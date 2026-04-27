import { Request, Response, NextFunction } from 'express';
import * as service from '../services/architect.service';

export const listTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await service.listTemplates();
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

export const getTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const payload = await service.getTemplateDetails(id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
};

export const approveTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reviewerId = req.user!.userId;
    const updated = await service.approveTemplate(id, reviewerId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const rejectTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { comment } = req.body;
    const reviewerId = req.user!.userId;
    const updated = await service.rejectTemplate(id, reviewerId, comment);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const processTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reviewerId = req.user!.userId;
    const updated = await service.processTemplate(id, reviewerId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};
// GET /api/architect/templates
export const listTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT td.id, td.table_name, td.status, td.created_by, td.created_at, u.first_name, u.last_name
       FROM table_definitions td
       LEFT JOIN users u ON td.created_by = u.id
       WHERE td.status = 'submitted'
       ORDER BY td.created_at DESC`
    );
    const rows = result.rows.map((r: any) => ({
      id: r.id,
      tableName: r.table_name,
      status: r.status,
      createdBy: r.first_name ? `${r.first_name} ${r.last_name}` : r.created_by,
      createdAt: r.created_at,
    }));
    res.json(rows);
  } catch (err: any) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
};

// GET /api/architect/templates/:id
export const getTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const tableDef = await getTableDefinitionDetails(id);
    if (!tableDef) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const columns = await getColumnDefinitionsByTableId(id);
    res.json({ table: tableDef, columns });
  } catch (err: any) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
};

// POST /api/architect/templates/:id/approve
export const approveTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reviewerId = req.user!.userId;

    // Find pending submission for this table
    const subRes = await query('SELECT * FROM submissions WHERE table_id = $1 AND status = $2 ORDER BY submitted_at DESC LIMIT 1', [id, 'pending']);
    const submission = subRes.rows[0];
    if (submission) {
      await reviewSubmission(submission.id, reviewerId, 'approved');
    }

    await updateTableStatus(id, 'approved');

    await createAuditLog({
      action: 'APPROVE_TEMPLATE',
      entity_type: 'table_definition',
      entity_id: id,
      user_name: reviewerId,
      metadata: {}
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Approve template error:', err);
    res.status(500).json({ error: 'Failed to approve template' });
  }
};

// POST /api/architect/templates/:id/reject
export const rejectTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { comment } = req.body;
    const reviewerId = req.user!.userId;

    const subRes = await query('SELECT * FROM submissions WHERE table_id = $1 AND status = $2 ORDER BY submitted_at DESC LIMIT 1', [id, 'pending']);
    const submission = subRes.rows[0];
    if (submission) {
      await reviewSubmission(submission.id, reviewerId, 'rejected', comment || null);
    }

    await updateTableStatus(id, 'rejected');

    await createAuditLog({
      action: 'REJECT_TEMPLATE',
      entity_type: 'table_definition',
      entity_id: id,
      user_name: reviewerId,
      metadata: { comment }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Reject template error:', err);
    res.status(500).json({ error: 'Failed to reject template' });
  }
};

// POST /api/architect/templates/:id/process
export const processTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reviewerId = req.user!.userId;

    const tableDef = await getTableDefinitionDetails(id);
    if (!tableDef) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const columns = await getColumnDefinitionsByTableId(id);
    const connInfo = await getClusterConnectionConfig(tableDef.connection_id);
    if (!connInfo) {
      res.status(404).json({ error: 'Connection configuration not found' });
      return;
    }

    const connector = getConnector(connInfo.cluster.db_type as any);

    // Generate simple DDL (CREATE TABLE) — for new tables or apply changes for existing.
    const colsDDL = columns.map(c => `"${c.column_name}" ${c.data_type} ${c.is_nullable ? 'NULL' : 'NOT NULL'}`).join(', ');
    const ddl = `CREATE TABLE IF NOT EXISTS "${tableDef.schema_name}"."${tableDef.table_name}" (${colsDDL})`;

    // Execute DDL
    await connector.runQuery(connInfo.config, ddl);

    // Update metadata and status
    await query('UPDATE table_definitions SET status = $1, reviewed_by = $2, review_comments = $3, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $4', ['processed', reviewerId, null, id]);

    await createAuditLog({
      action: 'PROCESS_TEMPLATE',
      entity_type: 'table_definition',
      entity_id: id,
      user_name: reviewerId,
      metadata: { target_cluster: connInfo.cluster.name }
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Process template error:', err);
    res.status(500).json({ error: 'Failed to process template', details: err.message });
  }
};