import { Request, Response } from 'express';
import { createOrUpdateTableDefinition, getTableDefinitionDetails, getAllTableDefinitions } from '../models/table_definition.model';
import { bulkUpsertColumnDefinitions, getColumnDefinitionsByTableId } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';

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
        });

        if (!table || !table.connection_id || !table.database_name || !table.schema_name || !table.table_name) {
            res.status(400).json({ error: 'Required table definition parameters missing' });
            return;
        }

        // Save Table
        const savedTable = await createOrUpdateTableDefinition(table);

        // Save Columns
        if (columns && Array.isArray(columns) && columns.length > 0) {
            await bulkUpsertColumnDefinitions(savedTable.id, columns);
        }

        const savedColumns = await getColumnDefinitionsByTableId(savedTable.id);

        await createAuditLog({
            action: 'SAVE_TABLE',
            entity_type: 'table_definition',
            entity_id: savedTable.id,
            user_name: 'Developer', // We can extract from JWT once integrated
            metadata: { table_name: savedTable.table_name, column_count: columns?.length || 0 }
        });

        res.status(200).json({ table: savedTable, columns: savedColumns });
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

export const getTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
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
