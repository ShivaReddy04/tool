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

// ── Pool cache (PostgreSQL / Redshift) ─────────────────
//
// Each connector function used to do `new PgPool(...) → query → pool.end()`,
// which is fine for one-off calls but burns FDs and serializes work when the
// same target cluster is hit repeatedly (every API request that touches a
// remote DB). We keep a small bounded LRU of warm pools keyed by the full
// destination tuple — including password, so credential rotation evicts the
// stale pool naturally on the next call.
//
// Eviction policy:
//   - Idle TTL: pools untouched for `POOL_IDLE_TTL_MS` are closed on the next
//     access (lazy sweep — keeps the module timer-free for tests).
//   - Capacity: at most `MAX_POOLS` entries; oldest-by-lastUsed wins.

const POOL_IDLE_TTL_MS = 5 * 60 * 1000;
const MAX_POOLS = 16;

interface PoolCacheEntry {
  pool: PgPool;
  lastUsed: number;
}

const pgPoolCache = new Map<string, PoolCacheEntry>();

function pgPoolKey(c: ConnectionConfig): string {
  return `${c.host}|${c.port}|${c.database}|${c.user}|${c.password}`;
}

function sweepPgCache(): void {
  const now = Date.now();
  for (const [k, entry] of pgPoolCache) {
    if (now - entry.lastUsed > POOL_IDLE_TTL_MS) {
      pgPoolCache.delete(k);
      // Fire-and-forget: closing a stale pool must never block the live request.
      entry.pool.end().catch((err) => console.warn('Stale pg pool close failed:', err?.message || err));
    }
  }
  if (pgPoolCache.size >= MAX_POOLS) {
    const sorted = [...pgPoolCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (pgPoolCache.size >= MAX_POOLS && sorted.length > 0) {
      const [k, entry] = sorted.shift()!;
      pgPoolCache.delete(k);
      entry.pool.end().catch((err) => console.warn('Evicted pg pool close failed:', err?.message || err));
    }
  }
}

// ── PostgreSQL / Redshift ─────────────────
async function pgConnect(config: ConnectionConfig): Promise<PgPool> {
  const key = pgPoolKey(config);
  const existing = pgPoolCache.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.pool;
  }

  sweepPgCache();

  const pool = new PgPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  // pg surfaces idle-client errors via the pool's `error` event; without a
  // handler Node treats them as uncaught and crashes the process.
  pool.on('error', (err) => console.error('Idle pg client error on cached pool:', err?.message || err));
  pgPoolCache.set(key, { pool, lastUsed: Date.now() });
  return pool;
}

/** Test-only: drain and drop all cached pools. */
export async function _clearPgPoolCache(): Promise<void> {
  const entries = [...pgPoolCache.values()];
  pgPoolCache.clear();
  await Promise.all(entries.map((e) => e.pool.end().catch(() => undefined)));
}

/**
 * Drain and drop the cached pg pool for a specific connection tuple. Called
 * after a cluster row is deleted so the FD is released immediately instead of
 * waiting for the lazy idle-TTL sweep. Safe to call when no pool is cached
 * (e.g. the connection had never been used) — it's a no-op.
 */
export async function evictPgPool(config: ConnectionConfig): Promise<void> {
  const key = pgPoolKey(config);
  const entry = pgPoolCache.get(key);
  if (!entry) return;
  pgPoolCache.delete(key);
  // Closing a freshly-evicted pool must never block the caller — surface as a
  // warning, never a failure.
  await entry.pool.end().catch((err) =>
    console.warn('Evicted pg pool close failed:', err?.message || err),
  );
}

async function pgGetDatabases(config: ConnectionConfig): Promise<string[]> {
  const pool = await pgConnect(config);
  const res = await pool.query(
    `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
  );
  return res.rows.map((r: any) => r.datname);
}

async function pgGetSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
  const pool = await pgConnect(config);
  const res = await pool.query(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name NOT IN ('pg_catalog','information_schema')`
  );
  return res.rows;
}

async function pgGetTables(config: ConnectionConfig, schema: string): Promise<TableInfo[]> {
  const pool = await pgConnect(config);
  const res = await pool.query(
    `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema=$1`,
    [schema]
  );
  return res.rows;
}

async function pgGetColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const pool = await pgConnect(config);
  const res = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`,
    [schema, table]
  );
  return res.rows;
}

async function pgTest(config: ConnectionConfig) {
  const pool = await pgConnect(config);
  await pool.query('SELECT 1');
  return true;
}

async function pgGetTableData(config: ConnectionConfig, schema: string, table: string) {
  const pool = await pgConnect(config);
  const res = await pool.query(`SELECT * FROM "${schema}"."${table}" LIMIT 100`);
  return res.rows;
}

async function pgRunQuery(config: ConnectionConfig, queryStr: string, params?: any[]) {
  const pool = await pgConnect(config);
  return pool.query(queryStr, params);
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
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

// Same shape as pgRunDDLBatch but always rolls back. Used by the submit
// pre-flight to surface "this DDL won't apply against current data" errors
// (e.g. ALTER ... TYPE TIMESTAMP USING ::TIMESTAMP failing because the column
// holds non-castable strings) before the architect ever sees the submission.
async function pgDryRunDDLBatch(config: ConnectionConfig, statements: string[]) {
  if (statements.length === 0) return;
  const pool = await pgConnect(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < statements.length; i++) {
      try {
        await client.query(statements[i]);
      } catch (e: any) {
        e.failedStatement = statements[i];
        e.failedStatementIndex = i;
        throw e;
      }
    }
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    client.release();
  }
}

async function pgRunDDLBatch(config: ConnectionConfig, statements: string[]) {
  if (statements.length === 0) return;
  const pool = await pgConnect(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < statements.length; i++) {
      try {
        await client.query(statements[i]);
      } catch (e: any) {
        // Attach the exact statement that blew up so the controller can
        // surface a useful message ("Column X DEFAULT 'AI' rejected on
        // DATE type") instead of the raw "invalid input syntax" text.
        e.failedStatement = statements[i];
        e.failedStatementIndex = i;
        throw e;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
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

async function mysqlRunDDLBatch(config: ConnectionConfig, statements: string[]) {
  if (statements.length === 0) return;
  // MySQL DDL statements implicitly commit, so a real transaction wouldn't roll back
  // ALTER/CREATE anyway. Run sequentially and surface the first failure.
  const conn = await mysqlConnect(config);
  try {
    for (let i = 0; i < statements.length; i++) {
      try {
        await conn.query(statements[i]);
      } catch (e: any) {
        e.failedStatement = statements[i];
        e.failedStatementIndex = i;
        throw e;
      }
    }
  } finally {
    await conn.end();
  }
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

async function mssqlDryRunDDLBatch(config: ConnectionConfig, statements: string[]) {
  if (statements.length === 0) return;
  const pool = await mssqlConnect(config);
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    for (let i = 0; i < statements.length; i++) {
      try {
        const req = new sql.Request(transaction);
        await req.query(statements[i]);
      } catch (inner: any) {
        inner.failedStatement = statements[i];
        inner.failedStatementIndex = i;
        throw inner;
      }
    }
  } finally {
    try { await transaction.rollback(); } catch { /* ignore */ }
    await pool.close();
  }
}

async function mssqlRunDDLBatch(config: ConnectionConfig, statements: string[]) {
  if (statements.length === 0) return;
  const pool = await mssqlConnect(config);
  const transaction = new sql.Transaction(pool);
  let failedIndex = -1;
  try {
    await transaction.begin();
    for (let i = 0; i < statements.length; i++) {
      try {
        const req = new sql.Request(transaction);
        await req.query(statements[i]);
      } catch (inner: any) {
        failedIndex = i;
        inner.failedStatement = statements[i];
        inner.failedStatementIndex = i;
        throw inner;
      }
    }
    await transaction.commit();
  } catch (e: any) {
    try { await transaction.rollback(); } catch { /* ignore */ }
    if (failedIndex >= 0 && !e.failedStatement) {
      e.failedStatement = statements[failedIndex];
      e.failedStatementIndex = failedIndex;
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
    runDDLBatch: pgRunDDLBatch,
    dryRunDDLBatch: pgDryRunDDLBatch,
    supportsDDLDryRun: true,
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
    runDDLBatch: pgRunDDLBatch,
    dryRunDDLBatch: pgDryRunDDLBatch,
    supportsDDLDryRun: true,
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
    runDDLBatch: mysqlRunDDLBatch,
    // MySQL DDL auto-commits; no safe dry-run. Submit pre-flight will skip.
    supportsDDLDryRun: false,
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
    runDDLBatch: mssqlRunDDLBatch,
    dryRunDDLBatch: mssqlDryRunDDLBatch,
    supportsDDLDryRun: true,
  },
};

// ── EXPORT ─────────────────
export function getConnector(dbType: DbType) {
  return connectors[dbType];
}