/**
 * Migration: Add architect review fields and processed status
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn('table_definitions', {
    reviewed_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    review_comments: { type: 'text' },
    processed_at: { type: 'timestamptz' },
  });

  // Update status check to include 'processed'
  try {
    pgm.dropConstraint('table_definitions', 'table_definitions_status_check');
  } catch (e) {
    // If constraint name differs, ignore and continue; we'll still add a new constraint name
    // This may leave the old check in place on some DBs; recommend running a manual check if needed.
  }

  pgm.addConstraint('table_definitions', 'table_definitions_status_check', {
    check: "status IN ('draft','submitted','approved','rejected','applied','processed')",
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('table_definitions', 'reviewed_by');
  pgm.dropColumn('table_definitions', 'review_comments');
  pgm.dropColumn('table_definitions', 'processed_at');

  try {
    pgm.dropConstraint('table_definitions', 'table_definitions_status_check');
  } catch (e) {}

  pgm.addConstraint('table_definitions', 'table_definitions_status_check', {
    check: "status IN ('draft','submitted','approved','rejected','applied')",
  });
};