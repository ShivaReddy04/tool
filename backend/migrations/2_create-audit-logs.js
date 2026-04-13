/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.createTable('audit_logs', {
        id: { type: 'uuid', default: pgm.func('gen_random_uuid()'), primaryKey: true },
        action: { type: 'varchar(100)', notNull: true },
        entity_type: { type: 'varchar(100)', notNull: true },
        entity_id: { type: 'varchar(255)', notNull: true },
        user_id: { type: 'uuid', notNull: false, references: 'users(id)', onDelete: 'SET NULL' },
        user_name: { type: 'varchar(255)', notNull: false },
        metadata: { type: 'jsonb', notNull: false },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.createIndex('audit_logs', 'entity_type');
    pgm.createIndex('audit_logs', 'entity_id');
    pgm.createIndex('audit_logs', 'user_id');
};

exports.down = pgm => {
    pgm.dropTable('audit_logs');
};
