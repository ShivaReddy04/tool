import React from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, TextInput, Select, Checkbox, Button } from "../common";
import type { DataClassification, RedshiftDataType } from "../../types";

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

export const ColumnDetailPanel: React.FC = () => {
  const {
    columns,
    selectedColumnId,
    updateColumn,
    setSelectedColumnId,
    setRightPanelMode,
  } = useDashboard();

  const column = columns.find((c) => c.id === selectedColumnId);

  if (!column) {
    return null;
  }

  const handleBack = () => {
    setSelectedColumnId("");
    setRightPanelMode("properties");
  };

  return (
    <Card
      title={`Column: ${column.columnName}`}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      }
      headerAction={
        <button
          onClick={handleBack}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Column Name"
          value={column.columnName}
          onChange={(e) =>
            updateColumn(column.id, { columnName: e.target.value })
          }
          required
        />

        <Select
          label="Data Type"
          options={DATA_TYPE_OPTIONS}
          value={column.dataType}
          onChange={(v) => updateColumn(column.id, { dataType: v })}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Checkbox
            label="Is Nullable"
            checked={column.isNullable}
            onChange={(v) => updateColumn(column.id, { isNullable: v })}
          />
          <Checkbox
            label="Primary Key"
            checked={column.isPrimaryKey}
            onChange={(v) => updateColumn(column.id, { isPrimaryKey: v })}
          />
        </div>

        <Select
          label="Data Classification"
          options={CLASSIFICATION_OPTIONS}
          value={column.dataClassification}
          onChange={(v) =>
            updateColumn(column.id, {
              dataClassification: v as DataClassification,
            })
          }
          required
        />

        <TextInput
          label="Data Domain"
          value={column.dataDomain}
          onChange={(e) =>
            updateColumn(column.id, { dataDomain: e.target.value })
          }
          placeholder="e.g., Financial"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Attribute Definition
          </label>
          <textarea
            value={column.attributeDefinition}
            onChange={(e) =>
              updateColumn(column.id, {
                attributeDefinition: e.target.value,
              })
            }
            rows={3}
            placeholder="Business description of this column"
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
        </div>

        <TextInput
          label="Default Value"
          value={column.defaultValue}
          onChange={(e) =>
            updateColumn(column.id, { defaultValue: e.target.value })
          }
          placeholder="e.g., 0, NULL, GETDATE()"
        />

        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={handleBack}>
            Cancel
          </Button>
          <Button variant="primary">Apply Change</Button>
        </div>
      </div>
    </Card>
  );
};
