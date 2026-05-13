import { Request, Response } from 'express';
import { createOrUpdateTableDefinition, getTableDefinitionDetails, getAllTableDefinitions, deleteTableDefinitionById, getTableReferences, getTableDefinitionByKey } from '../models/table_definition.model';
import { bulkUpsertColumnDefinitions, getColumnDefinitionsByTableId } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';
import { validateSchemaName, validateIdentifier, validateColumnDefault } from '../utils/validation';
import { withTransaction } from '../config/db';

const VALID_DISTRIBUTION_STYLES = new Set(['KEY', 'EVEN', 'ALL', 'AUTO']);
const VALID_BUSINESS_AREAS = new Set(['XBI Tables', 'Database Source']);

export const saveTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const { table, columns } = req.body;
        console.log('[table-def] incoming POST /table-definitions', {
            tableId: table?.id,
            connection_id: table?.connection_id,
            schema_name: table?.schema_name,
            table_name: table?.table_name,
            status: table?.status,
            columnCount: Array.isArray(columns) ? columns.length : 0,
            userId: req.user?.userId,
        });

        if (!table || !table.connection_id || !table.database_name || !table.schema_name || !table.table_name) {
            res.status(400).json({
                error: 'Required table definition parameters missing',
                missing: [
                    !table?.connection_id && 'connection_id',
                    !table?.database_name && 'database_name',
                    !table?.schema_name && 'schema_name',
                    !table?.table_name && 'table_name',
                ].filter(Boolean),
            });
            return;
        }

        // schema_name is part of the unique key for table_definitions and is
        // also written to physical DDL downstream — validate format up front
        // so we can return a friendly 400 instead of a Postgres 22P02 / 23505.
        const schemaCheck = validateSchemaName(table.schema_name);
        if (!schemaCheck.valid) {
            res.status(400).json({ error: schemaCheck.error || 'Invalid schema_name', field: 'schema_name' });
            return;
        }
        table.schema_name = schemaCheck.sanitized;

        // table_name lands in DDL too — apply the same identifier rule.
        const tableNameCheck = validateIdentifier(table.table_name, 'Table name');
        if (!tableNameCheck.valid) {
            res.status(400).json({ error: tableNameCheck.error, field: 'table_name' });
            return;
        }
        table.table_name = tableNameCheck.sanitized;

        // distribution_style has a DB-level CHECK constraint. Catching it here
        // lets us return a clean 400 rather than a 23514 with cryptic constraint
        // name in the response.
        if (table.distribution_style && !VALID_DISTRIBUTION_STYLES.has(table.distribution_style)) {
            res.status(400).json({ error: 'Invalid distribution_style', field: 'distribution_style' });
            return;
        }

        // business_area is optional. Normal tables don't need a classification;
        // it's only used to flag XBI Tables vs Database Source when relevant.
        // Empty/undefined is fine — coerce to null so the DB stores NULL. If a
        // value IS provided, it must match the CHECK constraint allow-list.
        if (table.business_area) {
            if (!VALID_BUSINESS_AREAS.has(table.business_area)) {
                res.status(400).json({
                    error: 'business_area must be one of: XBI Tables, Database Source',
                    field: 'business_area',
                });
                return;
            }
        } else {
            table.business_area = null;
        }

        // definition is free-text and optional. Trim whitespace so blank input
        // (e.g. just spaces) is stored as NULL rather than a meaningless string.
        if (typeof table.definition === 'string') {
            const trimmed = table.definition.trim();
            table.definition = trimmed.length > 0 ? trimmed : null;
        } else if (table.definition === undefined) {
            table.definition = null;
        }

        // Per-column validation: every column must have a valid identifier
        // and a non-empty data type. Detect duplicate names client-side so
        // the eventual 23505 from the (table_id, column_name) unique key is
        // never the path the user hits.
        const colList: any[] = Array.isArray(columns) ? columns : [];
        const seenNames = new Set<string>();
        for (let i = 0; i < colList.length; i++) {
            const col = colList[i] || {};
            const nameCheck = validateIdentifier(col.column_name, `Column #${i + 1} name`);
            if (!nameCheck.valid) {
                res.status(400).json({ error: nameCheck.error, field: 'column_name', rowIndex: i });
                return;
            }
            col.column_name = nameCheck.sanitized;
            if (!col.data_type || typeof col.data_type !== 'string') {
                res.status(400).json({ error: `Column #${i + 1} requires a data type`, field: 'data_type', rowIndex: i });
                return;
            }
            const lower = nameCheck.sanitized.toLowerCase();
            if (seenNames.has(lower)) {
                res.status(400).json({ error: `Duplicate column name "${nameCheck.sanitized}"`, field: 'column_name', rowIndex: i });
                return;
            }
            seenNames.add(lower);

            // Reject obviously-wrong DEFAULT values before they reach DDL.
            // The generator inlines col.default_value verbatim, so `DEFAULT AI`
            // on a DATE column would otherwise blow up at architect-approve
            // time with an opaque "invalid input syntax for type date" error.
            const defaultCheck = validateColumnDefault(
                col.default_value,
                col.data_type,
                `Column "${nameCheck.sanitized}"`,
            );
            if (!defaultCheck.valid) {
                res.status(400).json({ error: defaultCheck.error, field: 'default_value', rowIndex: i });
                return;
            }
            col.default_value = defaultCheck.sanitized || null;
        }

        // Identity comes from the JWT — never from the body. Audit logging
        // attributes both the user id and the email so we can trace edits
        // even if the user account is later renamed.
        const userId = req.user?.userId;
        const userEmail = req.user?.email || 'unknown';
        const tablePayload = { ...table, created_by: userId ?? table.created_by };

        // Single transaction so a column-insert failure rolls back the
        // table insert/update — no orphaned `table_definitions` row.
        const result = await withTransaction(async (exec) => {
            const savedTable = await createOrUpdateTableDefinition(tablePayload, exec);
            if (colList.length > 0) {
                await bulkUpsertColumnDefinitions(savedTable.id, colList, exec);
            }
            const savedColumns = await getColumnDefinitionsByTableId(savedTable.id, exec);
            return { savedTable, savedColumns };
        });

        // Audit log outside the transaction and best-effort — never let an
        // audit-table issue mask a successful save.
        try {
            await createAuditLog({
                action: 'SAVE_TABLE',
                entity_type: 'table_definition',
                entity_id: result.savedTable.id,
                user_id: userId,
                user_name: userEmail,
                metadata: { table_name: result.savedTable.table_name, column_count: colList.length },
            });
        } catch (auditErr) {
            console.warn('[table-def] audit log failed (non-fatal)', auditErr);
        }

        res.status(200).json({ table: result.savedTable, columns: result.savedColumns });
    } catch (err: any) {
        const pgCode: string | undefined = err?.code;
        console.error('[table-def] saveTableDefinition failed', {
            code: pgCode,
            message: err?.message,
            detail: err?.detail,
            constraint: err?.constraint,
            column: err?.column,
            stack: err?.stack,
        });

        // 23514 = CHECK violation, 23503 = FK violation, 23502 = NOT NULL,
        // 23505 = unique, 22P02 = bad input syntax, 42703 = undefined column.
        if (pgCode === '23514') {
            res.status(400).json({ error: 'Value violates a CHECK constraint', constraint: err.constraint, detail: err.detail });
            return;
        }
        if (pgCode === '23503') {
            res.status(400).json({ error: 'Referenced record does not exist', constraint: err.constraint, detail: err.detail });
            return;
        }
        if (pgCode === '23502') {
            res.status(400).json({ error: 'Missing required field', column: err.column });
            return;
        }
        if (pgCode === '23505') {
            res.status(409).json({ error: 'Record already exists', constraint: err.constraint, detail: err.detail });
            return;
        }
        if (pgCode === '22P02') {
            res.status(400).json({ error: 'Invalid value format', detail: err.detail });
            return;
        }
        if (pgCode === '42703') {
            res.status(500).json({ error: 'Schema mismatch — undefined column. Run pending migrations.', detail: err.message });
            return;
        }

        const isProd = process.env.NODE_ENV === 'production';
        res.status(500).json({
            error: 'Failed to save table definition',
            ...(isProd ? {} : { message: err?.message, code: pgCode }),
        });
    }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        // Reject non-UUID ids (e.g. frontend "tbl-new-..." placeholders) up front
        // so we return a clean 400 rather than letting Postgres throw 22P02.
        if (!UUID_RE.test(id)) {
            res.status(400).json({ error: 'tableId must be a UUID' });
            return;
        }
        const includeRows = String(req.query.includeRows || 'false') === 'true';
        const page = parseInt(String(req.query.page || '1'), 10) || 1;
        const pageSize = parseInt(String(req.query.pageSize || '10'), 10) || 10;

        const table = await getTableDefinitionDetails(id);
        if (!table) {
            res.status(404).json({ error: 'Table definition not found' });
            return;
        }
        const columns = await getColumnDefinitionsByTableId(id);

        let rows: any[] = [];
        let totalRows: number | null = null;

        if (includeRows) {
            const connInfo = await getClusterConnectionConfig(table.connection_id);
            if (!connInfo) {
                res.status(404).json({ error: 'Connection configuration not found for table' });
                return;
            }
            const connector = getConnector(connInfo.cluster.db_type as any);
            // Use runQuery to allow pagination across supported connectors
            const offset = (page - 1) * pageSize;
            const queryStr = `SELECT * FROM "${table.schema_name}"."${table.table_name}" LIMIT ${pageSize} OFFSET ${offset}`;
            try {
                const result: any = await connector.runQuery(connInfo.config, queryStr);
                // Normalize result rows for different connectors
                if (result && result.rows) rows = result.rows;
                else if (Array.isArray(result)) rows = result;
                else if (result && result.recordset) rows = result.recordset;
                else rows = [];

                // Try to fetch total count (best-effort)
                try {
                    const countRes: any = await connector.runQuery(connInfo.config, `SELECT COUNT(*) AS count FROM "${table.schema_name}"."${table.table_name}"`);
                    if (countRes && countRes.rows && countRes.rows[0] && countRes.rows[0].count !== undefined) {
                        totalRows = parseInt(countRes.rows[0].count, 10);
                    } else if (Array.isArray(countRes) && countRes[0] && (countRes[0].count !== undefined || countRes[0]['COUNT(*)'] !== undefined)) {
                        totalRows = parseInt(countRes[0].count || countRes[0]['COUNT(*)'], 10);
                    } else if (countRes && countRes.recordset && countRes.recordset[0]) {
                        totalRows = parseInt(countRes.recordset[0].count || countRes.recordset[0]['COUNT(*)'], 10);
                    }
                } catch (e: any) {
                    console.warn('Failed to fetch total row count:', (e as any).message || e);
                }
            } catch (e: any) {
                console.error('Failed to fetch table rows:', e);
                // If row fetch fails, continue and return columns only
            }
        }

        res.status(200).json({ table, columns, rows, totalRows, page, pageSize });
    } catch (err) {
        console.error('Get table definition error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Resolve a physical (connection, database, schema, table) to its DART
 * table_definition row, returning the same { table, columns } shape as
 * GET /:id. Used by the developer dashboard when a table picked from the
 * physical-tables list has already been approved into DART — so its saved
 * metadata (definition, entity_logical_name, business_area, etc.) and
 * column attributes can be shown instead of being wiped to defaults.
 *
 * 404 means no DART row exists for that physical table — caller falls
 * back to the columns-from-cluster path.
 */
export const getTableDefinitionByCompositeKey = async (req: Request, res: Response): Promise<void> => {
    try {
        const { connectionId, database, schema, table } = req.query as Record<string, string | undefined>;
        if (!connectionId || !database || !schema || !table) {
            res.status(400).json({
                error: 'connectionId, database, schema, and table query parameters are required',
            });
            return;
        }
        const row = await getTableDefinitionByKey(connectionId, database, schema, table);
        if (!row) {
            res.status(404).json({ error: 'No DART table definition exists for this physical table' });
            return;
        }
        const columns = await getColumnDefinitionsByTableId(row.id);
        res.status(200).json({ table: row, columns });
    } catch (err) {
        console.error('Get table definition by key error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listTableDefinitions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { connectionId, schemaName } = req.query;
        if (!connectionId || !schemaName) {
            res.status(400).json({ error: 'connectionId and schemaName query parameters are required' });
            return;
        }
        const tables = await getAllTableDefinitions(connectionId as string, schemaName as string);
        res.status(200).json(tables);
    } catch (err) {
        console.error('List table definitions error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Soft-delete a DART table definition: removes the metadata row (and cascades
 * column_definitions + submissions via FK) but never touches the physical
 * table on the target cluster. No DROP TABLE is issued anywhere — by design.
 *
 * Flow:
 *  - DELETE /:id            → if pending submissions exist, return 409 with
 *                             a warnings payload so the UI can re-confirm.
 *  - DELETE /:id?force=true → skip the safety check and delete anyway.
 */
export const removeTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        if (!UUID_RE.test(id)) {
            res.status(400).json({ error: 'tableId must be a UUID' });
            return;
        }

        const existing = await getTableDefinitionDetails(id);
        if (!existing) {
            res.status(404).json({ error: 'Table definition not found' });
            return;
        }

        const force = String(req.query.force || 'false') === 'true';

        if (!force) {
            const refs = await getTableReferences(id);
            const warnings: string[] = [];
            if (refs.pendingSubmissions > 0) {
                warnings.push(
                    `This table has ${refs.pendingSubmissions} pending submission${refs.pendingSubmissions === 1 ? '' : 's'} awaiting architect review.`
                );
            }
            if (warnings.length > 0) {
                res.status(409).json({
                    error: 'Table has related entities',
                    warnings,
                    references: refs,
                });
                return;
            }
        }

        await deleteTableDefinitionById(id);

        // Audit log is best-effort: the row is already gone, so a logging
        // failure shouldn't surface as a delete failure.
        try {
            await createAuditLog({
                action: 'DELETE_TABLE_METADATA',
                entity_type: 'table_definition',
                entity_id: id,
                user_id: req.user?.userId,
                user_name: req.user?.email || req.user?.userId || 'unknown',
                metadata: {
                    table_name: existing.table_name,
                    schema_name: existing.schema_name,
                    database_name: existing.database_name,
                    connection_id: existing.connection_id,
                    deleted_at: new Date().toISOString(),
                    note: 'Application metadata only — physical table on target cluster is unchanged.',
                },
            });
        } catch (auditErr) {
            console.warn('[table-def] audit log for delete failed (non-fatal)', auditErr);
        }

        res.status(200).json({
            success: true,
            message: 'Table metadata removed from the application. The physical database table was not affected.',
            id,
            table_name: existing.table_name,
        });
    } catch (err: any) {
        console.error('[table-def] removeTableDefinition failed', {
            code: err?.code,
            message: err?.message,
            detail: err?.detail,
        });
        const isProd = process.env.NODE_ENV === 'production';
        res.status(500).json({
            error: 'Failed to remove table from application.',
            ...(isProd ? {} : { message: err?.message, code: err?.code }),
        });
    }
};

export const dryRunTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const { table, columns } = req.body;
        if (!table || !table.connection_id || !table.table_name) {
            res.status(400).json({ error: 'Required table definition parameters missing' });
            return;
        }

        const connInfo = await getClusterConnectionConfig(table.connection_id);
        if (!connInfo) {
            res.status(404).json({ error: 'Connection target not found' });
            return;
        }

        const connector = getConnector(connInfo.cluster.db_type);

        const colsDDL = columns.map((c: any) => `${c.column_name} ${c.data_type} ${c.is_nullable ? 'NULL' : 'NOT NULL'}`).join(', ');
        const schemaPart = table.schema_name ? `${table.schema_name}.` : '';
        const ddl = `CREATE TABLE ${schemaPart}${table.table_name} (${colsDDL})`;

        const success = await connector.dryRunDDL(connInfo.config, ddl);

        res.status(200).json({ success, message: "Dry run passed successfully. SQL execution would not fail." });
    } catch (err: any) {
        // We log intentionally formatted errors for the user
        res.status(400).json({ error: 'Database Dry Run Failed', details: err.message || err });
    }
};
