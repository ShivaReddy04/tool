import { Request, Response } from 'express';
import {
  createCluster as createClusterModel,
  getAllClusters,
  getClusterById,
  updateCluster,
  deleteCluster,
  getClusterConnectionConfig,
} from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { DATA_TYPES } from '../utils/dataTypes';
import { HttpError } from '../utils/httpError';
import type { CreateClusterInput, UpdateClusterInput, TestConnectionInput } from '../schemas/cluster';

const requireClusterConfig = async (id: string) => {
  const connConfig = await getClusterConnectionConfig(id);
  if (!connConfig) throw new HttpError(404, 'Cluster not found');
  return connConfig;
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const { name, dbType, host, port, databaseName, username, password } = req.body as CreateClusterInput;
  const cluster = await createClusterModel(name, dbType, host, port, databaseName, username, password, req.user!.userId);
  res.status(201).json(cluster);
};

export const list = async (req: Request, res: Response): Promise<void> => {
  // Connections carry encrypted credentials and target real production
  // clusters — they must not leak across developer accounts. Each requester
  // sees only the connections they registered themselves; admins get the
  // global list for governance and unblocking.
  const role = (req.user?.role || '').toLowerCase();
  const scopedUserId = role === 'admin' ? undefined : req.user?.userId;
  res.json(await getAllClusters(scopedUserId));
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  const cluster = await getClusterById((req.params.id as string));
  if (!cluster) throw new HttpError(404, 'Cluster not found');
  // Strip the encrypted password from the wire response.
  res.json({
    id: cluster.id,
    name: cluster.name,
    dbType: cluster.db_type,
    host: cluster.host,
    port: cluster.port,
    databaseName: cluster.database_name,
    username: cluster.username,
    status: cluster.status,
    createdBy: cluster.created_by,
    createdAt: cluster.created_at,
  });
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const updated = await updateCluster((req.params.id as string), req.body as UpdateClusterInput);
  if (!updated) throw new HttpError(404, 'Cluster not found');
  res.json(updated);
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const deleted = await deleteCluster((req.params.id as string));
  if (!deleted) throw new HttpError(404, 'Cluster not found');
  res.json({ message: 'Cluster deleted' });
};

// Connection tests intentionally return `{ success, message }` with a 200 even
// on failure — the frontend shows the error inline rather than treating it as
// an exception.
export const testById = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  try {
    const success = await getConnector(connConfig.cluster.db_type).test(connConfig.config);
    res.json({ success, message: success ? 'Connection successful' : 'Connection failed' });
  } catch (err: any) {
    res.json({ success: false, message: err.message || 'Connection failed' });
  }
};

export const testDirect = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as TestConnectionInput;
  const database = (input.databaseName || input.database)!;
  try {
    const success = await getConnector(input.dbType).test({
      host: input.host,
      port: input.port,
      database,
      user: input.username,
      password: input.password,
    });
    res.json({ success, message: success ? 'Connection successful' : 'Connection failed' });
  } catch (err: any) {
    res.json({ success: false, message: err.message || 'Connection failed' });
  }
};

export const getDataTypesForCluster = async (req: Request, res: Response): Promise<void> => {
  const cluster = await getClusterById((req.params.id as string));
  if (!cluster) throw new HttpError(404, 'Cluster not found');
  const types = DATA_TYPES[cluster.db_type];
  if (!types) throw new HttpError(400, `No data types defined for db_type: ${cluster.db_type}`);
  res.json(types);
};

export const getDatabases = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  const databases = await getConnector(connConfig.cluster.db_type).getDatabases(connConfig.config);
  res.json(databases);
};

const overrideDatabase = (connConfig: Awaited<ReturnType<typeof getClusterConnectionConfig>>, req: Request) => {
  const database = String(req.query.database || connConfig!.config.database);
  return { ...connConfig!.config, database };
};

export const getSchemas = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  const schemas = await getConnector(connConfig.cluster.db_type).getSchemas(overrideDatabase(connConfig, req));
  res.json(schemas.map((s: any) => s.schema_name));
};

const requireSchemaAndTableQuery = (req: Request) => {
  const schema = String(req.query.schema || '');
  const table = String(req.query.table || '');
  if (!schema) throw new HttpError(400, 'schema query parameter is required');
  if (!table) throw new HttpError(400, 'table query parameter is required');
  return { schema, table };
};

export const getTables = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  const schema = String(req.query.schema || '');
  if (!schema) throw new HttpError(400, 'schema query parameter is required');
  const tables = await getConnector(connConfig.cluster.db_type).getTables(overrideDatabase(connConfig, req), schema);
  res.json(tables);
};

export const getColumns = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  const { schema, table } = requireSchemaAndTableQuery(req);
  const columns = await getConnector(connConfig.cluster.db_type).getColumns(overrideDatabase(connConfig, req), schema, table);
  res.json(columns);
};

export const getTableData = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  const { schema, table } = requireSchemaAndTableQuery(req);
  const data = await getConnector(connConfig.cluster.db_type).getTableData(overrideDatabase(connConfig, req), schema, table);
  res.json(data);
};

// NOTE: This handler still concatenates row values into SQL — see issue
// review. Left intact during the validation refactor; needs parameterization
// in a follow-up before exposing to untrusted callers.
export const updateTableData = async (req: Request, res: Response): Promise<void> => {
  const connConfig = await requireClusterConfig((req.params.id as string));
  const { schema, table } = requireSchemaAndTableQuery(req);
  const { originalRow, updatedRow } = req.body as { originalRow: Record<string, any>; updatedRow: Record<string, any> };

  const setKeys = Object.keys(updatedRow).filter((k) => updatedRow[k] !== originalRow[k]);
  if (setKeys.length === 0) {
    res.json({ success: true, message: 'No changes needed' });
    return;
  }

  const dbType = connConfig.cluster.db_type;
  let queryStr = '';
  if (dbType === 'postgresql' || dbType === 'redshift') {
    const setClauses = setKeys.map((k) => `"${k}" = '${updatedRow[k]}'`).join(', ');
    const whereClauses = Object.keys(originalRow)
      .map((k) => (originalRow[k] === null ? `"${k}" IS NULL` : `"${k}" = '${originalRow[k]}'`))
      .join(' AND ');
    queryStr = `UPDATE "${schema}"."${table}" SET ${setClauses} WHERE ${whereClauses}`;
  } else if (dbType === 'mysql') {
    const setClauses = setKeys.map((k) => `\`${k}\` = '${updatedRow[k]}'`).join(', ');
    const whereClauses = Object.keys(originalRow)
      .map((k) => (originalRow[k] === null ? `\`${k}\` IS NULL` : `\`${k}\` = '${originalRow[k]}'`))
      .join(' AND ');
    queryStr = `UPDATE \`${schema}\`.\`${table}\` SET ${setClauses} WHERE ${whereClauses}`;
  } else if (dbType === 'mssql') {
    const setClauses = setKeys.map((k) => `[${k}] = '${updatedRow[k]}'`).join(', ');
    const whereClauses = Object.keys(originalRow)
      .map((k) => (originalRow[k] === null ? `[${k}] IS NULL` : `[${k}] = '${originalRow[k]}'`))
      .join(' AND ');
    queryStr = `UPDATE [${schema}].[${table}] SET ${setClauses} WHERE ${whereClauses}`;
  }

  await getConnector(dbType).runQuery(overrideDatabase(connConfig, req), queryStr);
  res.json({ success: true, message: 'Row updated successfully' });
};
