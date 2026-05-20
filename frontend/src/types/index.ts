export type UserRole = "developer" | "architect" | "viewer" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
}

export type DbType = "postgresql" | "mysql" | "mssql" | "redshift";

export interface DbConnection {
  id: string;
  name: string;
  dbType: DbType;
  host: string;
  port: number;
  databaseName: string;
  status: "active" | "inactive";
  createdAt?: string;
}

// Keep Cluster as alias for backward compat with existing components
export interface Cluster {
  id: string;
  name: string;
  region: string;
  status: "active" | "inactive" | "maintenance";
}

export interface Schema {
  id: string;
  name: string;
  clusterId: string;
}

/**
 * Fixed allow-list for the simplified Business Area attribute on a table.
 * Mirrors the CHECK constraint on `table_definitions.business_area`.
 */
export const BUSINESS_AREA_OPTIONS = ["XBI Tables", "Database Source"] as const;
export type BusinessArea = (typeof BUSINESS_AREA_OPTIONS)[number] | "";

export interface TableSummary {
  id: string;
  name: string;
  schemaId: string;
  columnCount: number;
  createdAt: string;
  updatedAt: string;
  /** DART workflow status for this row. Absent for physical-only tables
   *  (those discovered on the cluster but not yet tracked in DART). */
  status?: "draft" | "submitted" | "approved" | "rejected" | "applied" | "processed";
}

export type DistributionStyle = "KEY" | "EVEN" | "ALL" | "AUTO";

export const VERTICAL_NAME_OPTIONS = ["Sales", "Enterprise", "Marketing"] as const;
export type VerticalName = (typeof VERTICAL_NAME_OPTIONS)[number] | "";

export interface TableDefinition {
  id?: string;
  tableName: string;
  entityLogicalName: string;
  distributionStyle: DistributionStyle;
  /**
   * Physical schema name. Required for new tables; mapped to
   * `table_definitions.schema_name` on the backend.
   */
  schemaName: string;
  /** @deprecated Replaced by `schemaName`. Retained for backward compatibility with old payloads. */
  keys?: string;
  verticalName: VerticalName | string;
  businessArea?: BusinessArea;
  /** Free-text description of what the table represents. Optional. */
  definition?: string;
  columns: ColumnDefinition[];
}

export type ColumnAction = "No Change" | "Modify" | "Add" | "Drop";

export type DataClassification =
  | "Public"
  | "Internal"
  | "Confidential"
  | "PII"
  | "Restricted";

export type RedshiftDataType =
  | "SMALLINT"
  | "INTEGER"
  | "BIGINT"
  | "DECIMAL"
  | "REAL"
  | "DOUBLE PRECISION"
  | "BOOLEAN"
  | "CHAR"
  | "VARCHAR"
  | "DATE"
  | "TIMESTAMP"
  | "TIMESTAMPTZ"
  | "SUPER";

export interface ColumnDefinition {
  id: string;
  columnName: string;
  dataType: RedshiftDataType | string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  dataClassification: DataClassification | "";
  dataDomain: string;
  attributeDefinition: string;
  defaultValue: string;
  action: ColumnAction;
  /* Sort order — exposed in the create grid as "Column Sequence". */
  sortOrder?: number;
  /* Extended enterprise metadata. All optional so existing rows from before
     migration 8 still load cleanly. Defaults are applied by the Create Table
     grid when a user adds a new row. */
  attributeName?: string;
  hasStats?: boolean;
  compressValue?: string;
  columnFormat?: string;
  comments?: string;
  sourceTableName?: string;
  sourceColumnName?: string;
  transformation?: string;
  tierValue?: string;
  sourceSystem?: string;
  encoding?: string;
  isSortKey?: boolean;
  isDistKey?: boolean;
  sourceDatabaseName?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SubmissionStatus = "draft" | "submitted" | "approved" | "rejected";

export interface Notification {
  id: string;
  type: "submission" | "approval" | "rejection";
  title: string;
  message: string;
  tableName: string;
  submittedBy: string;
  timestamp: string;
  isRead: boolean;
  targetRole: "architect" | "developer";
  submissionId?: string;
  tableDefinition?: TableDefinition;
  columns?: ColumnDefinition[];
  /** Live cluster snapshot captured at submit time, for OLD → NEW diff. */
  previousColumns?: PreviousColumnSnapshot[];
}

export interface PreviousColumnSnapshot {
  column_name: string;
  data_type: string;
  /** information_schema convention: "YES" / "NO". */
  is_nullable: string;
  column_default: string | null;
}

export type StepStatus = "completed" | "active" | "pending";

export interface Step {
  number: number;
  label: string;
  status: StepStatus;
}
