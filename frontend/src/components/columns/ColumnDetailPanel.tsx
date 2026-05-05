import React, { useState } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { useAuth } from "../../context/AuthContext";
import { Card, TextInput, Select, Checkbox, Button, Modal, ArchitectSelector } from "../common";
import type { DataClassification, RedshiftDataType } from "../../types";
import type { Architect } from "../../api/architects";

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
  const { user } = useAuth();
  const {
    columns,
    selectedColumnId,
    selectedTableId,
    updateColumn,
    setSelectedColumnId,
    setRightPanelMode,
    hasUnsavedChanges,
    submissionStatus,
    saveChanges,
    submitForReview,
  } = useDashboard();

  const [submitting, setSubmitting] = useState(false);
  const [isReviewerDialogOpen, setIsReviewerDialogOpen] = useState(false);
  const [selectedArchitect, setSelectedArchitect] = useState<Architect | null>(null);

  const column = columns.find((c) => c.id === selectedColumnId);
  if (!column) return null;

  const submitDisabled =
    !hasUnsavedChanges ||
    submissionStatus === "submitted" ||
    !selectedTableId ||
    submitting;

  const handleBack = () => {
    setSelectedColumnId("");
    setRightPanelMode("properties");
  };

  const openReviewerDialog = () => {
    if (submitDisabled) return;
    setSelectedArchitect(null);
    setIsReviewerDialogOpen(true);
  };

  const closeReviewerDialog = () => {
    if (submitting) return;
    setIsReviewerDialogOpen(false);
    setSelectedArchitect(null);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedArchitect || submitting) return;
    setSubmitting(true);
    try {
      const savedId = await saveChanges();
      if (!savedId) return;
      const ok = await submitForReview(
        user?.id ?? user?.name ?? "Unknown",
        selectedArchitect.id,
        user?.name ?? user?.id ?? "Unknown",
        savedId
      );
      if (ok) {
        setIsReviewerDialogOpen(false);
        setSelectedArchitect(null);
      }
    } catch (err) {
      console.error("Submit for review failed:", err);
    } finally {
      setSubmitting(false);
    }
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
          onChange={(e) => updateColumn(column.id, { columnName: e.target.value })}
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
            updateColumn(column.id, { dataClassification: v as DataClassification })
          }
          required
        />

        <TextInput
          label="Data Domain"
          value={column.dataDomain}
          onChange={(e) => updateColumn(column.id, { dataDomain: e.target.value })}
          placeholder="e.g., Financial"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Attribute Definition
          </label>
          <textarea
            value={column.attributeDefinition}
            onChange={(e) =>
              updateColumn(column.id, { attributeDefinition: e.target.value })
            }
            rows={3}
            placeholder="Business description of this column"
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
        </div>

        <TextInput
          label="Default Value"
          value={column.defaultValue}
          onChange={(e) => updateColumn(column.id, { defaultValue: e.target.value })}
          placeholder="e.g., 0, NULL, GETDATE()"
        />

        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={handleBack} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={openReviewerDialog}
            disabled={submitDisabled}
          >
            {submitting ? "Submitting..." : "Submit for Review"}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isReviewerDialogOpen}
        onClose={closeReviewerDialog}
        title="Submit for Architect Review"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeReviewerDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmSubmit}
              disabled={!selectedArchitect || submitting}
            >
              {submitting ? "Submitting..." : "Submit for Review"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Choose an architect to review the proposed changes. They'll be notified
            and the submission will appear in their review queue.
          </p>
          <ArchitectSelector
            label="Assign Reviewer"
            value={selectedArchitect}
            onChange={setSelectedArchitect}
            required
            autoFocus
          />
        </div>
      </Modal>
    </Card>
  );
};
