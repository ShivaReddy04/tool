import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
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
  } catch {}
  return null;
}

function persistState(state: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
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
  const saveChanges = useCallback(() => {
    setHasUnsavedChanges(false);
    addToast("success", "Changes saved successfully.");
  }, [addToast]);

  const submitForReview = useCallback(
    (submittedByName: string) => {
      if (!tableDefinition) return;
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
        tableDefinition: { ...tableDefinition },
        columns: columns.map((c) => ({ ...c })),
      };
      addNotification(notification);
      addToast("success", `"${tableDefinition.tableName}" submitted for Architect review.`);
    },
    [tableDefinition, columns, addNotification, addToast]
  );

  // Architect review actions
  const approveSubmission = useCallback(
    (architectName: string) => {
      if (!reviewingNotification) return;

      // Mark submission notification as read
      markNotificationRead(reviewingNotification.id);

      // Update submission status
      setSubmissionStatus("approved");

      // Send approval notification to Developer
      const approvalNotif: Notification = {
        id: `notif-${Date.now()}`,
        type: "approval",
        title: "Table Approved",
        message: `${architectName} approved "${reviewingNotification.tableName}" and updated the data model in Redshift.`,
        tableName: reviewingNotification.tableName,
        submittedBy: architectName,
        timestamp: new Date().toISOString(),
        isRead: false,
        targetRole: "developer",
      };
      addNotification(approvalNotif);

      // Close review drawer
      setIsReviewDrawerOpen(false);
      setReviewingNotification(null);

      addToast("success", `"${reviewingNotification.tableName}" approved — data model updated in Redshift.`);
    },
    [reviewingNotification, markNotificationRead, addNotification, addToast]
  );

  const rejectSubmission = useCallback(
    (architectName: string, reason?: string) => {
      if (!reviewingNotification) return;

      // Mark submission notification as read
      markNotificationRead(reviewingNotification.id);

      // Update submission status
      setSubmissionStatus("rejected");

      // Send rejection notification to Developer
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

      // Close review drawer
      setIsReviewDrawerOpen(false);
      setReviewingNotification(null);

      addToast("info", `"${reviewingNotification.tableName}" has been rejected.`);
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

  // Track whether this is the initial mount (to skip overwriting persisted data)
  const isInitialMount = React.useRef(true);

  // Load tables when a schema is selected
  useEffect(() => {
    if (isInitialMount.current) return; // Skip on mount — persisted state is already loaded
    // TODO: fetch tables from API for selectedSchemaId
    setTables([]);
    setSelectedTableId("");
    setTableDefinition(null);
    setColumns([]);
  }, [selectedSchemaId]);

  // Load table definition & columns when a table is selected
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Skip on mount — persisted state is already loaded
    }
    if (selectedTableId) {
      // TODO: fetch table definition + columns from API
      setCurrentStep(3);
      setSubmissionStatus("draft");
      setHasUnsavedChanges(false);
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
  const refreshTable = useCallback(() => {
    if (!selectedTableId) return;
    // TODO: re-fetch table definition + columns from API
    setSelectedColumnId("");
    setRightPanelMode("properties");
    setHasUnsavedChanges(false);
    addToast("success", "Table data refreshed.");
  }, [selectedTableId, addToast]);

  // Refresh metadata — reload clusters, schemas, and tables
  const refreshMetadata = useCallback(() => {
    // TODO: re-fetch clusters, schemas, businessAreas, and tables from API
    addToast("success", "Metadata refreshed.");
  }, [addToast]);

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
