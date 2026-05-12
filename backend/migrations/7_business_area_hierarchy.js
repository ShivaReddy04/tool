/**
 * Migration: Promote business_areas into a 3-tier hierarchy.
 *
 * Layer 1 -> Domain
 * Layer 2 -> Business Area
 * Layer 3 -> Sub Area
 *
 * Adds `parent_id` (self FK) and `level` columns. The unique constraint on
 * `name` is dropped because the same name can legally appear under different
 * parents (e.g. two domains may both have a "Sales" sub-area). A composite
 * uniqueness on (parent_id, name, level) replaces it. Existing rows are
 * back-filled to level='business_area' with no parent so old data continues
 * to work with the new layered selector.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumn('business_areas', {
    parent_id: {
      type: 'uuid',
      references: 'business_areas(id)',
      onDelete: 'SET NULL',
    },
    level: {
      type: 'varchar(20)',
      notNull: true,
      default: 'business_area',
      check: "level IN ('domain', 'business_area', 'sub_area')",
    },
  });

  // Drop the auto-generated UNIQUE constraint on `name` so duplicate names
  // can exist at different layers / under different parents. The constraint
  // is named by Postgres convention `<table>_<column>_key`.
  pgm.dropConstraint('business_areas', 'business_areas_name_key', { ifExists: true });

  pgm.addConstraint('business_areas', 'business_areas_parent_name_level_unique', {
    unique: ['parent_id', 'name', 'level'],
  });

  pgm.createIndex('business_areas', 'parent_id');
  pgm.createIndex('business_areas', 'level');
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropIndex('business_areas', 'level');
  pgm.dropIndex('business_areas', 'parent_id');
  pgm.dropConstraint('business_areas', 'business_areas_parent_name_level_unique', { ifExists: true });
  pgm.addConstraint('business_areas', 'business_areas_name_key', { unique: ['name'] });
  pgm.dropColumn('business_areas', 'level');
  pgm.dropColumn('business_areas', 'parent_id');
};
