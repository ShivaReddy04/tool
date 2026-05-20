import api from './client';
import type { DbConnection } from '../types';

export const listConnections = async (): Promise<DbConnection[]> => {
  const { data } = await api.get('/clusters');
  return data;
};

export const addConnection = async (conn: {
  name: string;
  dbType: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}): Promise<DbConnection> => {
  const { data } = await api.post('/clusters', conn);
  return data;
};

export const testConnection = async (conn: {
  dbType: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post('/clusters/test', conn);
  return data;
};

export interface DeleteConnectionReferences {
  warnings: string[];
  references: { tableDefinitions: number; changeRequests: number };
}

/**
 * Delete a connection. Without `force`, the backend returns 409 if related
 * table definitions / change requests exist; the thrown error then carries
 * a `references` payload so the UI can re-confirm with the counts.
 */
export const deleteConnection = async (id: string, force = false): Promise<void> => {
  await api.delete(`/clusters/${id}${force ? '?force=true' : ''}`);
};

export const fetchDatabases = async (connectionId: string): Promise<string[]> => {
  const { data } = await api.get(`/clusters/${connectionId}/databases`);
  return data;
};

export const fetchSchemas = async (connectionId: string, database?: string): Promise<string[]> => {
  const { data } = await api.get(`/clusters/${connectionId}/schemas`, { params: database ? { database } : {} });
  return data;
};

export const fetchTables = async (connectionId: string, schema: string, database?: string): Promise<{ table_name: string; table_type: string }[]> => {
  const { data } = await api.get(`/clusters/${connectionId}/tables`, { params: { schema, ...(database ? { database } : {}) } });
  return data;
};

export const fetchColumns = async (connectionId: string, schema: string, table: string, database?: string): Promise<any[]> => {
  const { data } = await api.get(`/clusters/${connectionId}/columns`, { params: { schema, table, ...(database ? { database } : {}) } });
  return data;
};

export const fetchTableData = async (connectionId: string, schema: string, table: string, database?: string): Promise<any[]> => {
  const { data } = await api.get(`/clusters/${connectionId}/data`, { params: { schema, table, ...(database ? { database } : {}) } });
  return data;
};

export const updateTableData = async (connectionId: string, schema: string, table: string, originalRow: any, updatedRow: any, database?: string): Promise<void> => {
  await api.post(`/clusters/${connectionId}/data`, { originalRow, updatedRow }, { params: { schema, table, ...(database ? { database } : {}) } });
};

export const fetchDataTypes = async (connectionId: string): Promise<string[]> => {
  const { data } = await api.get(`/clusters/${connectionId}/data-types`);
  return data;
};
