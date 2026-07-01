import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { TopBar, FooterStatusBar } from "../components/layout";
import { Button, TextInput, Select, ArchitectSelector, Card, ToastContainer } from "../components/common";
import type { Architect } from "../api/architects";
import { formatArchitectName } from "../api/architects";
import {
  generateEntityLogicalName,
  generateTableName,
  setAbbreviationDictionary,
} from "../utils/abbreviations";
import api from "../api/client";
import { sanitizeSchemaInput, validateColumnDefault, validateIdentifier, validateSchemaName } from "../utils/validation";
import {
  VERTICAL_NAME_OPTIONS,
  type TableDefinition,
  type ColumnDefinition,
  type DistributionStyle,
  type DbType,
} from "../types";
import { COLUMN_FIELDS, type ColumnFieldSpec } from "../components/columns/columnFields";
import { generateCreateTableDDL } from "../utils/ddlPreview";

const DISTRIBUTION_OPTIONS = [
  { value: "KEY", label: "KEY" },
  { value: "EVEN", label: "EVEN" },
  { value: "ALL", label: "ALL" },
  { value: "AUTO", label: "AUTO" },
];

const VERTICAL_OPTIONS = VERTICAL_NAME_OPTIONS.map((v) => ({ value: v, label: v }));

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

type CreateTableFormState = Omit<TableDefinition, "columns" | "businessArea">;

const buildInitialFormState = (defaultSchema: string): CreateTableFormState => ({
  tableName: "",
  entityLogicalName: "",
  distributionStyle: "KEY",
  schemaName: defaultSchema,
  verticalName: "",
  definition: "",
});

export const CreateTablePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    createTable,
    submitForReview,
    selectedSchemaId,
    selectedBusinessArea,
    clusters,
    selectedClusterId,
    toasts,
    dismissToast,
  } = useDashboard();
  const { user } = useAuth();

  const [formData, setFormData] = useState<CreateTableFormState>(() =>
    buildInitialFormState(selectedSchemaId || "")
  );
  const [newColumns, setNewColumns] = useState<ColumnDefinition[]>([createEmptyColumn(0)]);
  const [schemaNameTouched, setSchemaNameTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedArchitect, setSelectedArchitect] = useState<Architect | null>(null);

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
  // Table Name displays with spaces ("Emp Sls Fct") but gets persisted as a
  // SQL identifier ("Emp_Sls_Fct"). Collapse the display value to its canonical
  // form before validating, so `sanitized` is what we send to the backend.
  const tableNameValidation = useMemo(
    () => validateIdentifier(formData.tableName.trim().replace(/\s+/g, "_"), "Table name"),
    [formData.tableName]
  );

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

  // Same per-column default validation the backend runs. Computed up-front so
  // we can both highlight individual cells and block the page-level submit
  // until every default is valid.
  const defaultErrors = useMemo(() => {
    const map = new Map<string, string>();
    newColumns.forEach((c) => {
      if (!c.columnName.trim()) return;
      const r = validateColumnDefault(c.defaultValue, c.dataType, `Column "${c.columnName}"`);
      if (!r.valid && r.error) map.set(c.id, r.error);
    });
    return map;
  }, [newColumns]);

  const firstDefaultError = defaultErrors.size > 0 ? Array.from(defaultErrors.values())[0] : null;

  // Live DDL preview — mirrors the server-side generator so the developer sees
  // the exact CREATE TABLE (including Redshift DISTSTYLE/DISTKEY/SORTKEY) the
  // approval pipeline will run. Dialect comes from the target connection.
  const previewDbType = useMemo<DbType>(() => {
    const cluster = clusters.find((c) => c.id === selectedClusterId) as any;
    return (cluster?.dbType as DbType) || "postgresql";
  }, [clusters, selectedClusterId]);

  const ddlPreview = useMemo(
    () =>
      generateCreateTableDDL({
        dbType: previewDbType,
        schema: formData.schemaName,
        table: formData.tableName,
        distributionStyle: formData.distributionStyle,
        columns: newColumns,
      }),
    [previewDbType, formData.schemaName, formData.tableName, formData.distributionStyle, newColumns],
  );

  const updateFormField = (field: keyof CreateTableFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSchemaNameChange = useCallback((raw: string) => {
    setSchemaNameTouched(true);
    setFormData((prev) => ({ ...prev, schemaName: sanitizeSchemaInput(raw) }));
  }, []);

  const handleTableNameChange = useCallback((raw: string) => {
    const compact = raw.replace(/[\s_]+/g, "");

    const ABBREVIATIONS: Record<string, string> = {
      emp: "Employee",
      sls: "Sales",
      fct: "Fact",
      tbl: "Table",
      cust: "Customer",
      dim: "Dimension",
      addr: "Address",
      txn: "Transaction",
      qty: "Quantity",
      amt: "Amount",
    };

    const keys = Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length);

    let remaining = compact.toLowerCase();
    const words: string[] = [];

    while (remaining.length > 0) {
      let matched = false;

      for (const key of keys) {
        if (remaining.startsWith(key)) {
          words.push(ABBREVIATIONS[key]);
          remaining = remaining.slice(key.length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        words.push(remaining.charAt(0).toUpperCase() + remaining.slice(1));
        break;
      }
    }

    setFormData((prev) => ({
      ...prev,
      tableName: compact,
      entityLogicalName: words.join(" "),
    }));
  }, []);

  const handleEntityNameChange = useCallback((raw: string) => {
    const displayed = raw.replace(/_/g, " ");
    setFormData((prev) => ({
      ...prev,
      entityLogicalName: displayed,
      // Continuous physical name: drop the separators between abbreviations.
      tableName: generateTableName(displayed).replace(/_/g, ""),
    }));
  }, []);

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
      .catch(() => undefined);
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
    (id: string, spec: ColumnFieldSpec, value: string | number | boolean) => {
      setNewColumns((prev) =>
        prev.map((col) => (col.id === id ? spec.set(col, value) : col))
      );
    },
    []
  );

  const isValid =
    tableNameValidation.valid &&
    !!formData.entityLogicalName.trim() &&
    schemaValidation.valid &&
    !!selectedArchitect &&
    namedColumns.length > 0 &&
    duplicateColumnNames.size === 0 &&
    defaultErrors.size === 0;

  const handleCancel = () => {
    navigate("/dashboard");
  };

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
    if (firstDefaultError) {
      setSubmitError(firstDefaultError);
      return;
    }

    setIsSaving(true);
    try {
      const tableId = await createTable({
        ...formData,
        tableName: tableNameValidation.sanitized,
        schemaName: schemaValidation.sanitized,
        businessArea: selectedBusinessArea,
        columns: namedColumns,
      });
      if (!tableId) return;

      const ok = await submitForReview(
        user.id,
        selectedArchitect.id,
        user.name,
        tableId
      );
      if (!ok) return;

      // Return to the dashboard; the newly-created table is now selected
      // in context so the dashboard will render the edit view for it.
      navigate("/dashboard");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex flex-col bg-slate-50">
        <TopBar />

        <div className="px-6 py-4 bg-white border-b border-slate-200">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                }
              >
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-base font-semibold text-slate-800">Create New Table</h1>
                <p className="text-xs text-slate-500">
                  Define table metadata and submit for architect review.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!isValid || isSaving} onClick={handleCreate}>
                {isSaving ? "Submitting…" : "Submit for Review"}
              </Button>
            </div>
          </div>
        </div>

        <main className="flex-1 p-6">
          <div className="max-w-[1600px] mx-auto space-y-6">
            {showErrors && submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <Card title="Table Metadata">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TextInput
                      label="Table Name"
                      value={formData.tableName}
                      onChange={(e) => handleTableNameChange(e.target.value)}
                      placeholder="e.g., Emp Sls Fct"
                      required
                      error={
                        showErrors && !tableNameValidation.valid
                          ? tableNameValidation.error
                          : undefined
                      }
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Editing this regenerates Entity Logical Name.
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
                      Editing this regenerates Table Name.
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
                    onBlur={(e) => handleSchemaNameChange((e.target.value || "").trim())}
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
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Table Definition
                    <span className="ml-1 font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={formData.definition ?? ""}
                    onChange={(e) => updateFormField("definition", e.target.value)}
                    placeholder="Describe what this table represents — purpose, ownership, key business meaning…"
                    rows={3}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                  />
                </div>
                {selectedBusinessArea && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="text-slate-500">Business Area:&nbsp;</span>
                    <span className="font-medium text-slate-700">{selectedBusinessArea}</span>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Architect Review">
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
                  On submit, {formatArchitectName(selectedArchitect)} will see this in their
                  review queue.
                </p>
              )}
            </Card>

            <Card
              title={`Column Metadata (${newColumns.length})`}
              subtitle="Scroll horizontally to edit every attribute. Each row is one column in the target table."
              headerAction={
                <Button variant="outline" size="sm" onClick={addColumn}>
                  + Add Row
                </Button>
              }
              noPadding
            >
              <div className="overflow-auto max-h-[60vh]">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th
                        className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200"
                        style={{ minWidth: 48, width: 48 }}
                      >
                        #
                      </th>
                      {COLUMN_FIELDS.map((f) => (
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
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {newColumns.map((col, rowIdx) => {
                      const isDup =
                        !!col.columnName.trim() &&
                        duplicateColumnNames.has(col.columnName.trim().toLowerCase());
                      const defaultErr = defaultErrors.get(col.id);
                      return (
                        <tr
                          key={col.id}
                          className="hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <td className="px-3 py-1.5 text-slate-500 align-middle">
                            {rowIdx + 1}
                          </td>
                          {COLUMN_FIELDS.map((f) => {
                            const value = f.get(col);
                            const cellClass =
                              "w-full bg-transparent px-2 py-1 text-xs text-slate-800 border border-transparent rounded focus:bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 focus:outline-none";
                            const defaultErrorOnCell = f.key === "defaultValue" && !!defaultErr;
                            const errorRing =
                              (showErrors &&
                                f.key === "columnName" &&
                                (isDup || !col.columnName.trim())) ||
                              defaultErrorOnCell
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
                                      : defaultErrorOnCell
                                      ? defaultErr
                                      : undefined
                                  }
                                />
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => removeColumn(col.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                              aria-label={`Remove row ${rowIdx + 1}`}
                              title="Remove this column"
                            >
                              <svg
                                className="w-4 h-4 inline"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="DDL Preview"
              subtitle={`Generated CREATE statement for the target dialect (${previewDbType}).`}
              headerAction={
                ddlPreview ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard?.writeText(ddlPreview)}
                  >
                    Copy
                  </Button>
                ) : undefined
              }
            >
              {ddlPreview ? (
                <pre className="overflow-auto rounded-md bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100 whitespace-pre">
                  {ddlPreview}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">
                  Enter a table name and at least one column to preview the DDL.
                </p>
              )}
              {previewDbType !== "redshift" && (
                <p className="mt-2 text-[11px] text-slate-400">
                  DISTSTYLE / DISTKEY / SORTKEY apply only to Redshift connections and are
                  omitted for {previewDbType}.
                </p>
              )}
            </Card>
          </div>
        </main>

        <FooterStatusBar />
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
