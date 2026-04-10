/**
 * Migration: Initial schema for DART
 * Creates all core tables: users, refresh_tokens, connections (clusters),
 * schemas, business_areas, table_definitions, column_definitions, submissions
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // ══════════════════════════════════════════════════════════════
  // 1. users
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    first_name: { type: 'varchar(100)', notNull: true },
    last_name: { type: 'varchar(100)', notNull: true },
    role: {
      type: 'varchar(20)',
      notNull: true,
      default: 'developer',
      check: "role IN ('developer', 'architect', 'admin', 'viewer')",
    },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('users', 'email');

  // ══════════════════════════════════════════════════════════════
  // 2. refresh_tokens
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('refresh_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'varchar(255)', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('refresh_tokens', 'user_id');
  pgm.createIndex('refresh_tokens', 'token_hash');

  // ══════════════════════════════════════════════════════════════
  // 3. connections (clusters — target database connections)
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('connections', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(100)', notNull: true },
    db_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "db_type IN ('postgresql', 'mysql', 'mssql', 'redshift')",
    },
    host: { type: 'varchar(255)', notNull: true },
    port: { type: 'integer', notNull: true },
    database_name: { type: 'varchar(100)', notNull: true },
    username: { type: 'varchar(100)', notNull: true },
    password_encrypted: { type: 'varchar(500)', notNull: true },
    status: {
      type: 'varchar(20)',
      default: 'active',
      check: "status IN ('active', 'inactive')",
    },
    created_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('connections', 'created_by');

  // ══════════════════════════════════════════════════════════════
  // 4. schemas (linked to connections/clusters)
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('schemas', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(100)', notNull: true },
    cluster_id: {
      type: 'uuid',
      notNull: true,
      references: 'connections(id)',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('schemas', 'cluster_id');
  pgm.addConstraint('schemas', 'schemas_name_cluster_unique', {
    unique: ['name', 'cluster_id'],
  });

  // ══════════════════════════════════════════════════════════════
  // 5. business_areas
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('business_areas', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(100)', notNull: true, unique: true },
    description: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  // ══════════════════════════════════════════════════════════════
  // 6. table_definitions
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('table_definitions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    connection_id: {
      type: 'uuid',
      notNull: true,
      references: 'connections(id)',
      onDelete: 'CASCADE',
    },
    database_name: { type: 'varchar(100)', notNull: true },
    schema_name: { type: 'varchar(100)', notNull: true },
    table_name: { type: 'varchar(255)', notNull: true },
    entity_logical_name: { type: 'varchar(255)' },
    distribution_style: {
      type: 'varchar(20)',
      check: "distribution_style IN ('KEY', 'EVEN', 'ALL', 'AUTO')",
    },
    keys: { type: 'text' },
    vertical_name: { type: 'varchar(100)' },
    business_area_id: { type: 'uuid', references: 'business_areas(id)', onDelete: 'SET NULL' },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'draft',
      check: "status IN ('draft', 'submitted', 'approved', 'rejected', 'applied')",
    },
    created_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('table_definitions', 'connection_id');
  pgm.createIndex('table_definitions', 'schema_name');
  pgm.createIndex('table_definitions', 'status');
  pgm.createIndex('table_definitions', 'created_by');
  pgm.addConstraint('table_definitions', 'table_definitions_unique_table', {
    unique: ['connection_id', 'database_name', 'schema_name', 'table_name'],
  });

  // ══════════════════════════════════════════════════════════════
  // 7. column_definitions
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('column_definitions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    table_id: {
      type: 'uuid',
      notNull: true,
      references: 'table_definitions(id)',
      onDelete: 'CASCADE',
    },
    column_name: { type: 'varchar(255)', notNull: true },
    data_type: { type: 'varchar(50)', notNull: true },
    is_nullable: { type: 'boolean', default: true },
    is_primary_key: { type: 'boolean', default: false },
    data_classification: {
      type: 'varchar(20)',
      default: 'Internal',
      check: "data_classification IN ('Public', 'Internal', 'Confidential', 'PII', 'Restricted')",
    },
    data_domain: { type: 'varchar(100)' },
    attribute_definition: { type: 'text' },
    default_value: { type: 'text' },
    action: {
      type: 'varchar(20)',
      notNull: true,
      default: 'No Change',
      check: "action IN ('No Change', 'Modify', 'Add', 'Drop')",
    },
    sort_order: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });

  pgm.createIndex('column_definitions', 'table_id');
  pgm.addConstraint('column_definitions', 'column_definitions_unique_column', {
    unique: ['table_id', 'column_name'],
  });

  // ══════════════════════════════════════════════════════════════
  // 8. submissions (review workflow)
  // ══════════════════════════════════════════════════════════════
  pgm.createTable('submissions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    table_id: {
      type: 'uuid',
      notNull: true,
      references: 'table_definitions(id)',
      onDelete: 'CASCADE',
    },
    submitted_by: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    reviewed_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending', 'approved', 'rejected')",
    },
    rejection_reason: { type: 'text' },
    submitted_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    reviewed_at: { type: 'timestamptz' },
  });

  pgm.createIndex('submissions', 'table_id');
  pgm.createIndex('submissions', 'submitted_by');
  pgm.createIndex('submissions', 'status');
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropTable('submissions', { cascade: true });
  pgm.dropTable('column_definitions', { cascade: true });
  pgm.dropTable('table_definitions', { cascade: true });
  pgm.dropTable('business_areas', { cascade: true });
  pgm.dropTable('schemas', { cascade: true });
  pgm.dropTable('connections', { cascade: true });
  pgm.dropTable('refresh_tokens', { cascade: true });
  pgm.dropTable('users', { cascade: true });
};
