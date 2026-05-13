/**
 * Migration: Track the last-applied physical column name on column_definitions.
 *
 * Approval pipeline previously emitted ALTER COLUMN statements using the
 * current `column_name` as the lookup key, so renaming a column in the grid
 * (e.g. `department` → `Department`) produced an ALTER targeting a name that
 * didn't exist in the physical table — Postgres returned 42703.
 *
 * `original_column_name` stores the column name as it last existed in the
 * target database. The DDL generator diffs it against `column_name` and emits
 * `ALTER TABLE ... RENAME COLUMN` first, then uses the new name for any
 * subsequent type/null/default ALTERs. `commitColumnActions` syncs
 * original_column_name = column_name on every successful apply so the next
 * edit measures from the correct base.
 *
 * Backfill assumption: existing rows have not been renamed since their last
 * apply, so original_column_name = column_name. Pre-migration submissions
 * that had already broken on a rename will still need a one-off UPDATE to
 * point original_column_name at the actual physical column name.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn('column_definitions', {
    original_column_name: { type: 'varchar(255)' },
  });
  pgm.sql(`UPDATE column_definitions SET original_column_name = column_name`);
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropColumn('column_definitions', 'original_column_name');
};
