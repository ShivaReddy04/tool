/**
 * READ-ONLY: dump tables, columns, types and foreign keys on the target DB.
 * Run: npx ts-node scripts/inspect-schema.ts
 */
import { query, getPool } from '../src/config/db';

async function main() {
  const pool = await getPool();
  const target = pool.options as any;
  const where = target.connectionString
    ? target.connectionString.replace(/\/\/[^@]+@/, '//***@')
    : `${target.host}:${target.port}/${target.database}`;
  console.log(`Targeting DB: ${where}\n`);

  const tables = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  console.log('Tables present:', tables.rows.map((r: any) => r.table_name).join(', '));

  const cols = await query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );
  let currentTable = '';
  for (const r of cols.rows) {
    if (r.table_name !== currentTable) {
      currentTable = r.table_name;
      console.log(`\n── ${currentTable} ────────────────────────────────`);
    }
    console.log(
      `  ${r.column_name.padEnd(30)} ${r.data_type.padEnd(28)} ${r.is_nullable === 'NO' ? 'NOT NULL' : ''} ${r.column_default ? `default ${r.column_default}` : ''}`
    );
  }

  console.log('\n── Foreign keys ──────────────────────────────────────');
  const fks = await query(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
     ORDER BY tc.table_name, kcu.column_name`
  );
  for (const r of fks.rows) {
    console.log(`  ${r.table_name}.${r.column_name} → ${r.ref_table}.${r.ref_column}`);
  }

  console.log('\n── Row counts ────────────────────────────────────────');
  for (const t of tables.rows) {
    const c = await query(`SELECT COUNT(*)::int AS n FROM "${t.table_name}"`);
    console.log(`  ${t.table_name.padEnd(25)} ${c.rows[0].n}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Inspect failed:', err);
    process.exit(1);
  });
