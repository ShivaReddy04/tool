import React, { useState } from "react";
import { Drawer, Button, Select, TextInput } from "../common";
import { addConnection, testConnection } from "../../api/connections";
import type { DbType } from "../../types";

interface AddConnectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const DB_TYPE_OPTIONS = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mssql", label: "SQL Server" },
  { value: "redshift", label: "Amazon Redshift" },
];

const DEFAULT_PORTS: Record<DbType, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  redshift: 5439,
};

export const AddConnectionDrawer: React.FC<AddConnectionDrawerProps> = ({
  isOpen,
  onClose,
  onAdded,
}) => {
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<DbType>("postgresql");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleDbTypeChange = (value: string) => {
    const dt = value as DbType;
    setDbType(dt);
    setPort(DEFAULT_PORTS[dt]);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const result = await testConnection({ dbType, host, port, database, username, password });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection failed" });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim() || !host.trim() || !database.trim() || !username.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      await addConnection({ name: name.trim(), dbType, host: host.trim(), port, database: database.trim(), username: username.trim(), password });
      resetForm();
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to save connection.");
    }
    setSaving(false);
  };

  const resetForm = () => {
    setName("");
    setDbType("postgresql");
    setHost("localhost");
    setPort(5432);
    setDatabase("");
    setUsername("");
    setPassword("");
    setError("");
    setTestResult(null);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => { resetForm(); onClose(); }}
      title="Add Database Connection"
      subtitle="Connect to PostgreSQL, MySQL, SQL Server, or Redshift"
      footer={
        <>
          <Button variant="secondary" onClick={() => { resetForm(); onClose(); }}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !host || !database || !username || !password}>
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Connection"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {testResult && (
          <div className={`p-3 rounded-xl border text-sm ${
            testResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {testResult.message}
          </div>
        )}

        <TextInput
          label="Connection Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Production PostgreSQL"
          required
        />

        <Select
          label="Database Type"
          options={DB_TYPE_OPTIONS}
          value={dbType}
          onChange={handleDbTypeChange}
          required
        />

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <TextInput
              label="Host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              required
            />
          </div>
          <TextInput
            label="Port"
            type="number"
            value={port.toString()}
            onChange={(e) => setPort(parseInt(e.target.value) || 0)}
            required
          />
        </div>

        <TextInput
          label="Database Name"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
          placeholder="my_database"
          required
        />

        <TextInput
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="postgres"
          required
        />

        <TextInput
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          required
        />
      </div>
    </Drawer>
  );
};
