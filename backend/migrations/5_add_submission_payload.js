/**
 * Migration: Add payload snapshot column to submissions
 * Stores the table_definition + columns snapshot at submit time so the
 * architect can review exactly what the developer submitted.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn('submissions', {
    payload: { type: 'jsonb' },
  });
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropColumn('submissions', 'payload');
};
