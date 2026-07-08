import { computeApplyStatements } from './submission.controller';
import type { DDLColumn } from '../utils/ddl_generator';

// Fake connector: only getTables / getColumns are exercised by
// computeApplyStatements. No app DB is touched.
const fakeConnector = (opts: {
  tables?: any[];
  liveColumns?: any[];
  getColumnsThrows?: boolean;
}) => ({
  getTables: async () => opts.tables ?? [],
  getColumns: async () => {
    if (opts.getColumnsThrows) throw new Error('metadata read failed');
    return opts.liveColumns ?? [];
  },
});

const col = (overrides: Partial<DDLColumn>): DDLColumn => ({
  column_name: 'c',
  data_type: 'INT',
  is_nullable: true,
  is_primary_key: false,
  default_value: null,
  action: 'No Change',
  ...overrides,
});

describe('computeApplyStatements', () => {
  it('emits CREATE (schema + table) when the physical table is absent', async () => {
    const connector = fakeConnector({ tables: [] });
    const stmts = await computeApplyStatements(
      connector, 'postgresql', {}, 'public', 't', [col({ column_name: 'a', action: 'Add' })],
    );
    expect(stmts).toEqual([
      'CREATE SCHEMA IF NOT EXISTS "public"',
      'CREATE TABLE IF NOT EXISTS "public"."t" ("a" INT)',
    ]);
  });

  it('skips an Add whose column already exists — retry-safe on redshift (no IF NOT EXISTS)', async () => {
    const connector = fakeConnector({
      tables: [{ table_name: 't' }],
      liveColumns: [{ column_name: 'a' }], // 'a' already applied on a prior attempt
    });
    const cols = [
      col({ column_name: 'a', action: 'Add' }),
      col({ column_name: 'b', action: 'Add' }),
    ];
    const stmts = await computeApplyStatements(connector, 'redshift', {}, 'public', 't', cols);
    // 'a' is dropped from the batch entirely; only the genuinely-new 'b' is added.
    expect(stmts).toEqual(['ALTER TABLE "public"."t" ADD COLUMN "b" INT']);
  });

  it('skips a Drop whose column is already gone; keeps a Drop that still exists', async () => {
    const connector = fakeConnector({
      tables: [{ table_name: 't' }],
      liveColumns: [{ column_name: 'stays' }], // 'gone' already dropped
    });
    const cols = [
      col({ column_name: 'gone', action: 'Drop' }),
      col({ column_name: 'stays', action: 'Drop' }),
    ];
    const stmts = await computeApplyStatements(connector, 'mysql', {}, 'app', 't', cols);
    expect(stmts).toEqual(['ALTER TABLE `app`.`t` DROP COLUMN `stays`']);
  });

  it('is a no-op when every requested change is already applied (idempotent retry)', async () => {
    const connector = fakeConnector({
      tables: [{ table_name: 't' }],
      liveColumns: [{ column_name: 'a' }], // Add 'a' done, Drop 'b' done
    });
    const cols = [
      col({ column_name: 'a', action: 'Add' }),
      col({ column_name: 'b', action: 'Drop' }),
    ];
    const stmts = await computeApplyStatements(connector, 'mssql', {}, 'dbo', 't', cols);
    expect(stmts).toEqual([]);
  });

  it('passes Modify through (naturally idempotent) after reconcile', async () => {
    const connector = fakeConnector({
      tables: [{ table_name: 't' }],
      liveColumns: [{ column_name: 'qty' }],
    });
    const cols = [col({ column_name: 'qty', data_type: 'BIGINT', action: 'Modify', is_nullable: false })];
    const stmts = await computeApplyStatements(connector, 'postgresql', {}, 'public', 't', cols);
    expect(stmts).toContain('ALTER TABLE "public"."t" ALTER COLUMN "qty" TYPE BIGINT USING "qty"::BIGINT');
    expect(stmts).toContain('ALTER TABLE "public"."t" ALTER COLUMN "qty" SET NOT NULL');
  });

  it('falls back to the unreconciled batch when the live-column read fails', async () => {
    const connector = fakeConnector({ tables: [{ table_name: 't' }], getColumnsThrows: true });
    const cols = [col({ column_name: 'a', action: 'Add' })];
    const stmts = await computeApplyStatements(connector, 'postgresql', {}, 'public', 't', cols);
    // No reconcile possible → still emits the Add (Postgres IF NOT EXISTS guard covers retry here).
    expect(stmts).toEqual(['ALTER TABLE "public"."t" ADD COLUMN IF NOT EXISTS "a" INT']);
  });
});
