import { Request, Response } from 'express';
import {
  createOrUpdateTableDefinition,
  getTableDefinitionDetails,
  getAllTableDefinitions,
  deleteTableDefinitionById,
  getTableReferences,
  getTableDefinitionByKey,
  getDraftTableDefinitionsByUser,
} from '../models/table_definition.model';
import { bulkUpsertColumnDefinitions, getColumnDefinitionsByTableId } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';
import { validateColumnDefault } from '../utils/validation';
import { withTransaction } from '../config/db';
import { HttpError } from '../utils/httpError';
import type { SaveTableDefinitionInput, DryRunTableInput } from '../schemas/tableDefinition';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireUuid = (id: string, label = 'tableId'): string => {
  if (!UUID_RE.test(id)) throw new HttpError(400, `${label} must be a UUID`);
  return id;
};

export const saveTableDefinition = async (req: Request, res: Response): Promise<void> => {
  const { table, columns } = req.body as SaveTableDefinitionInput;

  console.log('[table-def] incoming POST /table-definitions', {
    tableId: (table as any).id,
    connection_id: table.connection_id,
    schema_name: table.schema_name,
    table_name: table.table_name,
    status: (table as any).status,
    columnCount: columns.length,
    userId: req.user?.userId,
  });

  // default-value validation depends on the per-column data_type — keep it in
  // the controller because it's not a pure structural check.
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const defaultCheck = validateColumnDefault(col.default_value, col.data_type, `Column "${col.column_name}"`);
    if (!defaultCheck.valid) {
      throw new HttpError(400, defaultCheck.error || 'Invalid default value', { field: 'default_value', rowIndex: i });
    }
    col.default_value = defaultCheck.sanitized || null;
  }

  // Identity comes from the JWT — never from the body. Audit logging attributes
  // both the user id and the email so we can trace edits even if the user account
  // is later renamed.
  const userId = req.user?.userId;
  const userEmail = req.user?.email || 'unknown';
  const tablePayload = { ...table, created_by: userId ?? (table as any).created_by };

  // Single transaction so a column-insert failure rolls back the table
  // insert/update — no orphaned `table_definitions` row.
  const result = await withTransaction(async (exec) => {
    const savedTable = await createOrUpdateTableDefinition(tablePayload as any, exec);
    if (columns.length > 0) {
      await bulkUpsertColumnDefinitions(savedTable.id, columns as any[], exec);
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
      metadata: { table_name: result.savedTable.table_name, column_count: columns.length },
    });
  } catch (auditErr) {
    console.warn('[table-def] audit log failed (non-fatal)', auditErr);
  }

  res.status(200).json({ table: result.savedTable, columns: result.savedColumns });
};

export const getTableDefinition = async (req: Request, res: Response): Promise<void> => {
  const id = requireUuid(req.params.id as string);
  const includeRows = String(req.query.includeRows || 'false') === 'true';
  const page = parseInt(String(req.query.page || '1'), 10) || 1;
  const pageSize = parseInt(String(req.query.pageSize || '10'), 10) || 10;

  const table = await getTableDefinitionDetails(id);
  if (!table) throw new HttpError(404, 'Table definition not found');
  const columns = await getColumnDefinitionsByTableId(id);

  let rows: any[] = [];
  let totalRows: number | null = null;

  if (includeRows) {
    const connInfo = await getClusterConnectionConfig(table.connection_id);
    if (!connInfo) throw new HttpError(404, 'Connection configuration not found for table');
    const connector = getConnector(connInfo.cluster.db_type as any);
    const offset = (page - 1) * pageSize;
    const queryStr = `SELECT * FROM "${table.schema_name}"."${table.table_name}" LIMIT ${pageSize} OFFSET ${offset}`;
    try {
      const result: any = await connector.runQuery(connInfo.config, queryStr);
      if (result && result.rows) rows = result.rows;
      else if (Array.isArray(result)) rows = result;
      else if (result && result.recordset) rows = result.recordset;

      try {
        const countRes: any = await connector.runQuery(
          connInfo.config,
          `SELECT COUNT(*) AS count FROM "${table.schema_name}"."${table.table_name}"`,
        );
        if (countRes?.rows?.[0]?.count !== undefined) totalRows = parseInt(countRes.rows[0].count, 10);
        else if (Array.isArray(countRes) && countRes[0]) totalRows = parseInt(countRes[0].count || countRes[0]['COUNT(*)'], 10);
        else if (countRes?.recordset?.[0]) totalRows = parseInt(countRes.recordset[0].count || countRes.recordset[0]['COUNT(*)'], 10);
      } catch (e: any) {
        console.warn('Failed to fetch total row count:', e?.message || e);
      }
    } catch (e: any) {
      console.error('Failed to fetch table rows:', e);
    }
  }

  res.status(200).json({ table, columns, rows, totalRows, page, pageSize });
};

/**
 * Resolve a physical (connection, database, schema, table) to its DART
 * table_definition row, returning the same { table, columns } shape as
 * GET /:id. 404 means no DART row exists yet for that physical table —
 * caller falls back to the columns-from-cluster path.
 */
export const getTableDefinitionByCompositeKey = async (req: Request, res: Response): Promise<void> => {
  const { connectionId, database, schema, table } = req.query as Record<string, string | undefined>;
  if (!connectionId || !database || !schema || !table) {
    throw new HttpError(400, 'connectionId, database, schema, and table query parameters are required');
  }
  const row = await getTableDefinitionByKey(connectionId, database, schema, table);
  if (!row) throw new HttpError(404, 'No DART table definition exists for this physical table');
  const columns = await getColumnDefinitionsByTableId(row.id);
  res.status(200).json({ table: row, columns });
};

export const listTableDefinitions = async (req: Request, res: Response): Promise<void> => {
  const { connectionId, schemaName } = req.query;
  if (!connectionId || !schemaName) {
    throw new HttpError(400, 'connectionId and schemaName query parameters are required');
  }
  const tables = await getAllTableDefinitions(connectionId as string, schemaName as string);
  res.status(200).json(tables);
};

export const listMyDrafts = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) throw new HttpError(401, 'Not authenticated');
  const drafts = await getDraftTableDefinitionsByUser(userId);
  res.status(200).json(drafts);
};

/**
 * Soft-delete a DART table definition: removes the metadata row (and cascades
 * column_definitions + submissions via FK) but never touches the physical table
 * on the target cluster. No DROP TABLE is issued anywhere — by design.
 *
 *  - DELETE /:id            → if pending submissions exist, return 409 with a
 *                             warnings payload so the UI can re-confirm.
 *  - DELETE /:id?force=true → skip the safety check and delete anyway.
 */
export const removeTableDefinition = async (req: Request, res: Response): Promise<void> => {
  const id = requireUuid(req.params.id as string);

  const existing = await getTableDefinitionDetails(id);
  if (!existing) throw new HttpError(404, 'Table definition not found');

  const force = String(req.query.force || 'false') === 'true';
  if (!force) {
    const refs = await getTableReferences(id);
    if (refs.pendingSubmissions > 0) {
      // exposeDetails=true so warnings reach the client in production; the
      // UI uses them to render a "confirm cascade" dialog.
      throw new HttpError(
        409,
        'Table has related entities',
        {
          warnings: [
            `This table has ${refs.pendingSubmissions} pending submission${refs.pendingSubmissions === 1 ? '' : 's'} awaiting architect review.`,
          ],
          references: refs,
        },
        true,
      );
    }
  }

  await deleteTableDefinitionById(id);

  // Audit log is best-effort — the row is already gone, a logging failure
  // shouldn't surface as a delete failure.
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
};

export const dryRunTableDefinition = async (req: Request, res: Response): Promise<void> => {
  const { table, columns } = req.body as DryRunTableInput;
  const connInfo = await getClusterConnectionConfig(table.connection_id);
  if (!connInfo) throw new HttpError(404, 'Connection target not found');

  const connector = getConnector(connInfo.cluster.db_type);
  const colsDDL = columns.map((c) => `${c.column_name} ${c.data_type} ${c.is_nullable ? 'NULL' : 'NOT NULL'}`).join(', ');
  const schemaPart = table.schema_name ? `${table.schema_name}.` : '';
  const ddl = `CREATE TABLE ${schemaPart}${table.table_name} (${colsDDL})`;

  try {
    const success = await connector.dryRunDDL(connInfo.config, ddl);
    res.status(200).json({ success, message: 'Dry run passed successfully. SQL execution would not fail.' });
  } catch (err: any) {
    throw new HttpError(400, 'Database Dry Run Failed', err.message || err);
  }
};
