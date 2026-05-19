import { Request, Response } from 'express';
import {
  createChangeRequest,
  getChangeRequests,
  getChangeRequestById,
  updateChangeRequestStatus,
  ChangeRequest,
} from '../models/change_request.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { HttpError } from '../utils/httpError';
import type { CreateChangeRequestInput } from '../schemas/changeRequest';

export const create = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CreateChangeRequestInput;
  const cr: ChangeRequest = {
    connection_id: body.connection_id,
    database_name: body.database_name,
    schema_name: body.schema_name,
    table_name: body.table_name,
    row_id: body.row_id,
    old_data: body.old_data,
    new_data: body.new_data,
    submitted_by: req.user!.userId,
  };
  const created = await createChangeRequest(cr);
  res.status(201).json(created);
};

export const list = async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
  res.json(await getChangeRequests(status as any));
};

const parseId = (raw: string | string[] | undefined): number => {
  const str = Array.isArray(raw) ? raw[0] : raw;
  if (!str) throw new HttpError(400, 'Invalid id parameter');
  const id = parseInt(str, 10);
  if (Number.isNaN(id)) throw new HttpError(400, 'Invalid id parameter');
  return id;
};

const requirePending = async (id: number) => {
  const cr = await getChangeRequestById(id);
  if (!cr) throw new HttpError(404, 'Change request not found');
  if (cr.status !== 'pending') throw new HttpError(400, `Cannot transition request with status ${cr.status}`);
  return cr;
};

/**
 * Build a parameterized UPDATE for the target dialect.
 * Keys (column names) are interpolated; values go through the driver's
 * parameter binding so user-supplied row data cannot inject SQL.
 */
const buildUpdate = (
  dbType: string,
  schema: string,
  table: string,
  setKeys: string[],
  updatedRow: Record<string, any>,
  originalRow: Record<string, any>,
) => {
  const params: any[] = [];

  if (dbType === 'postgresql' || dbType === 'redshift') {
    let i = 1;
    const setClauses = setKeys.map((k) => { params.push(updatedRow[k]); return `"${k}" = $${i++}`; }).join(', ');
    const whereClauses = Object.keys(originalRow).map((k) =>
      originalRow[k] === null ? `"${k}" IS NULL` : (params.push(originalRow[k]), `"${k}" = $${i++}`),
    ).join(' AND ');
    return { queryStr: `UPDATE "${schema}"."${table}" SET ${setClauses} WHERE ${whereClauses}`, params };
  }
  if (dbType === 'mysql') {
    const setClauses = setKeys.map((k) => { params.push(updatedRow[k]); return `\`${k}\` = ?`; }).join(', ');
    const whereClauses = Object.keys(originalRow).map((k) =>
      originalRow[k] === null ? `\`${k}\` IS NULL` : (params.push(originalRow[k]), `\`${k}\` = ?`),
    ).join(' AND ');
    return { queryStr: `UPDATE \`${schema}\`.\`${table}\` SET ${setClauses} WHERE ${whereClauses}`, params };
  }
  if (dbType === 'mssql') {
    let i = 0;
    const setClauses = setKeys.map((k) => { params.push(updatedRow[k]); return `[${k}] = @p${i++}`; }).join(', ');
    const whereClauses = Object.keys(originalRow).map((k) =>
      originalRow[k] === null ? `[${k}] IS NULL` : (params.push(originalRow[k]), `[${k}] = @p${i++}`),
    ).join(' AND ');
    return { queryStr: `UPDATE [${schema}].[${table}] SET ${setClauses} WHERE ${whereClauses}`, params };
  }
  throw new HttpError(400, `Unsupported db type for change-request apply: ${dbType}`);
};

export const approve = async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id as any);
  const cr = await requirePending(id);

  const connConfig = await getClusterConnectionConfig(cr.connection_id);
  if (!connConfig) throw new HttpError(404, 'Connection configuration not found');

  const setKeys = Object.keys(cr.new_data).filter((k) => cr.new_data[k] !== cr.old_data[k]);
  if (setKeys.length > 0) {
    const dbType = connConfig.cluster.db_type;
    const schema = cr.schema_name || '';
    const database = cr.database_name || connConfig.config.database;
    const { queryStr, params } = buildUpdate(dbType, schema, cr.table_name, setKeys, cr.new_data, cr.old_data);
    await getConnector(dbType).runQuery({ ...connConfig.config, database }, queryStr, params);
  }

  res.json(await updateChangeRequestStatus(id, 'approved', req.user!.userId));
};

export const reject = async (req: Request, res: Response): Promise<void> => {
  const id = parseId(req.params.id as any);
  await requirePending(id);
  res.json(await updateChangeRequestStatus(id, 'rejected', req.user!.userId));
};
