/**
 * Migration: Collapse the `business_areas` taxonomy into a single enum-style
 * column on `table_definitions`.
 *
 * Why: the hierarchical taxonomy (domain → business_area → sub_area) and the
 * `business_areas` table itself were over-engineered for current needs. The
 * tagging value DART needs is a binary "where does this table live": either
 * the XBI fact/dim layer or the upstream raw Database Source. Everything else
 * was unused metadata.
 *
 * Behavior:
 *   - Drops `table_definitions.business_area_id` (and its FK)
 *   - Drops the `business_areas` table itself (CASCADE — kills the indexes
 *     and parent_id self-FK added by migration 7 if it ran)
 *   - Adds `table_definitions.business_area` (varchar(50)) with a CHECK
 *     constraint restricting values to the two allowed labels. Nullable so
 *     pre-existing rows stay valid; the application layer enforces
 *     "required on save" for new submissions.
 *
 * The `down` migration recreates the original flat `business_areas` shape
 * from migration 1 but does NOT attempt to restore data — this is a one-way
 * cleanup. Roll back only on a fresh DB.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.dropColumn('table_definitions', 'business_area_id', { ifExists: true });

  pgm.dropTable('business_areas', { cascade: true, ifExists: true });

  pgm.addColumn('table_definitions', {
    business_area: {
      type: 'varchar(50)',
      check: "business_area IN ('XBI Tables', 'Database Source')",
    },
  });

  pgm.createIndex('table_definitions', 'business_area');
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropIndex('table_definitions', 'business_area');
  pgm.dropColumn('table_definitions', 'business_area');

  pgm.createTable('business_areas', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(100)', notNull: true, unique: true },
    description: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.addColumn('table_definitions', {
    business_area_id: {
      type: 'uuid',
      references: 'business_areas(id)',
      onDelete: 'SET NULL',
    },
  });
};
