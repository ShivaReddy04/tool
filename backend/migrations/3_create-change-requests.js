/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.createTable('change_requests', {
        id: { type: 'serial', primaryKey: true },
        connection_id: { type: 'uuid', notNull: true, references: 'connections(id)', onDelete: 'CASCADE' },
        database_name: { type: 'varchar(255)' },
        schema_name: { type: 'varchar(255)' },
        table_name: { type: 'text', notNull: true },
        row_id: { type: 'text', notNull: true }, // Changed to text to handle string IDs or compound PKs conceptually, but keeping the name row_id
        old_data: { type: 'jsonb', notNull: true },
        new_data: { type: 'jsonb', notNull: true },
        status: { type: 'text', default: 'pending' },
        submitted_by: { type: 'uuid', references: 'users(id)' }, // UUID ref
        reviewed_by: { type: 'uuid', references: 'users(id)' }, // UUID ref
        created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
        updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
    });

    pgm.createIndex('change_requests', 'status');
    pgm.createIndex('change_requests', 'connection_id');
};

exports.down = pgm => {
    pgm.dropTable('change_requests');
};
