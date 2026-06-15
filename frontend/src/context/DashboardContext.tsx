import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import { ToastProvider, useToast } from "./ToastContext";
import { NotificationsProvider, useNotifications } from "./NotificationsContext";
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
import { generateEntityLogicalName } from "../utils/abbreviations";

/**
 * NOTE ON STRUCTURE
 *
 * The dashboard used to own one ~1.3k-line context that re-rendered every
 * consumer on any state change. As of this commit the slice is split:
 *
 *   ToastProvider          — toasts + addToast/dismissToast
 *   NotificationsProvider  — notifications + dismissed list + server poll
 *   DashboardContext       — environment selection, tables, columns, save/submit
 *
 * The Tables+Columns split is deferred — columns are tightly coupled to the
 * selected table's load/save lifecycle and pulling them apart requires more
 * care than this refactor takes.
 *
 * `useDashboard()` is kept as a backwards-compatible facade that reads from
 * all three providers and assembles the original surface. New components
 * should prefer the focused hooks (`useToast`, `useNotifications`) so they
 * don't re-render on unrelated state changes.
 */

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

// Backend errors may attach a `details` field — either a plain string (legacy /
// validation errors) or a structured object (e.g. the DDL push failure, which
// carries { details, column, statement, pgCode }). Format both into a single
// human-readable line for the toast; the raw object stays in console.error.
const formatErrorWithDetails = (msg: string, details: unknown): string => {
  if (details == null) return msg;
  if (typeof details === "string") return `${msg} (${details})`;
  if (typeof details === "object") {
    const d = details as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof d.details === "string") parts.push(d.details);
    if (typeof d.pgCode === "string" && d.pgCode) parts.push(`[${d.pgCode}]`);
    if (typeof d.statement === "string" && d.statement) parts.push(`SQL: ${d.statement}`);
    if (parts.length) return `${msg} — ${parts.join(" ")}`;
  }
  return msg;
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

  selectedRowData: any;
  setSelectedRowData: (row: any) => void;

  // Save & Submit
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
  submissionStatus: SubmissionStatus;
  saveChanges: () => Promise<string | null>;
  saveAsDraft: () => Promise<string | null>;
  submitForReview: (
    submittedById: string,
    assignedArchitectId: string,
    submittedByName?: string,
    tableIdOverride?: string,
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
    reason?: string,
  ) => Promise<boolean>;

  // Notifications — proxied from NotificationsContext
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;

  // Toasts — proxied from ToastContext
  toasts: ToastData[];
  addToast: (variant: ToastData["variant"], message: string) => void;
  dismissToast: (id: string) => void;

  resetEnvironment: () => void;
  resetTable: () => void;
  createTable: (def: TableDefinition) => Promise<string | null>;
  deleteTable: (
    id: string,
    options?: { force?: boolean },
  ) => Promise<{ status: "deleted" | "warning" | "error"; warnings?: string[]; message?: string }>;
  refreshTable: () => void;
  refreshMetadata: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const LEGACY_STORAGE_KEY = "dart_dashboard_state";
// Each user gets their own localStorage blob — connections, table selections,
// and notifications must not leak across accounts on a shared browser.
const storageKeyFor = (userId: string | undefined) =>
  userId ? `dart_dashboard_state_${userId}` : `${LEGACY_STORAGE_KEY}_anon`;

/* ── shared column mappers ─────────────────────────────────────────────── */
export function columnFromServer(c: any): ColumnDefinition {
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
    // Attribute Name is a human-readable alias of the physical column name.
    // Rows that never had it persisted (legacy data, columns discovered from
    // the physical schema) come back empty — derive it from column_name on
    // load so it's never blank in any view, and a subsequent save backfills it.
    attributeName: c.attribute_name || generateEntityLogicalName(c.column_name || ""),
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

export function columnToServer(c: ColumnDefinition, fallbackSortOrder: number): Record<string, unknown> {
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

function loadPersistedState(userId: string | undefined) {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
}

function persistState(userId: string | undefined, state: Record<string, unknown>) {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(state));
  } catch { }
}

/**
 * Inner provider — assumes ToastProvider and NotificationsProvider are already
 * mounted above. Holds all dashboard state EXCEPT the toast and notification
 * slices, and proxies those into the public `useDashboard()` shape.
 */
const DashboardCoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  const {
    notifications,
    dismissedSubmissionIds,
    addNotification,
    markNotificationRead,
    setNotificationReviewStatus,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
    refreshPendingSubmissions,
  } = useNotifications();

  const userId = user?.id;
  const persisted = loadPersistedState(userId);

  // Environment state
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState(persisted?.selectedClusterId ?? "");
  const [selectedDatabaseId, setSelectedDatabaseId] = useState(persisted?.selectedDatabaseId ?? "");
  const [selectedSchemaId, setSelectedSchemaId] = useState(persisted?.selectedSchemaId ?? "");
  const [selectedBusinessArea, setSelectedBusinessArea] = useState<BusinessArea>(persisted?.selectedBusinessArea ?? "");

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
  const [rightPanelMode, setRightPanelMode] = useState<"properties" | "column-detail" | "row-detail">("properties");

  const [selectedRowData, setSelectedRowData] = useState<any>(null);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(persisted?.hasUnsavedChanges ?? false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>(persisted?.submissionStatus ?? "draft");

  // Review state (Architect)
  const [reviewingNotification, setReviewingNotification] = useState<Notification | null>(null);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);

  // Persist scoped by userId so each signed-in user has their own blob.
  // Includes the notifications + dismissed list received from NotificationsContext
  // via the parent so a single localStorage row continues to round-trip the
  // user's bell state alongside their dashboard selections.
  useEffect(() => {
    persistState(userId, {
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
      dismissedSubmissionIds,
    });
  }, [
    userId,
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
    dismissedSubmissionIds,
  ]);

  // One-time migration: drop the legacy un-namespaced blob if it's still
  // around from before per-user scoping.
  useEffect(() => {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

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
        "public";

      const dbTableDef = {
        id:
          tableDefinition.id?.startsWith("tbl-new") || tableDefinition.id?.includes("::")
            ? undefined
            : tableDefinition.id,
        connection_id: selectedClusterId,
        database_name: selectedDatabaseId || "default_db",
        schema_name: effectiveSchema,
        table_name: tableDefinition.tableName,
        entity_logical_name: tableDefinition.entityLogicalName,
        distribution_style: tableDefinition.distributionStyle,
        vertical_name: tableDefinition.verticalName,
        business_area: tableDefinition.businessArea || undefined,
        definition: tableDefinition.definition || undefined,
        status: submissionStatus,
      };

      const dbColumns = columns.map((c, idx) => ({
        // Strip frontend-generated placeholder ids so the backend INSERTs
        // instead of UPDATEing with a bogus uuid.
        id:
          c.id?.startsWith("col-") || c.id?.startsWith("col_new") || c.id?.startsWith("new-col-")
            ? undefined
            : c.id,
        ...columnToServer(c, idx),
      }));

      const res = await api.post("/table-definitions", { table: dbTableDef, columns: dbColumns });

      if (!tableDefinition.id || tableDefinition.id.startsWith("tbl-new") || tableDefinition.id.includes("::")) {
        setTableDefinition((prev) => (prev ? { ...prev, id: res.data.table.id } : null));
      }

      if (res.data.columns && res.data.columns.length > 0) {
        setColumns(res.data.columns.map(columnFromServer));
      }

      // Reflect the saved status on the cached picker entry so the pending
      // indicator updates without waiting for the next list refresh.
      const savedTable = res.data.table;
      setTables((prev) =>
        prev.map((t) =>
          t.id === savedTable.id || t.name === savedTable.table_name
            ? { ...t, id: savedTable.id, status: savedTable.status }
            : t,
        ),
      );

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

  // Explicit "save as draft" — force the wire payload's status to 'draft' so
  // a developer can park unfinished work without it slipping into the
  // architect's review queue. Reuses saveChanges by flipping submissionStatus
  // ahead of the call so the existing transactional save path is the only
  // place that talks to the backend.
  const saveAsDraft = useCallback(async (): Promise<string | null> => {
    if (!tableDefinition) return null;
    if (submissionStatus !== "draft") setSubmissionStatus("draft");
    // Defer one tick so the status state update lands before saveChanges
    // reads it from closure.
    await new Promise((r) => setTimeout(r, 0));
    return saveChanges();
  }, [tableDefinition, submissionStatus, saveChanges]);

  const submitForReview = useCallback(
    async (
      submittedById: string,
      assignedArchitectId: string,
      submittedByName?: string,
      tableIdOverride?: string,
    ): Promise<boolean> => {
      // Prefer the override (e.g. id returned by a fresh save) because
      // tableDefinition from closure may be stale within the same handler tick.
      const effectiveTableId = tableIdOverride || tableDefinition?.id;
      if (!effectiveTableId || effectiveTableId.startsWith("tbl-new")) {
        addToast("error", "Please save the table before submitting.");
        return false;
      }
      if (!assignedArchitectId) {
        addToast("error", "Please select an architect to review this submission.");
        return false;
      }
      try {
        const res = await api.post("/submissions", {
          tableId: effectiveTableId,
          submittedBy: submittedById,
          assignedArchitectId,
        });
        setSubmissionStatus("submitted");
        setHasUnsavedChanges(false);

        // The architect-side notification is created exclusively from the
        // server's pending list (refreshPendingSubmissions →
        // pendingSubmissionToNotification); creating a second local copy
        // here caused the bell to show two entries for one submission.
        const displayTableName =
          tableDefinition?.tableName ||
          tables.find((t) => t.id === effectiveTableId)?.name ||
          "Table";

        addToast("success", `"${displayTableName}" submitted for Architect review.`);
        // Avoid the unused-variable lint while still accepting the legacy arg.
        void res; void submittedByName;
        return true;
      } catch (err: any) {
        console.error(err);
        const data = err?.response?.data;
        const msg = data?.error || "Failed to submit for review.";
        addToast("error", formatErrorWithDetails(msg, data?.details));
        return false;
      }
    },
    [tableDefinition, tables, addToast],
  );

  // Architect review actions
  const approveSubmission = useCallback(
    async (architectName: string) => {
      if (!reviewingNotification || !reviewingNotification.submissionId) {
        addToast("error", "Missing submission ID");
        return;
      }
      try {
        await api.post(`/submissions/${reviewingNotification.submissionId}/review`, {
          reviewedBy: architectName,
          status: "approved",
        });
        setNotificationReviewStatus(reviewingNotification.id, "approved");
        setSubmissionStatus("approved");

        addNotification({
          id: `notif-${Date.now()}`,
          type: "approval",
          title: "Table Approved",
          message: `${architectName} approved "${reviewingNotification.tableName}" and updated the data model in target cluster.`,
          tableName: reviewingNotification.tableName,
          submittedBy: architectName,
          timestamp: new Date().toISOString(),
          isRead: false,
          targetRole: "developer",
        });

        setIsReviewDrawerOpen(false);
        setReviewingNotification(null);
        addToast("success", `"${reviewingNotification.tableName}" approved — data model updated.`);
        refreshPendingSubmissions();
      } catch (err: any) {
        console.error(err);
        const data = err?.response?.data;
        const msg = data?.error || data?.message || "Failed to push approval database changes.";
        addToast("error", formatErrorWithDetails(msg, data?.details));
      }
    },
    [reviewingNotification, setNotificationReviewStatus, addNotification, addToast, refreshPendingSubmissions],
  );

  const rejectSubmission = useCallback(
    async (architectName: string, reason?: string) => {
      if (!reviewingNotification || !reviewingNotification.submissionId) return;
      try {
        await api.post(`/submissions/${reviewingNotification.submissionId}/review`, {
          reviewedBy: architectName,
          status: "rejected",
          rejectionReason: reason,
        });
        setNotificationReviewStatus(reviewingNotification.id, "rejected");
        setSubmissionStatus("rejected");

        addNotification({
          id: `notif-${Date.now()}`,
          type: "rejection",
          title: "Table Rejected",
          message: `${architectName} rejected "${reviewingNotification.tableName}".${reason ? ` Reason: ${reason}` : ""}`,
          tableName: reviewingNotification.tableName,
          submittedBy: architectName,
          timestamp: new Date().toISOString(),
          isRead: false,
          targetRole: "developer",
        });

        setIsReviewDrawerOpen(false);
        setReviewingNotification(null);
        addToast("info", `"${reviewingNotification.tableName}" has been rejected.`);
        refreshPendingSubmissions();
      } catch (err: any) {
        console.error(err);
        const data = err?.response?.data;
        const msg = data?.error || data?.message || "Failed to record rejection.";
        addToast("error", formatErrorWithDetails(msg, data?.details));
      }
    },
    [reviewingNotification, setNotificationReviewStatus, addNotification, addToast, refreshPendingSubmissions],
  );

  const reviewCurrentTable = useCallback(
    async (
      status: "approved" | "rejected",
      architectName: string,
      reason?: string,
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
        // ('applied' after DDL succeeds normalizes to 'approved').
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
    [tableDefinition, addToast, refreshPendingSubmissions],
  );

  const createTable = useCallback(
    async (def: TableDefinition): Promise<string | null> => {
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
          status: saved.status || "draft",
        };
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
    [selectedClusterId, selectedDatabaseId, selectedSchemaId, addToast],
  );

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

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      refreshMetadata();
    }
  }, [refreshMetadata]);

  useEffect(() => {
    if (isInitialMount.current) return;
    if (!selectedClusterId) {
      setSchemas([]);
      return;
    }
    api
      .get(`/schemas/cluster/${selectedClusterId}`)
      .then((res) =>
        setSchemas(
          res.data.map((s: any) => ({
            id: s.id,
            name: s.name,
            clusterId: s.cluster_id,
          })),
        ),
      )
      .catch(console.error);
  }, [selectedClusterId]);

  useEffect(() => {
    if (isInitialMount.current) return;
    if (!selectedSchemaId || !selectedClusterId) {
      setTables([]);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
      return;
    }

    api
      .get(`/table-definitions?connectionId=${selectedClusterId}&schemaName=${selectedSchemaId}`)
      .then((res) => {
        const mappedSummary = res.data.map((t: any) => ({
          id: t.id,
          name: t.table_name,
          schemaId: selectedSchemaId,
          columnCount: 0,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          status: t.status,
        }));
        // Strict picker rule (see EnvironmentPanel for the full explanation):
        // the picker is driven by what's physically on the cluster. DART rows
        // never get added as new entries here; they only enrich existing rows
        // by name so the per-table status badge can render. If a DART row has
        // no matching physical entry (table dropped externally, or never
        // applied yet), it is intentionally dropped from the picker.
        setTables((prev) => {
          const dartByName = new Map<string, TableSummary>(
            mappedSummary.map((m: TableSummary) => [m.name, m]),
          );
          return prev.map((p) => {
            const dart = dartByName.get(p.name);
            if (!dart) return p;
            return { ...p, id: dart.id, status: dart.status };
          });
        });
      })
      .catch((err) => {
        console.error(err);
        addToast("error", "Failed to load DART tables.");
      });

    setSelectedTableId("");
    setTableDefinition(null);
    setColumns([]);
  }, [selectedSchemaId, selectedClusterId, addToast]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Skip on mount — persisted state is already loaded
    }
    if (selectedTableId) {
      if (selectedTableId.startsWith("tbl-new-")) {
        // no-op: createTable() already populated state
      } else if (selectedTableId.includes("::")) {
        const [connId, db, schema, tableName] = selectedTableId.split("::");

        api
          .get("/table-definitions/by-key", {
            params: { connectionId: connId, database: db, schema, table: tableName },
          })
          .then((res) => {
            const t = res.data.table;
            setTableDefinition({
              id: selectedTableId,
              tableName: t.table_name,
              entityLogicalName: t.entity_logical_name || "",
              distributionStyle: t.distribution_style || "AUTO",
              schemaName: t.schema_name || schema,
              verticalName: t.vertical_name || "",
              businessArea: t.business_area || "",
              definition: t.definition || "",
              columns: res.data.columns,
            });
            setColumns(res.data.columns.map(columnFromServer));
            setCurrentStep(3);
            setSubmissionStatus(normalizeStatus(t.status));
            setHasUnsavedChanges(false);
          })
          .catch((err) => {
            if (err?.response?.status !== 404) console.error("by-key lookup failed:", err);
            api
              .get(`/clusters/${connId}/columns`, { params: { schema, table: tableName, database: db } })
              .then((res) => {
                const cols = res.data;
                setTableDefinition({
                  id: selectedTableId,
                  tableName: tableName,
                  entityLogicalName: "",
                  distributionStyle: "AUTO",
                  schemaName: schema,
                  verticalName: "",
                  businessArea: "",
                  definition: "",
                  columns: [],
                });
                setColumns(
                  cols.map((c: any) =>
                    columnFromServer({
                      id: `col-${c.column_name}`,
                      column_name: c.column_name,
                      data_type: c.data_type,
                      is_nullable: c.is_nullable === "YES" || c.is_nullable === true,
                      is_primary_key: false,
                      default_value: c.column_default || "",
                      action: "No Change",
                    }),
                  ),
                );
                setCurrentStep(3);
                setSubmissionStatus("draft");
                setHasUnsavedChanges(false);
              })
              .catch((err2) => {
                console.error("Failed to load physical columns:", err2);
                // Both the DART by-key lookup AND the live cluster columns
                // call failed — the table almost certainly no longer exists
                // on the cluster (dropped externally). Clear the stale
                // selection so the right panel returns to its empty state.
                setSelectedTableId("");
                setTableDefinition(null);
                setColumns([]);
                setSubmissionStatus("draft");
                setHasUnsavedChanges(false);
                addToast(
                  "error",
                  `Table "${tableName}" no longer exists in the database.`,
                );
              });
          });
      } else {
        api
          .get(`/table-definitions/${selectedTableId}`)
          .then((res) => {
            setTableDefinition({
              id: res.data.table.id,
              tableName: res.data.table.table_name,
              entityLogicalName: res.data.table.entity_logical_name || "",
              distributionStyle: res.data.table.distribution_style || "AUTO",
              schemaName: res.data.table.schema_name || "",
              verticalName: res.data.table.vertical_name || "",
              businessArea: res.data.table.business_area || "",
              definition: res.data.table.definition || "",
              columns: res.data.columns,
            });
            setColumns(res.data.columns.map(columnFromServer));
            setCurrentStep(3);
            setSubmissionStatus(normalizeStatus(res.data.table.status));
            setHasUnsavedChanges(false);
          })
          .catch((err) => {
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
    { number: 1, label: "Environment", status: currentStep > 1 ? "completed" : currentStep === 1 ? "active" : "pending" },
    { number: 2, label: "Table Selection", status: currentStep > 2 ? "completed" : currentStep === 2 ? "active" : "pending" },
    { number: 3, label: "Actions", status: currentStep === 3 ? "active" : "pending" },
  ];

  const updateColumn = useCallback(
    (id: string, updates: Partial<ColumnDefinition>) => {
      // DDL-affecting fields: editing any of these on an already-applied column
      // must auto-promote action to 'Modify' so the approval pipeline emits
      // an ALTER. Without this, hasPendingChanges would be false for the
      // snapshot and the architect's approve would be a no-op on the target.
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
            next.action === "No Change"
          ) {
            next.action = "Modify";
          }
          return next;
        }),
      );
      setHasUnsavedChanges(true);
    },
    [],
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

  const deleteTable = useCallback(
    async (
      id: string,
      options?: { force?: boolean },
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
    [selectedTableId, addToast],
  );

  const refreshTable = useCallback(async () => {
    if (!selectedTableId || selectedTableId.startsWith("tbl-new-")) return;
    try {
      let res;
      if (selectedTableId.includes("::")) {
        const [connId, db, schema, tableName] = selectedTableId.split("::");
        res = await api.get("/table-definitions/by-key", {
          params: { connectionId: connId, database: db, schema, table: tableName },
        });
      } else {
        res = await api.get(`/table-definitions/${selectedTableId}`);
      }
      const t = res.data.table;
      setTableDefinition({
        id: selectedTableId.includes("::") ? selectedTableId : t.id,
        tableName: t.table_name,
        entityLogicalName: t.entity_logical_name || "",
        distributionStyle: t.distribution_style || "AUTO",
        schemaName: t.schema_name || "",
        verticalName: t.vertical_name || "",
        businessArea: t.business_area || "",
        definition: t.definition || "",
        columns: res.data.columns,
      });
      setColumns(res.data.columns.map(columnFromServer));
      setSelectedColumnId("");
      setRightPanelMode("properties");
      setSubmissionStatus(normalizeStatus(t.status));
      setHasUnsavedChanges(false);
      addToast("success", "Table data refreshed.");
    } catch (err: any) {
      if (selectedTableId.includes("::") && err?.response?.status === 404) {
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
        saveAsDraft,
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
        deleteNotification,
        clearAllNotifications,
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

/**
 * Public provider: mounts Toast + Notifications + Dashboard core in the
 * correct order. Callers continue to wrap the dashboard subtree in a single
 * `<DashboardProvider>` exactly as before.
 *
 * Hydrate the inner Notifications provider from the same persisted blob the
 * core writes back to. The core syncs its localStorage row on every
 * notifications/dismissed change via the values it reads from
 * `useNotifications()` in the effect above, so a single source of truth is
 * preserved across reloads.
 */
export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const persisted = loadPersistedState(user?.id);
  return (
    <ToastProvider>
      <NotificationsProvider
        initialNotifications={persisted?.notifications ?? []}
        initialDismissedSubmissionIds={
          Array.isArray(persisted?.dismissedSubmissionIds) ? persisted.dismissedSubmissionIds : []
        }
      >
        <DashboardCoreProvider>{children}</DashboardCoreProvider>
      </NotificationsProvider>
    </ToastProvider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
