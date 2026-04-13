import { query } from '../config/db';

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

export const createAuditLog = async (log: AuditLog): Promise<AuditLog> => {
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

    const result = await query(q, values);
    return result.rows[0];
};

export const getAuditLogs = async (entityType?: string, entityId?: string): Promise<AuditLog[]> => {
    let q = `SELECT * FROM audit_logs`;
    const params: any[] = [];

    if (entityType) {
        params.push(entityType);
        q += ` WHERE entity_type = $${params.length}`;
    }

    if (entityId) {
        params.push(entityId);
        q += params.length === 1 ? ` WHERE ` : ` AND `;
        q += `entity_id = $${params.length}`;
    }

    q += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await query(q, params);
    return result.rows;
};
