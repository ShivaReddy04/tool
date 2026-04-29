import React, { useState } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { useAuth } from "../../context/AuthContext";
import { Card, Select, Button, Badge } from "../common";
import type { ColumnAction } from "../../types";

const ACTION_OPTIONS = [
  { value: "No Change", label: "No Change" },
  { value: "Modify", label: "Modify" },
  { value: "Add", label: "Add" },
  { value: "Drop", label: "Drop" },
];

const actionRowStyles: Record<ColumnAction, string> = {
  "No Change": "",
  Modify: "bg-amber-50 border-l-4 border-l-amber-400",
  Add: "bg-emerald-50 border-l-4 border-l-emerald-400",
  Drop: "bg-red-50 border-l-4 border-l-red-400 line-through opacity-60",
};

export const ColumnDataGrid: React.FC = () => {
  const { user } = useAuth();
  const {
    selectedTableId,
    columns,
    updateColumn,
    selectedColumnId,
    setSelectedColumnId,
    setRightPanelMode,
    hasUnsavedChanges,
    submissionStatus,
    saveChanges,
    dryRunValidation,
    submitForReview,
  } = useDashboard();

  const [searchTerm, setSearchTerm] = useState("");

  const filteredColumns = columns.filter((col) =>
    col.columnName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRowClick = (columnId: string) => {
    setSelectedColumnId(columnId);
    setRightPanelMode("column-detail");
  };

  const handleActionChange = (columnId: string, action: string) => {
    updateColumn(columnId, { action: action as ColumnAction });
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!hasUnsavedChanges || submissionStatus === 'submitted' || !selectedTableId) return;
    setSubmitting(true);
    try {
      await saveChanges();
      await submitForReview(user?.id ?? user?.name ?? 'Unknown', user?.name ?? user?.id ?? 'Unknown');
      setSubmitting(false);
    } catch (err) {
      console.error('Submit for review failed:', err);
      setSubmitting(false);
    }
  };

  if (columns.length === 0) {
    return null;
  }

  return (
    <Card
      title="Column Management"
      subtitle={`${columns.length} columns`}
      noPadding
      headerAction={
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="danger" dot>Unsaved</Badge>
          )}
          {submissionStatus === "submitted" && (
            <Badge variant="info">Submitted</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={dryRunValidation}
            disabled={submissionStatus === "submitted"}
          >
            Dry Run Validation
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!hasUnsavedChanges || submissionStatus === "submitted" || submitting}
          >
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </div>
      }
    >
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search columns..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Column Name
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Data Type
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Nullable
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                PK
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Classification
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col) => (
              <tr
                key={col.id}
                onClick={() => handleRowClick(col.id)}
                className={`
                  border-b border-slate-50 cursor-pointer transition-colors
                  hover:bg-slate-50
                  ${selectedColumnId === col.id ? "ring-2 ring-inset ring-indigo-500" : ""}
                  ${actionRowStyles[col.action]}
                `}
              >
                <td className="px-4 py-3 text-sm font-medium text-slate-800">
                  {col.columnName}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                  {col.dataType}
                </td>
                <td className="px-4 py-3 text-center">
                  {col.isNullable ? (
                    <span className="text-emerald-500 text-sm">Yes</span>
                  ) : (
                    <span className="text-slate-400 text-sm">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {col.isPrimaryKey ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-100 text-indigo-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {col.dataClassification}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Select
                    options={ACTION_OPTIONS}
                    value={col.action}
                    onChange={(v) => handleActionChange(col.id, v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-slate-100">
        <Button
          variant="ghost"
          size="sm"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Add Column
        </Button>
      </div>
    </Card>
  );
};
