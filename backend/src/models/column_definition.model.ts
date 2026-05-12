import { query, defaultExecutor, Executor } from '../config/db';

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
    /* Extended metadata — added in migration 8 to capture the enterprise
       data-governance attribute set surfaced in the Create Table grid. All
       fields are optional so rows from before the migration still load. */
    attribute_name?: string;
    has_stats?: boolean;
    compress_value?: string;
    column_format?: string;
    comments?: string;
    source_table_name?: string;
    source_column_name?: string;
    transformation?: string;
    tier_value?: string;
    source_system?: string;
    encoding?: string;
    is_sort_key?: boolean;
    is_dist_key?: boolean;
    source_database_name?: string;
    created_at: Date;
    updated_at: Date;
}

/* ── small helpers ────────────────────────────────────────────────────────── */

/** Normalize undefined-or-empty-string to null so optional text fields are
 *  stored as NULL rather than the literal empty string. */
const nz = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    const s = String(v);
    return s.length === 0 ? null : s;
};

/** Cast a possibly-undefined boolean toggle to a strict boolean default. */
const bool = (v: unknown, fallback = false): boolean => {
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
};

/* Column list mirrored by the SQL below — kept here so the param positions
   in both INSERT and UPDATE stay aligned with a single visible source. */
const META_COLUMNS = [
    'column_name',
    'data_type',
    'is_nullable',
    'is_primary_key',
    'data_classification',
    'data_domain',
    'attribute_definition',
    'default_value',
    'action',
    'sort_order',
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
] as const;

const paramsFor = (col: Partial<ColumnDefinition>): any[] => [
    col.column_name,
    col.data_type,
    bool(col.is_nullable, true),
    bool(col.is_primary_key, false),
    col.data_classification || 'Internal',
    nz(col.data_domain),
    nz(col.attribute_definition),
    nz(col.default_value),
    col.action || 'Add',
    typeof col.sort_order === 'number' ? col.sort_order : 0,
    nz(col.attribute_name),
    bool(col.has_stats, false),
    nz(col.compress_value),
    nz(col.column_format),
    nz(col.comments),
    nz(col.source_table_name),
    nz(col.source_column_name),
    nz(col.transformation),
    nz(col.tier_value),
    nz(col.source_system),
    nz(col.encoding),
    bool(col.is_sort_key, false),
    bool(col.is_dist_key, false),
    nz(col.source_database_name),
];

export const bulkUpsertColumnDefinitions = async (
    tableId: string,
    columns: Partial<ColumnDefinition>[],
    executor: Executor = defaultExecutor
): Promise<void> => {
    const setClause = META_COLUMNS
        .map((c, i) => `${c} = $${i + 1}`)
        .join(', ');
    const insertCols = ['table_id', ...META_COLUMNS].join(', ');
    const insertPlaceholders = ['$1', ...META_COLUMNS.map((_, i) => `$${i + 2}`)].join(', ');
    const updateOnConflict = META_COLUMNS
        // Don't overwrite column_name on conflict — that's the conflict key
        // itself, and EXCLUDED.column_name is identical anyway.
        .filter((c) => c !== 'column_name')
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');

    for (const col of columns) {
        if (col.id) {
            const params = paramsFor(col);
            params.push(col.id, tableId);
            await executor.query(
                `UPDATE column_definitions SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $${META_COLUMNS.length + 1} AND table_id = $${META_COLUMNS.length + 2}`,
                params
            );
        } else {
            // No id: caller may be saving a column it discovered from the
            // physical schema (synthetic `col-<name>` placeholder ids stripped
            // upstream). UPSERT on (table_id, column_name) so we don't 23505
            // when DART already has a row for the same column.
            await executor.query(
                `INSERT INTO column_definitions (${insertCols})
                 VALUES (${insertPlaceholders})
                 ON CONFLICT (table_id, column_name) DO UPDATE SET
                   ${updateOnConflict},
                   updated_at = CURRENT_TIMESTAMP`,
                [tableId, ...paramsFor(col)]
            );
        }
    }
};

export const getColumnDefinitionsByTableId = async (
    tableId: string,
    executor: Executor = defaultExecutor
): Promise<ColumnDefinition[]> => {
    const result = await executor.query('SELECT * FROM column_definitions WHERE table_id = $1 ORDER BY sort_order ASC', [tableId]);
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
