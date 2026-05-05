/**
 * One-off: bring the target Postgres schema up to date with migrations 1-6.
 * Every statement is idempotent (IF NOT EXISTS), so this is safe to re-run.
 *
 * Run: npx ts-node scripts/sync-schema.ts
 */
import { query, getPool } from '../src/config/db';

const STATEMENTS: { label: string; sql: string }[] = [
  // ── Tables (migration 1) ──────────────────────────────────────────
  {
    label: 'users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) NOT NULL UNIQUE,
      password_hash varchar(255) NOT NULL,
      first_name varchar(100) NOT NULL,
      last_name varchar(100) NOT NULL,
      role varchar(20) NOT NULL DEFAULT 'developer'
        CHECK (role IN ('developer', 'architect', 'admin', 'viewer')),
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    label: 'refresh_tokens',
    sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash varchar(255) NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    label: 'connections',
    sql: `CREATE TABLE IF NOT EXISTS connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL,
      db_type varchar(20) NOT NULL
        CHECK (db_type IN ('postgresql', 'mysql', 'mssql', 'redshift')),
      host varchar(255) NOT NULL,
      port integer NOT NULL,
      database_name varchar(100) NOT NULL,
      username varchar(100) NOT NULL,
      password_encrypted varchar(500) NOT NULL,
      status varchar(20) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    label: 'schemas',
    sql: `CREATE TABLE IF NOT EXISTS schemas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL,
      cluster_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT schemas_name_cluster_unique UNIQUE (name, cluster_id)
    )`,
  },
  {
    label: 'business_areas',
    sql: `CREATE TABLE IF NOT EXISTS business_areas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL UNIQUE,
      description text,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    label: 'table_definitions',
    sql: `CREATE TABLE IF NOT EXISTS table_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      database_name varchar(100) NOT NULL,
      schema_name varchar(100) NOT NULL,
      table_name varchar(255) NOT NULL,
      entity_logical_name varchar(255),
      distribution_style varchar(20)
        CHECK (distribution_style IN ('KEY', 'EVEN', 'ALL', 'AUTO')),
      keys text,
      vertical_name varchar(100),
      business_area_id uuid REFERENCES business_areas(id) ON DELETE SET NULL,
      status varchar(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','submitted','approved','rejected','applied','processed')),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT table_definitions_unique_table
        UNIQUE (connection_id, database_name, schema_name, table_name)
    )`,
  },
  {
    label: 'column_definitions',
    sql: `CREATE TABLE IF NOT EXISTS column_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id uuid NOT NULL REFERENCES table_definitions(id) ON DELETE CASCADE,
      column_name varchar(255) NOT NULL,
      data_type varchar(50) NOT NULL,
      is_nullable boolean DEFAULT true,
      is_primary_key boolean DEFAULT false,
      data_classification varchar(20) DEFAULT 'Internal'
        CHECK (data_classification IN ('Public','Internal','Confidential','PII','Restricted')),
      data_domain varchar(100),
      attribute_definition text,
      default_value text,
      action varchar(20) NOT NULL DEFAULT 'No Change'
        CHECK (action IN ('No Change','Modify','Add','Drop')),
      sort_order integer DEFAULT 0,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT column_definitions_unique_column UNIQUE (table_id, column_name)
    )`,
  },
  {
    label: 'submissions',
    sql: `CREATE TABLE IF NOT EXISTS submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id uuid NOT NULL REFERENCES table_definitions(id) ON DELETE CASCADE,
      submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
      rejection_reason text,
      submitted_at timestamptz DEFAULT CURRENT_TIMESTAMP,
      reviewed_at timestamptz
    )`,
  },

  // ── Tables (migration 2) ──────────────────────────────────────────
  {
    label: 'audit_logs',
    sql: `CREATE TABLE IF NOT EXISTS audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      action varchar(100) NOT NULL,
      entity_type varchar(100) NOT NULL,
      entity_id varchar(255) NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      user_name varchar(255),
      metadata jsonb,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },

  // ── Tables (migration 3) ──────────────────────────────────────────
  {
    label: 'change_requests',
    sql: `CREATE TABLE IF NOT EXISTS change_requests (
      id serial PRIMARY KEY,
      connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      database_name varchar(255),
      schema_name varchar(255),
      table_name text NOT NULL,
      row_id text NOT NULL,
      old_data jsonb NOT NULL,
      new_data jsonb NOT NULL,
      status text DEFAULT 'pending',
      submitted_by uuid REFERENCES users(id),
      reviewed_by uuid REFERENCES users(id),
      created_at timestamp DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp DEFAULT CURRENT_TIMESTAMP
    )`,
  },

  // ── ALTERs (migrations 4-6, idempotent) ───────────────────────────
  {
    label: 'users.updated_at',
    sql: `ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT CURRENT_TIMESTAMP`,
  },
  {
    label: 'table_definitions.reviewed_by',
    sql: `ALTER TABLE table_definitions
      ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL`,
  },
  {
    label: 'table_definitions.review_comments',
    sql: `ALTER TABLE table_definitions
      ADD COLUMN IF NOT EXISTS review_comments text`,
  },
  {
    label: 'table_definitions.processed_at',
    sql: `ALTER TABLE table_definitions
      ADD COLUMN IF NOT EXISTS processed_at timestamptz`,
  },
  {
    label: 'submissions.payload',
    sql: `ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS payload jsonb`,
  },
  {
    label: 'submissions.assigned_architect_id',
    sql: `ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS assigned_architect_id uuid REFERENCES users(id) ON DELETE SET NULL`,
  },

  // ── Indexes (idempotent) ──────────────────────────────────────────
  { label: 'idx users_email', sql: `CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)` },
  { label: 'idx refresh_tokens_user_id', sql: `CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens (user_id)` },
  { label: 'idx refresh_tokens_token_hash', sql: `CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens (token_hash)` },
  { label: 'idx connections_created_by', sql: `CREATE INDEX IF NOT EXISTS connections_created_by_idx ON connections (created_by)` },
  { label: 'idx schemas_cluster_id', sql: `CREATE INDEX IF NOT EXISTS schemas_cluster_id_idx ON schemas (cluster_id)` },
  { label: 'idx table_definitions_connection_id', sql: `CREATE INDEX IF NOT EXISTS table_definitions_connection_id_idx ON table_definitions (connection_id)` },
  { label: 'idx table_definitions_status', sql: `CREATE INDEX IF NOT EXISTS table_definitions_status_idx ON table_definitions (status)` },
  { label: 'idx column_definitions_table_id', sql: `CREATE INDEX IF NOT EXISTS column_definitions_table_id_idx ON column_definitions (table_id)` },
  { label: 'idx submissions_table_id', sql: `CREATE INDEX IF NOT EXISTS submissions_table_id_idx ON submissions (table_id)` },
  { label: 'idx submissions_submitted_by', sql: `CREATE INDEX IF NOT EXISTS submissions_submitted_by_idx ON submissions (submitted_by)` },
  { label: 'idx submissions_status', sql: `CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions (status)` },
  { label: 'idx submissions_assigned_architect_id', sql: `CREATE INDEX IF NOT EXISTS submissions_assigned_architect_id_idx ON submissions (assigned_architect_id)` },
  { label: 'idx audit_logs_entity_type', sql: `CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx ON audit_logs (entity_type)` },
  { label: 'idx audit_logs_entity_id', sql: `CREATE INDEX IF NOT EXISTS audit_logs_entity_id_idx ON audit_logs (entity_id)` },
  { label: 'idx change_requests_status', sql: `CREATE INDEX IF NOT EXISTS change_requests_status_idx ON change_requests (status)` },
];

async function main() {
  const pool = await getPool();
  const target = pool.options as any;
  const where = target.connectionString
    ? target.connectionString.replace(/\/\/[^@]+@/, '//***@')
    : `${target.host}:${target.port}/${target.database}`;
  console.log(`Targeting DB: ${where}\n`);

  // Snapshot what's there before, so the report shows what was created/added.
  const before = await query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'`
  );
  const existing = new Set(before.rows.map((r: any) => `${r.table_name}.${r.column_name}`));
  const existingTables = new Set(before.rows.map((r: any) => r.table_name));

  for (const { label, sql } of STATEMENTS) {
    process.stdout.write(`  ${label.padEnd(42)} ... `);
    try {
      await query(sql);
      console.log('ok');
    } catch (err: any) {
      console.log('FAILED');
      console.error(`     ${err.code || ''} ${err.message}`);
      throw err;
    }
  }

  // Diff after
  const after = await query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'`
  );
  const newCols = after.rows
    .map((r: any) => `${r.table_name}.${r.column_name}`)
    .filter((k) => !existing.has(k));
  const newTables = [...new Set(after.rows.map((r: any) => r.table_name as string))]
    .filter((t) => !existingTables.has(t));

  console.log('\n── Summary ────────────────────────────────────────────');
  console.log('Tables created:', newTables.length ? newTables.join(', ') : 'none');
  console.log('Columns added :', newCols.length ? newCols.join(', ') : 'none');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
