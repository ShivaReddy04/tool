import { query } from '../config/db';

export interface SubmissionPayload {
    table: any;
    columns: any[];
}

export interface Submission {
    id: string;
    table_id: string;
    submitted_by: string;
    assigned_architect_id?: string | null;
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
    assignedArchitectId: string,
    payload?: SubmissionPayload
): Promise<Submission> => {
    const result = await query(
        `INSERT INTO submissions (table_id, submitted_by, assigned_architect_id, status, payload)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
        [tableId, submittedBy, assignedArchitectId, payload ? JSON.stringify(payload) : null]
    );
    return result.rows[0];
};

/**
 * Pending submissions, optionally scoped to a specific reviewer. Architects
 * pass their own user id so they only see submissions assigned to them;
 * admins pass nothing and see everything.
 */
export const getPendingSubmissions = async (assignedArchitectId?: string): Promise<any[]> => {
    const params: any[] = [];
    let assignedClause = '';
    if (assignedArchitectId) {
        params.push(assignedArchitectId);
        assignedClause = `AND s.assigned_architect_id = $1`;
    }

    const result = await query(
        `SELECT s.*, td.table_name, td.schema_name, td.database_name,
                u.first_name AS submitter_first_name, u.last_name AS submitter_last_name, u.email AS submitter_email,
                a.first_name AS architect_first_name, a.last_name AS architect_last_name, a.email AS architect_email
         FROM submissions s
         JOIN table_definitions td ON s.table_id = td.id
         LEFT JOIN users u ON s.submitted_by = u.id
         LEFT JOIN users a ON s.assigned_architect_id = a.id
         WHERE s.status = 'pending' ${assignedClause}
         ORDER BY s.submitted_at ASC`,
        params
    );
    return result.rows;
};

export const getSubmissionById = async (id: string): Promise<Submission | null> => {
    const result = await query(`SELECT * FROM submissions WHERE id = $1`, [id]);
    return result.rows[0] || null;
};

export const reviewSubmission = async (id: string, reviewedBy: string, status: 'approved' | 'rejected', rejectionReason?: string): Promise<Submission> => {
    const result = await query(
        `UPDATE submissions SET reviewed_by = $1, status = $2, rejection_reason = $3, reviewed_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
        [reviewedBy, status, rejectionReason, id]
    );
    return result.rows[0];
};
