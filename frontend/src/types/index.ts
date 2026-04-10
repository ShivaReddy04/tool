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

export interface BusinessArea {
  id: string;
  name: string;
  description?: string;
}

export interface TableSummary {
  id: string;
  name: string;
  schemaId: string;
  columnCount: number;
  createdAt: string;
  updatedAt: string;
}

export type DistributionStyle = "KEY" | "EVEN" | "ALL" | "AUTO";

export interface TableDefinition {
  id?: string;
  tableName: string;
  entityLogicalName: string;
  distributionStyle: DistributionStyle;
  keys: string;
  verticalName: string;
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
  dataClassification: DataClassification;
  dataDomain: string;
  attributeDefinition: string;
  defaultValue: string;
  action: ColumnAction;
}

export interface EnvironmentState {
  selectedClusterId: string;
  selectedSchemaId: string;
  selectedBusinessAreaId: string;
}

export interface ValidationError {
  field: string;
  message: string;
  rowIndex?: number;
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
  tableDefinition?: TableDefinition;
  columns?: ColumnDefinition[];
}

export type StepStatus = "completed" | "active" | "pending";

export interface Step {
  number: number;
  label: string;
  status: StepStatus;
}
