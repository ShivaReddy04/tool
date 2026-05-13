import React, { useState } from "react";
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
import type { Architect } from "../api/architects";

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
    submissionStatus,
    hasUnsavedChanges,
    saveChanges,
    submitForReview,
  } = useDashboard();
  const [open, setOpen] = useState(false);
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [busy, setBusy] = useState(false);

  if (!tableDefinition) return null;

  const isLocked = submissionStatus === "submitted";

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
          <Button
            variant="primary"
            onClick={() => setOpen(true)}
            disabled={isLocked}
            title={
              isLocked
                ? "This table is already pending review."
                : "Save and submit changes for architect approval."
            }
          >
            Submit for Approval
          </Button>
        </div>
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
      <DeleteTableModal />
      <ReviewDrawer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
