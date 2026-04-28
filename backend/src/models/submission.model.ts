import { query } from '../config/db';

export interface SubmissionPayload {
    table: any;
    columns: any[];
}

export interface Submission {
    id: string;
    table_id: string;
    submitted_by: string;
    reviewed_by?: string;
    status: 'pending' | 'approved' | 'rejected';
    rejection_reason?: string;
    submitted_at: Date;
    reviewed_at?: Date;
    payload?: SubmissionPayload | null;
}

export const createSubmission = async (
    tableId: string,
    submittedBy: string,
    payload?: SubmissionPayload
): Promise<Submission> => {
    const result = await query(
        `INSERT INTO submissions (table_id, submitted_by, status, payload) VALUES ($1, $2, 'pending', $3) RETURNING *`,
        [tableId, submittedBy, payload ? JSON.stringify(payload) : null]
    );
    return result.rows[0];
};

export const getPendingSubmissions = async (): Promise<any[]> => {
    const result = await query(
        `SELECT s.*, td.table_name, td.schema_name, td.database_name,
                u.first_name AS submitter_first_name, u.last_name AS submitter_last_name, u.email AS submitter_email
         FROM submissions s
         JOIN table_definitions td ON s.table_id = td.id
         LEFT JOIN users u ON s.submitted_by = u.id
         WHERE s.status = 'pending'
         ORDER BY s.submitted_at ASC`
    );
    return result.rows;
};

export const reviewSubmission = async (id: string, reviewedBy: string, status: 'approved' | 'rejected', rejectionReason?: string): Promise<Submission> => {
    const result = await query(
        `UPDATE submissions SET reviewed_by = $1, status = $2, rejection_reason = $3, reviewed_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
        [reviewedBy, status, rejectionReason, id]
    );
    return result.rows[0];
};
