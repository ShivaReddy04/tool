import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Drawer, Button, Badge } from "../common";
import type { ColumnAction } from "../../types";

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
                { label: "Keys", value: tableDef.keys },
                { label: "Vertical Name", value: tableDef.verticalName },
                { label: "Total Columns", value: cols.length.toString() },
              ].map((prop) => (
                <div key={prop.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{prop.label}</span>
                  <span className="text-xs font-medium text-slate-700">{prop.value || "—"}</span>
                </div>
              ))}
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

          {/* Columns Grid */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Columns ({cols.length})
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Column Name
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Data Type
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Nullable
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        PK
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Classification
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cols.map((col) => (
                      <tr
                        key={col.id}
                        className={`border-b border-slate-50 ${actionRowStyles[col.action]}`}
                      >
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800">
                          {col.columnName}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 font-mono">
                          {col.dataType}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {col.isNullable ? (
                            <span className="text-emerald-500 text-sm">Yes</span>
                          ) : (
                            <span className="text-slate-400 text-sm">No</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
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
                        <td className="px-4 py-2.5 text-sm text-slate-600">
                          {col.dataClassification}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={actionBadgeVariant[col.action]}>
                            {col.action}
                          </Badge>
                        </td>
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
