import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import sql from 'mssql';

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface SchemaInfo {
  schema_name: string;
}

interface TableInfo {
  table_name: string;
  table_type: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

// ── PostgreSQL / Redshift ────────────────────────────────────
async function pgConnect(config: ConnectionConfig) {
  const pool = new PgPool({ ...config, max: 2, connectionTimeoutMillis: 5000 });
  return pool;
}

async function pgGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const pool = await pgConnect(config);
  try {
    const result = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn = true ORDER BY datname`
    );
    return result.rows.map((r: any) => r.datname);
  } finally {
    await pool.end();
  }
}

async function pgGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  const pool = await pgConnect(config);
  try {
    const result = await pool.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function pgGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const pool = await pgConnect(config);
  try {
    const result = await pool.query(
      `SELECT table_name, table_type FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [schema]
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function pgGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const pool = await pgConnect(config);
  try {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function pgTest(config: ConnectionConfig): Promise<boolean> {
  const pool = await pgConnect(config);
  try {
    await pool.query('SELECT 1');
    return true;
  } finally {
    await pool.end();
  }
}

async function pgExecuteDDL(config: ConnectionConfig, query: string): Promise<void> {
  const pool = await pgConnect(config);
  try {
    await pool.query(query);
  } finally {
    await pool.end();
  }
}

async function pgDryRunDDL(config: ConnectionConfig, query: string): Promise<boolean> {
  const pool = await pgConnect(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(query);
    await client.query('ROLLBACK');
    return true;
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// ── MySQL ────────────────────────────────────────────────────
async function mysqlConnect(config: ConnectionConfig) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectTimeout: 5000,
  });
}

async function mysqlGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const conn = await mysqlConnect({ ...config, database: '' });
  try {
    const [rows] = await conn.query(
      `SELECT SCHEMA_NAME FROM information_schema.schemata
       WHERE SCHEMA_NAME NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
       ORDER BY SCHEMA_NAME`
    );
    return (rows as any[]).map((r) => r.SCHEMA_NAME);
  } finally {
    await conn.end();
  }
}

async function mysqlGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  const conn = await mysqlConnect(config);
  try {
    const [rows] = await conn.query(
      `SELECT SCHEMA_NAME as schema_name FROM information_schema.schemata
       WHERE SCHEMA_NAME NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
       ORDER BY SCHEMA_NAME`
    );
    return rows as SchemaInfo[];
  } finally {
    await conn.end();
  }
}

async function mysqlGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const conn = await mysqlConnect(config);
  try {
    const [rows] = await conn.query(
      `SELECT TABLE_NAME as table_name, TABLE_TYPE as table_type
       FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [schema]
    );
    return rows as TableInfo[];
  } finally {
    await conn.end();
  }
}

async function mysqlGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const conn = await mysqlConnect(config);
  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type,
              IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default
       FROM information_schema.columns
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [schema, table]
    );
    return rows as ColumnInfo[];
  } finally {
    await conn.end();
  }
}

async function mysqlTest(config: ConnectionConfig): Promise<boolean> {
  const conn = await mysqlConnect(config);
  try {
    await conn.query('SELECT 1');
    return true;
  } finally {
    await conn.end();
  }
}

async function mysqlExecuteDDL(config: ConnectionConfig, query: string): Promise<void> {
  const conn = await mysqlConnect(config);
  try {
    await conn.query(query);
  } finally {
    await conn.end();
  }
}

async function mysqlDryRunDDL(config: ConnectionConfig, query: string): Promise<boolean> {
  const conn = await mysqlConnect(config);
  try {
    await conn.query('START TRANSACTION');
    await conn.query(query);
    await conn.query('ROLLBACK');
    return true;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    await conn.end();
  }
}

// ── MSSQL ────────────────────────────────────────────────────
async function mssqlConnect(config: ConnectionConfig) {
  return sql.connect({
    server: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 5000,
  });
}

async function mssqlGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const pool = await mssqlConnect(config);
  try {
    const result = await pool.query(
      `SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' AND name NOT IN ('master', 'tempdb', 'model', 'msdb') ORDER BY name`
    );
    return result.recordset.map((r: any) => r.name);
  } finally {
    await pool.close();
  }
}

async function mssqlGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  const pool = await mssqlConnect(config);
  try {
    const result = await pool.query(
      `SELECT SCHEMA_NAME as schema_name FROM INFORMATION_SCHEMA.SCHEMATA
       WHERE SCHEMA_NAME NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys', 'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
       ORDER BY SCHEMA_NAME`
    );
    return result.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const pool = await mssqlConnect(config);
  try {
    const result = await pool.request()
      .input('schema', sql.VarChar, schema)
      .query(
        `SELECT TABLE_NAME as table_name, TABLE_TYPE as table_type
         FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema ORDER BY TABLE_NAME`
      );
    return result.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const pool = await mssqlConnect(config);
  try {
    const result = await pool.request()
      .input('schema', sql.VarChar, schema)
      .input('table', sql.VarChar, table)
      .query(
        `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type,
                IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
         ORDER BY ORDINAL_POSITION`
      );
    return result.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlTest(config: ConnectionConfig): Promise<boolean> {
  const pool = await mssqlConnect(config);
  try {
    await pool.query('SELECT 1');
    return true;
  } finally {
    await pool.close();
  }
}

async function mssqlExecuteDDL(config: ConnectionConfig, query: string): Promise<void> {
  const pool = await mssqlConnect(config);
  try {
    await pool.query(query);
  } finally {
    await pool.close();
  }
}

async function mssqlDryRunDDL(config: ConnectionConfig, query: string): Promise<boolean> {
  const pool = await mssqlConnect(config);
  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const request = new sql.Request(transaction);
      await request.query(query);
      await transaction.rollback();
      return true;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } finally {
    await pool.close();
  }
}

// ── Factory ──────────────────────────────────────────────────
type DbType = 'postgresql' | 'mysql' | 'mssql' | 'redshift';

const connectors: Record<DbType, {
  test: (c: ConnectionConfig) => Promise<boolean>;
  getDatabases: (c: ConnectionConfig) => Promise<string[]>;
  getSchemas: (c: ConnectionConfig) => Promise<SchemaInfo[]>;
  getTables: (c: ConnectionConfig, schema: string) => Promise<TableInfo[]>;
  getColumns: (c: ConnectionConfig, schema: string, table: string) => Promise<ColumnInfo[]>;
  executeDDL: (c: ConnectionConfig, query: string) => Promise<void>;
  dryRunDDL: (c: ConnectionConfig, query: string) => Promise<boolean>;
}> = {
  postgresql: { test: pgTest, getDatabases: pgGetDatabases, getSchemas: pgGetSchemas, getTables: pgGetTables, getColumns: pgGetColumns, executeDDL: pgExecuteDDL, dryRunDDL: pgDryRunDDL },
  redshift: { test: pgTest, getDatabases: pgGetDatabases, getSchemas: pgGetSchemas, getTables: pgGetTables, getColumns: pgGetColumns, executeDDL: pgExecuteDDL, dryRunDDL: pgDryRunDDL },
  mysql: { test: mysqlTest, getDatabases: mysqlGetDatabases, getSchemas: mysqlGetSchemas, getTables: mysqlGetTables, getColumns: mysqlGetColumns, executeDDL: mysqlExecuteDDL, dryRunDDL: mysqlDryRunDDL },
  mssql: { test: mssqlTest, getDatabases: mssqlGetDatabases, getSchemas: mssqlGetSchemas, getTables: mssqlGetTables, getColumns: mssqlGetColumns, executeDDL: mssqlExecuteDDL, dryRunDDL: mssqlDryRunDDL },
};

export function getConnector(dbType: DbType) {
  return connectors[dbType];
}
