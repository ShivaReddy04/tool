import { buildCreateTableDDL, buildAlterDDL, hasPendingChanges, DDLColumn, DbType } from './ddl_generator';

const baseCol = (overrides: Partial<DDLColumn> = {}): DDLColumn => ({
  column_name: 'name',
  data_type: 'VARCHAR(100)',
  is_nullable: true,
  is_primary_key: false,
  default_value: null,
  action: 'No Change',
  ...overrides,
});

describe('buildCreateTableDDL', () => {
  it('returns null when every column is marked Drop (nothing to create)', () => {
    const cols = [baseCol({ action: 'Drop' })];
    expect(buildCreateTableDDL('postgresql', 'public', 't', cols)).toBeNull();
  });

  it('quotes identifiers with double quotes on postgresql', () => {
    const cols = [baseCol({ column_name: 'name', data_type: 'TEXT' })];
    const ddl = buildCreateTableDDL('postgresql', 'public', 'users', cols);
    expect(ddl).toBe('CREATE TABLE IF NOT EXISTS "public"."users" ("name" TEXT)');
  });

  it('quotes identifiers with backticks on mysql', () => {
    const cols = [baseCol({ column_name: 'name', data_type: 'TEXT' })];
    const ddl = buildCreateTableDDL('mysql', 'app', 'users', cols);
    expect(ddl).toBe('CREATE TABLE IF NOT EXISTS `app`.`users` (`name` TEXT)');
  });

  it('quotes identifiers with brackets on mssql (no IF NOT EXISTS — unsupported)', () => {
    const cols = [baseCol({ column_name: 'name', data_type: 'NVARCHAR(100)' })];
    const ddl = buildCreateTableDDL('mssql', 'dbo', 'users', cols);
    expect(ddl).toBe('CREATE TABLE [dbo].[users] ([name] NVARCHAR(100))');
  });

  it('emits CREATE TABLE IF NOT EXISTS where the dialect supports it', () => {
    const cols = [baseCol({ column_name: 'name', data_type: 'TEXT' })];
    expect(buildCreateTableDDL('postgresql', 'public', 't', cols)).toContain('CREATE TABLE IF NOT EXISTS');
    expect(buildCreateTableDDL('redshift', 'public', 't', cols)).toContain('CREATE TABLE IF NOT EXISTS');
    expect(buildCreateTableDDL('mysql', 'app', 't', cols)).toContain('CREATE TABLE IF NOT EXISTS');
    expect(buildCreateTableDDL('mssql', 'dbo', 't', cols)).not.toContain('IF NOT EXISTS');
  });

  it('escapes embedded quote characters per dialect', () => {
    expect(buildCreateTableDDL('postgresql', 'public', 'a"b', [baseCol()]))
      .toContain('"a""b"');
    expect(buildCreateTableDDL('mysql', 'app', 'a`b', [baseCol()]))
      .toContain('`a``b`');
    expect(buildCreateTableDDL('mssql', 'dbo', 'a]b', [baseCol()]))
      .toContain('[a]]b]');
  });

  it('emits NOT NULL and DEFAULT clauses verbatim', () => {
    const cols = [baseCol({
      column_name: 'created_at',
      data_type: 'TIMESTAMP',
      is_nullable: false,
      default_value: 'CURRENT_TIMESTAMP',
    })];
    const ddl = buildCreateTableDDL('postgresql', 'public', 't', cols);
    expect(ddl).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  });

  it('appends a PRIMARY KEY clause for the set of pk columns', () => {
    const cols = [
      baseCol({ column_name: 'id', data_type: 'BIGINT', is_primary_key: true, is_nullable: false }),
      baseCol({ column_name: 'tenant_id', data_type: 'BIGINT', is_primary_key: true, is_nullable: false }),
      baseCol({ column_name: 'name', data_type: 'TEXT' }),
    ];
    const ddl = buildCreateTableDDL('postgresql', 'public', 't', cols)!;
    expect(ddl).toContain('PRIMARY KEY ("id", "tenant_id")');
  });

  it('excludes columns marked Drop from the CREATE statement', () => {
    const cols = [
      baseCol({ column_name: 'keep', data_type: 'INT' }),
      baseCol({ column_name: 'gone', data_type: 'INT', action: 'Drop' }),
    ];
    const ddl = buildCreateTableDDL('postgresql', 'public', 't', cols)!;
    expect(ddl).toContain('"keep"');
    expect(ddl).not.toContain('"gone"');
  });
});

describe('buildAlterDDL', () => {
  it('returns an empty list when there are no actioned columns', () => {
    const cols = [baseCol({ action: 'No Change' })];
    expect(buildAlterDDL('postgresql', 'public', 't', cols)).toEqual([]);
  });

  it('orders statements as Add → Modify → Drop', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'd', data_type: 'INT', action: 'Drop' }),
      baseCol({ column_name: 'a', data_type: 'INT', action: 'Add' }),
      baseCol({ column_name: 'm', data_type: 'BIGINT', action: 'Modify', is_nullable: true }),
    ];
    const stmts = buildAlterDDL('postgresql', 'public', 't', cols);
    const addIdx = stmts.findIndex((s) => s.includes('ADD COLUMN'));
    const modIdx = stmts.findIndex((s) => s.includes('ALTER COLUMN "m" TYPE'));
    const dropIdx = stmts.findIndex((s) => s.includes('DROP COLUMN') && s.includes('"d"'));
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(modIdx).toBeGreaterThan(addIdx);
    expect(dropIdx).toBeGreaterThan(modIdx);
  });

  it('guards ADD / DROP COLUMN with IF [NOT] EXISTS on postgres for safe retries', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'a', data_type: 'INT', action: 'Add' }),
      baseCol({ column_name: 'd', data_type: 'INT', action: 'Drop' }),
    ];
    const stmts = buildAlterDDL('postgresql', 'public', 't', cols);
    expect(stmts).toContain('ALTER TABLE "public"."t" ADD COLUMN IF NOT EXISTS "a" INT');
    expect(stmts).toContain('ALTER TABLE "public"."t" DROP COLUMN IF EXISTS "d"');
  });

  it('omits ADD/DROP guards on redshift (clause unsupported)', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'a', data_type: 'INT', action: 'Add' }),
      baseCol({ column_name: 'd', data_type: 'INT', action: 'Drop' }),
    ];
    const stmts = buildAlterDDL('redshift', 'public', 't', cols);
    expect(stmts).toContain('ALTER TABLE "public"."t" ADD COLUMN "a" INT');
    expect(stmts).toContain('ALTER TABLE "public"."t" DROP COLUMN "d"');
    expect(stmts.join('\n')).not.toContain('IF NOT EXISTS');
    expect(stmts.join('\n')).not.toContain('IF EXISTS');
  });

  it('guards only DROP COLUMN on mssql (DROP IF EXISTS supported, ADD is not)', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'a', data_type: 'INT', action: 'Add' }),
      baseCol({ column_name: 'd', data_type: 'INT', action: 'Drop' }),
    ];
    const stmts = buildAlterDDL('mssql', 'dbo', 't', cols);
    expect(stmts).toContain('ALTER TABLE [dbo].[t] ADD COLUMN [a] INT');
    expect(stmts).toContain('ALTER TABLE [dbo].[t] DROP COLUMN IF EXISTS [d]');
  });

  it('expands a Modify on postgres into TYPE + NULL + DEFAULT statements', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'qty', data_type: 'BIGINT', action: 'Modify', is_nullable: false, default_value: '0' }),
    ];
    const stmts = buildAlterDDL('postgresql', 'public', 't', cols);
    expect(stmts).toEqual([
      'ALTER TABLE "public"."t" ALTER COLUMN "qty" TYPE BIGINT USING "qty"::BIGINT',
      'ALTER TABLE "public"."t" ALTER COLUMN "qty" SET NOT NULL',
      'ALTER TABLE "public"."t" ALTER COLUMN "qty" SET DEFAULT 0',
    ]);
  });

  it('drops the default on postgres when default_value is missing', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'qty', data_type: 'BIGINT', action: 'Modify', is_nullable: true, default_value: null }),
    ];
    const stmts = buildAlterDDL('postgresql', 'public', 't', cols);
    expect(stmts).toContain('ALTER TABLE "public"."t" ALTER COLUMN "qty" DROP NOT NULL');
    expect(stmts).toContain('ALTER TABLE "public"."t" ALTER COLUMN "qty" DROP DEFAULT');
  });

  it('emits a single MODIFY COLUMN on mysql', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'qty', data_type: 'BIGINT', action: 'Modify', is_nullable: false, default_value: '0' }),
    ];
    const stmts = buildAlterDDL('mysql', 'app', 't', cols);
    expect(stmts).toEqual(['ALTER TABLE `app`.`t` MODIFY COLUMN `qty` BIGINT NOT NULL DEFAULT 0']);
  });

  it('redshift uses the same shape as postgres', () => {
    const cols: DDLColumn[] = [
      baseCol({ column_name: 'qty', data_type: 'BIGINT', action: 'Add', is_nullable: false }),
    ];
    expect(buildAlterDDL('redshift', 'public', 't', cols)).toEqual([
      'ALTER TABLE "public"."t" ADD COLUMN "qty" BIGINT NOT NULL',
    ]);
  });
});

describe('hasPendingChanges', () => {
  it.each<[DDLColumn['action'], boolean]>([
    ['No Change', false],
    [undefined as any, false],
    ['Add', true],
    ['Modify', true],
    ['Drop', true],
  ])('action=%s → %s', (action, expected) => {
    const cols: DDLColumn[] = [baseCol({ action })];
    expect(hasPendingChanges(cols)).toBe(expected);
  });

  it('returns true when at least one of several columns is actioned', () => {
    const cols: DDLColumn[] = [
      baseCol({ action: 'No Change' }),
      baseCol({ column_name: 'b', action: 'Add' }),
    ];
    expect(hasPendingChanges(cols)).toBe(true);
  });
});
