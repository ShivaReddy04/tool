import { query } from '../config/db';

export interface ColumnDefinition {
    id: string;
    table_id: string;
    column_name: string;
    data_type: string;
    is_nullable: boolean;
    is_primary_key: boolean;
    data_classification: string;
    data_domain?: string;
    attribute_definition?: string;
    default_value?: string;
    action: 'No Change' | 'Modify' | 'Add' | 'Drop';
    sort_order: number;
    created_at: Date;
    updated_at: Date;
}

export const bulkUpsertColumnDefinitions = async (tableId: string, columns: Partial<ColumnDefinition>[]): Promise<void> => {
    for (const col of columns) {
        if (col.id) {
            await query(
                `UPDATE column_definitions SET column_name = $1, data_type = $2, is_nullable = $3, is_primary_key = $4, data_classification = $5, data_domain = $6, attribute_definition = $7, default_value = $8, action = $9, sort_order = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 AND table_id = $12`,
                [col.column_name, col.data_type, col.is_nullable, col.is_primary_key, col.data_classification, col.data_domain, col.attribute_definition, col.default_value, col.action, col.sort_order, col.id, tableId]
            );
        } else {
            await query(
                `INSERT INTO column_definitions (table_id, column_name, data_type, is_nullable, is_primary_key, data_classification, data_domain, attribute_definition, default_value, action, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [tableId, col.column_name, col.data_type, col.is_nullable, col.is_primary_key, col.data_classification || 'Internal', col.data_domain, col.attribute_definition, col.default_value, col.action || 'Add', col.sort_order || 0]
            );
        }
    }
};

export const getColumnDefinitionsByTableId = async (tableId: string): Promise<ColumnDefinition[]> => {
    const result = await query('SELECT * FROM column_definitions WHERE table_id = $1 ORDER BY sort_order ASC', [tableId]);
    return result.rows;
};

/**
 * After an approved submission has been pushed to the target database, commit
 * the diff into our metadata: physically delete columns marked Drop, and reset
 * every remaining column's action to 'No Change' so the next submission will
 * diff cleanly.
 */
export const commitColumnActions = async (tableId: string): Promise<void> => {
    await query(`DELETE FROM column_definitions WHERE table_id = $1 AND action = 'Drop'`, [tableId]);
    await query(
        `UPDATE column_definitions SET action = 'No Change', updated_at = CURRENT_TIMESTAMP WHERE table_id = $1`,
        [tableId]
    );
};
