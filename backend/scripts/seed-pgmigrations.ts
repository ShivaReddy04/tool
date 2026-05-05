/**
 * Mark migrations 1-6 as applied so node-pg-migrate doesn't try to re-run them.
 * The schema was already created by sync-schema.ts; this just records the bookkeeping.
 *
 * Run: npx ts-node scripts/seed-pgmigrations.ts
 */
import { query, getPool } from '../src/config/db';

const APPLIED = [
  '1_initial-schema',
  '2_create-audit-logs',
  '3_create-change-requests',
  '4_add_architect_fields',
  '5_add_submission_payload',
  '6_add_assigned_architect',
];

async function main() {
  const pool = await getPool();
  const target = pool.options as any;
  const where = target.connectionString
    ? target.connectionString.replace(/\/\/[^@]+@/, '//***@')
    : `${target.host}:${target.port}/${target.database}`;
  console.log(`Targeting DB: ${where}\n`);

  await query(
    `CREATE TABLE IF NOT EXISTS pgmigrations (
      id SERIAL PRIMARY KEY,
      name varchar(255) NOT NULL,
      run_on timestamp NOT NULL
    )`
  );

  // Defensive: if a name already exists, leave its run_on alone (no clobbering).
  for (const name of APPLIED) {
    const exists = await query(`SELECT 1 FROM pgmigrations WHERE name = $1`, [name]);
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`  ${name.padEnd(28)} already recorded — skip`);
      continue;
    }
    await query(`INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())`, [name]);
    console.log(`  ${name.padEnd(28)} recorded`);
  }

  const all = await query(`SELECT name, run_on FROM pgmigrations ORDER BY id`);
  console.log('\npgmigrations now:');
  for (const r of all.rows) {
    console.log(`  ${r.name.padEnd(28)} ${r.run_on.toISOString()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
