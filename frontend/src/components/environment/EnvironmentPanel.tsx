import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { useToast } from "../../context/ToastContext";
import { Card, Select, Button, Badge, ConfirmDialog } from "../common";
import { AddConnectionDrawer } from "./AddConnectionDrawer";
import {
  listConnections,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
  deleteConnection,
} from "../../api/connections";
import {
  BUSINESS_AREA_OPTIONS,
  type BusinessArea,
  type DbConnection,
  type TableSummary,
} from "../../types";

const BUSINESS_AREA_DROPDOWN_OPTIONS = BUSINESS_AREA_OPTIONS.map((v) => ({
  value: v,
  label: v,
}));

const DB_TYPE_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mssql: "SQL Server",
  redshift: "Redshift",
};

export const EnvironmentPanel: React.FC = () => {
  const {
    setTables,
    selectedTableId,
    setSelectedTableId,
    tableDefinition,
    setTableDefinition,
    setColumns,
    setCurrentStep,
    setHasUnsavedChanges,
    selectedClusterId,
    setSelectedClusterId,
    selectedDatabaseId: selectedDatabase,
    setSelectedDatabaseId: setSelectedDatabase,
    selectedSchemaId,
    setSelectedSchemaId,
    selectedBusinessArea,
    setSelectedBusinessArea,
  } = useDashboard();

  // Track the live selection in a ref so the table-load effect can react to
  // it without adding it to its dependency array (which would re-fetch on
  // every selection change).
  const selectionRef = useRef<{ id: string; name?: string }>({
    id: selectedTableId,
    name: tableDefinition?.tableName,
  });
  useEffect(() => {
    selectionRef.current = {
      id: selectedTableId,
      name: tableDefinition?.tableName,
    };
  });

  // The Connection/Schema selectors mirror context. The context is the source
  // of truth (and is persisted to localStorage), so we read straight from it.
  // Local *list* state (connections, databases, schemas, …) still lives here
  // because it's transient and rebuilt from the API each time we mount.
  const selectedConnectionId = selectedClusterId;
  const selectedSchema = selectedSchemaId;

  // Connection list
  const [connections, setConnections] = useState<DbConnection[]>([]);

  // Cluster (database) list
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);

  // Schema list
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // Tables state
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableCount, setTableCount] = useState(0);

  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);

  // Delete-connection state machine:
  //   `confirm`   → first confirmation ("Are you sure?")
  //   `force`     → second confirmation only when the backend reported related
  //                 entities (table definitions / change requests will cascade)
  //   `deleting`  → in-flight; disables actions, shows spinner copy
  const [deletePhase, setDeletePhase] = useState<
    "idle" | "confirm" | "force" | "deleting"
  >("idle");
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);

  const { addToast } = useToast();

  // We need to distinguish "panel just mounted with persisted selections"
  // from "user changed the dropdown". On a fresh mount we want to fetch the
  // dependent lists but PRESERVE the persisted selections; on a user change
  // we clear the downstream chain. Refs track the last value we acted on, so
  // we know whether the new effect run is mount-time or a real user edit.
  const lastConnectionId = useRef<string | null>(null);
  const lastDatabase = useRef<string | null>(null);
  const lastSchema = useRef<string | null>(null);

  // Refresh ticker — bumping this re-runs the entire fetch chain even when
  // the selections themselves haven't changed.
  const [refreshTick, setRefreshTick] = useState(0);

  // Load connections on mount (and on Refresh).
  const loadConnections = useCallback(async () => {
    try {
      const data = await listConnections();
      setConnections(data);
    } catch {
      // Not connected or auth issue
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections, refreshTick]);

  // Load databases when the connection changes (or on Refresh).
  useEffect(() => {
    if (!selectedConnectionId) {
      setDatabases([]);
      setDatabase("");
      setSchemas([]);
      setSchemaName("");
      setTables([]);
      setTableCount(0);
      lastConnectionId.current = "";
      return;
    }

    const userChangedConnection =
      lastConnectionId.current !== null &&
      lastConnectionId.current !== selectedConnectionId;
    lastConnectionId.current = selectedConnectionId;

    const load = async () => {
      setLoadingDatabases(true);
      if (userChangedConnection) {
        // Real user change — clear downstream so they don't see a stale
        // db/schema/table from the previous connection.
        setDatabase("");
        setSchemas([]);
        setSchemaName("");
        setTables([]);
        setTableCount(0);
        setSelectedTableId("");
        setTableDefinition(null);
        setColumns([]);
      }
      try {
        const data = await fetchDatabases(selectedConnectionId);
        setDatabases(data);
        // If the persisted database is no longer valid for this connection,
        // drop it — keeps the chain consistent without surprising the user.
        if (selectedDatabase && !data.includes(selectedDatabase)) {
          setDatabase("");
        }
      } catch (err: any) {
        console.error("[env] fetchDatabases failed", err);
        setDatabases([]);
        const backendMsg = err?.response?.data?.error || err?.message;
        addToast(
          "error",
          backendMsg
            ? `Couldn't load databases: ${backendMsg}`
            : "Couldn't load databases. Check the connection credentials and that the host is reachable.",
        );
      }
      setLoadingDatabases(false);
    };
    load();
    // selectedDatabase intentionally excluded — we read it but should not
    // re-run this effect when only the database changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnectionId, refreshTick]);

  // Load schemas when the database changes (or on Refresh).
  useEffect(() => {
    if (!selectedConnectionId || !selectedDatabase) {
      setSchemas([]);
      setSchemaName("");
      setTables([]);
      setTableCount(0);
      lastDatabase.current = "";
      return;
    }

    const userChangedDatabase =
      lastDatabase.current !== null &&
      lastDatabase.current !== selectedDatabase;
    lastDatabase.current = selectedDatabase;

    const load = async () => {
      setLoadingSchemas(true);
      if (userChangedDatabase) {
        setSchemaName("");
        setTables([]);
        setTableCount(0);
        setSelectedTableId("");
        setTableDefinition(null);
        setColumns([]);
      }
      try {
        const data = await fetchSchemas(selectedConnectionId, selectedDatabase);
        setSchemas(data);
        if (selectedSchema && !data.includes(selectedSchema)) {
          setSchemaName("");
        }
        setCurrentStep(1);
      } catch (err: any) {
        console.error("[env] fetchSchemas failed", err);
        setSchemas([]);
        const backendMsg = err?.response?.data?.error || err?.message;
        addToast(
          "error",
          backendMsg
            ? `Couldn't load schemas: ${backendMsg}`
            : "Couldn't load schemas. The role may lack USAGE on information_schema, or the connection timed out.",
        );
      }
      setLoadingSchemas(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnectionId, selectedDatabase, refreshTick]);

  // Load tables when the schema changes (or on Refresh).
  useEffect(() => {
    if (!selectedConnectionId || !selectedDatabase || !selectedSchema) {
      setTables([]);
      setTableCount(0);
      lastSchema.current = "";
      return;
    }

    const userChangedSchema =
      lastSchema.current !== null && lastSchema.current !== selectedSchema;
    lastSchema.current = selectedSchema;

    const load = async () => {
      setLoadingTables(true);
      if (userChangedSchema) {
        setSelectedTableId("");
        setTableDefinition(null);
        setColumns([]);
      }
      try {
        const data = await fetchTables(selectedConnectionId, selectedSchema, selectedDatabase);
        setTableCount(data.length);
        const physicalTables = data.map((t) => ({
          id: `${selectedConnectionId}::${selectedDatabase}::${selectedSchema}::${t.table_name}`,
          name: t.table_name,
          schemaId: selectedSchema,
          columnCount: 0,
          createdAt: "",
          updatedAt: "",
        }));

        // Strict picker rule: the dropdown reflects only tables that
        // physically exist on the target cluster. DART-only rows (drafts /
        // stale-applied metadata for externally-dropped tables) do NOT get
        // surfaced here — if the table isn't in the DB, the picker doesn't
        // know it. We still preserve any DART id/status that was previously
        // attached for a name that IS present, so the per-row "Pending
        // review" badges keep working after a refresh.
        setTables((prev: TableSummary[]) => {
          const dartByName = new Map(
            prev
              .filter((p) => !p.id.includes("::") && p.status)
              .map((p) => [p.name, p] as const),
          );
          return physicalTables.map((phys) => {
            const dart = dartByName.get(phys.name);
            return dart ? { ...phys, id: dart.id, status: dart.status } : phys;
          });
        });

        // If the currently-selected table is no longer physically present
        // (someone dropped it externally before this refresh), clear the
        // selection so the right panel stops showing stale columns. Using
        // the ref avoids re-firing this load on every selection change.
        const sel = selectionRef.current;
        const physicalNames = new Set(physicalTables.map((p) => p.name));
        if (sel.name && !physicalNames.has(sel.name) && !sel.id.startsWith("tbl-new-")) {
          setSelectedTableId("");
          setTableDefinition(null);
          setColumns([]);
          setHasUnsavedChanges(false);
          addToast(
            "info",
            `Table "${sel.name}" is no longer in the database. Selection cleared.`,
          );
        }

        setCurrentStep(2);
      } catch (err: any) {
        console.error("[env] fetchTables failed", err);
        setTables([]);
        setTableCount(0);
        const backendMsg = err?.response?.data?.error || err?.message;
        addToast(
          "error",
          backendMsg
            ? `Couldn't load tables: ${backendMsg}`
            : "Couldn't load tables for this schema.",
        );
      }
      setLoadingTables(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnectionId, selectedDatabase, selectedSchema, refreshTick]);

  // Local wrappers that write straight to context so the dropdowns are
  // controlled by the persisted source of truth.
  const setSelectedConnectionId = (v: string) => setSelectedClusterId(v);
  const setDatabase = (v: string) => setSelectedDatabase(v);
  const setSchemaName = (v: string) => setSelectedSchemaId(v);

  const handleRefresh = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  // Clears every piece of session state that depended on the deleted
  // connection: cluster/db/schema selections in context, the local panel's
  // dropdown caches, table list, and any in-progress table edit. Called
  // unconditionally after a successful delete — if the deleted connection
  // wasn't the active one, these clears are no-ops anyway because they only
  // fire when the deletion targeted the currently-selected id.
  const clearActiveSessionForDeletedConnection = useCallback(
    (deletedId: string) => {
      if (selectedConnectionId !== deletedId) return;
      setSelectedClusterId("");
      setSelectedDatabase("");
      setSelectedSchemaId("");
      setSelectedBusinessArea("");
      setDatabases([]);
      setSchemas([]);
      setTables([]);
      setTableCount(0);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
      lastConnectionId.current = "";
      lastDatabase.current = "";
      lastSchema.current = "";
    },
    [
      selectedConnectionId,
      setSelectedClusterId,
      setSelectedDatabase,
      setSelectedSchemaId,
      setSelectedBusinessArea,
      setTables,
      setSelectedTableId,
      setTableDefinition,
      setColumns,
    ],
  );

  const runDelete = useCallback(
    async (force: boolean) => {
      if (!selectedConnectionId) return;
      const deletedId = selectedConnectionId;
      setDeletePhase("deleting");
      try {
        await deleteConnection(deletedId, force);
        clearActiveSessionForDeletedConnection(deletedId);
        await loadConnections();
        addToast("success", "Connection deleted successfully");
        setDeletePhase("idle");
        setDeleteWarnings([]);
      } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        // 409 = backend wants explicit force because of related entities.
        // Pull the warning copy from the response and surface a second
        // confirmation rather than silently cascading.
        if (status === 409 && Array.isArray(data?.details?.warnings)) {
          setDeleteWarnings(data.details.warnings);
          setDeletePhase("force");
          return;
        }
        console.error("[delete-connection] failed", err);
        const msg = data?.error || data?.message || "Failed to delete connection";
        addToast("error", msg);
        setDeletePhase("idle");
        setDeleteWarnings([]);
      }
    },
    [
      selectedConnectionId,
      clearActiveSessionForDeletedConnection,
      loadConnections,
      addToast,
    ],
  );

  const selectedConn = connections.find((c) => c.id === selectedConnectionId);
  const isReady = !!selectedConnectionId && !!selectedDatabase && !!selectedSchema;

  const connectionOptions = connections.map((c) => ({
    value: c.id,
    label: `${c.name} (${DB_TYPE_LABELS[c.dbType] || c.dbType})`,
  }));

  const databaseOptions = databases.map((d) => ({
    value: d,
    label: d,
  }));

  const schemaOptions = schemas.map((s) => ({
    value: s,
    label: s,
  }));

  return (
    <div className="space-y-4">
      <Card
        title="Environment Setup"
        subtitle="Connect to your database"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        }
      >
        <div className="space-y-4">
          {/* Step 1: Database Connection */}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Select
                label="Database Connection"
                options={connectionOptions}
                value={selectedConnectionId}
                onChange={(v) => setSelectedConnectionId(v)}
                placeholder={connections.length === 0 ? "No connections yet" : "Select a connection"}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteWarnings([]);
                setDeletePhase("confirm");
              }}
              disabled={!selectedConnectionId || deletePhase === "deleting"}
              title={
                !selectedConnectionId
                  ? "Select a connection to delete"
                  : "Delete this connection"
              }
              aria-label="Delete selected connection"
              className="
                flex-shrink-0 inline-flex items-center justify-center
                w-10 h-[38px] rounded-xl border border-red-200
                text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700
                transition-colors duration-150
                disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-red-400
              "
            >
              {deletePhase === "deleting" ? (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              )}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={() => setIsAddDrawerOpen(true)}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Add Connection
          </Button>

          {/* Step 2: Cluster (Database) */}
          {selectedConnectionId && (
            <Select
              label="Cluster"
              options={databaseOptions}
              value={selectedDatabase}
              onChange={(v) => setSelectedDatabase(v)}
              placeholder={loadingDatabases ? "Loading databases..." : "Select a database"}
              disabled={loadingDatabases || databases.length === 0}
              required
            />
          )}

          {/* Step 3: Schema */}
          {selectedDatabase && (
            <Select
              label="Schema"
              options={schemaOptions}
              value={selectedSchema}
              onChange={(v) => setSchemaName(v)}
              placeholder={loadingSchemas ? "Loading schemas..." : "Select a schema"}
              disabled={loadingSchemas || schemas.length === 0}
              required
            />
          )}

          {selectedSchema && (
            <div className="text-xs text-slate-500">
              {loadingTables ? "Loading tables..." : `${tableCount} table${tableCount !== 1 ? "s" : ""} found`}
            </div>
          )}

          {/* Business Area lives at the environment level: it scopes the tables
              a developer is about to create or edit, so it belongs alongside
              cluster/schema rather than in per-table metadata. Optional —
              normal tables don't need to pick one; it's primarily for XBI
              Tables / Database Source classification. */}
          {selectedSchema && (
            <Select
              label="Business Area (optional)"
              options={BUSINESS_AREA_DROPDOWN_OPTIONS}
              value={selectedBusinessArea}
              onChange={(v) => setSelectedBusinessArea(v as BusinessArea)}
              placeholder="Select if applicable"
            />
          )}

          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={handleRefresh}
            disabled={loadingDatabases || loadingSchemas || loadingTables}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            {loadingDatabases || loadingSchemas || loadingTables ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </Card>

      <Card title="Connection Status">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Status</span>
            <Badge variant={isReady ? "success" : "neutral"} dot>
              {isReady ? "Connected" : "Not Connected"}
            </Badge>
          </div>
          {selectedConn && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Connection</span>
                <span className="text-xs font-medium text-slate-700">{selectedConn.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Type</span>
                <Badge variant="info">{DB_TYPE_LABELS[selectedConn.dbType] || selectedConn.dbType}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Host</span>
                <span className="text-xs font-medium text-slate-700">{selectedConn.host}:{selectedConn.port}</span>
              </div>
            </>
          )}
          {selectedDatabase && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Cluster</span>
              <span className="text-xs font-medium text-slate-700">{selectedDatabase}</span>
            </div>
          )}
          {selectedSchema && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Schema</span>
              <span className="text-xs font-medium text-slate-700">{selectedSchema}</span>
            </div>
          )}
          {selectedBusinessArea && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Business Area</span>
              <span className="text-xs font-medium text-slate-700">{selectedBusinessArea}</span>
            </div>
          )}
        </div>
      </Card>

      <AddConnectionDrawer
        isOpen={isAddDrawerOpen}
        onClose={() => setIsAddDrawerOpen(false)}
        onAdded={loadConnections}
      />

      {/* First-pass confirmation. If the backend rejects with 409, the next
          dialog (`force`) supplements this with the cascade warnings. */}
      <ConfirmDialog
        isOpen={deletePhase === "confirm"}
        onClose={() => setDeletePhase("idle")}
        onConfirm={() => runDelete(false)}
        title="Delete Connection"
        message={
          selectedConn
            ? `Are you sure you want to delete this connection? "${selectedConn.name}" will be permanently removed.`
            : "Are you sure you want to delete this connection?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Cascade-warning confirmation: only shown when the backend reports
          related table_definitions / change_requests. Requires the user to
          type DELETE to proceed because the cascade is irreversible. */}
      <ConfirmDialog
        isOpen={deletePhase === "force"}
        onClose={() => {
          setDeletePhase("idle");
          setDeleteWarnings([]);
        }}
        onConfirm={() => runDelete(true)}
        title="Delete connection and related data?"
        message={
          (selectedConn
            ? `Deleting "${selectedConn.name}" will also remove related DART data:\n\n`
            : "Deleting this connection will also remove related DART data:\n\n") +
          deleteWarnings.map((w) => `• ${w}`).join("\n") +
          "\n\nThis cannot be undone."
        }
        confirmLabel="Delete everything"
        cancelLabel="Cancel"
        variant="danger"
        requireTypedConfirmation="DELETE"
      />
    </div>
  );
};
