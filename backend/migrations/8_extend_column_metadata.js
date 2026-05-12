/**
 * Migration: Extend column_definitions with the full enterprise metadata set.
 *
 * Adds 14 new attributes per column so the Create Table grid can capture the
 * full Teradata/Redshift-style metadata enterprise data teams maintain:
 *
 *   - attribute_name          Business-friendly logical name (vs physical column_name)
 *   - has_stats               Whether COLLECT STATS has been requested for this column
 *   - compress_value          Compression literal (e.g. Teradata COMPRESS clause)
 *   - column_format           Display / FORMAT clause
 *   - comments                Free-text comments
 *   - source_table_name       Lineage: source table
 *   - source_column_name      Lineage: source column
 *   - transformation          ETL transformation expression / rule
 *   - tier_value              Data tier / quality tier label
 *   - source_system           Originating system of record
 *   - encoding                Physical encoding (e.g. LZO, ZSTD, DELTA)
 *   - is_sort_key             Redshift SORTKEY flag
 *   - is_dist_key             Redshift DISTKEY flag
 *   - source_database_name    Lineage: source database
 *
 * All new columns are nullable / default-safe so existing rows continue to
 * work without backfill.
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.addColumns('column_definitions', {
    attribute_name: { type: 'varchar(255)' },
    has_stats: { type: 'boolean', notNull: true, default: false },
    compress_value: { type: 'varchar(100)' },
    column_format: { type: 'varchar(100)' },
    comments: { type: 'text' },
    source_table_name: { type: 'varchar(255)' },
    source_column_name: { type: 'varchar(255)' },
    transformation: { type: 'text' },
    tier_value: { type: 'varchar(50)' },
    source_system: { type: 'varchar(100)' },
    encoding: { type: 'varchar(50)' },
    is_sort_key: { type: 'boolean', notNull: true, default: false },
    is_dist_key: { type: 'boolean', notNull: true, default: false },
    source_database_name: { type: 'varchar(100)' },
  });
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropColumns('column_definitions', [
    'attribute_name',
    'has_stats',
    'compress_value',
    'column_format',
    'comments',
    'source_table_name',
    'source_column_name',
    'transformation',
    'tier_value',
    'source_system',
    'encoding',
    'is_sort_key',
    'is_dist_key',
    'source_database_name',
  ]);
};
