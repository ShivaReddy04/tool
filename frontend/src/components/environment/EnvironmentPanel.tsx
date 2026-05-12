import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, Select, Button, Badge } from "../common";
import { AddConnectionDrawer } from "./AddConnectionDrawer";
import {
  listConnections,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
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
    setSelectedTableId,
    setTableDefinition,
    setColumns,
    setCurrentStep,
    selectedClusterId,
    setSelectedClusterId,
    selectedDatabaseId: selectedDatabase,
    setSelectedDatabaseId: setSelectedDatabase,
    selectedSchemaId,
    setSelectedSchemaId,
    selectedBusinessArea,
    setSelectedBusinessArea,
  } = useDashboard();

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
      } catch {
        setDatabases([]);
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
      } catch {
        setSchemas([]);
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

        setTables((prev: TableSummary[]) => {
          const physicalNames = new Set(physicalTables.map((m) => m.name));
          const merged = [...physicalTables];
          for (const p of prev) {
            if (!physicalNames.has(p.name)) {
              merged.push(p);
            }
          }
          return merged;
        });
        setCurrentStep(2);
      } catch {
        setTables([]);
        setTableCount(0);
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
          <Select
            label="Database Connection"
            options={connectionOptions}
            value={selectedConnectionId}
            onChange={(v) => setSelectedConnectionId(v)}
            placeholder={connections.length === 0 ? "No connections yet" : "Select a connection"}
            required
          />

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
    </div>
  );
};
