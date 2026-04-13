import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import api from "../api/client";
import type {
  Cluster,
  Schema,
  BusinessArea,
  TableSummary,
  TableDefinition,
  ColumnDefinition,
  Step,
  Notification,
  SubmissionStatus,
} from "../types";
import type { ToastData } from "../components/common/Toast";

interface DashboardContextType {
  // Environment
  clusters: Cluster[];
  schemas: Schema[];
  businessAreas: BusinessArea[];
  selectedClusterId: string;
  selectedSchemaId: string;
  selectedBusinessAreaId: string;
  setClusters: (clusters: Cluster[]) => void;
  setSchemas: (schemas: Schema[]) => void;
  setBusinessAreas: (areas: BusinessArea[]) => void;
  setSelectedClusterId: (id: string) => void;
  setSelectedSchemaId: (id: string) => void;
  setSelectedBusinessAreaId: (id: string) => void;

  // Tables
  tables: TableSummary[];
  selectedTableId: string;
  tableDefinition: TableDefinition | null;
  setTables: (tables: TableSummary[]) => void;
  setSelectedTableId: (id: string) => void;
  setTableDefinition: (def: TableDefinition | null) => void;

  // Columns
  columns: ColumnDefinition[];
  selectedColumnId: string;
  setColumns: (columns: ColumnDefinition[]) => void;
  setSelectedColumnId: (id: string) => void;
  updateColumn: (id: string, updates: Partial<ColumnDefinition>) => void;

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
  rightPanelMode: "properties" | "column-detail";
  setRightPanelMode: (mode: "properties" | "column-detail") => void;

  // Save & Submit
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
  submissionStatus: SubmissionStatus;
  saveChanges: () => void;
  dryRunValidation: () => Promise<void>;
  submitForReview: (submittedByName: string) => void;

  // Review (Architect)
  reviewingNotification: Notification | null;
  setReviewingNotification: (n: Notification | null) => void;
  isReviewDrawerOpen: boolean;
  setIsReviewDrawerOpen: (open: boolean) => void;
  approveSubmission: (architectName: string) => void;
  rejectSubmission: (architectName: string, reason?: string) => void;

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
  createTable: (def: TableDefinition) => void;
  refreshTable: () => void;
  refreshMetadata: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const STORAGE_KEY = "dart_dashboard_state";

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

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const persisted = loadPersistedState();

  // Environment state — seeded with mock data
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [businessAreas, setBusinessAreas] = useState<BusinessArea[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState(persisted?.selectedClusterId ?? "");
  const [selectedSchemaId, setSelectedSchemaId] = useState(persisted?.selectedSchemaId ?? "");
  const [selectedBusinessAreaId, setSelectedBusinessAreaId] = useState(persisted?.selectedBusinessAreaId ?? "");

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
  const [rightPanelMode, setRightPanelMode] = useState<"properties" | "column-detail">(
    "properties"
  );

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
      selectedSchemaId,
      selectedBusinessAreaId,
      tables,
      selectedTableId,
      tableDefinition,
      columns,
      currentStep,
      hasUnsavedChanges,
      submissionStatus,
      notifications,
    });
  }, [selectedClusterId, selectedSchemaId, selectedBusinessAreaId, tables, selectedTableId, tableDefinition, columns, currentStep, hasUnsavedChanges, submissionStatus, notifications]);

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

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  // Save & Submit actions
  const saveChanges = useCallback(async () => {
    if (!tableDefinition) return;
    try {
      // Map to db format
      const dbTableDef = {
        id: tableDefinition.id?.startsWith('tbl-new') ? undefined : tableDefinition.id,
        connection_id: selectedClusterId,
        database_name: 'default_db',
        schema_name: selectedSchemaId || 'public',
        table_name: tableDefinition.tableName,
        entity_logical_name: tableDefinition.entityLogicalName,
        distribution_style: tableDefinition.distributionStyle,
        keys: tableDefinition.keys,
        vertical_name: tableDefinition.verticalName,
        business_area_id: selectedBusinessAreaId || undefined,
        status: submissionStatus
      };

      const dbColumns = columns.map(c => ({
        id: c.id,
        column_name: c.columnName,
        data_type: c.dataType,
        is_nullable: c.isNullable,
        is_primary_key: c.isPrimaryKey,
        data_classification: c.dataClassification,
        data_domain: c.dataDomain,
        attribute_definition: c.attributeDefinition,
        default_value: c.defaultValue,
        action: c.action,
        sort_order: 0
      }));

      const res = await api.post('/table-definitions', { table: dbTableDef, columns: dbColumns });

      if (!tableDefinition.id || tableDefinition.id.startsWith('tbl-new')) {
        setTableDefinition(prev => prev ? { ...prev, id: res.data.table.id } : null);
      }

      setHasUnsavedChanges(false);
      addToast("success", "Changes saved successfully.");
    } catch (err) {
      console.error(err);
      addToast("error", "Failed to save changes.");
    }
  }, [tableDefinition, columns, selectedClusterId, selectedSchemaId, schemas, selectedBusinessAreaId, submissionStatus, addToast]);

  const dryRunValidation = useCallback(async () => {
    if (!tableDefinition) return;
    try {
      // Map to db format exactly like save changes
      const dbTableDef = {
        connection_id: selectedClusterId,
        database_name: 'default_db',
        schema_name: selectedSchemaId || 'public',
        table_name: tableDefinition.tableName,
      };

      const dbColumns = columns.map(c => ({
        column_name: c.columnName,
        data_type: c.dataType,
        is_nullable: c.isNullable,
        is_primary_key: c.isPrimaryKey,
      }));

      const res = await api.post('/table-definitions/dry-run', { table: dbTableDef, columns: dbColumns });

      addToast("success", res.data.message);
    } catch (err: any) {
      console.error(err);
      addToast("error", err.response?.data?.details || "Failed to validate SQL structure against target connection.");
    }
  }, [tableDefinition, columns, selectedClusterId, selectedSchemaId, addToast]);

  const submitForReview = useCallback(
    async (submittedByName: string) => {
      if (!tableDefinition || !tableDefinition.id || tableDefinition.id.startsWith('tbl-new')) {
        addToast("error", "Please save the table before submitting.");
        return;
      }
      try {
        const res = await api.post('/submissions', { tableId: tableDefinition.id, submittedBy: submittedByName });
        setSubmissionStatus("submitted");
        setHasUnsavedChanges(false);

        const notification: Notification = {
          id: `notif-${Date.now()}`,
          type: "submission",
          title: "Table Submitted for Review",
          message: `${submittedByName} submitted "${tableDefinition.tableName}" for review.`,
          tableName: tableDefinition.tableName,
          submittedBy: submittedByName,
          timestamp: new Date().toISOString(),
          isRead: false,
          targetRole: "architect",
          submissionId: res.data.id,
          tableDefinition: { ...tableDefinition },
          columns: columns.map((c) => ({ ...c })),
        };
        addNotification(notification);
        addToast("success", `"${tableDefinition.tableName}" submitted for Architect review.`);
      } catch (err) {
        console.error(err);
        addToast("error", "Failed to submit for review.");
      }
    },
    [tableDefinition, columns, addNotification, addToast]
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
      } catch (err) {
        console.error(err);
        addToast("error", "Failed to push approval database changes.");
      }
    },
    [reviewingNotification, markNotificationRead, addNotification, addToast]
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
      } catch (err) {
        console.error(err);
        addToast("error", "Failed to record rejection.");
      }
    },
    [reviewingNotification, markNotificationRead, addNotification, addToast]
  );

  // Create table action
  const createTable = useCallback(
    (def: TableDefinition) => {
      const newId = `tbl-new-${Date.now()}`;
      const now = new Date().toISOString().split("T")[0];
      const summary: TableSummary = {
        id: newId,
        name: def.tableName,
        schemaId: selectedSchemaId,
        columnCount: def.columns.length,
        createdAt: now,
        updatedAt: now,
      };
      setTables((prev) => [...prev, summary]);
      setSelectedTableId(newId);
      setTableDefinition({ ...def, id: newId });
      setColumns(def.columns);
      setHasUnsavedChanges(true);
      setSubmissionStatus("draft");
      setCurrentStep(3);
      addToast("success", `Table "${def.tableName}" created. Save and submit when ready.`);
    },
    [selectedSchemaId, addToast]
  );

  // Refresh metadata — reload clusters, schemas, and tables
  const refreshMetadata = useCallback(async () => {
    try {
      const [clusterRes, areaRes] = await Promise.all([
        api.get("/clusters"),
        api.get("/business-areas")
      ]);
      setClusters(clusterRes.data);
      setBusinessAreas(areaRes.data.map((a: any) => ({
        id: a.id,
        name: a.name,
        description: a.description
      })));
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
          const merged = [...mappedSummary];
          const dartNames = new Set(mappedSummary.map((m: any) => m.name));
          for (const p of prev) {
            if (!dartNames.has(p.name)) {
              merged.push(p);
            }
          }
          return merged;
        });
      })
      .catch(err => {
        console.error(err);
        addToast("error", "Failed to load tables.");
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
      api.get(`/table-definitions/${selectedTableId}`)
        .then(res => {
          setTableDefinition({
            id: res.data.table.id,
            tableName: res.data.table.table_name,
            entityLogicalName: res.data.table.entity_logical_name || '',
            distributionStyle: res.data.table.distribution_style || 'AUTO',
            keys: res.data.table.keys || '',
            verticalName: res.data.table.vertical_name || '',
            columns: res.data.columns
          });
          setColumns(res.data.columns.map((c: any) => ({
            id: c.id,
            columnName: c.column_name,
            dataType: c.data_type,
            isNullable: c.is_nullable,
            isPrimaryKey: c.is_primary_key,
            dataClassification: c.data_classification,
            dataDomain: c.data_domain || '',
            attributeDefinition: c.attribute_definition || '',
            defaultValue: c.default_value || '',
            action: c.action
          })));
          setCurrentStep(3);
          setSubmissionStatus(res.data.table.status);
          setHasUnsavedChanges(false);
        })
        .catch(console.error);
    } else {
      setTableDefinition(null);
      setColumns([]);
    }
    setSelectedColumnId("");
    setRightPanelMode("properties");
  }, [selectedTableId]);

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
      setColumns((prev) =>
        prev.map((col) => (col.id === id ? { ...col, ...updates } : col))
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  // Refresh table — reload columns for the currently selected table
  const refreshTable = useCallback(async () => {
    if (!selectedTableId) return;
    try {
      const res = await api.get(`/table-definitions/${selectedTableId}`);
      setTableDefinition({
        id: res.data.table.id,
        tableName: res.data.table.table_name,
        entityLogicalName: res.data.table.entity_logical_name || '',
        distributionStyle: res.data.table.distribution_style || 'AUTO',
        keys: res.data.table.keys || '',
        verticalName: res.data.table.vertical_name || '',
        columns: res.data.columns
      });
      setColumns(res.data.columns.map((c: any) => ({
        id: c.id,
        columnName: c.column_name,
        dataType: c.data_type,
        isNullable: c.is_nullable,
        isPrimaryKey: c.is_primary_key,
        dataClassification: c.data_classification,
        dataDomain: c.data_domain || '',
        attributeDefinition: c.attribute_definition || '',
        defaultValue: c.default_value || '',
        action: c.action
      })));
      setSelectedColumnId("");
      setRightPanelMode("properties");
      setHasUnsavedChanges(false);
      addToast("success", "Table data refreshed.");
    } catch (err) {
      console.error(err);
      addToast("error", "Failed to refresh table data.");
    }
  }, [selectedTableId, addToast]);


  const resetEnvironment = useCallback(() => {
    setSelectedClusterId("");
    setSelectedSchemaId("");
    setSelectedBusinessAreaId("");
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
        businessAreas,
        selectedClusterId,
        selectedSchemaId,
        selectedBusinessAreaId,
        setClusters,
        setSchemas,
        setBusinessAreas,
        setSelectedClusterId,
        setSelectedSchemaId,
        setSelectedBusinessAreaId,
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
        hasUnsavedChanges,
        setHasUnsavedChanges,
        submissionStatus,
        saveChanges,
        dryRunValidation,
        submitForReview,
        reviewingNotification,
        setReviewingNotification,
        isReviewDrawerOpen,
        setIsReviewDrawerOpen,
        approveSubmission,
        rejectSubmission,
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
