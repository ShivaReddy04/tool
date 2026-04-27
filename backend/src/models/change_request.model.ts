import { query } from '../config/db';

export interface ChangeRequest {
  id?: number;
  connection_id: string;
  database_name?: string;
  schema_name?: string;
  table_name: string;
  row_id: string;
  old_data: any;
  new_data: any;
  status?: string;
  submitted_by: string;
  reviewed_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

export const createChangeRequest = async (cr: ChangeRequest) => {
  const result = await query(
    `INSERT INTO change_requests (connection_id, database_name, schema_name, table_name, row_id, old_data, new_data, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [cr.connection_id, cr.database_name, cr.schema_name, cr.table_name, cr.row_id, cr.old_data, cr.new_data, cr.submitted_by]
  );
  return result.rows[0];
};

export const getChangeRequests = async (status?: string) => {
  let text = `
    SELECT cr.*, 
           s.first_name || ' ' || s.last_name as submitter_name,
           r.first_name || ' ' || r.last_name as reviewer_name
    FROM change_requests cr
    LEFT JOIN users s ON cr.submitted_by = s.id
    LEFT JOIN users r ON cr.reviewed_by = r.id
  `;
  const params: any[] = [];
  if (status) {
    text += ` WHERE cr.status = $1`;
    params.push(status);
  }
  text += ` ORDER BY cr.created_at DESC`;
  const result = await query(text, params);
  return result.rows;
};

export const getChangeRequestById = async (id: number) => {
  const result = await query(`SELECT * FROM change_requests WHERE id = $1`, [id]);
  return result.rows[0];
};

export const updateChangeRequestStatus = async (id: number, status: string, reviewerId: string) => {
  const result = await query(
    `UPDATE change_requests SET status = $1, reviewed_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
    [status, reviewerId, id]
  );
  return result.rows[0];
};
