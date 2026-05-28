import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import type { Notification, TableDefinition, ColumnDefinition } from "../types";

interface NotificationsContextType {
  notifications: Notification[];
  dismissedSubmissionIds: string[];
  addNotification: (n: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  refreshPendingSubmissions: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

/**
 * Shape conversion duplicated from DashboardContext intentionally — we want the
 * notifications slice to be self-contained so it can be tested and mounted
 * independently. If the column field set grows, update both this and
 * DashboardContext's columnFromServer.
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

function pendingSubmissionToNotification(s: any): Notification {
  const p = s.payload || {};
  const tablePayload = p.table || {};
  const columnsPayload: any[] = Array.isArray(p.columns) ? p.columns : [];
  const previousColumns: any[] = Array.isArray(p.previousColumns) ? p.previousColumns : [];
  const ddlStatements: string[] = Array.isArray(p.ddlStatements) ? p.ddlStatements : [];
  const dbType = p.dbType;

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
    previousColumns,
    ddlStatements,
    dbType,
  };
}

interface NotificationsProviderProps {
  children: React.ReactNode;
  /** Initial notifications hydrated from localStorage (still owned by DashboardContext). */
  initialNotifications?: Notification[];
  /** Initial dismissed submission ids hydrated from localStorage. */
  initialDismissedSubmissionIds?: string[];
  /** Called whenever notifications/dismissed list mutate, so the persistence layer can save them. */
  onChange?: (state: { notifications: Notification[]; dismissedSubmissionIds: string[] }) => void;
}

export const NotificationsProvider: React.FC<NotificationsProviderProps> = ({
  children,
  initialNotifications = [],
  initialDismissedSubmissionIds = [],
  onChange,
}) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  // Server-sourced submission notifications are regenerated on every poll, so
  // "delete" needs persistence beyond the array — we track the submissionIds
  // the user explicitly removed and filter them out of every subsequent
  // refresh. The list survives reloads via DashboardContext's localStorage.
  const [dismissedSubmissionIds, setDismissedSubmissionIds] = useState<string[]>(initialDismissedSubmissionIds);

  useEffect(() => {
    onChange?.({ notifications, dismissedSubmissionIds });
  }, [notifications, dismissedSubmissionIds, onChange]);

  const addNotification = useCallback((n: Notification) => {
    setNotifications((prev) => [n, ...prev]);
  }, []);

  // Pull pending submissions and merge as architect-targeted notifications.
  // MERGE (don't replace) the server-sourced slice: once a submission notif
  // has been delivered to the bell, it persists locally until the architect
  // explicitly removes it via deleteNotification (which records the id in
  // dismissedSubmissionIds so subsequent refreshes don't resurrect it).
  // This means a notification stays visible after approve/reject — marked
  // as read — instead of vanishing the moment the backend drops it from
  // the pending list. Wiping reviewed notifications surprised architects
  // who expected the bell to be a durable inbox, not a live queue mirror.
  const refreshPendingSubmissions = useCallback(async () => {
    try {
      const res = await api.get("/submissions/pending");
      const dismissed = new Set(dismissedSubmissionIds);
      const incoming: Notification[] = (res.data || [])
        .map(pendingSubmissionToNotification)
        .filter((n: Notification) => !n.submissionId || !dismissed.has(n.submissionId));
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const newOnes = incoming.filter((n) => !existingIds.has(n.id));
        return [...newOnes, ...prev];
      });
    } catch (err) {
      console.error("Failed to load pending submissions:", err);
    }
  }, [dismissedSubmissionIds]);

  useEffect(() => {
    if (user?.role === "architect") {
      refreshPendingSubmissions();
    }
  }, [user?.role, refreshPendingSubmissions]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  // For server-sourced submission notifications, the polling endpoint will
  // re-emit them on every refresh unless we record dismissal here.
  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target?.type === "submission" && target.submissionId) {
        setDismissedSubmissionIds((ids) =>
          ids.includes(target.submissionId!) ? ids : [...ids, target.submissionId!],
        );
      }
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications((prev) => {
      const submissionIds = prev
        .filter((n) => n.type === "submission" && n.submissionId)
        .map((n) => n.submissionId!) as string[];
      if (submissionIds.length > 0) {
        setDismissedSubmissionIds((ids) => Array.from(new Set([...ids, ...submissionIds])));
      }
      return [];
    });
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        dismissedSubmissionIds,
        addNotification,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
        clearAllNotifications,
        refreshPendingSubmissions,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = (): NotificationsContextType => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
};
