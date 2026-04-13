import { query } from '../config/db';

export interface Schema {
  id: string;
  name: string;
  cluster_id: string;
  created_at: Date;
}

export const createSchema = async (name: string, clusterId: string): Promise<Schema> => {
  const result = await query(
    'INSERT INTO schemas (name, cluster_id) VALUES ($1, $2) RETURNING *',
    [name, clusterId]
  );
  return result.rows[0];
};

export const getSchemasByClusterId = async (clusterId: string): Promise<Schema[]> => {
  const result = await query('SELECT * FROM schemas WHERE cluster_id = $1 ORDER BY name ASC', [clusterId]);
  return result.rows;
};

export const deleteSchema = async (id: string): Promise<boolean> => {
  const result = await query('DELETE FROM schemas WHERE id = $1 RETURNING id', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};
