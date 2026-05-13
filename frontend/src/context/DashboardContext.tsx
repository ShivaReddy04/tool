import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import type {
  Cluster,
  Schema,
  TableSummary,
  TableDefinition,
  ColumnDefinition,
  Step,
  Notification,
  SubmissionStatus,
  BusinessArea,
} from "../types";
import type { ToastData } from "../components/common/Toast";

// Backend status values include 'applied' (DDL applied to target cluster) and
// 'processed' that the frontend SubmissionStatus type does not enumerate. Both
// represent a successfully approved table from the user's perspective, so
// collapse them to 'approved' for display.
const normalizeStatus = (s: string | undefined | null): SubmissionStatus => {
  if (s === "approved" || s === "applied" || s === "processed") return "approved";
  if (s === "submitted") return "submitted";
  if (s === "rejected") return "rejected";
  return "draft";
};

interface DashboardContextType {
  // Environment
  clusters: Cluster[];
  schemas: Schema[];
  selectedClusterId: string;
  selectedDatabaseId: string;
  selectedSchemaId: string;
  selectedBusinessArea: BusinessArea;
  setClusters: (clusters: Cluster[]) => void;
  setSchemas: (schemas: Schema[]) => void;
  setSelectedClusterId: (id: string) => void;
  setSelectedDatabaseId: (id: string) => void;
  setSelectedSchemaId: (id: string) => void;
  setSelectedBusinessArea: (area: BusinessArea) => void;

  // Tables
  tables: TableSummary[];
  selectedTableId: string;
  tableDefinition: TableDefinition | null;
  setTables: React.Dispatch<React.SetStateAction<TableSummary[]>>;
  setSelectedTableId: (id: string) => void;
  setTableDefinition: (def: TableDefinition | null) => void;

  // Columns
  columns: ColumnDefinition[];
  selectedColumnId: string;
  setColumns: (columns: ColumnDefinition[]) => void;
  setSelectedColumnId: (id: string) => void;
  updateColumn: (id: string, updates: Partial<ColumnDefinition>) => void;
  addColumn: () => void;

  // UI State
  steps: Step[];
  currentStep: number;
  setCurrentStep: (step: number) => void;
  isCreateTableDrawerOpen: boolean;
  setIsCreateTableDrawerOpen: (open: boolean) => void;
  isDeleteModalOpen: boolean;
  setIsDeleteModalOpen: (open: boolean) => void;
  isUploadDrawerOpen: boolean;
  setIsUploadDrawerOpen: (open: boolean) => void;
  rightPanelMode: "properties" | "column-detail" | "row-detail";
  setRightPanelMode: (mode: "properties" | "column-detail" | "row-detail") => void;

  // Row selection for editing
  selectedRowData: any;
  setSelectedRowData: (row: any) => void;

  // Save & Submit
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
  submissionStatus: SubmissionStatus;
  saveChanges: () => Promise<string | null>;
  submitForReview: (
    submittedById: string,
    assignedArchitectId: string,
    submittedByName?: string,
    tableIdOverride?: string
  ) => Promise<boolean>;

  // Review (Architect)
  reviewingNotification: Notification | null;
  setReviewingNotification: (n: Notification | null) => void;
  isReviewDrawerOpen: boolean;
  setIsReviewDrawerOpen: (open: boolean) => void;
  approveSubmission: (architectName: string) => void;
  rejectSubmission: (architectName: string, reason?: string) => void;
  reviewCurrentTable: (
    status: "approved" | "rejected",
    architectName: string,
    reason?: string
  ) => Promise<boolean>;

  // Notifications
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Toasts
  toasts: ToastData[];
  addToast: (variant: ToastData["variant"], message: string) => void;
  dismissToast: (id: string) => void;

  // Actions
  resetEnvironment: () => void;
  resetTable: () => void;
  /**
   * Persist a new table + its columns server-side in a single transaction.
   * Returns the created table id on success, or `null` on failure (a toast
   * with the backend error message is already shown). The caller is expected
   * to keep the drawer open on `null` so the user can correct and retry.
   */
  createTable: (def: TableDefinition) => Promise<string | null>;
  /**
   * Soft-delete a table from the application's metadata only. Never issues a
   * DROP TABLE on the target cluster. On a 409 (related entities exist), the
   * caller receives `warnings` and can re-invoke with `{ force: true }` to
   * proceed. Returns `{ status: 'deleted' | 'warning' | 'error', warnings? }`.
   */
  deleteTable: (
    id: string,
    options?: { force?: boolean }
  ) => Promise<{ status: "deleted" | "warning" | "error"; warnings?: string[]; message?: string }>;
  refreshTable: () => void;
  refreshMetadata: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const STORAGE_KEY = "dart_dashboard_state";

/* ── shared column mappers ────────────────────────────────────────────────
 * Every code path that talks to the backend goes through these so all 24
 * metadata fields stay in sync. Update here, not in individual call sites.
 */
function columnFromServer(c: any): ColumnDefinition {
  return {
    id: c.id,
    columnName: c.column_name,
    dataType: c.data_type,
    isNullable: !!c.is_nullable,
    isPrimaryKey: !!c.is_primary_key,
    dataClassification: c.data_classification || "",
    dataDomain: c.data_domain || "",
    attributeDefinition: c.attribute_definition || "",
    defaultValue: c.default_value || "",
    action: c.action || "No Change",
    sortOrder: typeof c.sort_order === "number" ? c.sort_order : 0,
    attributeName: c.attribute_name || "",
    hasStats: !!c.has_stats,
    compressValue: c.compress_value || "",
    columnFormat: c.column_format || "",
    comments: c.comments || "",
    sourceTableName: c.source_table_name || "",
    sourceColumnName: c.source_column_name || "",
    transformation: c.transformation || "",
    tierValue: c.tier_value || "",
    sourceSystem: c.source_system || "",
    encoding: c.encoding || "",
    isSortKey: !!c.is_sort_key,
    isDistKey: !!c.is_dist_key,
    sourceDatabaseName: c.source_database_name || "",
  };
}

function columnToServer(c: ColumnDefinition, fallbackSortOrder: number): Record<string, unknown> {
  return {
    column_name: c.columnName,
    data_type: c.dataType,
    is_nullable: c.isNullable,
    is_primary_key: c.isPrimaryKey,
    data_classification: c.dataClassification || "Internal",
    data_domain: c.dataDomain,
    attribute_definition: c.attributeDefinition,
    default_value: c.defaultValue,
    action: c.action || "Add",
    sort_order: typeof c.sortOrder === "number" ? c.sortOrder : fallbackSortOrder,
    attribute_name: c.attributeName,
    has_stats: !!c.hasStats,
    compress_value: c.compressValue,
    column_format: c.columnFormat,
    comments: c.comments,
    source_table_name: c.sourceTableName,
    source_column_name: c.sourceColumnName,
    transformation: c.transformation,
    tier_value: c.tierValue,
    source_system: c.sourceSystem,
    encoding: c.encoding,
    is_sort_key: !!c.isSortKey,
    is_dist_key: !!c.isDistKey,
    source_database_name: c.sourceDatabaseName,
  };
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
}

function persistState(state: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { }
}

function pendingSubmissionToNotification(s: any): Notification {
  const p = s.payload || {};
  const tablePayload = p.table || {};
  const columnsPayload: any[] = Array.isArray(p.columns) ? p.columns : [];

  const tableDefinition: TableDefinition = {
    id: tablePayload.id,
    tableName: tablePayload.table_name || s.table_name || "",
    entityLogicalName: tablePayload.entity_logical_name || "",
    distributionStyle: tablePayload.distribution_style || "AUTO",
    schemaName: tablePayload.schema_name || "",
    verticalName: tablePayload.vertical_name || "",
    businessArea: tablePayload.business_area || "",
    definition: tablePayload.definition || "",
    columns: [],
  };

  const columns: ColumnDefinition[] = columnsPayload.map(columnFromServer);

  const submitterName = s.submitter_name || "Developer";
  const tableName = s.table_name || tableDefinition.tableName;

  return {
    id: `srv-submission-${s.id}`,
    type: "submission",
    title: "Table Submitted for Review",
    message: `${submitterName} submitted "${tableName}" for review.`,
    tableName,
    submittedBy: submitterName,
    timestamp: s.submitted_at,
    isRead: false,
    targetRole: "architect",
    submissionId: s.id,
    tableDefinition,
    columns,
  };
}

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const persisted = loadPersistedState();
  const { user } = useAuth();

  // Environment state — seeded with mock data
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState(persisted?.selectedClusterId ?? "");
  const [selectedDatabaseId, setSelectedDatabaseId] = useState(persisted?.selectedDatabaseId ?? "");
  const [selectedSchemaId, setSelectedSchemaId] = useState(persisted?.selectedSchemaId ?? "");
  const [selectedBusinessArea, setSelectedBusinessArea] = useState<BusinessArea>(
    persisted?.selectedBusinessArea ?? ""
  );

  // Table state
  const [tables, setTables] = useState<TableSummary[]>(persisted?.tables ?? []);
  const [selectedTableId, setSelectedTableId] = useState(persisted?.selectedTableId ?? "");
  const [tableDefinition, setTableDefinition] = useState<TableDefinition | null>(persisted?.tableDefinition ?? null);

  // Column state
  const [columns, setColumns] = useState<ColumnDefinition[]>(persisted?.columns ?? []);
  const [selectedColumnId, setSelectedColumnId] = useState("");

  // UI state
  const [currentStep, setCurrentStep] = useState(persisted?.currentStep ?? 1);
  const [isCreateTableDrawerOpen, setIsCreateTableDrawerOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"properties" | "column-detail" | "row-detail">(
    "properties"
  );

  // Selected row for editing
  const [selectedRowData, setSelectedRowData] = useState<any>(null);

  // Save & Submit state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(persisted?.hasUnsavedChanges ?? false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>(persisted?.submissionStatus ?? "draft");

  // Review state (Architect)
  const [reviewingNotification, setReviewingNotification] = useState<Notification | null>(null);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>(persisted?.notifications ?? []);

  // Persist state to localStorage whenever key data changes
  useEffect(() => {
    persistState({
      selectedClusterId,
      selectedDatabaseId,
      selectedSchemaId,
      selectedBusinessArea,
      tables,
      selectedTableId,
      tableDefinition,
      columns,
      currentStep,
      hasUnsavedChanges,
      submissionStatus,
      notifications,
    });
  }, [selectedClusterId, selectedDatabaseId, selectedSchemaId, selectedBusinessArea, tables, selectedTableId, tableDefinition, columns, currentStep, hasUnsavedChanges, submissionStatus, notifications]);

  // Warn user before unloading page if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Toast state
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((variant: ToastData["variant"], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, variant, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Notification actions
  const addNotification = useCallback((n: Notification) => {
    setNotifications((prev) => [n, ...prev]);
  }, []);

  // Pull pending submissions from the server and merge as architect-targeted notifications.
  // The server is the sole source of truth for submission notifications: any
  // local notif with a submissionId (e.g. a legacy entry persisted from a
  // previous developer session on this browser) is dropped so the bell can't
  // show both a local mirror and the server-side "srv-submission-…" for the
  // same submission. Local approval/rejection notifications have no
  // submissionId and are preserved.
  const refreshPendingSubmissions = useCallback(async () => {
    try {
      const res = await api.get("/submissions/pending");
      const serverNotifs: Notification[] = (res.data || []).map(pendingSubmissionToNotification);
      setNotifications((prev) => {
        const localOnly = prev.filter(
          (n) => !n.id.startsWith("srv-submission-") && !(n.type === "submission" && n.submissionId)
        );
        return [...serverNotifs, ...localOnly];
      });
    } catch (err) {
      console.error("Failed to load pending submissions:", err);
    }
  }, []);

  // Hydrate architect's bell from server on mount and on role change
  useEffect(() => {
    if (user?.role === "architect") {
      refreshPendingSubmissions();
    }
  }, [user?.role, refreshPendingSubmissions]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  // Save & Submit actions
  const saveChanges = useCallback(async (): Promise<string | null> => {
    if (!tableDefinition) return null;
    try {
      // Schema name precedence: the explicit field on the table definition
      // (set in the Create drawer or Edit-metadata flow) wins over the
      // env-selected schema, so per-table overrides survive a save.
      const effectiveSchema =
        (tableDefinition.schemaName && tableDefinition.schemaName.trim()) ||
        selectedSchemaId ||
        'public';

      // Map to db format
      const dbTableDef = {
        id: tableDefinition.id?.startsWith('tbl-new') || tableDefinition.id?.includes('::') ? undefined : tableDefinition.id,
        connection_id: selectedClusterId,
        database_name: selectedDatabaseId || 'default_db',
        schema_name: effectiveSchema,
        table_name: tableDefinition.tableName,
        entity_logical_name: tableDefinition.entityLogicalName,
        distribution_style: tableDefinition.distributionStyle,
        vertical_name: tableDefinition.verticalName,
        business_area: tableDefinition.businessArea || undefined,
        definition: tableDefinition.definition || undefined,
        status: submissionStatus
      };

      const dbColumns = columns.map((c, idx) => ({
        // Strip every kind of frontend-generated placeholder id so the backend
        // does an INSERT, not an UPDATE-with-bad-uuid. New rows from the create
        // drawer prefix `new-col-`, the Add Column button uses `new-col-`, and
        // the discovered-physical path uses `col-`.
        id: c.id?.startsWith('col-') || c.id?.startsWith('col_new') || c.id?.startsWith('new-col-') ? undefined : c.id,
        ...columnToServer(c, idx),
      }));

      const res = await api.post('/table-definitions', { table: dbTableDef, columns: dbColumns });

      if (!tableDefinition.id || tableDefinition.id.startsWith('tbl-new') || tableDefinition.id.includes('::')) {
        setTableDefinition(prev => prev ? { ...prev, id: res.data.table.id } : null);
      }

      if (res.data.columns && res.data.columns.length > 0) {
        setColumns(res.data.columns.map(columnFromServer));
      }

      setHasUnsavedChanges(false);
      addToast("success", "Changes saved successfully.");
      return res.data.table.id as string;
    } catch (err: any) {
      console.error(err);
      const data = err?.response?.data;
      const parts = [data?.error || "Failed to save changes."];
      if (data?.detail) parts.push(`(${data.detail})`);
      else if (data?.message) parts.push(`(${data.message})`);
      if (data?.code) parts.push(`[${data.code}]`);
      addToast("error", parts.join(" "));
      return null;
    }
  }, [tableDefinition, columns, selectedClusterId, selectedDatabaseId, selectedSchemaId, submissionStatus, addToast]);


  const submitForReview = useCallback(
    async (submittedById: string, assignedArchitectId: string, submittedByName?: string, tableIdOverride?: string): Promise<boolean> => {
      // Prefer the override (e.g., the freshly-saved id returned by createTable
      // or saveChanges) because tableDefinition from closure may still be null
      // or stale — React state hasn't propagated within the same handler tick.
      // We do NOT gate on `tableDefinition` being non-null: the create-then-
      // submit flow legitimately calls this before the new tableDefinition has
      // landed in this callback's closure.
      const effectiveTableId = tableIdOverride || tableDefinition?.id;
      if (!effectiveTableId || effectiveTableId.startsWith('tbl-new')) {
        addToast("error", "Please save the table before submitting.");
        return false;
      }
      if (!assignedArchitectId) {
        addToast("error", "Please select an architect to review this submission.");
        return false;
      }
      try {
        const res = await api.post('/submissions', {
          tableId: effectiveTableId,
          submittedBy: submittedById,
          assignedArchitectId,
        });
        setSubmissionStatus("submitted");
        setHasUnsavedChanges(false);

        // Resolve a friendly table label for the developer-side toast.
        // The architect-side notification is created exclusively from the
        // server's pending list (refreshPendingSubmissions → pendingSubmissionToNotification);
        // creating a second local copy here caused the bell to show two
        // entries for one submission whenever the architect loaded on a
        // browser that had previously persisted the developer's state.
        const displayTableName =
          tableDefinition?.tableName ||
          tables.find((t) => t.id === effectiveTableId)?.name ||
          "Table";

        addToast("success", `"${displayTableName}" submitted for Architect review.`);
        return true;
      } catch (err: any) {
        console.error(err);
        const data = err?.response?.data;
        // Backend includes `message` and `code` in non-prod responses — surface
        // them so the toast actually tells you what broke (e.g. "42703 column ... does not exist"
        // means a pending migration). In prod only the generic `error` shows.
        const parts = [data?.error || "Failed to submit for review."];
        if (data?.message) parts.push(`(${data.message})`);
        if (data?.code) parts.push(`[${data.code}]`);
        addToast("error", parts.join(" "));
        return false;
      }
    },
    [tableDefinition, tables, addToast]
  );

  // Architect review actions
  const approveSubmission = useCallback(
    async (architectName: string) => {
      if (!reviewingNotification || !reviewingNotification.submissionId) {
        addToast("error", "Missing submission ID");
        return;
      }
      try {
        await api.post(`/submissions/${reviewingNotification.submissionId}/review`, { reviewedBy: architectName, status: "approved" });
        markNotificationRead(reviewingNotification.id);
        setSubmissionStatus("approved");

        const approvalNotif: Notification = {
          id: `notif-${Date.now()}`,
          type: "approval",
          title: "Table Approved",
          message: `${architectName} approved "${reviewingNotification.tableName}" and updated the data model in target cluster.`,
          tableName: reviewingNotification.tableName,
          submittedBy: architectName,
          timestamp: new Date().toISOString(),
          isRead: false,
          targetRole: "developer",
        };
        addNotification(approvalNotif);

        setIsReviewDrawerOpen(false);
        setReviewingNotification(null);
        addToast("success", `"${reviewingNotification.tableName}" approved — data model updated.`);
        refreshPendingSubmissions();
      } catch (err: any) {
        console.error(err);
        // Surface what the server actually said. The backend returns
        // {error, details} on sync failures (DDL errors include the column
        // name and PG code), so showing that gives the architect something
        // actionable instead of the generic "Failed to push..." message.
        const data = err?.response?.data;
        const msg =
          data?.error ||
          data?.message ||
          "Failed to push approval database changes.";
        addToast("error", data?.details ? `${msg} (${data.details})` : msg);
      }
    },
    [reviewingNotification, markNotificationRead, addNotification, addToast, refreshPendingSubmissions]
  );

  const rejectSubmission = useCallback(
    async (architectName: string, reason?: string) => {
      if (!reviewingNotification || !reviewingNotification.submissionId) return;
      try {
        await api.post(`/submissions/${reviewingNotification.submissionId}/review`, { reviewedBy: architectName, status: "rejected", rejectionReason: reason });
        markNotificationRead(reviewingNotification.id);
        setSubmissionStatus("rejected");

        const rejectionNotif: Notification = {
          id: `notif-${Date.now()}`,
          type: "rejection",
          title: "Table Rejected",
          message: `${architectName} rejected "${reviewingNotification.tableName}".${reason ? ` Reason: ${reason}` : ""}`,
          tableName: reviewingNotification.tableName,
          submittedBy: architectName,
          timestamp: new Date().toISOString(),
          isRead: false,
          targetRole: "developer",
        };
        addNotification(rejectionNotif);

        setIsReviewDrawerOpen(false);
        setReviewingNotification(null);
        addToast("info", `"${reviewingNotification.tableName}" has been rejected.`);
        refreshPendingSubmissions();
      } catch (err: any) {
        console.error(err);
        const data = err?.response?.data;
        const msg = data?.error || data?.message || "Failed to record rejection.";
        addToast("error", data?.details ? `${msg} (${data.details})` : msg);
      }
    },
    [reviewingNotification, markNotificationRead, addNotification, addToast, refreshPendingSubmissions]
  );

  // Review the currently-loaded table directly from the Table Details page
  // without needing a notification in the bell. Looks up the pending submission
  // for this table_id, posts the review, then re-syncs status from the server
  // (so 'applied' after a successful DDL run normalizes to 'approved').
  const reviewCurrentTable = useCallback(
    async (
      status: "approved" | "rejected",
      architectName: string,
      reason?: string
    ): Promise<boolean> => {
      const tableId = tableDefinition?.id;
      if (!tableId) {
        addToast("error", "No table loaded to review.");
        return false;
      }
      try {
        const pendingRes = await api.get("/submissions/pending");
        const submission = (pendingRes.data || []).find((s: any) => s.table_id === tableId);
        if (!submission) {
          addToast("error", "No pending submission found for this table.");
          return false;
        }
        await api.post(`/submissions/${submission.id}/review`, {
          reviewedBy: architectName,
          status,
          rejectionReason: reason,
        });

        // Re-fetch the table to pick up the backend's authoritative status
        // (which becomes 'applied' after DDL succeeds on the target cluster).
        try {
          const tableRes = await api.get(`/table-definitions/${tableId}`);
          setSubmissionStatus(normalizeStatus(tableRes.data.table.status));
        } catch {
          setSubmissionStatus(status);
        }

        refreshPendingSubmissions();

        const name = tableDefinition?.tableName || "Table";
        if (status === "approved") {
          addToast("success", `"${name}" approved — data model updated.`);
        } else {
          addToast("info", `"${name}" has been rejected.${reason ? ` Reason: ${reason}` : ""}`);
        }
        return true;
      } catch (err: any) {
        console.error(err);
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          (status === "approved"
            ? "Failed to push approval database changes."
            : "Failed to record rejection.");
        addToast("error", msg);
        return false;
      }
    },
    [tableDefinition, addToast, refreshPendingSubmissions]
  );

  // Create table action — persists immediately to the backend in a single
  // transactional save. Earlier versions only stashed a `tbl-new-*` placeholder
  // in local state and deferred the actual POST to a later Save click, which
  // left users staring at a "table" that did not exist server-side and could
  // not be submitted for review. The drawer now treats this as the single
  // create step.
  const createTable = useCallback(
    async (def: TableDefinition): Promise<string | null> => {
      // Fail fast with a specific message if environment selection is
      // incomplete — better than the generic 400 the backend would return.
      if (!selectedClusterId) {
        addToast("error", "Select a database connection before creating a table.");
        return null;
      }
      if (!selectedDatabaseId) {
        addToast("error", "Select a cluster (database) before creating a table.");
        return null;
      }
      const targetSchema = (def.schemaName && def.schemaName.trim()) || selectedSchemaId;
      if (!targetSchema) {
        addToast("error", "Select a schema before creating a table.");
        return null;
      }

      const dbTableDef = {
        connection_id: selectedClusterId,
        database_name: selectedDatabaseId,
        schema_name: targetSchema,
        table_name: def.tableName,
        entity_logical_name: def.entityLogicalName,
        distribution_style: def.distributionStyle,
        vertical_name: def.verticalName,
        business_area: def.businessArea || undefined,
        definition: def.definition || undefined,
        status: "draft",
      };

      const dbColumns = def.columns.map((c, idx) => columnToServer(c, idx));

      try {
        const res = await api.post("/table-definitions", { table: dbTableDef, columns: dbColumns });
        const saved = res.data.table;
        const savedColumns: ColumnDefinition[] = (res.data.columns || []).map(columnFromServer);

        const summary: TableSummary = {
          id: saved.id,
          name: saved.table_name,
          schemaId: selectedSchemaId,
          columnCount: savedColumns.length,
          createdAt: saved.created_at || new Date().toISOString(),
          updatedAt: saved.updated_at || new Date().toISOString(),
        };
        // Replace any optimistic placeholder or physical-table row with the
        // same name so the list doesn't show duplicates after creation.
        setTables((prev) => {
          const filtered = prev.filter((t) => t.name !== summary.name);
          return [...filtered, summary];
        });
        setTableDefinition({
          id: saved.id,
          tableName: saved.table_name,
          entityLogicalName: saved.entity_logical_name || "",
          distributionStyle: saved.distribution_style || "AUTO",
          schemaName: saved.schema_name || "",
          verticalName: saved.vertical_name || "",
          businessArea: saved.business_area || "",
          definition: saved.definition || "",
          columns: savedColumns,
        });
        setColumns(savedColumns);
        setSelectedTableId(saved.id);
        setHasUnsavedChanges(false);
        setSubmissionStatus("draft");
        setCurrentStep(3);
        addToast("success", `Table "${saved.table_name}" created.`);
        return saved.id as string;
      } catch (err: any) {
        console.error("createTable failed", err);
        const data = err?.response?.data;
        const parts = [data?.error || "Failed to create table."];
        if (data?.detail) parts.push(`(${data.detail})`);
        else if (data?.message) parts.push(`(${data.message})`);
        if (data?.code) parts.push(`[${data.code}]`);
        addToast("error", parts.join(" "));
        return null;
      }
    },
    [
      selectedClusterId,
      selectedDatabaseId,
      selectedSchemaId,
      addToast,
    ]
  );

  // Refresh metadata — reload clusters, schemas, and tables
  const refreshMetadata = useCallback(async () => {
    try {
      const clusterRes = await api.get("/clusters");
      setClusters(clusterRes.data);
      addToast("success", "Metadata refreshed.");
    } catch (err) {
      console.error(err);
      addToast("error", "Failed to load metadata.");
    }
  }, [addToast]);

  // Track whether this is the initial mount (to skip overwriting persisted data)
  const isInitialMount = React.useRef(true);

  // Initial mount load
  useEffect(() => {
    if (isInitialMount.current) {
      refreshMetadata();
    }
  }, [refreshMetadata]);

  // Load schemas when cluster is selected
  useEffect(() => {
    if (isInitialMount.current) return;
    if (!selectedClusterId) {
      setSchemas([]);
      return;
    }
    api.get(`/schemas/cluster/${selectedClusterId}`)
      .then(res => setSchemas(res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        clusterId: s.cluster_id
      }))))
      .catch(console.error);
  }, [selectedClusterId]);

  // Load tables when a schema is selected
  useEffect(() => {
    if (isInitialMount.current) return;
    if (!selectedSchemaId || !selectedClusterId) {
      setTables([]);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
      return;
    }

    // Because EnvironmentPanel sets selectedSchemaId directly to the schema name (e.g. "public")
    // we query using that name directly.
    api.get(`/table-definitions?connectionId=${selectedClusterId}&schemaName=${selectedSchemaId}`)
      .then(res => {
        const mappedSummary = res.data.map((t: any) => ({
          id: t.id,
          name: t.table_name,
          schemaId: selectedSchemaId,
          columnCount: 0,
          createdAt: t.created_at,
          updatedAt: t.updated_at
        }));
        // Merge DART metadata tables with the physical target database tables (which exist in prev state)
        setTables(prev => {
          // Identify existing physical tables currently in state
          const physicalOnly = prev.filter(p => p.id.includes('::'));

          const merged = [...mappedSummary];
          const dartNames = new Set(mappedSummary.map((m: any) => m.name));

          for (const p of physicalOnly) {
            if (!dartNames.has(p.name)) {
              merged.push(p);
            }
          }
          return merged;
        });
      })
      .catch(err => {
        console.error(err);
        addToast("error", "Failed to load DART tables.");
      });

    setSelectedTableId("");
    setTableDefinition(null);
    setColumns([]);
  }, [selectedSchemaId, selectedClusterId, addToast]);

  // Load table definition & columns when a table is selected
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Skip on mount — persisted state is already loaded
    }
    if (selectedTableId) {
      // Brand-new tables created via `createTable` get a `tbl-new-<ts>` placeholder
      // id. Their state is already populated locally — there's nothing to fetch yet,
      // and asking the backend would 500 because the id isn't a UUID.
      if (selectedTableId.startsWith('tbl-new-')) {
        // no-op: keep whatever createTable() already put in state
      } else if (selectedTableId.includes('::')) {
        // Physical table from the database. Prefer DART's saved metadata
        // (definition, entity_logical_name, business_area, full column
        // attribute set) when a table_definitions row exists — after an
        // approved submission the developer expects to see what they
        // entered, not blank defaults derived from the cluster columns.
        // Falls back to columns-from-cluster only when DART has no record.
        const [connId, db, schema, tableName] = selectedTableId.split('::');

        api.get('/table-definitions/by-key', { params: { connectionId: connId, database: db, schema, table: tableName } })
          .then(res => {
            const t = res.data.table;
            setTableDefinition({
              id: selectedTableId,
              tableName: t.table_name,
              entityLogicalName: t.entity_logical_name || '',
              distributionStyle: t.distribution_style || 'AUTO',
              schemaName: t.schema_name || schema,
              verticalName: t.vertical_name || '',
              businessArea: t.business_area || '',
              definition: t.definition || '',
              columns: res.data.columns,
            });
            setColumns(res.data.columns.map(columnFromServer));
            setCurrentStep(3);
            setSubmissionStatus(normalizeStatus(t.status));
            setHasUnsavedChanges(false);
          })
          .catch(err => {
            if (err?.response?.status !== 404) {
              console.error('by-key lookup failed:', err);
            }
            api.get(`/clusters/${connId}/columns`, { params: { schema, table: tableName, database: db } })
              .then(res => {
                const cols = res.data;
                setTableDefinition({
                  id: selectedTableId,
                  tableName: tableName,
                  entityLogicalName: '',
                  distributionStyle: 'AUTO',
                  schemaName: schema,
                  verticalName: '',
                  businessArea: '',
                  definition: '',
                  columns: []
                });
                setColumns(cols.map((c: any) =>
                  columnFromServer({
                    id: `col-${c.column_name}`,
                    column_name: c.column_name,
                    data_type: c.data_type,
                    is_nullable: c.is_nullable === 'YES' || c.is_nullable === true,
                    is_primary_key: false,
                    default_value: c.column_default || '',
                    action: 'No Change',
                  })
                ));
                setCurrentStep(3);
                setSubmissionStatus("draft");
                setHasUnsavedChanges(false);
              })
              .catch(err2 => {
                console.error("Failed to load physical columns:", err2);
                addToast("error", "Failed to fetch table columns from database.");
              });
          });
      } else {
        // This is a DART managed table definition
        api.get(`/table-definitions/${selectedTableId}`)
          .then(res => {
            setTableDefinition({
              id: res.data.table.id,
              tableName: res.data.table.table_name,
              entityLogicalName: res.data.table.entity_logical_name || '',
              distributionStyle: res.data.table.distribution_style || 'AUTO',
              schemaName: res.data.table.schema_name || '',
              verticalName: res.data.table.vertical_name || '',
              businessArea: res.data.table.business_area || '',
              definition: res.data.table.definition || '',
              columns: res.data.columns
            });
            setColumns(res.data.columns.map(columnFromServer));
            setCurrentStep(3);
            setSubmissionStatus(normalizeStatus(res.data.table.status));
            setHasUnsavedChanges(false);
          })
          .catch(err => {
            console.error(err);
            addToast("error", "Failed to load table definition.");
          });
      }
    } else {
      setTableDefinition(null);
      setColumns([]);
    }
    setSelectedColumnId("");
    setRightPanelMode("properties");
  }, [selectedTableId, addToast]);

  const steps: Step[] = [
    {
      number: 1,
      label: "Environment",
      status: currentStep > 1 ? "completed" : currentStep === 1 ? "active" : "pending",
    },
    {
      number: 2,
      label: "Table Selection",
      status: currentStep > 2 ? "completed" : currentStep === 2 ? "active" : "pending",
    },
    {
      number: 3,
      label: "Actions",
      status: currentStep === 3 ? "active" : "pending",
    },
  ];

  const updateColumn = useCallback(
    (id: string, updates: Partial<ColumnDefinition>) => {
      // DDL-affecting fields: editing any of these on an already-applied column
      // (action === 'No Change') must auto-promote the action to 'Modify' so the
      // approval pipeline actually emits an ALTER. Without this, hasPendingChanges
      // returns false for the snapshot and the architect's approve becomes a no-op
      // on the target cluster.
      const DDL_FIELDS: (keyof ColumnDefinition)[] = [
        "columnName",
        "dataType",
        "isNullable",
        "isPrimaryKey",
        "defaultValue",
      ];
      const touchesDDL = DDL_FIELDS.some((k) => k in updates);
      const callerSetAction = "action" in updates;

      setColumns((prev) =>
        prev.map((col) => {
          if (col.id !== id) return col;
          const next = { ...col, ...updates };
          if (
            touchesDDL &&
            !callerSetAction &&
            col.action === "No Change" &&
            // Add/Drop columns shouldn't be downgraded — only promote when the
            // column was previously committed (No Change).
            next.action === "No Change"
          ) {
            next.action = "Modify";
          }
          return next;
        })
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  const addColumn = useCallback(() => {
    const newId = `new-col-${Date.now()}`;
    const newColumn: ColumnDefinition = {
      id: newId,
      columnName: "",
      dataType: "VARCHAR",
      isNullable: true,
      isPrimaryKey: false,
      dataClassification: "Internal",
      dataDomain: "",
      attributeDefinition: "",
      defaultValue: "",
      action: "Add",
      attributeName: "",
      hasStats: false,
      compressValue: "",
      columnFormat: "",
      comments: "",
      sourceTableName: "",
      sourceColumnName: "",
      transformation: "",
      tierValue: "",
      sourceSystem: "",
      encoding: "",
      isSortKey: false,
      isDistKey: false,
      sourceDatabaseName: "",
    };
    setColumns((prev) => [...prev, newColumn]);
    setSelectedColumnId(newId);
    setRightPanelMode("column-detail");
    setHasUnsavedChanges(true);
  }, []);

  // Soft-delete a table from DART metadata only. Backend never issues DROP
  // TABLE on the target cluster — verified in table_definition.controller.ts.
  const deleteTable = useCallback(
    async (
      id: string,
      options?: { force?: boolean }
    ): Promise<{ status: "deleted" | "warning" | "error"; warnings?: string[]; message?: string }> => {
      if (!id) {
        addToast("error", "No table selected to delete.");
        return { status: "error", message: "No table id" };
      }
      try {
        const force = options?.force ? "?force=true" : "";
        const res = await api.delete(`/table-definitions/${encodeURIComponent(id)}${force}`);

        setTables((prev) => prev.filter((t) => t.id !== id));
        if (selectedTableId === id) {
          setSelectedTableId("");
          setTableDefinition(null);
          setColumns([]);
          setSelectedColumnId("");
          setRightPanelMode("properties");
          setHasUnsavedChanges(false);
          setSubmissionStatus("draft");
        }

        addToast("success", "Table removed successfully from application view.");
        return { status: "deleted", message: res.data?.message };
      } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        if (status === 409 && Array.isArray(data?.warnings)) {
          return { status: "warning", warnings: data.warnings, message: data.error };
        }
        const msg =
          data?.error || data?.message || err?.message || "Failed to remove table from application.";
        addToast("error", msg);
        return { status: "error", message: msg };
      }
    },
    [selectedTableId, addToast]
  );

  // Refresh table — reload metadata + columns for the currently selected table.
  // Handles both id shapes: UUID (DART-managed table) and composite
  // "connId::db::schema::table" (physical table picked from the cluster list).
  // Skips placeholder ids ("tbl-new-…") which exist only client-side.
  const refreshTable = useCallback(async () => {
    if (!selectedTableId || selectedTableId.startsWith('tbl-new-')) return;
    try {
      let res;
      if (selectedTableId.includes('::')) {
        const [connId, db, schema, tableName] = selectedTableId.split('::');
        res = await api.get('/table-definitions/by-key', {
          params: { connectionId: connId, database: db, schema, table: tableName },
        });
      } else {
        res = await api.get(`/table-definitions/${selectedTableId}`);
      }
      const t = res.data.table;
      setTableDefinition({
        // Preserve the composite id when that's how the table was selected,
        // so the selection chain (table list ↔ panel) stays consistent.
        id: selectedTableId.includes('::') ? selectedTableId : t.id,
        tableName: t.table_name,
        entityLogicalName: t.entity_logical_name || '',
        distributionStyle: t.distribution_style || 'AUTO',
        schemaName: t.schema_name || '',
        verticalName: t.vertical_name || '',
        businessArea: t.business_area || '',
        definition: t.definition || '',
        columns: res.data.columns,
      });
      setColumns(res.data.columns.map(columnFromServer));
      setSelectedColumnId("");
      setRightPanelMode("properties");
      setSubmissionStatus(normalizeStatus(t.status));
      setHasUnsavedChanges(false);
      addToast("success", "Table data refreshed.");
    } catch (err: any) {
      if (selectedTableId.includes('::') && err?.response?.status === 404) {
        // Physical table has no DART record yet — nothing to refresh on the
        // metadata side. The columns shown came from the cluster directly and
        // don't change between refreshes of metadata.
        addToast("info", "No saved DART definition for this physical table.");
        return;
      }
      console.error(err);
      addToast("error", "Failed to refresh table data.");
    }
  }, [selectedTableId, addToast]);


  const resetEnvironment = useCallback(() => {
    setSelectedClusterId("");
    setSelectedDatabaseId("");
    setSelectedSchemaId("");
    setSelectedBusinessArea("");
    setSchemas([]);
    setTables([]);
    setSelectedTableId("");
    setTableDefinition(null);
    setColumns([]);
    setCurrentStep(1);
    setHasUnsavedChanges(false);
    setSubmissionStatus("draft");
  }, []);

  const resetTable = useCallback(() => {
    setSelectedTableId("");
    setTableDefinition(null);
    setColumns([]);
    setSelectedColumnId("");
    setRightPanelMode("properties");
    setHasUnsavedChanges(false);
    setSubmissionStatus("draft");
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        clusters,
        schemas,
        selectedClusterId,
        selectedDatabaseId,
        selectedSchemaId,
        selectedBusinessArea,
        setClusters,
        setSchemas,
        setSelectedClusterId,
        setSelectedDatabaseId,
        setSelectedSchemaId,
        setSelectedBusinessArea,
        tables,
        selectedTableId,
        tableDefinition,
        setTables,
        setSelectedTableId,
        setTableDefinition,
        columns,
        selectedColumnId,
        setColumns,
        setSelectedColumnId,
        updateColumn,
        addColumn,
        steps,
        currentStep,
        setCurrentStep,
        isCreateTableDrawerOpen,
        setIsCreateTableDrawerOpen,
        isDeleteModalOpen,
        setIsDeleteModalOpen,
        isUploadDrawerOpen,
        setIsUploadDrawerOpen,
        rightPanelMode,
        setRightPanelMode,
        selectedRowData,
        setSelectedRowData,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        submissionStatus,
        saveChanges,
        submitForReview,
        reviewingNotification,
        setReviewingNotification,
        isReviewDrawerOpen,
        setIsReviewDrawerOpen,
        approveSubmission,
        rejectSubmission,
        reviewCurrentTable,
        notifications,
        addNotification,
        markNotificationRead,
        markAllNotificationsRead,
        toasts,
        addToast,
        dismissToast,
        resetEnvironment,
        resetTable,
        createTable,
        deleteTable,
        refreshTable,
        refreshMetadata,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
