import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Drawer, Button, Badge } from "../common";
import type { ColumnAction, ColumnDefinition, PreviousColumnSnapshot } from "../../types";
import { COLUMN_FIELDS, type ColumnFieldSpec } from "../columns/columnFields";

const renderReviewCell = (field: ColumnFieldSpec, col: ColumnDefinition): React.ReactNode => {
  const value = field.get(col);
  if (field.kind === "checkbox") {
    return value ? (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-100 text-indigo-700">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    ) : (
      <span className="text-slate-300">—</span>
    );
  }
  const display = String(value ?? "");
  if (!display) return <span className="text-slate-300">—</span>;
  if (field.kind === "select" && field.key === "dataType") {
    return <span className="font-mono">{display}</span>;
  }
  return display;
};

const actionRowStyles: Record<ColumnAction, string> = {
  "No Change": "",
  Modify: "bg-amber-50 border-l-4 border-l-amber-400",
  Add: "bg-emerald-50 border-l-4 border-l-emerald-400",
  Drop: "bg-red-50 border-l-4 border-l-red-400 line-through opacity-60",
};

const actionBadgeVariant: Record<ColumnAction, "neutral" | "info" | "success" | "danger"> = {
  "No Change": "neutral",
  Modify: "info",
  Add: "success",
  Drop: "danger",
};

// information_schema returns is_nullable as "YES" / "NO"; DART's column_definitions
// stores a boolean. Normalize both to boolean for comparison.
const toBoolNullable = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toUpperCase() === "YES";
  return true;
};

interface FieldDiff {
  field: string;
  oldValue: string;
  newValue: string;
}

// DDL-affecting fields only — these are what the architect's approval actually
// pushes to the target cluster, and they're the fields connector.getColumns()
// returns. Other DART metadata (data_classification, attribute_definition,
// etc.) changes aren't diffed here because we have no prior snapshot of them.
const computeFieldDiffs = (
  prev: PreviousColumnSnapshot | undefined,
  col: ColumnDefinition,
): FieldDiff[] => {
  if (!prev) return [];
  const diffs: FieldDiff[] = [];

  if ((prev.data_type || "").toLowerCase() !== (col.dataType || "").toLowerCase()) {
    diffs.push({ field: "Data Type", oldValue: prev.data_type || "—", newValue: col.dataType || "—" });
  }

  const prevNullable = toBoolNullable(prev.is_nullable);
  if (prevNullable !== col.isNullable) {
    diffs.push({ field: "Nullable", oldValue: prevNullable ? "YES" : "NO", newValue: col.isNullable ? "YES" : "NO" });
  }

  const prevDefault = (prev.column_default || "").trim();
  const newDefault = (col.defaultValue || "").trim();
  if (prevDefault !== newDefault) {
    diffs.push({ field: "Default", oldValue: prevDefault || "—", newValue: newDefault || "—" });
  }

  return diffs;
};

const FieldChangeRow: React.FC<{ diff: FieldDiff }> = ({ diff }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="font-medium text-slate-600 min-w-[88px]">{diff.field}:</span>
    <span className="line-through text-red-600 font-mono">{diff.oldValue}</span>
    <span className="text-slate-400">→</span>
    <span className="text-emerald-700 font-mono font-semibold">{diff.newValue}</span>
  </div>
);

const FieldChangesSection: React.FC<{
  cols: ColumnDefinition[];
  previousColumns: PreviousColumnSnapshot[];
}> = ({ cols, previousColumns }) => {
  const prevByName = new Map(previousColumns.map((p) => [p.column_name.toLowerCase(), p]));
  const changes = cols.filter((c) => c.action !== "No Change");

  if (changes.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic px-3 py-2 bg-slate-50 rounded border border-slate-200">
        No column changes in this submission — all columns are unchanged.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {changes.map((col) => {
        const prev = prevByName.get(col.columnName.toLowerCase());

        if (col.action === "Add") {
          return (
            <div key={col.id} className="border-l-4 border-emerald-400 bg-emerald-50 px-3 py-2 rounded">
              <div className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-2">
                <Badge variant="success">Added</Badge>
                <span className="font-mono">{col.columnName}</span>
              </div>
              <div className="text-xs text-slate-700 font-mono ml-1">
                {col.dataType}
                {!col.isNullable && " NOT NULL"}
                {col.isPrimaryKey && " PRIMARY KEY"}
                {col.defaultValue && ` DEFAULT ${col.defaultValue}`}
              </div>
            </div>
          );
        }

        if (col.action === "Drop") {
          return (
            <div key={col.id} className="border-l-4 border-red-400 bg-red-50 px-3 py-2 rounded">
              <div className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-2">
                <Badge variant="danger">Dropped</Badge>
                <span className="font-mono">{col.columnName}</span>
              </div>
              {prev ? (
                <div className="text-xs text-slate-700 font-mono line-through ml-1">
                  was {prev.data_type}
                  {prev.is_nullable === "NO" && " NOT NULL"}
                  {prev.column_default && ` DEFAULT ${prev.column_default}`}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic ml-1">no prior cluster state captured</div>
              )}
            </div>
          );
        }

        // Modify
        const diffs = computeFieldDiffs(prev, col);
        return (
          <div key={col.id} className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 rounded">
            <div className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-2">
              <Badge variant="info">Modified</Badge>
              <span className="font-mono">{col.columnName}</span>
            </div>
            {!prev ? (
              <div className="text-xs text-slate-400 italic ml-1">
                no prior cluster state — column may be new on the target
              </div>
            ) : diffs.length === 0 ? (
              <div className="text-xs text-slate-500 italic ml-1">
                marked Modify but no DDL-affecting field differs from the cluster
              </div>
            ) : (
              <div className="space-y-0.5 ml-1">
                {diffs.map((d) => (
                  <FieldChangeRow key={d.field} diff={d} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


export const ReviewDrawer: React.FC = () => {
  const { user } = useAuth();
  const {
    isReviewDrawerOpen,
    setIsReviewDrawerOpen,
    reviewingNotification,
    setReviewingNotification,
    approveSubmission,
    rejectSubmission,
  } = useDashboard();

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const handleClose = () => {
    setIsReviewDrawerOpen(false);
    setReviewingNotification(null);
    setRejectReason("");
    setShowRejectInput(false);
  };

  const handleApprove = () => {
    approveSubmission(user?.name ?? "Architect");
    setRejectReason("");
    setShowRejectInput(false);
  };

  const handleReject = () => {
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    rejectSubmission(user?.name ?? "Architect", rejectReason || undefined);
    setRejectReason("");
    setShowRejectInput(false);
  };

  const tableDef = reviewingNotification?.tableDefinition;
  const cols = reviewingNotification?.columns ?? [];
  const previousColumns = reviewingNotification?.previousColumns ?? [];

  return (
    <Drawer
      isOpen={isReviewDrawerOpen}
      onClose={handleClose}
      title="Review Submission"
      subtitle={
        reviewingNotification
          ? `Submitted by ${reviewingNotification.submittedBy} — ${new Date(reviewingNotification.timestamp).toLocaleString()}`
          : undefined
      }
      width="xl"
      footer={
        <>
          {showRejectInput && (
            <div className="flex-1">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                autoFocus
              />
            </div>
          )}
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReject}>
            {showRejectInput ? "Confirm Reject" : "Reject"}
          </Button>
          <Button variant="primary" onClick={handleApprove}>
            Approve & Update Data Model
          </Button>
        </>
      }
    >
      {tableDef ? (
        <div className="space-y-6">
          {/* Table Metadata */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Table Metadata
            </h4>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              {[
                { label: "Table Name", value: tableDef.tableName },
                { label: "Entity Logical Name", value: tableDef.entityLogicalName },
                { label: "Distribution Style", value: tableDef.distributionStyle },
                { label: "Schema Name", value: tableDef.schemaName },
                { label: "Vertical Name", value: tableDef.verticalName },
                { label: "Business Area", value: tableDef.businessArea || "" },
                { label: "Total Columns", value: cols.length.toString() },
              ].map((prop) => (
                <div key={prop.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{prop.label}</span>
                  <span className="text-xs font-medium text-slate-700">{prop.value || "—"}</span>
                </div>
              ))}
              {tableDef.definition && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="text-xs text-slate-500 mb-1">Table Definition</div>
                  <div className="text-xs font-medium text-slate-700 whitespace-pre-wrap break-words">
                    {tableDef.definition}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Change Summary */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Change Summary
            </h4>
            <div className="flex gap-3 flex-wrap">
              {(() => {
                const added = cols.filter((c) => c.action === "Add").length;
                const modified = cols.filter((c) => c.action === "Modify").length;
                const dropped = cols.filter((c) => c.action === "Drop").length;
                const unchanged = cols.filter((c) => c.action === "No Change").length;
                return (
                  <>
                    {added > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-xs font-medium text-emerald-700">{added} Added</span>
                      </div>
                    )}
                    {modified > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-medium text-amber-700">{modified} Modified</span>
                      </div>
                    )}
                    {dropped > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs font-medium text-red-700">{dropped} Dropped</span>
                      </div>
                    )}
                    {unchanged > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-xs font-medium text-slate-600">{unchanged} Unchanged</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Field-Level Changes — side-by-side OLD → NEW per modified column,
              built from the live-cluster snapshot captured at submit time. */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Field-Level Changes
            </h4>
            <FieldChangesSection cols={cols} previousColumns={previousColumns} />
          </div>


          {/* Columns Grid — every attribute captured at submit time is shown
              read-only so the architect reviews the exact payload that will
              be persisted on approval. Scroll horizontally to inspect all 24
              fields. */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Columns ({cols.length})
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {COLUMN_FIELDS.map((f) => (
                        <th
                          key={f.key}
                          className="sticky top-0 z-10 bg-slate-50 text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap border-b border-slate-200"
                          style={{ minWidth: f.width, width: f.width }}
                        >
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cols.map((col) => (
                      <tr
                        key={col.id}
                        className={`border-b border-slate-50 ${actionRowStyles[col.action]}`}
                      >
                        {COLUMN_FIELDS.map((f) => {
                          const alignCenter = f.kind === "checkbox";
                          return (
                            <td
                              key={f.key}
                              className={`px-3 py-2 text-slate-700 align-middle ${alignCenter ? "text-center" : ""}`}
                              style={{ minWidth: f.width, width: f.width }}
                            >
                              {f.key === "action" ? (
                                <Badge variant={actionBadgeVariant[col.action]}>
                                  {col.action}
                                </Badge>
                              ) : (
                                renderReviewCell(f, col)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-slate-400">No submission data available.</p>
        </div>
      )}
    </Drawer>
  );
};
