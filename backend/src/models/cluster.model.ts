import { query } from '../config/db';
import { encrypt, decrypt } from '../utils/encryption';
import type { DbType } from '../utils/dataTypes';

export interface Cluster {
  id: string;
  name: string;
  db_type: DbType;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password_encrypted: string;
  status: 'active' | 'inactive';
  created_by: string;
  created_at: Date;
}

export interface ClusterResponse {
  id: string;
  name: string;
  dbType: DbType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  status: string;
  createdBy: string;
  createdAt: Date;
}

function toResponse(row: Cluster): ClusterResponse {
  return {
    id: row.id,
    name: row.name,
    dbType: row.db_type,
    host: row.host,
    port: row.port,
    databaseName: row.database_name,
    username: row.username,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const createCluster = async (
  name: string,
  dbType: DbType,
  host: string,
  port: number,
  databaseName: string,
  username: string,
  password: string,
  createdBy: string
): Promise<ClusterResponse> => {
  const passwordEncrypted = encrypt(password);
  const result = await query(
    `INSERT INTO connections (name, db_type, host, port, database_name, username, password_encrypted, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, dbType, host, port, databaseName, username, passwordEncrypted, createdBy]
  );
  return toResponse(result.rows[0]);
};

export const getAllClusters = async (): Promise<ClusterResponse[]> => {
  const result = await query(
    `SELECT id, name, db_type, host, port, database_name, username, status, created_by, created_at
     FROM connections ORDER BY created_at DESC`
  );
  return result.rows.map(toResponse);
};

export const getClusterById = async (id: string): Promise<Cluster | null> => {
  const result = await query('SELECT * FROM connections WHERE id = $1', [id]);
  return result.rows[0] || null;
};

export const updateCluster = async (
  id: string,
  fields: {
    name?: string;
    dbType?: DbType;
    host?: string;
    port?: number;
    databaseName?: string;
    username?: string;
    password?: string;
    status?: string;
  }
): Promise<ClusterResponse | null> => {
  const existing = await getClusterById(id);
  if (!existing) return null;

  const updated = {
    name: fields.name ?? existing.name,
    db_type: fields.dbType ?? existing.db_type,
    host: fields.host ?? existing.host,
    port: fields.port ?? existing.port,
    database_name: fields.databaseName ?? existing.database_name,
    username: fields.username ?? existing.username,
    password_encrypted: fields.password ? encrypt(fields.password) : existing.password_encrypted,
    status: fields.status ?? existing.status,
  };

  const result = await query(
    `UPDATE connections
     SET name = $1, db_type = $2, host = $3, port = $4, database_name = $5,
         username = $6, password_encrypted = $7, status = $8
     WHERE id = $9
     RETURNING *`,
    [
      updated.name, updated.db_type, updated.host, updated.port,
      updated.database_name, updated.username, updated.password_encrypted,
      updated.status, id,
    ]
  );
  return result.rows[0] ? toResponse(result.rows[0]) : null;
};

export const deleteCluster = async (id: string): Promise<boolean> => {
  const result = await query('DELETE FROM connections WHERE id = $1 RETURNING id', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};

/** Returns decrypted connection config for use with the DB connector */
export const getClusterConnectionConfig = async (id: string) => {
  const cluster = await getClusterById(id);
  if (!cluster) return null;
  return {
    cluster,
    config: {
      host: cluster.host,
      port: cluster.port,
      database: cluster.database_name,
      user: cluster.username,
      password: decrypt(cluster.password_encrypted),
    },
  };
};
