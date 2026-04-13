import { Request, Response } from 'express';
import { createSubmission, getPendingSubmissions, reviewSubmission } from '../models/submission.model';
import { updateTableStatus, getTableDefinitionDetails } from '../models/table_definition.model';
import { getColumnDefinitionsByTableId } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';

export const submitTableForReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const { tableId, submittedBy } = req.body;
        if (!tableId || !submittedBy) {
            res.status(400).json({ error: 'tableId and submittedBy are required' });
            return;
        }

        await updateTableStatus(tableId, 'submitted');
        const submission = await createSubmission(tableId, submittedBy);

        res.status(201).json(submission);
    } catch (err) {
        console.error('Submit review error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listPendingSubmissions = async (req: Request, res: Response): Promise<void> => {
    try {
        const submissions = await getPendingSubmissions();
        res.status(200).json(submissions);
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

        if (status === 'approved') {
            try {
                // Sync Hook logic
                const tableDef = await getTableDefinitionDetails(reviewedSubmission.table_id);
                const columnsDef = await getColumnDefinitionsByTableId(reviewedSubmission.table_id);
                if (tableDef) {
                    const connInfo = await getClusterConnectionConfig(tableDef.connection_id);
                    if (connInfo) {
                        const connector = getConnector(connInfo.cluster.db_type);

                        // Generate simple DDL Create Table for Sync Demo (since 'ALTER' is significantly more complex to mock generalized logic for across dialects)
                        const colsDDL = columnsDef.map(c => `${c.column_name} ${c.data_type} ${c.is_nullable ? 'NULL' : 'NOT NULL'}`).join(', ');
                        const ddl = `CREATE TABLE ${tableDef.schema_name}.${tableDef.table_name} (${colsDDL})`;

                        await connector.executeDDL(connInfo.config, ddl);
                        await updateTableStatus(reviewedSubmission.table_id, 'applied');
                    }
                }
            } catch (syncErr) {
                console.error('Database Sync Hook Error:', syncErr);
                res.status(500).json({ error: 'Review recorded, but Database schema push failed.', details: syncErr });
                return;
            }
        }

        res.status(200).json(reviewedSubmission);
    } catch (err) {
        console.error('Handle review error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
