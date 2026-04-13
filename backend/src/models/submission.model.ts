import { query } from '../config/db';

export interface Submission {
    id: string;
    table_id: string;
    submitted_by: string;
    reviewed_by?: string;
    status: 'pending' | 'approved' | 'rejected';
    rejection_reason?: string;
    submitted_at: Date;
    reviewed_at?: Date;
}

export const createSubmission = async (tableId: string, submittedBy: string): Promise<Submission> => {
    const result = await query(
        `INSERT INTO submissions (table_id, submitted_by, status) VALUES ($1, $2, 'pending') RETURNING *`,
        [tableId, submittedBy]
    );
    return result.rows[0];
};

export const getPendingSubmissions = async (): Promise<Submission[]> => {
    const result = await query(`SELECT * FROM submissions WHERE status = 'pending' ORDER BY submitted_at ASC`);
    return result.rows;
};

export const reviewSubmission = async (id: string, reviewedBy: string, status: 'approved' | 'rejected', rejectionReason?: string): Promise<Submission> => {
    const result = await query(
        `UPDATE submissions SET reviewed_by = $1, status = $2, rejection_reason = $3, reviewed_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
        [reviewedBy, status, rejectionReason, id]
    );
    return result.rows[0];
};
