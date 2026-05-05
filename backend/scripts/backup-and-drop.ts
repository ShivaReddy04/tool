/**
 * Dump existing users + clusters to JSON, then DROP both tables CASCADE.
 * Run: npx ts-node scripts/backup-and-drop.ts
 */
import { query, getPool } from '../src/config/db';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const pool = await getPool();
  const target = pool.options as any;
  const where = target.connectionString
    ? target.connectionString.replace(/\/\/[^@]+@/, '//***@')
    : `${target.host}:${target.port}/${target.database}`;
  console.log(`Targeting DB: ${where}\n`);

  const backupDir = path.join(__dirname, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `pre-rebuild-${stamp}.json`);

  const users = await query(`SELECT * FROM users`);
  const clusters = await query(`SELECT * FROM clusters`);

  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        backed_up_at: new Date().toISOString(),
        target: where,
        users: users.rows,
        clusters: clusters.rows,
      },
      null,
      2
    )
  );
  console.log(`Backed up ${users.rows.length} users and ${clusters.rows.length} clusters to:`);
  console.log(`  ${backupFile}\n`);

  console.log('Dropping clusters CASCADE...');
  await query(`DROP TABLE IF EXISTS clusters CASCADE`);
  console.log('Dropping users CASCADE...');
  await query(`DROP TABLE IF EXISTS users CASCADE`);
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backup/drop failed:', err);
    process.exit(1);
  });
