import { Request, Response } from 'express';
import { createSubmission, getPendingSubmissions, getSubmissionById, reviewSubmission, SubmissionPayload } from '../models/submission.model';
import { updateTableStatus, getTableDefinitionDetails, getTableDefinitionByKey, createOrUpdateTableDefinition } from '../models/table_definition.model';
import { getColumnDefinitionsByTableId, commitColumnActions } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';
import { findUserById } from '../models/user.model';
import { broadcastSubmissionEvent } from '../utils/webhook';
import { buildCreateTableDDL, buildAlterDDL, hasPendingChanges, DbType, DDLColumn } from '../utils/ddl_generator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const submitTableForReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const { tableId, assignedArchitectId } = req.body;
        console.log('[submission] incoming POST /submissions', {
            tableId,
            assignedArchitectId,
            submittedBy: req.user?.userId,
        });

        if (!tableId) {
            res.status(400).json({ error: 'tableId is required' });
            return;
        }

        // submissions.submitted_by is a uuid FK; trust the JWT, not the body.
        const submittedBy = req.user?.userId;
        if (!submittedBy) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        // Reviewer assignment is mandatory and must resolve to a real architect.
        // Frontend uses a constrained autocomplete, but never trust the client —
        // re-validate identity AND role server-side so a developer can't escalate
        // by handing us an arbitrary user id.
        if (!assignedArchitectId || typeof assignedArchitectId !== 'string') {
            res.status(400).json({ error: 'assignedArchitectId is required' });
            return;
        }
        // Reject non-UUID strings up-front so we return a clean 400 rather than
        // letting Postgres throw 22P02 inside findUserById and bubble out as 500.
        if (!UUID_RE.test(assignedArchitectId)) {
            res.status(400).json({ error: 'assignedArchitectId must be a UUID' });
            return;
        }
        const architect = await findUserById(assignedArchitectId);
        if (!architect) {
            res.status(404).json({ error: 'Selected architect not found' });
            return;
        }
        if ((architect.role || '').toLowerCase() !== 'architect' || architect.is_active === false) {
            res.status(400).json({ error: 'Selected user is not an active architect' });
            return;
        }

        let tableDefinitionId = tableId;
        // If frontend passed a physical table identifier (connId::db::schema::table), create or find a table_definition
        if (typeof tableId === 'string' && tableId.includes('::')) {
            const [connectionId, databaseName, schemaName, tableName] = tableId.split('::');
            // Try to find existing table definition
            const existing = await getTableDefinitionByKey(connectionId, databaseName, schemaName, tableName);
            if (existing) {
                tableDefinitionId = existing.id;
            } else {
                const newTableDef = await createOrUpdateTableDefinition({
                    connection_id: connectionId,
                    database_name: databaseName,
                    schema_name: schemaName,
                    table_name: tableName,
                    created_by: submittedBy
                });
                tableDefinitionId = newTableDef.id;
            }
        } else if (!UUID_RE.test(tableDefinitionId)) {
            // Catches stale frontend ids like "tbl-new-..." that weren't replaced
            // after saveChanges. Returns 400 instead of letting the FK insert blow up.
            res.status(400).json({ error: 'tableId must be a saved table UUID or a physical key (conn::db::schema::table)' });
            return;
        }

        const tableSnapshot = await getTableDefinitionDetails(tableDefinitionId);
        if (!tableSnapshot) {
            res.status(404).json({ error: 'Table definition not found for the provided tableId' });
            return;
        }

        await updateTableStatus(tableDefinitionId, 'submitted');

        const columnsSnapshot = await getColumnDefinitionsByTableId(tableDefinitionId);
        const payload: SubmissionPayload = {
            table: tableSnapshot,
            columns: columnsSnapshot,
        };

        const submission = await createSubmission(tableDefinitionId, submittedBy, assignedArchitectId, payload);

        await createAuditLog({
            action: 'SUBMIT_FOR_REVIEW',
            entity_type: 'submission',
            entity_id: submission.id,
            user_name: submittedBy,
            metadata: {
                table_id: tableDefinitionId,
                assigned_architect_id: assignedArchitectId,
                assigned_architect_email: architect.email,
            }
        });

        broadcastSubmissionEvent('SUBMITTED', {
            submittedBy,
            tableName: tableSnapshot.table_name || tableId,
            linkId: submission.id
        }).catch(e => console.error('Webhook broadcast failed softly:', e));

        res.status(201).json(submission);
    } catch (err: any) {
        // Postgres error codes: 23503 = FK violation, 23502 = NOT NULL, 22P02 = bad input syntax
        const pgCode: string | undefined = err?.code;
        console.error('[submission] submitTableForReview failed', {
            code: pgCode,
            message: err?.message,
            detail: err?.detail,
            constraint: err?.constraint,
            stack: err?.stack,
        });

        if (pgCode === '23503') {
            res.status(400).json({
                error: 'Referenced record does not exist',
                detail: err.detail,
                constraint: err.constraint,
            });
            return;
        }
        if (pgCode === '23502') {
            res.status(400).json({ error: 'Missing required field', column: err.column });
            return;
        }
        if (pgCode === '22P02') {
            res.status(400).json({ error: 'Invalid value format', detail: err.detail });
            return;
        }

        const isProd = process.env.NODE_ENV === 'production';
        res.status(500).json({
            error: 'Failed to submit table for review',
            ...(isProd ? {} : { message: err?.message, code: pgCode }),
        });
    }
};

export const listPendingSubmissions = async (req: Request, res: Response): Promise<void> => {
    try {
        // Architects only see submissions assigned to them (Jira-style "my queue").
        // Admins see the full firehose so they can monitor or unblock.
        const role = (req.user?.role || '').toLowerCase();
        const scopedArchitectId = role === 'architect' ? req.user?.userId : undefined;

        const submissions = await getPendingSubmissions(scopedArchitectId);
        const enriched = submissions.map((s: any) => {
            const submitterName = s.submitter_first_name
                ? `${s.submitter_first_name} ${s.submitter_last_name || ''}`.trim()
                : (s.submitter_email || s.submitted_by);
            const architectName = s.architect_first_name
                ? `${s.architect_first_name} ${s.architect_last_name || ''}`.trim()
                : (s.architect_email || null);
            return {
                id: s.id,
                table_id: s.table_id,
                submitted_by: s.submitted_by,
                submitter_name: submitterName,
                assigned_architect_id: s.assigned_architect_id,
                assigned_architect_name: architectName,
                assigned_architect_email: s.architect_email,
                table_name: s.table_name,
                schema_name: s.schema_name,
                database_name: s.database_name,
                status: s.status,
                submitted_at: s.submitted_at,
                payload: s.payload,
            };
        });
        res.status(200).json(enriched);
    } catch (err) {
        console.error('List pending submissions error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const handleReviewAndSync = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { reviewedBy: reviewedByName, status, rejectionReason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            res.status(400).json({ error: 'Valid status (approved/rejected) is required' });
            return;
        }

        // submissions.reviewed_by is a uuid FK to users(id) — use the authenticated
        // user's UUID, not whatever display name the frontend sent in the body.
        const reviewerId = req.user?.userId;
        if (!reviewerId) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        // Architects can only act on submissions assigned to them. Admins
        // are still allowed to act on anything (e.g., to unblock when the
        // assigned architect is OOO).
        const role = (req.user?.role || '').toLowerCase();
        if (role === 'architect') {
            const existing = await getSubmissionById(id);
            if (!existing) {
                res.status(404).json({ error: 'Submission not found' });
                return;
            }
            if (existing.assigned_architect_id !== reviewerId) {
                res.status(403).json({ error: 'This submission is assigned to a different architect' });
                return;
            }
        }

        const reviewedSubmission = await reviewSubmission(id, reviewerId, status, rejectionReason);
        await updateTableStatus(reviewedSubmission.table_id, status);

        await createAuditLog({
            action: status === 'approved' ? 'APPROVE_SUBMISSION' : 'REJECT_SUBMISSION',
            entity_type: 'submission',
            entity_id: id,
            user_name: reviewedByName || reviewerId,
            metadata: { table_id: reviewedSubmission.table_id, reason: rejectionReason }
        });

        if (status === 'approved') {
            try {
                const tableDef = await getTableDefinitionDetails(reviewedSubmission.table_id);
                if (!tableDef) {
                    res.status(404).json({ error: 'Table definition not found' });
                    return;
                }

                // Drive the apply step from the submission snapshot — that is what was
                // approved, regardless of subsequent edits. Fall back to current state for
                // legacy submissions that pre-date the payload column.
                const snapshotColumns: DDLColumn[] =
                    Array.isArray(reviewedSubmission.payload?.columns) && reviewedSubmission.payload!.columns.length > 0
                        ? (reviewedSubmission.payload!.columns as DDLColumn[])
                        : ((await getColumnDefinitionsByTableId(reviewedSubmission.table_id)) as unknown as DDLColumn[]);

                const connInfo = await getClusterConnectionConfig(tableDef.connection_id);
                if (!connInfo) {
                    res.status(404).json({ error: 'Connection configuration not found' });
                    return;
                }

                const dbType = connInfo.cluster.db_type as DbType;
                const connector = getConnector(dbType);

                // Detect whether the physical table already exists
                const existingTables: any[] = await connector.getTables(connInfo.config, tableDef.schema_name);
                const tableExists = existingTables.some(
                    (t) => (t.table_name || '').toLowerCase() === tableDef.table_name.toLowerCase()
                );

                const statements: string[] = [];
                if (!tableExists) {
                    if (dbType === 'postgresql' || dbType === 'redshift') {
                        statements.push(`CREATE SCHEMA IF NOT EXISTS "${tableDef.schema_name.replace(/"/g, '""')}"`);
                    }
                    const create = buildCreateTableDDL(dbType, tableDef.schema_name, tableDef.table_name, snapshotColumns);
                    if (create) statements.push(create);
                } else if (hasPendingChanges(snapshotColumns)) {
                    statements.push(...buildAlterDDL(dbType, tableDef.schema_name, tableDef.table_name, snapshotColumns));
                }

                if (statements.length > 0) {
                    console.log('[approval] Applying DDL to', connInfo.cluster.name, statements);
                    await connector.runDDLBatch(connInfo.config, statements);
                }

                await commitColumnActions(reviewedSubmission.table_id);
                await updateTableStatus(reviewedSubmission.table_id, 'applied');

                await createAuditLog({
                    action: 'EXECUTE_DDL',
                    entity_type: 'table_definition',
                    entity_id: reviewedSubmission.table_id,
                    user_name: 'DART_SYSTEM',
                    metadata: {
                        target_cluster: connInfo.cluster.name,
                        target_schema: tableDef.schema_name,
                        target_table: tableDef.table_name,
                        statements,
                    },
                });
            } catch (syncErr: any) {
                console.error('Database Sync Hook Error:', syncErr);
                res.status(500).json({
                    error: 'Review recorded, but database schema push failed.',
                    details: syncErr?.message || String(syncErr),
                });
                return;
            }
        }
        const tableDef = await getTableDefinitionDetails(reviewedSubmission.table_id);

        broadcastSubmissionEvent(status === 'approved' ? 'APPROVED' : 'REJECTED', {
            submittedBy: reviewedByName || reviewerId,
            tableName: tableDef?.table_name || reviewedSubmission.table_id,
            linkId: id,
            reason: rejectionReason
        }).catch(e => console.error("Webhook broadcast failed softly:", e));

        res.status(200).json(reviewedSubmission);
    } catch (err) {
        console.error('Handle review error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
