import React, { useEffect, useState } from "react";
import { DashboardLayout } from "../components/layout";
import { EnvironmentPanel } from "../components/environment";
import {
  TableToolbar,
  TablePropertiesPanel,
  DeleteTableModal,
} from "../components/table";

import { ColumnDataGrid } from "../components/columns";
import { ReviewDrawer } from "../components/review";
import {
  EmptyState,
  Card,
  Badge,
  Button,
  Modal,
  ArchitectSelector,
  ToastContainer,
} from "../components/common";
import { useDashboard } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { validateColumnDefault } from "../utils/validation";
import api from "../api/client";
import type { Architect } from "../api/architects";

interface DraftRow {
  id: string;
  connection_id: string;
  database_name: string;
  schema_name: string;
  table_name: string;
  updated_at: string;
}

const statusVariant: Record<string, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  applied: "success",
};

const SubmitForApprovalBar: React.FC = () => {
  const { user } = useAuth();
  const {
    tableDefinition,
    columns,
    submissionStatus,
    hasUnsavedChanges,
    saveChanges,
    saveAsDraft,
    submitForReview,
  } = useDashboard();
  const [open, setOpen] = useState(false);
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Block submission when any column's DEFAULT is malformed — the backend
  // would reject anyway, but catching it here surfaces the actionable
  // message right next to the button instead of as a toast after a round-trip.
  const firstInvalidDefault = React.useMemo(() => {
    for (const c of columns) {
      const r = validateColumnDefault(c.defaultValue, c.dataType, `Column "${c.columnName || "?"}"`);
      if (!r.valid && r.error) return r.error;
    }
    return null;
  }, [columns]);

  if (!tableDefinition) return null;

  const isLocked = submissionStatus === "submitted";
  // Only allow submit when there is actually something to review: either the
  // developer has unsaved edits, or this is a freshly created table that has
  // never been submitted yet (status still 'draft'). Re-submitting an
  // already-approved/rejected table with no changes would just churn the
  // architect's queue with an identical snapshot.
  const hasSubmittableWork = hasUnsavedChanges || submissionStatus === "draft";
  const submitDisabled = isLocked || firstInvalidDefault !== null || !hasSubmittableWork;

  const handleConfirm = async () => {
    if (!architect || !user) return;
    setBusy(true);
    try {
      // Persist any in-progress edits before snapshotting them into the
      // submission payload — the architect must see the current state.
      const savedId = await saveChanges();
      if (!savedId) {
        // saveChanges toasted the error; keep the dialog open for retry.
        return;
      }
      const ok = await submitForReview(user.id, architect.id, user.name, savedId);
      if (ok) {
        setOpen(false);
        setArchitect(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-slate-800 truncate">
                {tableDefinition.tableName || "Untitled table"}
              </h3>
              <Badge variant={statusVariant[submissionStatus] ?? "neutral"}>
                {submissionStatus.charAt(0).toUpperCase() + submissionStatus.slice(1)}
              </Badge>
              {hasUnsavedChanges && (
                <span className="text-xs font-medium text-amber-600">
                  Unsaved changes
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Edit metadata and column attributes inline, then submit the table for
              architect approval.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                setSavingDraft(true);
                try {
                  await saveAsDraft();
                } finally {
                  setSavingDraft(false);
                }
              }}
              disabled={isLocked || savingDraft || (!hasUnsavedChanges && submissionStatus !== "draft")}
              title={
                isLocked
                  ? "This table is already pending review."
                  : !hasUnsavedChanges && submissionStatus !== "draft"
                  ? "Nothing to save."
                  : "Save your work as a draft. You can come back and submit it later."
              }
            >
              {savingDraft ? "Saving…" : "Save as Draft"}
            </Button>
            <Button
              variant="primary"
              onClick={() => setOpen(true)}
              disabled={submitDisabled}
              title={
                isLocked
                  ? "This table is already pending review."
                  : firstInvalidDefault
                  ? firstInvalidDefault
                  : !hasSubmittableWork
                  ? "Make a change or create a new table to enable submission."
                  : "Save and submit changes for architect approval."
              }
            >
              Submit for Approval
            </Button>
          </div>
        </div>
        {firstInvalidDefault && (
          <p className="mt-3 text-xs text-red-600">{firstInvalidDefault}</p>
        )}
      </Card>

      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setArchitect(null);
          }
        }}
        title="Submit for Architect Approval"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setArchitect(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={!architect || busy}
            >
              {busy ? "Submitting…" : "Submit for Review"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Choose an architect to review the current table definition. Your edits
            will be saved automatically and snapshotted into the submission payload.
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
    </>
  );
};

const NoTableCenter: React.FC = () => {
  const { selectedClusterId, selectedSchemaId } = useDashboard();

  if (!selectedClusterId || !selectedSchemaId) {
    return (
      <Card>
        <EmptyState
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          }
          title="Configure Environment"
          description="Select a cluster and schema from the left panel to begin managing tables."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Table Management"
      subtitle="Select a table to edit, or create a new one"
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      }
    >
      <TableToolbar />
    </Card>
  );
};

const TableEditCenter: React.FC = () => {
  return (
    <div className="space-y-4">
      <SubmitForApprovalBar />
      <Card
        title="Table Management"
        subtitle="Switch tables or create a new one"
      >
        <TableToolbar />
      </Card>
      <TablePropertiesPanel />
      <ColumnDataGrid />
    </div>
  );
};

const DraftsReminderModal: React.FC = () => {
  const { user } = useAuth();
  const {
    setSelectedClusterId,
    setSelectedDatabaseId,
    setSelectedSchemaId,
    setSelectedTableId,
  } = useDashboard();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [open, setOpen] = useState(false);

  // Per-user, per-session suppression key — re-shown on next login so a
  // forgotten draft can't quietly age out forever.
  const dismissKey = user ? `dart_drafts_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!user || !dismissKey) return;
    if (sessionStorage.getItem(dismissKey) === "1") return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<DraftRow[]>("/table-definitions/drafts/me");
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setDrafts(data);
          setOpen(true);
        }
      } catch (err) {
        // Drafts reminder is non-critical — never block the dashboard.
        console.warn("Failed to load drafts:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, dismissKey]);

  const close = () => setOpen(false);
  const dismissForSession = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, "1");
    close();
  };

  const continueEditing = (d: DraftRow) => {
    setSelectedClusterId(d.connection_id);
    setSelectedDatabaseId(d.database_name);
    setSelectedSchemaId(d.schema_name);
    setSelectedTableId(d.id);
    close();
  };

  if (!open) return null;

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={`You have ${drafts.length} unfinished draft${drafts.length === 1 ? "" : "s"}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={dismissForSession}>
            Dismiss for this session
          </Button>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          The following tables were saved as drafts and haven't been submitted for
          architect approval yet. Pick one to resume editing, or submit it for review.
        </p>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-auto">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {(d.table_name || "").replace(/_/g, " ")}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {d.schema_name} · {d.database_name}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Last edited {new Date(d.updated_at).toLocaleString()}
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={() => continueEditing(d)}>
                Continue Editing
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export const DeveloperDashboard: React.FC = () => {
  const { toasts, dismissToast, tableDefinition } = useDashboard();

  return (
    <>
      <DashboardLayout
        leftPanel={<EnvironmentPanel />}
        // When a table is selected the edit section takes the remaining
        // 9 columns by rendering TableEditCenter as the centerPanel and
        // returning null for rightPanel. DashboardLayout still renders the
        // empty right column at lg:col-span-4, so the inline view spreads
        // out via space-y-4 cards on a single column — which is exactly
        // what a 24-attribute grid wants for horizontal scroll room.
        centerPanel={tableDefinition ? <TableEditCenter /> : <NoTableCenter />}
        rightPanel={tableDefinition ? null : <TablePropertiesPanel />}
      />
      <DraftsReminderModal />
      <DeleteTableModal />
      <ReviewDrawer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
