import React, { useState, useEffect } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, TextInput, Button } from "../common";

export const RowDetailPanel: React.FC = () => {
  const dashboard = useDashboard() as any;
  const { selectedRowData, setSelectedRowData, selectedTableId, tableDefinition, addToast, refreshTable, setRightPanelMode, setHasUnsavedChanges } = dashboard;

  // Initialize hooks at top level (required by React Rules of Hooks)
  const [updatedRow, setUpdatedRow] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Update state when selectedRowData changes
  useEffect(() => {
    if (selectedRowData) {
      setUpdatedRow({ ...selectedRowData });
    }
  }, [selectedRowData]);

  // Early return after all hooks
  if (!selectedRowData) return null;

  const originalRow = selectedRowData;

  // Determine connection metadata
  let connId: string | null = null;
  let databaseName: string | null = null;
  let schemaName: string | null = null;
  let tableName: string | null = null;

  if (typeof selectedTableId === 'string' && selectedTableId.includes('::')) {
    [connId, databaseName, schemaName, tableName] = selectedTableId.split('::');
  } else if (tableDefinition && (tableDefinition as any).connection_id) {
    connId = (tableDefinition as any).connection_id;
    databaseName = (tableDefinition as any).database_name || undefined;
    schemaName = (tableDefinition as any).schema_name || 'public';
    tableName = (tableDefinition as any).tableName || (tableDefinition as any).table_name;
  }

  const handleChange = (colName: string, value: any) => {
    setUpdatedRow((prev: any) => ({ ...prev, [colName]: value }));
  };

  const handleCancel = () => {
    setSelectedRowData(null);
    setRightPanelMode("properties");
  };

  const handleApply = async () => {
    if (!connId || !schemaName || !tableName) {
      addToast("error", "Unable to determine target connection for this row.");
      return;
    }
    setSaving(true);
    try {
      const api = (await import('../../api/client')).default;
      const res = await api.post(`/clusters/${connId}/data`, { originalRow, updatedRow }, { params: { schema: schemaName, table: tableName, database: databaseName } });
      if (res.data && res.data.success) {
        addToast('success', 'Row updated successfully');
        setSelectedRowData(null);
        setRightPanelMode('properties');
        setHasUnsavedChanges(true);
        refreshTable();
      } else {
        addToast('error', res.data?.message || 'Update failed');
      }
    } catch (err: any) {
      console.error('Row update failed', err);
      addToast('error', err.response?.data?.error || err.message || 'Failed to update row');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={`Edit Row`}
      headerAction={
        <button onClick={handleCancel} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Back</button>
      }
    >
      <div className="space-y-3">
        {Object.keys(originalRow).map((col) => (
          <TextInput
            key={col}
            label={col}
            value={String(updatedRow[col] ?? '')}
            onChange={(e) => handleChange(col, e.target.value)}
          />
        ))}

        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleApply} disabled={saving}>{saving ? 'Applying...' : 'Apply Change'}</Button>
        </div>
      </div>
    </Card>
  );
};
