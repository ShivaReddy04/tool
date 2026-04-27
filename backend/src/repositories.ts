import { query } from './config/db';

export const listSubmittedTemplates = async () => {
  const result = await query(
    `SELECT td.*, u.first_name, u.last_name FROM table_definitions td LEFT JOIN users u ON td.created_by = u.id WHERE td.status = 'submitted' ORDER BY td.created_at DESC`
  );
  return result.rows;
};

export const getTableDefinitionById = async (id: string) => {
  const result = await query('SELECT * FROM table_definitions WHERE id = $1', [id]);
  return result.rows[0] || null;
};

export const getSubmissionForTable = async (tableId: string) => {
  const result = await query('SELECT * FROM submissions WHERE table_id = $1 AND status = $2 ORDER BY submitted_at DESC LIMIT 1', [tableId, 'pending']);
  return result.rows[0] || null;
};

export const markSubmissionReviewed = async (submissionId: string, reviewedBy: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
  const result = await query('UPDATE submissions SET reviewed_by = $1, status = $2, rejection_reason = $3, reviewed_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *', [reviewedBy, status, rejectionReason || null, submissionId]);
  return result.rows[0];
};

export const updateTableMetadata = async (tableId: string, fields: { status?: string; reviewed_by?: string | null; review_comments?: string | null; processed_at?: string | null; }) => {
  const result = await query('UPDATE table_definitions SET status = $1, reviewed_by = $2, review_comments = $3, processed_at = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *', [fields.status || 'draft', fields.reviewed_by || null, fields.review_comments || null, fields.processed_at || null, tableId]);
  return result.rows[0];
};
