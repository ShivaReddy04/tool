import { defaultExecutor, Executor } from '../config/db';

export interface AuditLog {
    id?: string;
    action: string;
    entity_type: string;
    entity_id: string;
    user_id?: string;
    user_name?: string;
    metadata?: any;
    created_at?: string;
}

export const createAuditLog = async (
    log: AuditLog,
    executor: Executor = defaultExecutor
): Promise<AuditLog> => {
    const q = `
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, user_name, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
    const values = [
        log.action,
        log.entity_type,
        log.entity_id,
        log.user_id || null, // Might not have User ID fully mapped from JWT internally depending on mock usage
        log.user_name || 'System',
        log.metadata ? JSON.stringify(log.metadata) : null,
    ];

    const result = await executor.query(q, values);
    return result.rows[0];
};
