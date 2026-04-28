import { Request, Response } from 'express';
import { createSubmission, getPendingSubmissions, reviewSubmission, SubmissionPayload } from '../models/submission.model';
import { updateTableStatus, getTableDefinitionDetails, getTableDefinitionByKey, createOrUpdateTableDefinition } from '../models/table_definition.model';
import { getColumnDefinitionsByTableId, commitColumnActions } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';
import { broadcastSubmissionEvent } from '../utils/webhook';
import { buildCreateTableDDL, buildAlterDDL, hasPendingChanges, DbType, DDLColumn } from '../utils/ddl_generator';

export const submitTableForReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const { tableId, submittedBy } = req.body;
        if (!tableId || !submittedBy) {
            res.status(400).json({ error: 'tableId and submittedBy are required' });
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
        }

        await updateTableStatus(tableDefinitionId, 'submitted');

        const tableSnapshot = await getTableDefinitionDetails(tableDefinitionId);
        const columnsSnapshot = await getColumnDefinitionsByTableId(tableDefinitionId);
        const payload: SubmissionPayload = {
            table: tableSnapshot,
            columns: columnsSnapshot,
        };

        const submission = await createSubmission(tableDefinitionId, submittedBy, payload);

        await createAuditLog({
            action: 'SUBMIT_FOR_REVIEW',
            entity_type: 'submission',
            entity_id: submission.id,
            user_name: submittedBy,
            metadata: { table_id: tableDefinitionId }
        });

        const tableDef = tableSnapshot;
        broadcastSubmissionEvent('SUBMITTED', {
            submittedBy,
            tableName: tableDef?.table_name || tableId,
            linkId: submission.id
        }).catch(e => console.error("Webhook broadcast failed softly:", e));

        res.status(201).json(submission);
    } catch (err) {
        console.error('Submit review error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listPendingSubmissions = async (req: Request, res: Response): Promise<void> => {
    try {
        const submissions = await getPendingSubmissions();
        const enriched = submissions.map((s: any) => {
            const submitterName = s.submitter_first_name
                ? `${s.submitter_first_name} ${s.submitter_last_name || ''}`.trim()
                : (s.submitter_email || s.submitted_by);
            return {
                id: s.id,
                table_id: s.table_id,
                submitted_by: s.submitted_by,
                submitter_name: submitterName,
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
        const { reviewedBy, status, rejectionReason } = req.body;

        if (!reviewedBy || !['approved', 'rejected'].includes(status)) {
            res.status(400).json({ error: 'Valid reviewedBy and status (approved/rejected) are required' });
            return;
        }

        const reviewedSubmission = await reviewSubmission(id, reviewedBy, status, rejectionReason);
        await updateTableStatus(reviewedSubmission.table_id, status);

        await createAuditLog({
            action: status === 'approved' ? 'APPROVE_SUBMISSION' : 'REJECT_SUBMISSION',
            entity_type: 'submission',
            entity_id: id,
            user_name: reviewedBy,
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
            submittedBy: reviewedBy,
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
