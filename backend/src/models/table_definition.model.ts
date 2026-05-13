import { query, defaultExecutor, Executor } from '../config/db';

export interface TableDefinition {
    id: string;
    connection_id: string;
    database_name: string;
    schema_name: string;
    table_name: string;
    entity_logical_name?: string;
    distribution_style?: 'KEY' | 'EVEN' | 'ALL' | 'AUTO';
    keys?: string;
    vertical_name?: string;
    business_area?: 'XBI Tables' | 'Database Source';
    definition?: string;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'applied' | 'processed';
    created_by?: string;
    reviewed_by?: string;
    review_comments?: string;
    processed_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export const createOrUpdateTableDefinition = async (
    tableDef: Partial<TableDefinition>,
    executor: Executor = defaultExecutor
): Promise<TableDefinition> => {
    // If no id, the caller may still be referring to an existing row by its
    // logical key (connection + db + schema + table). Look it up first so the
    // same save flow works whether the frontend has the UUID or the physical
    // "connId::db::schema::name" placeholder it used during discovery — without
    // this, repeat saves on a discovered table 23505 on the unique key.
    let effectiveId = tableDef.id;
    if (!effectiveId && tableDef.connection_id && tableDef.database_name && tableDef.schema_name && tableDef.table_name) {
        const existing = await getTableDefinitionByKey(
            tableDef.connection_id,
            tableDef.database_name,
            tableDef.schema_name,
            tableDef.table_name,
            executor
        );
        if (existing) effectiveId = existing.id;
    }

    if (effectiveId) {
        // The legacy `keys` column is preserved in DB for backward compat
        // with rows written before the Schema Name change, but is no longer
        // touched on update so historical values are not silently nulled.
        const result = await executor.query(
            `UPDATE table_definitions SET
        entity_logical_name = $1, distribution_style = $2, vertical_name = $3, business_area = $4, definition = $5, status = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
            [tableDef.entity_logical_name, tableDef.distribution_style, tableDef.vertical_name, tableDef.business_area, tableDef.definition ?? null, tableDef.status || 'draft', effectiveId]
        );
        return result.rows[0];
    } else {
        const result = await executor.query(
            `INSERT INTO table_definitions (connection_id, database_name, schema_name, table_name, entity_logical_name, distribution_style, vertical_name, business_area, definition, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [tableDef.connection_id, tableDef.database_name, tableDef.schema_name, tableDef.table_name, tableDef.entity_logical_name, tableDef.distribution_style, tableDef.vertical_name, tableDef.business_area, tableDef.definition ?? null, 'draft', tableDef.created_by]
        );
        return result.rows[0];
    }
};

export const getTableDefinitionDetails = async (id: string): Promise<TableDefinition | null> => {
    const result = await query('SELECT * FROM table_definitions WHERE id = $1', [id]);
    return result.rows[0] || null;
};

export const getAllTableDefinitions = async (connectionId: string, schemaName: string): Promise<TableDefinition[]> => {
    const result = await query('SELECT * FROM table_definitions WHERE connection_id = $1 AND schema_name = $2', [connectionId, schemaName]);
    return result.rows;
};

export const getTableDefinitionByKey = async (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string,
    executor: Executor = defaultExecutor
): Promise<TableDefinition | null> => {
    const result = await executor.query('SELECT * FROM table_definitions WHERE connection_id = $1 AND database_name = $2 AND schema_name = $3 AND table_name = $4 LIMIT 1', [connectionId, databaseName, schemaName, tableName]);
    return result.rows[0] || null;
};

export const updateTableStatus = async (id: string, status: string): Promise<void> => {
    await query('UPDATE table_definitions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
};

/**
 * Soft-delete from the application's perspective: removes the DART metadata
 * row only. The physical table on the target cluster is never touched. FK
 * cascades take care of column_definitions and submissions for this id.
 */
export const deleteTableDefinitionById = async (id: string): Promise<TableDefinition | null> => {
    const result = await query('DELETE FROM table_definitions WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
};

/**
 * Count related entities so the controller can warn the user before deletion.
 * Today this is just pending submissions; extend here if more tables grow FKs
 * to table_definitions.
 */
export const getTableReferences = async (id: string): Promise<{ pendingSubmissions: number }> => {
    const result = await query(
        `SELECT COUNT(*)::int AS pending FROM submissions WHERE table_id = $1 AND status = 'pending'`,
        [id]
    );
    return { pendingSubmissions: result.rows[0]?.pending ?? 0 };
};
