export type DbType = 'postgresql' | 'mysql' | 'mssql' | 'redshift';

export const DATA_TYPES: Record<DbType, string[]> = {
  postgresql: [
    'SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL',
    'DOUBLE PRECISION', 'BOOLEAN', 'CHAR', 'VARCHAR', 'TEXT',
    'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'JSON', 'JSONB', 'UUID',
  ],
  mysql: [
    'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT',
    'DOUBLE', 'BOOLEAN', 'CHAR', 'VARCHAR', 'TEXT',
    'DATE', 'DATETIME', 'TIMESTAMP', 'JSON', 'ENUM',
  ],
  mssql: [
    'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT',
    'BIT', 'CHAR', 'VARCHAR', 'NVARCHAR', 'TEXT',
    'DATE', 'DATETIME', 'DATETIME2', 'UNIQUEIDENTIFIER',
  ],
  redshift: [
    'SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'REAL',
    'DOUBLE PRECISION', 'BOOLEAN', 'CHAR', 'VARCHAR',
    'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'SUPER',
  ],
};
