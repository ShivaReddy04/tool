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
  const pool = process.env.DATABASE_URL
    ? new PgPool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
    })
    : new PgPool({
      ...config,
      max: 2,
      connectionTimeoutMillis: 5000,
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

// ── CONNECTORS MAP ─────────────────
type DbType = 'postgresql' | 'mysql' | 'mssql' | 'redshift';

const connectors = {
  postgresql: {
    test: pgTest,
    getDatabases: pgGetDatabases,
    getSchemas: pgGetSchemas,
    getTables: pgGetTables,
    getColumns: pgGetColumns,
    getTableData: pgGetTableData,
  },
  redshift: {
    test: pgTest,
    getDatabases: pgGetDatabases,
    getSchemas: pgGetSchemas,
    getTables: pgGetTables,
    getColumns: pgGetColumns,
    getTableData: pgGetTableData,
  },
  mysql: {
    test: mysqlTest,
  },
  mssql: {
    test: mssqlTest,
  },
};

// ── EXPORT ─────────────────
export function getConnector(dbType: DbType) {
  return connectors[dbType];
}