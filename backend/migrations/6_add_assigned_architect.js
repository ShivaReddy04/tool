/**
 * Migration: Assign a specific architect (reviewer) to each submission.
 *
 * The developer picks a reviewer at submit-time, similar to GitHub PR
 * "request review" or Jira ticket assignment. Architects only see
 * submissions assigned to them; admins continue to see everything.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn('submissions', {
    assigned_architect_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('submissions', 'assigned_architect_id');
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropIndex('submissions', 'assigned_architect_id');
  pgm.dropColumn('submissions', 'assigned_architect_id');
};
