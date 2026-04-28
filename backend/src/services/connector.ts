import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import sql from 'mssql';

// ───────────────── TYPES ─────────────────
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

// ── PostgreSQL / Redshift ─────────────────
async function pgConnect(config: ConnectionConfig) {
  const pool = new PgPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 2,
    connectionTimeoutMillis: 5000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  return pool;
}

async function pgGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const pool = await pgConnect(config);
  try {
    const res = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
    );
    return res.rows.map((r: any) => r.datname);
  } finally {
    await pool.end();
  }
}

async function pgGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  const pool = await pgConnect(config);
  try {
    const res = await pool.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog','information_schema')`
    );
    return res.rows;
  } finally {
    await pool.end();
  }
}

async function pgGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const pool = await pgConnect(config);
  try {
    const res = await pool.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema=$1`,
      [schema]
    );
    return res.rows;
  } finally {
    await pool.end();
  }
}

async function pgGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const pool = await pgConnect(config);
  try {
    const res = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`,
      [schema, table]
    );
    return res.rows;
  } finally {
    await pool.end();
  }
}

async function pgTest(config: ConnectionConfig) {
  const pool = await pgConnect(config);
  try {
    await pool.query('SELECT 1');
    return true;
  } finally {
    await pool.end();
  }
}

async function pgGetTableData(config: ConnectionConfig, schema: string, table: string) {
  const pool = await pgConnect(config);
  try {
    const res = await pool.query(`SELECT * FROM "${schema}"."${table}" LIMIT 100`);
    return res.rows;
  } finally {
    await pool.end();
  }
}

async function pgRunQuery(config: ConnectionConfig, queryStr: string, params?: any[]) {
  const pool = await pgConnect(config);
  try {
    const res = await pool.query(queryStr, params);
    return res;
  } finally {
    await pool.end();
  }
}

async function pgDryRunDDL(config: ConnectionConfig, ddl: string) {
  const pool = await pgConnect(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(ddl);
    await client.query('ROLLBACK');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

// ── MySQL ─────────────────
async function mysqlConnect(config: ConnectionConfig) {
  return mysql.createConnection(config);
}

async function mysqlTest(config: ConnectionConfig) {
  const conn = await mysqlConnect(config);
  await conn.query('SELECT 1');
  await conn.end();
  return true;
}

async function mysqlGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const conn = await mysqlConnect(config);
  try {
    const [rows]: any = await conn.query('SHOW DATABASES');
    return rows.map((r: any) => r.Database);
  } finally {
    await conn.end();
  }
}

async function mysqlGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  return [{ schema_name: config.database }];
}

async function mysqlGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const conn = await mysqlConnect(config);
  try {
    const [rows]: any = await conn.query(
      `SELECT TABLE_NAME as table_name, TABLE_TYPE as table_type 
       FROM information_schema.tables WHERE table_schema=?`, [schema || config.database]
    );
    return rows;
  } finally {
    await conn.end();
  }
}

async function mysqlGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const conn = await mysqlConnect(config);
  try {
    const [rows]: any = await conn.query(
      `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type, 
       IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default
       FROM information_schema.columns WHERE table_schema=? AND table_name=?`,
      [schema || config.database, table]
    );
    return rows;
  } finally {
    await conn.end();
  }
}

async function mysqlGetTableData(config: ConnectionConfig, schema: string, table: string) {
  const conn = await mysqlConnect(config);
  try {
    const targetSchema = schema || config.database;
    const [rows]: any = await conn.query(`SELECT * FROM \`${targetSchema}\`.\`${table}\` LIMIT 100`);
    return rows;
  } finally {
    await conn.end();
  }
}

async function mysqlRunQuery(config: ConnectionConfig, queryStr: string, params?: any[]) {
  const conn = await mysqlConnect(config);
  try {
    const [result] = await conn.query(queryStr, params);
    return result;
  } finally {
    await conn.end();
  }
}

async function mysqlDryRunDDL(config: ConnectionConfig, ddl: string) {
  throw new Error("Dry Run DDL not supported natively in MySQL without side effects");
}

// ── MSSQL ─────────────────
async function mssqlConnect(config: ConnectionConfig) {
  return sql.connect({
    server: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: { encrypt: false, trustServerCertificate: true },
  });
}

async function mssqlTest(config: ConnectionConfig) {
  const pool = await mssqlConnect(config);
  await pool.query('SELECT 1');
  await pool.close();
  return true;
}

async function mssqlGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const pool = await mssqlConnect(config);
  try {
    const res = await pool.query('SELECT name FROM sys.databases');
    return res.recordset.map((r: any) => r.name);
  } finally {
    await pool.close();
  }
}

async function mssqlGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  const pool = await mssqlConnect(config);
  try {
    const res = await pool.query('SELECT schema_name FROM information_schema.schemata');
    return res.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const pool = await mssqlConnect(config);
  try {
    const req = pool.request();
    req.input('schema', sql.NVarChar, schema);
    const res = await req.query(
      `SELECT TABLE_NAME as table_name, TABLE_TYPE as table_type 
       FROM information_schema.tables WHERE table_schema=@schema`
    );
    return res.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const pool = await mssqlConnect(config);
  try {
    const req = pool.request();
    req.input('schema', sql.NVarChar, schema);
    req.input('table', sql.NVarChar, table);
    const res = await req.query(
      `SELECT COLUMN_NAME as column_name, DATA_TYPE as data_type, 
       IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default
       FROM information_schema.columns WHERE table_schema=@schema AND table_name=@table`
    );
    return res.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlGetTableData(config: ConnectionConfig, schema: string, table: string) {
  const pool = await mssqlConnect(config);
  try {
    const res = await pool.query(`SELECT TOP 100 * FROM [${schema}].[${table}]`);
    return res.recordset;
  } finally {
    await pool.close();
  }
}

async function mssqlRunQuery(config: ConnectionConfig, queryStr: string, params?: any[]) {
  const pool = await mssqlConnect(config);
  try {
    const req = pool.request();
    if (params) {
      params.forEach((p, i) => {
        req.input(`p${i}`, p);
      });
    }
    const res = await req.query(queryStr);
    return res;
  } finally {
    await pool.close();
  }
}

async function mssqlDryRunDDL(config: ConnectionConfig, ddl: string) {
  const pool = await mssqlConnect(config);
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    await request.query(ddl);
    await transaction.rollback();
    return true;
  } catch (e) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      // Ignore rollback error
    }
    throw e;
  } finally {
    await pool.close();
  }
}

// ── CONNECTORS MAP ─────────────────
type DbType = 'postgresql' | 'mysql' | 'mssql' | 'redshift';

const connectors: Record<DbType, any> = {
  postgresql: {
    test: pgTest,
    getDatabases: pgGetDatabases,
    getSchemas: pgGetSchemas,
    getTables: pgGetTables,
    getColumns: pgGetColumns,
    getTableData: pgGetTableData,
    runQuery: pgRunQuery,
    dryRunDDL: pgDryRunDDL,
  },
  redshift: {
    test: pgTest,
    getDatabases: pgGetDatabases,
    getSchemas: pgGetSchemas,
    getTables: pgGetTables,
    getColumns: pgGetColumns,
    getTableData: pgGetTableData,
    runQuery: pgRunQuery,
    dryRunDDL: pgDryRunDDL,
  },
  mysql: {
    test: mysqlTest,
    getDatabases: mysqlGetDatabases,
    getSchemas: mysqlGetSchemas,
    getTables: mysqlGetTables,
    getColumns: mysqlGetColumns,
    getTableData: mysqlGetTableData,
    runQuery: mysqlRunQuery,
    dryRunDDL: mysqlDryRunDDL,
  },
  mssql: {
    test: mssqlTest,
    getDatabases: mssqlGetDatabases,
    getSchemas: mssqlGetSchemas,
    getTables: mssqlGetTables,
    getColumns: mssqlGetColumns,
    getTableData: mssqlGetTableData,
    runQuery: mssqlRunQuery,
    dryRunDDL: mssqlDryRunDDL,
  },
};

// ── EXPORT ─────────────────
export function getConnector(dbType: DbType) {
  return connectors[dbType];
}