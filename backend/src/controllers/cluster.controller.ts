import { Request, Response } from 'express';
import {
  createCluster,
  getAllClusters,
  getClusterById,
  updateCluster,
  deleteCluster,
  getClusterConnectionConfig,
} from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { DATA_TYPES, DbType } from '../utils/dataTypes';

const VALID_DB_TYPES: DbType[] = ['postgresql', 'mysql', 'mssql', 'redshift'];

// POST /api/clusters
export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, dbType, host, port, databaseName, username, password } = req.body;

    if (!name || !dbType || !host || !port || !databaseName || !username || !password) {
      res.status(400).json({ error: 'All fields are required: name, dbType, host, port, databaseName, username, password' });
      return;
    }

    if (!VALID_DB_TYPES.includes(dbType)) {
      res.status(400).json({ error: `Invalid dbType. Must be one of: ${VALID_DB_TYPES.join(', ')}` });
      return;
    }

    const cluster = await createCluster(
      name, dbType, host, Number(port), databaseName, username, password, req.user!.userId
    );

    res.status(201).json(cluster);
  } catch (err) {
    console.error('Create cluster error:', err);
    res.status(500).json({ error: 'Failed to create cluster' });
  }
};

// GET /api/clusters
export const list = async (_req: Request, res: Response): Promise<void> => {
  try {
    const clusters = await getAllClusters();
    res.json(clusters);
  } catch (err) {
    console.error('List clusters error:', err);
    res.status(500).json({ error: 'Failed to list clusters' });
  }
};

// GET /api/clusters/:id
export const getById = async (req: Request, res: Response): Promise<void> => {
  try {
    const cluster = await getClusterById(req.params.id as string);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    // Don't expose encrypted password
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
  } catch (err) {
    console.error('Get cluster error:', err);
    res.status(500).json({ error: 'Failed to get cluster' });
  }
};

// PUT /api/clusters/:id
export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, dbType, host, port, databaseName, username, password, status } = req.body;

    if (dbType && !VALID_DB_TYPES.includes(dbType)) {
      res.status(400).json({ error: `Invalid dbType. Must be one of: ${VALID_DB_TYPES.join(', ')}` });
      return;
    }

    if (status && !['active', 'inactive'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or inactive' });
      return;
    }

    const updated = await updateCluster(req.params.id as string, {
      name, dbType, host, port: port ? Number(port) : undefined,
      databaseName, username, password, status,
    });

    if (!updated) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error('Update cluster error:', err);
    res.status(500).json({ error: 'Failed to update cluster' });
  }
};

// DELETE /api/clusters/:id
export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await deleteCluster(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    res.json({ message: 'Cluster deleted' });
  } catch (err) {
    console.error('Delete cluster error:', err);
    res.status(500).json({ error: 'Failed to delete cluster' });
  }
};

// POST /api/clusters/:id/test
export const testById = async (req: Request, res: Response): Promise<void> => {
  try {
    const connConfig = await getClusterConnectionConfig(req.params.id as string);
    if (!connConfig) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const connector = getConnector(connConfig.cluster.db_type);
    const success = await connector.test(connConfig.config);

    res.json({ success, message: success ? 'Connection successful' : 'Connection failed' });
  } catch (err: any) {
    res.json({ success: false, message: err.message || 'Connection failed' });
  }
};

// POST /api/clusters/test (test without saving)
export const testDirect = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dbType, host, port, databaseName, username, password } = req.body;

    if (!dbType || !host || !port || !databaseName || !username || !password) {
      res.status(400).json({ error: 'All connection fields are required' });
      return;
    }

    if (!VALID_DB_TYPES.includes(dbType)) {
      res.status(400).json({ error: 'Unsupported database type' });
      return;
    }

    const connector = getConnector(dbType);
    const success = await connector.test({
      host, port: Number(port), database: databaseName, user: username, password,
    });

    res.json({ success, message: success ? 'Connection successful' : 'Connection failed' });
  } catch (err: any) {
    res.json({ success: false, message: err.message || 'Connection failed' });
  }
};

// GET /api/clusters/:id/data-types
export const getDataTypesForCluster = async (req: Request, res: Response): Promise<void> => {
  try {
    const cluster = await getClusterById(req.params.id as string);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const types = DATA_TYPES[cluster.db_type];
    if (!types) {
      res.status(400).json({ error: `No data types defined for db_type: ${cluster.db_type}` });
      return;
    }

    res.json(types);
  } catch (err) {
    console.error('Get data types error:', err);
    res.status(500).json({ error: 'Failed to fetch data types' });
  }
};

// GET /api/clusters/:id/databases
export const getDatabases = async (req: Request, res: Response): Promise<void> => {
  try {
    const connConfig = await getClusterConnectionConfig(req.params.id as string);
    if (!connConfig) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const connector = getConnector(connConfig.cluster.db_type);
    const databases = await connector.getDatabases(connConfig.config);
    res.json(databases);
  } catch (err: any) {
    console.error('Get databases error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch databases' });
  }
};

// GET /api/clusters/:id/schemas?database=
export const getSchemas = async (req: Request, res: Response): Promise<void> => {
  try {
    const connConfig = await getClusterConnectionConfig(req.params.id as string);
    if (!connConfig) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const database = String(req.query.database || connConfig.config.database);
    const connector = getConnector(connConfig.cluster.db_type);
    const schemas = await connector.getSchemas({ ...connConfig.config, database });
    res.json(schemas.map((s) => s.schema_name));
  } catch (err: any) {
    console.error('Get schemas error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch schemas' });
  }
};

// GET /api/clusters/:id/tables?schema=&database=
export const getTables = async (req: Request, res: Response): Promise<void> => {
  try {
    const connConfig = await getClusterConnectionConfig(req.params.id as string);
    if (!connConfig) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const schema = String(req.query.schema || '');
    if (!schema) {
      res.status(400).json({ error: 'schema query parameter is required' });
      return;
    }

    const database = String(req.query.database || connConfig.config.database);
    const connector = getConnector(connConfig.cluster.db_type);
    const tables = await connector.getTables({ ...connConfig.config, database }, schema);
    res.json(tables);
  } catch (err: any) {
    console.error('Get tables error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch tables' });
  }
};

// GET /api/clusters/:id/columns?schema=&table=&database=
export const getColumns = async (req: Request, res: Response): Promise<void> => {
  try {
    const connConfig = await getClusterConnectionConfig(req.params.id as string);
    if (!connConfig) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const schema = String(req.query.schema || '');
    const table = String(req.query.table || '');
    if (!schema || !table) {
      res.status(400).json({ error: 'schema and table query parameters are required' });
      return;
    }

    const database = String(req.query.database || connConfig.config.database);
    const connector = getConnector(connConfig.cluster.db_type);
    const columns = await connector.getColumns({ ...connConfig.config, database }, schema, table);
    res.json(columns);
  } catch (err: any) {
    console.error('Get columns error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch columns' });
  }
};
