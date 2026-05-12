import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { useAuth } from "../../context/AuthContext";
import { Drawer, Button, TextInput, Select, ArchitectSelector } from "../common";
import type { Architect } from "../../api/architects";
import { formatArchitectName } from "../../api/architects";
import {
  generateEntityLogicalName,
  generateTableName,
  setAbbreviationDictionary,
} from "../../utils/abbreviations";
import api from "../../api/client";
import { sanitizeSchemaInput, validateIdentifier, validateSchemaName } from "../../utils/validation";
import {
  VERTICAL_NAME_OPTIONS,
  type TableDefinition,
  type ColumnDefinition,
  type DistributionStyle,
  type DataClassification,
} from "../../types";

const DISTRIBUTION_OPTIONS = [
  { value: "KEY", label: "KEY" },
  { value: "EVEN", label: "EVEN" },
  { value: "ALL", label: "ALL" },
  { value: "AUTO", label: "AUTO" },
];

const VERTICAL_OPTIONS = VERTICAL_NAME_OPTIONS.map((v) => ({ value: v, label: v }));

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "Add", label: "Add" },
  { value: "Modify", label: "Modify" },
  { value: "Drop", label: "Drop" },
  { value: "No Change", label: "No Change" },
];

const createEmptyColumn = (index: number): ColumnDefinition => ({
  id: `new-col-${Date.now()}-${index}`,
  columnName: "",
  dataType: "VARCHAR",
  isNullable: true,
  isPrimaryKey: false,
  dataClassification: "Internal",
  dataDomain: "",
  attributeDefinition: "",
  defaultValue: "",
  action: "Add",
  sortOrder: index,
  attributeName: "",
  hasStats: false,
  compressValue: "",
  columnFormat: "",
  comments: "",
  sourceTableName: "",
  sourceColumnName: "",
  transformation: "",
  tierValue: "",
  sourceSystem: "",
  encoding: "",
  isSortKey: false,
  isDistKey: false,
  sourceDatabaseName: "",
});

/* ── grid column descriptors ───────────────────────────────────────────────
 * Drives both the sticky header row and each body cell. Centralizing this
 * keeps the 24 attributes editable in one place — adding a 25th field is
 * a single entry here plus a type/model update.
 */
type CellKind = "text" | "number" | "select" | "checkbox";
interface MetaFieldSpec {
  key: string;
  label: string;
  width: number;
  kind: CellKind;
  /** Read value from a column row. */
  get: (c: ColumnDefinition) => string | number | boolean;
  /** Write value back, returning the patched column. */
  set: (c: ColumnDefinition, v: string | number | boolean) => ColumnDefinition;
  options?: { value: string; label: string }[];
  required?: boolean;
}

const META_FIELDS: MetaFieldSpec[] = [
  {
    key: "attributeName",
    label: "Attribute Name",
    width: 170,
    kind: "text",
    get: (c) => c.attributeName ?? "",
    set: (c, v) => ({ ...c, attributeName: String(v) }),
  },
  {
    key: "columnName",
    label: "Column Name *",
    width: 170,
    kind: "text",
    required: true,
    get: (c) => c.columnName,
    set: (c, v) => ({ ...c, columnName: String(v) }),
  },
  {
    key: "action",
    label: "Action",
    width: 120,
    kind: "select",
    options: ACTION_OPTIONS,
    get: (c) => c.action,
    set: (c, v) => ({ ...c, action: v as ColumnDefinition["action"] }),
  },
  {
    key: "dataDomain",
    label: "Data Domain",
    width: 140,
    kind: "text",
    get: (c) => c.dataDomain,
    set: (c, v) => ({ ...c, dataDomain: String(v) }),
  },
  {
    key: "dataClassification",
    label: "Data Classification",
    width: 150,
    kind: "select",
    options: [
      { value: "Public", label: "Public" },
      { value: "Internal", label: "Internal" },
      { value: "Confidential", label: "Confidential" },
      { value: "PII", label: "PII" },
      { value: "Restricted", label: "Restricted" },
    ],
    get: (c) => c.dataClassification,
    set: (c, v) => ({ ...c, dataClassification: v as DataClassification }),
  },
  {
    key: "dataType",
    label: "Data Type *",
    width: 150,
    kind: "select",
    required: true,
    options: [
      "SMALLINT",
      "INTEGER",
      "BIGINT",
      "DECIMAL",
      "REAL",
      "DOUBLE PRECISION",
      "BOOLEAN",
      "CHAR",
      "VARCHAR",
      "DATE",
      "TIMESTAMP",
      "TIMESTAMPTZ",
      "SUPER",
    ].map((v) => ({ value: v, label: v })),
    get: (c) => c.dataType,
    set: (c, v) => ({ ...c, dataType: String(v) }),
  },
  {
    key: "isNotNull",
    label: "Is Not Null",
    width: 90,
    kind: "checkbox",
    // UI shows "Is Not Null"; storage keeps `isNullable`. Inverted here so
    // we never duplicate the field on the wire.
    get: (c) => !c.isNullable,
    set: (c, v) => ({ ...c, isNullable: !v }),
  },
  {
    key: "isPrimaryKey",
    label: "Primary Index",
    width: 100,
    kind: "checkbox",
    get: (c) => c.isPrimaryKey,
    set: (c, v) => ({ ...c, isPrimaryKey: !!v }),
  },
  {
    key: "attributeDefinition",
    label: "Attribute Definition",
    width: 220,
    kind: "text",
    get: (c) => c.attributeDefinition,
    set: (c, v) => ({ ...c, attributeDefinition: String(v) }),
  },
  {
    key: "hasStats",
    label: "Has Stats",
    width: 90,
    kind: "checkbox",
    get: (c) => !!c.hasStats,
    set: (c, v) => ({ ...c, hasStats: !!v }),
  },
  {
    key: "defaultValue",
    label: "Default Value",
    width: 130,
    kind: "text",
    get: (c) => c.defaultValue,
    set: (c, v) => ({ ...c, defaultValue: String(v) }),
  },
  {
    key: "compressValue",
    label: "Compress Value",
    width: 130,
    kind: "text",
    get: (c) => c.compressValue ?? "",
    set: (c, v) => ({ ...c, compressValue: String(v) }),
  },
  {
    key: "columnFormat",
    label: "Column Format",
    width: 130,
    kind: "text",
    get: (c) => c.columnFormat ?? "",
    set: (c, v) => ({ ...c, columnFormat: String(v) }),
  },
  {
    key: "comments",
    label: "Comments",
    width: 200,
    kind: "text",
    get: (c) => c.comments ?? "",
    set: (c, v) => ({ ...c, comments: String(v) }),
  },
  {
    key: "sortOrder",
    label: "Column Sequence",
    width: 110,
    kind: "number",
    get: (c) => c.sortOrder ?? 0,
    set: (c, v) => ({ ...c, sortOrder: Number(v) || 0 }),
  },
  {
    key: "sourceTableName",
    label: "Source Table Name",
    width: 170,
    kind: "text",
    get: (c) => c.sourceTableName ?? "",
    set: (c, v) => ({ ...c, sourceTableName: String(v) }),
  },
  {
    key: "sourceColumnName",
    label: "Source Column Name",
    width: 170,
    kind: "text",
    get: (c) => c.sourceColumnName ?? "",
    set: (c, v) => ({ ...c, sourceColumnName: String(v) }),
  },
  {
    key: "transformation",
    label: "Transformation",
    width: 200,
    kind: "text",
    get: (c) => c.transformation ?? "",
    set: (c, v) => ({ ...c, transformation: String(v) }),
  },
  {
    key: "tierValue",
    label: "Tier Value",
    width: 110,
    kind: "text",
    get: (c) => c.tierValue ?? "",
    set: (c, v) => ({ ...c, tierValue: String(v) }),
  },
  {
    key: "sourceSystem",
    label: "Source System",
    width: 150,
    kind: "text",
    get: (c) => c.sourceSystem ?? "",
    set: (c, v) => ({ ...c, sourceSystem: String(v) }),
  },
  {
    key: "encoding",
    label: "Encoding",
    width: 130,
    kind: "text",
    get: (c) => c.encoding ?? "",
    set: (c, v) => ({ ...c, encoding: String(v) }),
  },
  {
    key: "isSortKey",
    label: "Sort Key",
    width: 90,
    kind: "checkbox",
    get: (c) => !!c.isSortKey,
    set: (c, v) => ({ ...c, isSortKey: !!v }),
  },
  {
    key: "isDistKey",
    label: "Dist Key",
    width: 90,
    kind: "checkbox",
    get: (c) => !!c.isDistKey,
    set: (c, v) => ({ ...c, isDistKey: !!v }),
  },
  {
    key: "sourceDatabaseName",
    label: "Database Name",
    width: 140,
    kind: "text",
    get: (c) => c.sourceDatabaseName ?? "",
    set: (c, v) => ({ ...c, sourceDatabaseName: String(v) }),
  },
];

// businessArea is sourced from DashboardContext (the environment-level
// selection), not collected per-table — so it's omitted from the form state.
type CreateTableFormState = Omit<TableDefinition, "columns" | "businessArea">;

const buildInitialFormState = (defaultSchema: string): CreateTableFormState => ({
  tableName: "",
  entityLogicalName: "",
  distributionStyle: "KEY",
  schemaName: defaultSchema,
  verticalName: "",
});

export const CreateTableDrawer: React.FC = () => {
  const {
    isCreateTableDrawerOpen,
    setIsCreateTableDrawerOpen,
    createTable,
    submitForReview,
    selectedSchemaId,
    selectedBusinessArea,
  } = useDashboard();
  const { user } = useAuth();

  const [formData, setFormData] = useState<CreateTableFormState>(() =>
    buildInitialFormState(selectedSchemaId || "")
  );

  const [newColumns, setNewColumns] = useState<ColumnDefinition[]>([
    createEmptyColumn(0),
  ]);

  const [tableNameTouched, setTableNameTouched] = useState(false);
  const [entityNameTouched, setEntityNameTouched] = useState(false);
  // Tracks whether the user has manually edited Schema Name. While untouched,
  // the field stays in sync with the env-selected schema so reopening the
  // drawer for a different schema doesn't show a stale value.
  const [schemaNameTouched, setSchemaNameTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reviewer assignment lives alongside the table metadata here because
  // creating a table without picking a reviewer is no longer a valid flow:
  // the table must enter the architect's queue immediately. The physical
  // DDL only runs once the assigned architect approves the submission.
  const [selectedArchitect, setSelectedArchitect] = useState<Architect | null>(null);

  // Sync schema field with the environment selection until the user types.
  useEffect(() => {
    if (!schemaNameTouched) {
      setFormData((prev) =>
        prev.schemaName === (selectedSchemaId || "")
          ? prev
          : { ...prev, schemaName: selectedSchemaId || "" }
      );
    }
  }, [selectedSchemaId, schemaNameTouched]);

  const schemaValidation = useMemo(
    () => validateSchemaName(formData.schemaName),
    [formData.schemaName]
  );

  const tableNameValidation = useMemo(
    () => validateIdentifier(formData.tableName, "Table name"),
    [formData.tableName]
  );

  // Case-insensitive duplicate detection — matches what the backend reports
  // and what the DDL run on the target cluster would treat as a conflict.
  const duplicateColumnNames = useMemo(() => {
    const seen = new Map<string, number>();
    const dups = new Set<string>();
    newColumns.forEach((c) => {
      const name = c.columnName.trim().toLowerCase();
      if (!name) return;
      const count = (seen.get(name) || 0) + 1;
      seen.set(name, count);
      if (count > 1) dups.add(name);
    });
    return dups;
  }, [newColumns]);

  const namedColumns = useMemo(
    () => newColumns.filter((c) => c.columnName.trim()),
    [newColumns]
  );

  const updateFormField = (field: keyof CreateTableFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSchemaNameChange = useCallback((raw: string) => {
    setSchemaNameTouched(true);
    // Strip disallowed characters live so the visible value always reflects
    // what we'll actually persist — prevents the user typing `my-schema` and
    // being surprised by a save-time error.
    const cleaned = sanitizeSchemaInput(raw);
    setFormData((prev) => ({ ...prev, schemaName: cleaned }));
  }, []);

  // Bidirectional sync: typing on one side regenerates the other via the
  // enterprise abbreviation dictionary. Each side stops auto-syncing once
  // its own "touched" flag is set, which is what prevents the classic
  // ping-pong: the side currently being edited can never overwrite itself.
  const handleTableNameChange = useCallback(
    (raw: string) => {
      setTableNameTouched(raw.length > 0);
      setFormData((prev) => ({
        ...prev,
        tableName: raw,
        entityLogicalName: entityNameTouched
          ? prev.entityLogicalName
          : generateEntityLogicalName(raw),
      }));
    },
    [entityNameTouched]
  );

  const handleEntityNameChange = useCallback(
    (raw: string) => {
      setEntityNameTouched(raw.length > 0);
      setFormData((prev) => ({
        ...prev,
        entityLogicalName: raw,
        tableName: tableNameTouched ? prev.tableName : generateTableName(raw),
      }));
    },
    [tableNameTouched]
  );

  // Hydrate the in-memory dictionary from the backend once per drawer mount.
  // The default shipped with the bundle keeps the UI usable offline; the
  // backend may have admin-pushed overrides we want to absorb.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/abbreviations")
      .then((res) => {
        if (cancelled) return;
        const entries = res?.data?.entries;
        if (Array.isArray(entries) && entries.length > 0) {
          setAbbreviationDictionary(entries);
        }
      })
      .catch(() => {
        /* Non-fatal — the default dictionary still works. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addColumn = useCallback(() => {
    setNewColumns((prev) => [...prev, createEmptyColumn(prev.length)]);
  }, []);

  const removeColumn = useCallback((id: string) => {
    setNewColumns((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const applyFieldUpdate = useCallback(
    (id: string, spec: MetaFieldSpec, value: string | number | boolean) => {
      setNewColumns((prev) =>
        prev.map((col) => (col.id === id ? spec.set(col, value) : col))
      );
    },
    []
  );

  const handleClose = () => {
    setIsCreateTableDrawerOpen(false);
    setFormData(buildInitialFormState(selectedSchemaId || ""));
    setNewColumns([createEmptyColumn(0)]);
    setTableNameTouched(false);
    setEntityNameTouched(false);
    setSchemaNameTouched(false);
    setShowErrors(false);
    setIsSaving(false);
    setSubmitError(null);
    setSelectedArchitect(null);
  };

  const isValid =
    tableNameValidation.valid &&
    !!formData.entityLogicalName.trim() &&
    schemaValidation.valid &&
    !!selectedArchitect &&
    namedColumns.length > 0 &&
    duplicateColumnNames.size === 0;

  const handleCreate = async () => {
    setShowErrors(true);
    setSubmitError(null);

    if (!tableNameValidation.valid) {
      setSubmitError(tableNameValidation.error || "Invalid table name");
      return;
    }
    if (!formData.entityLogicalName.trim()) {
      setSubmitError("Entity logical name is required");
      return;
    }
    if (!schemaValidation.valid) {
      setSubmitError(schemaValidation.error || "Invalid schema name");
      return;
    }
    if (!selectedArchitect) {
      setSubmitError("Select an architect to review this table");
      return;
    }
    if (!user?.id) {
      setSubmitError("Not authenticated — please sign in again");
      return;
    }
    if (namedColumns.length === 0) {
      setSubmitError("Add at least one column with a name");
      return;
    }
    if (duplicateColumnNames.size > 0) {
      setSubmitError(
        `Duplicate column names: ${Array.from(duplicateColumnNames).join(", ")}`
      );
      return;
    }

    setIsSaving(true);
    try {
      // Step 1: persist the table + columns as a draft. createTable returns
      // the server-issued UUID we need to attach the submission to.
      const tableId = await createTable({
        ...formData,
        tableName: tableNameValidation.sanitized,
        schemaName: schemaValidation.sanitized,
        businessArea: selectedBusinessArea,
        columns: namedColumns,
      });
      if (!tableId) {
        // createTable already toasted the backend error. Leave the drawer
        // open so the user can correct and retry without retyping anything.
        return;
      }

      // Step 2: hand it off to the architect's queue. Backend marks the
      // table status as `submitted` and snapshots the current payload —
      // the table is not yet present in the physical cluster. DDL runs
      // only once the architect approves.
      const ok = await submitForReview(
        user.id,
        selectedArchitect.id,
        user.name,
        tableId
      );
      if (!ok) {
        // Submission failed but the draft was saved. The user can retry
        // from inside the drawer (createTable is idempotent on the logical
        // key — it'll UPDATE the existing row, not create a duplicate).
        return;
      }

      handleClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Drawer
      isOpen={isCreateTableDrawerOpen}
      onClose={handleClose}
      title="Create New Table"
      subtitle="Define table metadata and submit for architect review"
      width="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!isValid || isSaving}
            onClick={handleCreate}
          >
            {isSaving ? "Submitting…" : "Submit for Review"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {showErrors && submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700">
              Table Metadata
            </h4>
            <span
              className="text-[11px] text-slate-500"
              title="Table Name and Entity Logical Name auto-generate from each other using the enterprise abbreviation dictionary. Edit either side manually to opt out for that field."
            >
              Bidirectional naming
              <span className="ml-1 text-slate-400">ⓘ</span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <TextInput
                label="Table Name"
                value={formData.tableName}
                onChange={(e) => handleTableNameChange(e.target.value)}
                placeholder="e.g., Emp_Sls_Fct"
                required
                error={
                  showErrors && !tableNameValidation.valid
                    ? tableNameValidation.error
                    : undefined
                }
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {tableNameTouched
                  ? "Manual entry — auto-sync from Entity Logical Name paused."
                  : "Auto-generated from Entity Logical Name using abbreviations."}
              </p>
            </div>
            <div>
              <TextInput
                label="Entity Logical Name"
                value={formData.entityLogicalName}
                onChange={(e) => handleEntityNameChange(e.target.value)}
                placeholder="e.g., Employee Sales Fact"
                required
                error={
                  showErrors && !formData.entityLogicalName.trim()
                    ? "Entity logical name is required"
                    : undefined
                }
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {entityNameTouched
                  ? "Manual entry — auto-sync from Table Name paused."
                  : "Auto-generated from Table Name by expanding abbreviations."}
              </p>
            </div>
            <Select
              label="Distribution Style"
              options={DISTRIBUTION_OPTIONS}
              value={formData.distributionStyle}
              onChange={(v) =>
                updateFormField("distributionStyle", v as DistributionStyle)
              }
              required
            />
            <TextInput
              label="Schema Name"
              value={formData.schemaName}
              onChange={(e) => handleSchemaNameChange(e.target.value)}
              onBlur={(e) =>
                handleSchemaNameChange((e.target.value || "").trim())
              }
              placeholder="e.g., analytics_core"
              required
              error={
                showErrors && !schemaValidation.valid
                  ? schemaValidation.error
                  : undefined
              }
            />
            <Select
              label="Vertical Name"
              options={VERTICAL_OPTIONS}
              value={formData.verticalName}
              onChange={(v) => updateFormField("verticalName", v)}
              placeholder="Select vertical"
            />
          </div>
          {selectedBusinessArea && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">Business Area:&nbsp;</span>
              <span className="font-medium text-slate-700">
                {selectedBusinessArea}
              </span>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">
            Architect Review
          </h4>
          <p className="text-xs text-slate-500 mb-3">
            Submitting routes this table to the chosen architect. The table is
            saved as a draft now; the physical schema is created in the target
            cluster only after the architect approves.
          </p>
          <ArchitectSelector
            label="Assign to Architect"
            value={selectedArchitect}
            onChange={(a) => setSelectedArchitect(a)}
            required
            placeholder="Search architects by name or email…"
            error={
              showErrors && !selectedArchitect
                ? "Architect assignment is required"
                : undefined
            }
          />
          {selectedArchitect && (
            <p className="mt-1 text-[11px] text-slate-500">
              On submit, {formatArchitectName(selectedArchitect)} will see this
              in their review queue.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">
                Column Metadata ({newColumns.length})
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Scroll horizontally to edit every attribute. Each row is one
                column in the target table.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addColumn}>
              + Add Row
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-auto max-h-[60vh] shadow-sm">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th
                    className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200"
                    style={{ minWidth: 48, width: 48 }}
                  >
                    #
                  </th>
                  {META_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap"
                      style={{ minWidth: f.width, width: f.width }}
                    >
                      {f.label}
                    </th>
                  ))}
                  <th
                    className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200"
                    style={{ minWidth: 60, width: 60 }}
                  >

                  </th>
                </tr>
              </thead>
              <tbody>
                {newColumns.map((col, rowIdx) => {
                  const isDup =
                    !!col.columnName.trim() &&
                    duplicateColumnNames.has(col.columnName.trim().toLowerCase());
                  return (
                    <tr key={col.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-1.5 text-slate-500 align-middle">
                        {rowIdx + 1}
                      </td>
                      {META_FIELDS.map((f) => {
                        const value = f.get(col);
                        const cellClass =
                          "w-full bg-transparent px-2 py-1 text-xs text-slate-800 border border-transparent rounded focus:bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 focus:outline-none";
                        const errorRing =
                          showErrors && f.key === "columnName" && (isDup || !col.columnName.trim())
                            ? "border-red-300 bg-red-50"
                            : "";
                        if (f.kind === "checkbox") {
                          return (
                            <td key={f.key} className="px-3 py-1.5 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={!!value}
                                onChange={(e) =>
                                  applyFieldUpdate(col.id, f, e.target.checked)
                                }
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                aria-label={f.label}
                              />
                            </td>
                          );
                        }
                        if (f.kind === "select") {
                          return (
                            <td key={f.key} className="px-1 py-1 align-middle">
                              <select
                                value={String(value)}
                                onChange={(e) =>
                                  applyFieldUpdate(col.id, f, e.target.value)
                                }
                                className={`${cellClass} ${errorRing}`}
                                aria-label={f.label}
                              >
                                {f.options!.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }
                        if (f.kind === "number") {
                          return (
                            <td key={f.key} className="px-1 py-1 align-middle">
                              <input
                                type="number"
                                value={value as number}
                                onChange={(e) =>
                                  applyFieldUpdate(col.id, f, Number(e.target.value))
                                }
                                className={`${cellClass} ${errorRing}`}
                                aria-label={f.label}
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={f.key} className="px-1 py-1 align-middle">
                            <input
                              type="text"
                              value={String(value)}
                              onChange={(e) =>
                                applyFieldUpdate(col.id, f, e.target.value)
                              }
                              className={`${cellClass} ${errorRing}`}
                              aria-label={f.label}
                              placeholder={f.required ? "required" : ""}
                              title={
                                showErrors && f.key === "columnName" && isDup
                                  ? "Duplicate column name"
                                  : undefined
                              }
                            />
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center align-middle">
                        {newColumns.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeColumn(col.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                            aria-label={`Remove row ${rowIdx + 1}`}
                          >
                            <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
