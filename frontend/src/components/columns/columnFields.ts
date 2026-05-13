import type { ColumnDefinition, DataClassification } from "../../types";

export type CellKind = "text" | "number" | "select" | "checkbox";

export interface ColumnFieldSpec {
  key: string;
  label: string;
  width: number;
  kind: CellKind;
  get: (c: ColumnDefinition) => string | number | boolean;
  set: (c: ColumnDefinition, v: string | number | boolean) => ColumnDefinition;
  options?: { value: string; label: string }[];
  required?: boolean;
}

export const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "Add", label: "Add" },
  { value: "Modify", label: "Modify" },
  { value: "Drop", label: "Drop" },
  { value: "No Change", label: "No Change" },
];

const DATA_TYPE_OPTIONS = [
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
].map((v) => ({ value: v, label: v }));

const CLASSIFICATION_OPTIONS = [
  { value: "Public", label: "Public" },
  { value: "Internal", label: "Internal" },
  { value: "Confidential", label: "Confidential" },
  { value: "PII", label: "PII" },
  { value: "Restricted", label: "Restricted" },
];

/* The full attribute set captured at table creation. Order here drives the
   column order in: CreateTableDrawer (editable), ColumnDataGrid (read-only
   plus editable Action), and ReviewDrawer (read-only).
   Add a 25th attribute by appending one entry — no other files need editing
   beyond the ColumnDefinition type. */
export const COLUMN_FIELDS: ColumnFieldSpec[] = [
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
    options: CLASSIFICATION_OPTIONS,
    get: (c) => c.dataClassification,
    set: (c, v) => ({ ...c, dataClassification: v as DataClassification }),
  },
  {
    key: "dataType",
    label: "Data Type *",
    width: 150,
    kind: "select",
    required: true,
    options: DATA_TYPE_OPTIONS,
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
