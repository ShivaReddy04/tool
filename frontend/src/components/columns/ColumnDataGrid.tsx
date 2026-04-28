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
    setSelectedRowData,
    hasUnsavedChanges,
    submissionStatus,
    saveChanges,
    dryRunValidation,
    submitForReview,
  } = useDashboard();

  const [searchTerm, setSearchTerm] = useState("");

  // Table rows state
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRows, setTotalRows] = useState<number | null>(null);

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
      // First persist changes
      await saveChanges();
      // Then submit for review
      await submitForReview(user?.id ?? user?.name ?? 'Unknown', user?.name ?? user?.id ?? 'Unknown');
      setSubmitting(false);
    } catch (err) {
      console.error('Submit for review failed:', err);
      setSubmitting(false);
    }
  };

  React.useEffect(() => {
    // Fetch table data when table changes or pagination changes
    const fetchRows = async () => {
      if (!selectedTableId) return;
      setLoadingRows(true);
      try {
        if (selectedTableId.includes('::')) {
          const [connId, db, schema, tableName] = selectedTableId.split('::');
          const res = await (await import('../../api/client')).default.get(`/clusters/${connId}/data`, { params: { schema, table: tableName, database: db } });
          setRows(res.data || []);
          setTotalRows(null);
        } else {
          const res = await (await import('../../api/client')).default.get(`/table-definitions/${selectedTableId}`, { params: { includeRows: true, page, pageSize } });
          setRows(res.data.rows || []);
          setTotalRows(res.data.totalRows ?? null);
        }
      } catch (err) {
        console.error('Failed to load table rows:', err);
      } finally {
        setLoadingRows(false);
      }
    };
    fetchRows();
  }, [selectedTableId, page, pageSize]);

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

      {/* Table data preview: shows sample rows inline in Schema Structure */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-700">Table Data Preview</div>
          <div className="flex items-center gap-2">
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="text-sm p-1 border rounded">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
            <div className="text-sm text-slate-500">{totalRows !== null ? `${Math.min((page-1)*pageSize+1, totalRows)}-${Math.min(page*pageSize, totalRows)} of ${totalRows}` : ''}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                {columns.map((col) => (
                  <th key={col.id} className="text-left px-3 py-2 text-xs text-slate-500">{col.columnName}</th>
                ))}
                <th className="px-3 py-2 text-xs text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr><td className="p-4">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="p-4">No rows</td></tr>
              ) : rows.map((r, idx) => (
                <tr key={idx} className="border-b">
                  {columns.map((col) => (
                    <td key={col.id} className="px-3 py-2 text-sm truncate">{String(r[col.columnName] ?? '')}</td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedRowData(r); setRightPanelMode('row-detail'); }}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page === 1}>Prev</Button>
          <div className="text-sm text-slate-500">Page {page}</div>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p+1)} disabled={totalRows !== null && page*pageSize >= totalRows}>Next</Button>
        </div>
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
