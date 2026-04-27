import { HttpError } from '../utils/httpError';
import * as repo from '../repositories';
import { getColumnDefinitionsByTableId } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';

export const listTemplates = async () => {
  const rows = await repo.listSubmittedTemplates();
  return rows.map((r: any) => ({
    id: r.id,
    tableName: r.table_name,
    status: r.status,
    createdBy: r.first_name ? `${r.first_name} ${r.last_name}` : r.created_by,
    createdAt: r.created_at,
  }));
};

export const getTemplateDetails = async (id: string) => {
  const table = await repo.getTableDefinitionById(id);
  if (!table) throw new HttpError(404, 'Template not found');
  const columns = await getColumnDefinitionsByTableId(id);
  return { table, columns };
};

export const approveTemplate = async (id: string, reviewerId: string) => {
  const submission = await repo.getSubmissionForTable(id);
  if (submission) {
    await repo.markSubmissionReviewed(submission.id, reviewerId, 'approved');
  }
  const updated = await repo.updateTableMetadata(id, { status: 'approved', reviewed_by: reviewerId, review_comments: null });

  await createAuditLog({
    action: 'APPROVE_TEMPLATE',
    entity_type: 'table_definition',
    entity_id: id,
    user_name: reviewerId,
    metadata: {}
  });
  return updated;
};

export const rejectTemplate = async (id: string, reviewerId: string, comment?: string) => {
  const submission = await repo.getSubmissionForTable(id);
  if (submission) {
    await repo.markSubmissionReviewed(submission.id, reviewerId, 'rejected', comment);
  }
  const updated = await repo.updateTableMetadata(id, { status: 'rejected', reviewed_by: reviewerId, review_comments: comment || null });

  await createAuditLog({
    action: 'REJECT_TEMPLATE',
    entity_type: 'table_definition',
    entity_id: id,
    user_name: reviewerId,
    metadata: { comment }
  });
  return updated;
};

export const processTemplate = async (id: string, reviewerId: string) => {
  const table = await repo.getTableDefinitionById(id);
  if (!table) throw new HttpError(404, 'Template not found');
  const columns = await getColumnDefinitionsByTableId(id);
  const connInfo = await getClusterConnectionConfig(table.connection_id);
  if (!connInfo) throw new HttpError(404, 'Connection configuration not found');

  const connector = getConnector(connInfo.cluster.db_type as any);

  // Basic DDL generation
  const colsDDL = columns.map((c: any) => `"${c.column_name}" ${c.data_type} ${c.is_nullable ? 'NULL' : 'NOT NULL'}`).join(', ');
  const ddl = `CREATE TABLE IF NOT EXISTS "${table.schema_name}"."${table.table_name}" (${colsDDL})`;

  try {
    await connector.runQuery(connInfo.config, ddl);
  } catch (e: any) {
    throw new HttpError(500, 'Failed to execute DDL', e.message || e);
  }

  const processedAt = new Date().toISOString();
  const updated = await repo.updateTableMetadata(id, { status: 'processed', reviewed_by: reviewerId, review_comments: null, processed_at: processedAt });

  await createAuditLog({
    action: 'PROCESS_TEMPLATE',
    entity_type: 'table_definition',
    entity_id: id,
    user_name: reviewerId,
    metadata: { target_cluster: connInfo.cluster.name }
  });

  return updated;
};
