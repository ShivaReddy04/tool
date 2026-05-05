/**
 * One-off: add users.updated_at if missing.
 * Reuses the backend's pg pool config (DATABASE_URL or DB_HOST/DB_NAME from .env).
 *
 * Run: npx ts-node scripts/fix-users-updated-at.ts
 */
import { query, getPool } from '../src/config/db';

async function main() {
  const pool = await getPool();
  const target = pool.options as any;
  const where = target.connectionString
    ? target.connectionString.replace(/\/\/[^@]+@/, '//***@')
    : `${target.host}:${target.port}/${target.database}`;
  console.log(`Targeting DB: ${where}`);

  const before = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'updated_at'`
  );
  if (before.rowCount && before.rowCount > 0) {
    console.log('users.updated_at already exists. Nothing to do.');
    return;
  }

  console.log('Adding users.updated_at ...');
  await query(
    `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
  );

  const after = await query(
    `SELECT column_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'updated_at'`
  );
  console.log('Verified:', after.rows[0]);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
