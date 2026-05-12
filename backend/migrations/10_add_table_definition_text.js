/**
 * Migration: Add a free-text `definition` column to `table_definitions`.
 *
 * Captures the developer's description of what the table represents — its
 * purpose, ownership, key business meaning. Surfaced in the Create Table
 * drawer and read back in the Table Properties panel.
 *
 * Nullable so existing rows stay valid; no backfill needed.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn('table_definitions', {
    definition: { type: 'text' },
  });
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropColumn('table_definitions', 'definition');
};
