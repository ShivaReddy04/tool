import React, { useState, useCallback } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Drawer, Button, TextInput, Select } from "../common";
import type {
  TableDefinition,
  ColumnDefinition,
  DistributionStyle,
  RedshiftDataType,
  DataClassification,
} from "../../types";

const DISTRIBUTION_OPTIONS = [
  { value: "KEY", label: "KEY" },
  { value: "EVEN", label: "EVEN" },
  { value: "ALL", label: "ALL" },
  { value: "AUTO", label: "AUTO" },
];

const DATA_TYPE_OPTIONS: { value: RedshiftDataType; label: string }[] = [
  { value: "SMALLINT", label: "SMALLINT" },
  { value: "INTEGER", label: "INTEGER" },
  { value: "BIGINT", label: "BIGINT" },
  { value: "DECIMAL", label: "DECIMAL" },
  { value: "REAL", label: "REAL" },
  { value: "DOUBLE PRECISION", label: "DOUBLE PRECISION" },
  { value: "BOOLEAN", label: "BOOLEAN" },
  { value: "CHAR", label: "CHAR" },
  { value: "VARCHAR", label: "VARCHAR" },
  { value: "DATE", label: "DATE" },
  { value: "TIMESTAMP", label: "TIMESTAMP" },
  { value: "TIMESTAMPTZ", label: "TIMESTAMPTZ" },
  { value: "SUPER", label: "SUPER" },
];

const CLASSIFICATION_OPTIONS: { value: DataClassification; label: string }[] = [
  { value: "Public", label: "Public" },
  { value: "Internal", label: "Internal" },
  { value: "Confidential", label: "Confidential" },
  { value: "PII", label: "PII" },
  { value: "Restricted", label: "Restricted" },
];

const createEmptyColumn = (index: number): ColumnDefinition => ({
  id: `new-col-${Date.now()}-${index}`,
  columnName: "",
  dataType: "VARCHAR",
  isNullable: true,
  isPrimaryKey: false,
  dataClassification: "Internal",
  dataDomain: "",
  attributeDefinition: "",
  defaultValue: "",
  action: "Add",
});

export const CreateTableDrawer: React.FC = () => {
  const { isCreateTableDrawerOpen, setIsCreateTableDrawerOpen, createTable, selectedSchemaId } = useDashboard();

  const [formData, setFormData] = useState<Omit<TableDefinition, "columns">>({
    tableName: "",
    entityLogicalName: "",
    distributionStyle: "KEY",
    keys: "",
    verticalName: "",
  });

  const [newColumns, setNewColumns] = useState<ColumnDefinition[]>([
    createEmptyColumn(0),
  ]);

  const updateFormField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addColumn = useCallback(() => {
    setNewColumns((prev) => [...prev, createEmptyColumn(prev.length)]);
  }, []);

  const removeColumn = useCallback((id: string) => {
    setNewColumns((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateNewColumn = useCallback(
    (id: string, field: keyof ColumnDefinition, value: string | boolean) => {
      setNewColumns((prev) =>
        prev.map((col) => (col.id === id ? { ...col, [field]: value } : col))
      );
    },
    []
  );

  const handleClose = () => {
    setIsCreateTableDrawerOpen(false);
    setFormData({
      tableName: "",
      entityLogicalName: "",
      distributionStyle: "KEY",
      keys: "",
      verticalName: "",
    });
    setNewColumns([createEmptyColumn(0)]);
  };

  return (
    <Drawer
      isOpen={isCreateTableDrawerOpen}
      onClose={handleClose}
      title="Create New Table"
      subtitle="Define table metadata and columns"
      width="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!formData.tableName || !selectedSchemaId || newColumns.every((c) => !c.columnName)}
            onClick={() => {
              createTable({ ...formData, columns: newColumns });
              handleClose();
            }}
          >
            Validate & Create
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Table Metadata
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Table Name"
              value={formData.tableName}
              onChange={(e) => updateFormField("tableName", e.target.value)}
              placeholder="e.g., fact_transactions"
              required
            />
            <TextInput
              label="Entity Logical Name"
              value={formData.entityLogicalName}
              onChange={(e) =>
                updateFormField("entityLogicalName", e.target.value)
              }
              placeholder="e.g., Financial Transactions"
              required
            />
            <Select
              label="Distribution Style"
              options={DISTRIBUTION_OPTIONS}
              value={formData.distributionStyle}
              onChange={(v) =>
                updateFormField("distributionStyle", v as DistributionStyle)
              }
              required
            />
            <TextInput
              label="Keys"
              value={formData.keys}
              onChange={(e) => updateFormField("keys", e.target.value)}
              placeholder="e.g., txn_id"
              required
            />
            <TextInput
              label="Vertical Name"
              value={formData.verticalName}
              onChange={(e) => updateFormField("verticalName", e.target.value)}
              placeholder="e.g., Finance"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-700">
              Columns ({newColumns.length})
            </h4>
            <Button variant="outline" size="sm" onClick={addColumn}>
              + Add Column
            </Button>
          </div>

          <div className="space-y-3">
            {newColumns.map((col, index) => (
              <div
                key={col.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Column {index + 1}
                  </span>
                  {newColumns.length > 1 && (
                    <button
                      onClick={() => removeColumn(col.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <TextInput
                    label="Column Name"
                    value={col.columnName}
                    onChange={(e) =>
                      updateNewColumn(col.id, "columnName", e.target.value)
                    }
                    placeholder="column_name"
                    required
                  />
                  <Select
                    label="Data Type"
                    options={DATA_TYPE_OPTIONS}
                    value={col.dataType}
                    onChange={(v) => updateNewColumn(col.id, "dataType", v)}
                    required
                  />
                  <Select
                    label="Data Classification"
                    options={CLASSIFICATION_OPTIONS}
                    value={col.dataClassification}
                    onChange={(v) =>
                      updateNewColumn(col.id, "dataClassification", v)
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={col.isNullable}
                      onChange={(e) =>
                        updateNewColumn(col.id, "isNullable", e.target.checked)
                      }
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Nullable
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={col.isPrimaryKey}
                      onChange={(e) =>
                        updateNewColumn(col.id, "isPrimaryKey", e.target.checked)
                      }
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Primary Key
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <TextInput
                    label="Data Domain"
                    value={col.dataDomain}
                    onChange={(e) =>
                      updateNewColumn(col.id, "dataDomain", e.target.value)
                    }
                    placeholder="e.g., Financial"
                  />
                  <TextInput
                    label="Default Value"
                    value={col.defaultValue}
                    onChange={(e) =>
                      updateNewColumn(col.id, "defaultValue", e.target.value)
                    }
                    placeholder="e.g., 0"
                  />
                  <TextInput
                    label="Attribute Definition"
                    value={col.attributeDefinition}
                    onChange={(e) =>
                      updateNewColumn(
                        col.id,
                        "attributeDefinition",
                        e.target.value
                      )
                    }
                    placeholder="Business description"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
