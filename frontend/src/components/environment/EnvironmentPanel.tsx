import React, { useState, useEffect, useCallback } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, Select, Button, Badge } from "../common";
import { AddConnectionDrawer } from "./AddConnectionDrawer";
import {
  listConnections,
  fetchDatabases,
  fetchSchemas,
  fetchTables,
} from "../../api/connections";
import type { DbConnection, TableSummary } from "../../types";

const DB_TYPE_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mssql: "SQL Server",
  redshift: "Redshift",
};

export const EnvironmentPanel: React.FC = () => {
  const {
    businessAreas,
    selectedBusinessAreaId,
    setSelectedBusinessAreaId,
    setTables,
    setSelectedTableId,
    setTableDefinition,
    setColumns,
    setCurrentStep,
    setSelectedClusterId,
    selectedDatabaseId: selectedDatabase,
    setSelectedDatabaseId: setSelectedDatabase,
    setSelectedSchemaId,
  } = useDashboard();

  // Connection state
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");

  // Update Context when selection changes
  useEffect(() => {
    setSelectedClusterId(selectedConnectionId);
  }, [selectedConnectionId, setSelectedClusterId]);

  // Cluster (database) state
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);

  // Schema state
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  useEffect(() => {
    setSelectedSchemaId(selectedSchema);
  }, [selectedSchema, setSelectedSchemaId]);

  // Tables state
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableCount, setTableCount] = useState(0);

  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);

  // Load connections on mount
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
  }, [loadConnections]);

  // Load databases (clusters) when connection is selected
  useEffect(() => {
    if (!selectedConnectionId) {
      setDatabases([]);
      setSelectedDatabase("");
      setSchemas([]);
      setSelectedSchema("");
      setTables([]);
      setTableCount(0);
      return;
    }

    const load = async () => {
      setLoadingDatabases(true);
      setSelectedDatabase("");
      setSchemas([]);
      setSelectedSchema("");
      setTables([]);
      setTableCount(0);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
      try {
        const data = await fetchDatabases(selectedConnectionId);
        setDatabases(data);
      } catch {
        setDatabases([]);
      }
      setLoadingDatabases(false);
    };
    load();
  }, [selectedConnectionId, setTables, setSelectedTableId, setTableDefinition, setColumns]);

  // Load schemas when cluster (database) is selected
  useEffect(() => {
    if (!selectedConnectionId || !selectedDatabase) {
      setSchemas([]);
      setSelectedSchema("");
      setTables([]);
      setTableCount(0);
      return;
    }

    const load = async () => {
      setLoadingSchemas(true);
      setSelectedSchema("");
      setTables([]);
      setTableCount(0);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
      try {
        const data = await fetchSchemas(selectedConnectionId, selectedDatabase);
        setSchemas(data);
        setCurrentStep(1);
      } catch {
        setSchemas([]);
      }
      setLoadingSchemas(false);
    };
    load();
  }, [selectedConnectionId, selectedDatabase, setTables, setSelectedTableId, setTableDefinition, setColumns, setCurrentStep]);

  // Load tables when schema is selected
  useEffect(() => {
    if (!selectedConnectionId || !selectedDatabase || !selectedSchema) {
      setTables([]);
      setTableCount(0);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
      return;
    }

    const load = async () => {
      setLoadingTables(true);
      setSelectedTableId("");
      setTableDefinition(null);
      setColumns([]);
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
  }, [selectedConnectionId, selectedDatabase, selectedSchema, setTables, setSelectedTableId, setTableDefinition, setColumns, setCurrentStep]);

  const selectedConn = connections.find((c) => c.id === selectedConnectionId);
  const isReady = selectedConnectionId && selectedDatabase && selectedSchema;

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

  const businessAreaOptions = businessAreas.map((ba) => ({
    value: ba.id,
    label: ba.name,
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
              onChange={(v) => setSelectedSchema(v)}
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

          <Select
            label="Business Area"
            options={businessAreaOptions}
            value={selectedBusinessAreaId}
            onChange={(v) => setSelectedBusinessAreaId(v)}
            placeholder="Select business area"
          />

          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={loadConnections}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            Refresh
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
