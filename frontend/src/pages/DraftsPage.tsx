import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import {
  ArchitectSelector,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  ToastContainer,
} from "../components/common";
import { TopBar } from "../components/layout";
import type { Architect } from "../api/architects";

interface DraftRow {
  id: string;
  connection_id: string;
  database_name: string;
  schema_name: string;
  table_name: string;
  entity_logical_name: string | null;
  vertical_name: string | null;
  business_area: string | null;
  updated_at: string;
  created_at: string;
}

export const DraftsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    setSelectedClusterId,
    setSelectedDatabaseId,
    setSelectedSchemaId,
    setSelectedTableId,
    toasts,
    addToast,
    dismissToast,
  } = useDashboard();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitMode, setSubmitMode] = useState<"single" | "bulk">("bulk");
  const [submitTargetId, setSubmitTargetId] = useState<string | null>(null);
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const fetchDrafts = useCallback(async () => {
    try {
      const { data } = await api.get<DraftRow[]>("/table-definitions/drafts/me");
      setDrafts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      addToast("error", "Failed to load drafts.");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const filteredDrafts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return drafts;
    return drafts.filter((d) =>
      [d.table_name, d.schema_name, d.database_name, d.entity_logical_name, d.vertical_name, d.business_area]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [drafts, search]);

  const allFilteredSelected =
    filteredDrafts.length > 0 && filteredDrafts.every((d) => selected.has(d.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      // Deselect just the filtered subset so a user who narrowed the view
      // doesn't accidentally clear selections from rows hidden by search.
      setSelected((prev) => {
        const next = new Set(prev);
        filteredDrafts.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredDrafts.forEach((d) => next.add(d.id));
        return next;
      });
    }
  };

  const continueEditing = (d: DraftRow) => {
    setSelectedClusterId(d.connection_id);
    setSelectedDatabaseId(d.database_name);
    setSelectedSchemaId(d.schema_name);
    setSelectedTableId(d.id);
    navigate("/dashboard");
  };

  const openSubmitOne = (d: DraftRow) => {
    setSubmitMode("single");
    setSubmitTargetId(d.id);
    setArchitect(null);
    setSubmitOpen(true);
  };

  const openSubmitBulk = () => {
    if (selected.size === 0) return;
    setSubmitMode("bulk");
    setSubmitTargetId(null);
    setArchitect(null);
    setSubmitOpen(true);
  };

  const closeSubmit = () => {
    if (busy) return;
    setSubmitOpen(false);
    setArchitect(null);
    setSubmitTargetId(null);
  };

  const submitDraft = async (tableId: string, architectId: string): Promise<boolean> => {
    try {
      await api.post("/submissions", {
        tableId,
        assignedArchitectId: architectId,
        submittedBy: user?.id,
      });
      return true;
    } catch (err: any) {
      console.error(err);
      const data = err?.response?.data;
      const msg = data?.error || data?.message || "Submission failed.";
      addToast("error", msg);
      return false;
    }
  };

  const handleConfirmSubmit = async () => {
    if (!architect || !user) return;
    const targetIds =
      submitMode === "single" && submitTargetId
        ? [submitTargetId]
        : Array.from(selected);
    if (targetIds.length === 0) return;

    setBusy(true);
    let okCount = 0;
    for (const id of targetIds) {
      const ok = await submitDraft(id, architect.id);
      if (ok) okCount += 1;
    }
    setBusy(false);

    if (okCount === targetIds.length) {
      addToast(
        "success",
        okCount === 1
          ? "Draft submitted for review."
          : `${okCount} drafts submitted for review.`,
      );
    } else if (okCount > 0) {
      addToast(
        "info",
        `${okCount} of ${targetIds.length} drafts submitted. Check failed rows.`,
      );
    }

    setSubmitOpen(false);
    setArchitect(null);
    setSubmitTargetId(null);
    // Submitted drafts are no longer drafts — re-fetch and drop them from
    // the selection set.
    setSelected((prev) => {
      const next = new Set(prev);
      targetIds.forEach((id) => next.delete(id));
      return next;
    });
    await fetchDrafts();
  };

  const handleConfirmDelete = async () => {
    const targetIds = Array.from(selected);
    if (targetIds.length === 0) {
      setConfirmDeleteOpen(false);
      return;
    }
    setBusy(true);
    let okCount = 0;
    for (const id of targetIds) {
      try {
        await api.delete(`/table-definitions/${encodeURIComponent(id)}?force=true`);
        okCount += 1;
      } catch (err: any) {
        console.error(err);
        const data = err?.response?.data;
        addToast("error", data?.error || data?.message || `Failed to delete ${id}.`);
      }
    }
    setBusy(false);
    setConfirmDeleteOpen(false);
    setSelected(new Set());
    if (okCount > 0) {
      addToast(
        "success",
        okCount === 1 ? "Draft deleted." : `${okCount} drafts deleted.`,
      );
    }
    await fetchDrafts();
  };

  const selectedCount = selected.size;
  const selectedFromFiltered = filteredDrafts.filter((d) => selected.has(d.id)).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />

      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              ← Back to Dashboard
            </Button>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">My Drafts</h2>
              <p className="text-xs text-slate-500">
                Unsubmitted tables you've saved as drafts. Select rows for bulk
                actions or submit individually for architect review.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="info">{drafts.length} total</Badge>
            <Button variant="outline" size="sm" onClick={fetchDrafts} disabled={loading || busy}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-5">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by table, schema, vertical, business area…"
                  className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  aria-label="Search drafts"
                />
              </div>
              <div className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{selectedCount}</span> selected
                {selectedCount > 0 && selectedFromFiltered !== selectedCount && (
                  <span className="ml-1 text-slate-400">
                    ({selectedFromFiltered} on this view)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openSubmitBulk}
                  disabled={selectedCount === 0 || busy}
                  title={
                    selectedCount === 0
                      ? "Select one or more drafts to submit."
                      : `Submit ${selectedCount} draft${selectedCount === 1 ? "" : "s"} for architect review.`
                  }
                >
                  Submit Selected for Review
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={selectedCount === 0 || busy}
                  title={
                    selectedCount === 0
                      ? "Select one or more drafts to delete."
                      : `Permanently delete ${selectedCount} draft${selectedCount === 1 ? "" : "s"}.`
                  }
                >
                  Delete Selected
                </Button>
              </div>
            </div>
          </Card>

          <Card noPadding>
            {loading ? (
              <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
            ) : drafts.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon={
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                  title="No drafts"
                  description="You don't have any draft tables right now. Tables saved as draft from the dashboard will appear here."
                />
              </div>
            ) : filteredDrafts.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                No drafts match the current search.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleAllFiltered}
                          aria-label="Select all visible drafts"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Table</th>
                      <th className="px-3 py-2 text-left">Entity Logical Name</th>
                      <th className="px-3 py-2 text-left">Schema · Database</th>
                      <th className="px-3 py-2 text-left">Vertical</th>
                      <th className="px-3 py-2 text-left">Business Area</th>
                      <th className="px-3 py-2 text-left">Last Edited</th>
                      <th className="px-3 py-2 text-right w-72">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrafts.map((d) => {
                      const isSelected = selected.has(d.id);
                      return (
                        <tr
                          key={d.id}
                          className={`border-t border-slate-100 hover:bg-slate-50/60 ${
                            isSelected ? "bg-indigo-50/40" : ""
                          }`}
                        >
                          <td className="px-3 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(d.id)}
                              aria-label={`Select ${d.table_name}`}
                            />
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <div className="font-semibold text-slate-800">
                              {(d.table_name || "").replace(/_/g, " ")}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Created {new Date(d.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-middle text-slate-700">
                            {d.entity_logical_name?.trim() || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 align-middle text-slate-700">
                            <div className="font-mono text-xs">{d.schema_name}</div>
                            <div className="text-[11px] text-slate-400">{d.database_name}</div>
                          </td>
                          <td className="px-3 py-3 align-middle text-slate-700">
                            {d.vertical_name?.trim() || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 align-middle text-slate-700">
                            {d.business_area?.trim() || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 align-middle text-xs text-slate-500">
                            {new Date(d.updated_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 align-middle text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => continueEditing(d)}
                              >
                                Continue Editing
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => openSubmitOne(d)}
                              >
                                Submit for Review
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        isOpen={submitOpen}
        onClose={closeSubmit}
        title={
          submitMode === "single"
            ? "Submit Draft for Architect Review"
            : `Submit ${selectedCount} Draft${selectedCount === 1 ? "" : "s"} for Review`
        }
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeSubmit} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmSubmit}
              disabled={!architect || busy}
            >
              {busy
                ? "Submitting…"
                : submitMode === "single"
                ? "Submit"
                : `Submit ${selectedCount} for Review`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {submitMode === "bulk"
              ? "Pick the architect who will review every selected draft. Each table is submitted independently — if one fails its DDL pre-flight, the rest still go through."
              : "Pick the architect who will review this draft."}
          </p>
          <ArchitectSelector
            label="Assign Reviewer"
            value={architect}
            onChange={setArchitect}
            required
            autoFocus
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${selectedCount} draft${selectedCount === 1 ? "" : "s"}?`}
        message={`The selected draft${selectedCount === 1 ? "" : "s"} and their column metadata will be permanently removed from DART. The target database is not affected. This cannot be undone.`}
        variant="danger"
        confirmLabel={`Delete ${selectedCount}`}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
