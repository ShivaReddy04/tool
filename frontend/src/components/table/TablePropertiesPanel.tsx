import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Card, Button, Badge, TextInput, Select } from "../common";
import {
  BUSINESS_AREA_OPTIONS,
  VERTICAL_NAME_OPTIONS,
  type BusinessArea,
  type DistributionStyle,
  type TableDefinition,
  type VerticalName,
} from "../../types";
import { sanitizeSchemaInput, validateSchemaName } from "../../utils/validation";
import {
  generateEntityLogicalName,
  generateTableName,
} from "../../utils/abbreviations";

const DISTRIBUTION_OPTIONS: { value: DistributionStyle; label: string }[] = [
  { value: "KEY", label: "KEY" },
  { value: "EVEN", label: "EVEN" },
  { value: "ALL", label: "ALL" },
  { value: "AUTO", label: "AUTO" },
];

const VERTICAL_OPTIONS = VERTICAL_NAME_OPTIONS.map((v) => ({ value: v, label: v }));
const BUSINESS_AREA_DROPDOWN_OPTIONS = BUSINESS_AREA_OPTIONS.map((v) => ({ value: v, label: v }));

const buildVerticalOptions = (current: string) => {
  // Existing rows may carry a free-text vertical that pre-dates the dropdown
  // (e.g. "Finance"). Surface it as a one-off option so editing doesn't
  // silently overwrite legitimate legacy values.
  const known = (VERTICAL_NAME_OPTIONS as readonly string[]).includes(current);
  if (!current || known) return VERTICAL_OPTIONS;
  return [...VERTICAL_OPTIONS, { value: current, label: `${current} (legacy)` }];
};

export const TablePropertiesPanel: React.FC = () => {
  const { hasRole } = useAuth();
  const {
    tableDefinition,
    columns,
    submissionStatus,
    setTableDefinition,
    setHasUnsavedChanges,
    saveChanges,
    addToast,
    refreshTable,
  } = useDashboard();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TableDefinition | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshTable();
    } finally {
      setRefreshing(false);
    }
  };

  // Reset edit mode when the underlying table changes — prevents stale
  // drafts leaking across table selections.
  useEffect(() => {
    setIsEditing(false);
    setDraft(null);
    setShowErrors(false);
  }, [tableDefinition?.id]);

  const schemaCheck = useMemo(
    () => validateSchemaName(draft?.schemaName || ""),
    [draft?.schemaName]
  );

  if (!tableDefinition) {
    return (
      <Card title="Table Properties">
        <p className="text-sm text-slate-400 text-center py-8">
          Select a table to view its properties.
        </p>
      </Card>
    );
  }

  const startEdit = () => {
    // Table Name is stored as a SQL identifier ("Emp_Sls_Fct") but the form
    // shows spaces. Convert when entering edit mode; saveEdit converts back.
    setDraft({
      ...tableDefinition,
      tableName: tableDefinition.tableName.replace(/_/g, " "),
    });
    setIsEditing(true);
    setShowErrors(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
    setShowErrors(false);
  };

  const saveEdit = async () => {
    if (!draft) return;
    if (!draft.tableName.trim()) {
      setShowErrors(true);
      addToast("error", "Table name is required.");
      return;
    }
    if (!schemaCheck.valid) {
      setShowErrors(true);
      addToast("error", schemaCheck.error || "Schema name is invalid.");
      return;
    }

    setSaving(true);
    const canonicalTableName = draft.tableName.trim().replace(/\s+/g, "_");
    // Push the draft into the global table definition so saveChanges sees it.
    setTableDefinition({
      ...draft,
      tableName: canonicalTableName,
      schemaName: schemaCheck.sanitized,
    });
    setHasUnsavedChanges(true);

    // Defer save by one tick so React applies the state update before
    // saveChanges reads from context.
    await new Promise((r) => setTimeout(r, 0));
    const result = await saveChanges();
    setSaving(false);
    if (result !== null) {
      setIsEditing(false);
      setDraft(null);
      setShowErrors(false);
    }
  };

  const updateDraft = (patch: Partial<TableDefinition>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  // Table Name is persisted with underscores ("Emp_Sls_Fct") but rendered with
  // spaces, matching the create/edit forms.
  const displayTableName = tableDefinition.tableName.replace(/_/g, " ");

  const properties = [
    { label: "Table Name", value: displayTableName },
    { label: "Entity Logical Name", value: tableDefinition.entityLogicalName },
    { label: "Schema Name", value: tableDefinition.schemaName },
    { label: "Distribution Style", value: tableDefinition.distributionStyle },
    { label: "Vertical Name", value: tableDefinition.verticalName },
    { label: "Business Area", value: tableDefinition.businessArea || "" },
    { label: "Total Columns", value: columns.length.toString() },
  ];

  const statusVariant: Record<string, "neutral" | "info" | "success" | "danger"> = {
    draft: "neutral",
    submitted: "info",
    approved: "success",
    rejected: "danger",
  };

  const canEdit = hasRole("architect") || hasRole("developer");

  return (
    <Card
      title="Table Properties"
      subtitle={displayTableName}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      }
      headerAction={
        isEditing && canEdit ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              loading={refreshing}
              title="Reload table definition and columns from server"
              icon={
                !refreshing ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : undefined
              }
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={startEdit}>
                Edit
              </Button>
            )}
          </div>
        )
      }
    >
      {isEditing && draft ? (
        <div className="space-y-4">
          <TextInput
            label="Table Name"
            value={draft.tableName}
            onChange={(e) => {
              // Continuous physical table name: no spaces, no underscores.
              const raw = e.target.value;
              updateDraft({
                tableName: raw.replace(/[\s_]+/g, ""),
              });
            }}
            required
            error={showErrors && !draft.tableName.trim() ? "Table name is required" : undefined}
          />
          <TextInput
            label="Entity Logical Name"
            value={draft.entityLogicalName}
            onChange={(e) => {
              const displayed = e.target.value.replace(/_/g, " ");
              updateDraft({
                entityLogicalName: displayed,
                // Continuous physical name: drop the separators between abbreviations.
                tableName: generateTableName(displayed).replace(/_/g, ""),
              });
            }}
          />
          <TextInput
            label="Schema Name"
            value={draft.schemaName}
            onChange={(e) =>
              updateDraft({ schemaName: sanitizeSchemaInput(e.target.value) })
            }
            onBlur={(e) =>
              updateDraft({ schemaName: (e.target.value || "").trim() })
            }
            required
            error={showErrors && !schemaCheck.valid ? schemaCheck.error : undefined}
          />
          <Select
            label="Distribution Style"
            options={DISTRIBUTION_OPTIONS}
            value={draft.distributionStyle}
            onChange={(v) => updateDraft({ distributionStyle: v as DistributionStyle })}
            required
          />
          <Select
            label="Vertical Name"
            options={buildVerticalOptions(draft.verticalName)}
            value={draft.verticalName}
            onChange={(v) => updateDraft({ verticalName: v as VerticalName })}
            placeholder="Select vertical"
          />
          <Select
            label="Business Area (optional)"
            options={BUSINESS_AREA_DROPDOWN_OPTIONS}
            value={draft.businessArea || ""}
            onChange={(v) => updateDraft({ businessArea: v as BusinessArea })}
            placeholder="Select if applicable"
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Table Definition
              <span className="ml-1 font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={draft.definition ?? ""}
              onChange={(e) => updateDraft({ definition: e.target.value })}
              placeholder="Describe what this table represents…"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((prop) => (
            <div key={prop.label} className="flex items-start justify-between gap-4">
              <span className="text-xs text-slate-500 flex-shrink-0">{prop.label}</span>
              <span className="text-xs font-medium text-slate-700 text-right">
                {prop.value || "—"}
              </span>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Table Definition</div>
            <div className="text-xs font-medium text-slate-700 whitespace-pre-wrap break-words">
              {tableDefinition.definition || "—"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">Submission Status</span>
            <Badge variant={statusVariant[submissionStatus] ?? "neutral"}>
              {submissionStatus.charAt(0).toUpperCase() + submissionStatus.slice(1)}
            </Badge>
          </div>
        </div>
      )}
    </Card>
  );
};
