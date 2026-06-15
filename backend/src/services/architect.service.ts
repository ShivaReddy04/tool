import { HttpError } from '../utils/httpError';
import * as repo from '../repositories';
import { getColumnDefinitionsByTableId } from '../models/column_definition.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';
import { createAuditLog } from '../models/audit_log.model';
import { buildCreateTableDDL, buildAlterDDL, hasPendingChanges, DbType, DDLColumn } from '../utils/ddl_generator';

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
  const columns = (await getColumnDefinitionsByTableId(id)) as unknown as DDLColumn[];
  const connInfo = await getClusterConnectionConfig(table.connection_id);
  if (!connInfo) throw new HttpError(404, 'Connection configuration not found');

  const dbType = connInfo.cluster.db_type as DbType;
  const connector = getConnector(dbType);

  // Mirror the apply pipeline in submission.controller.ts so all DDL flows
  // through the same dialect-aware generator. Detect whether the physical
  // table already exists and pick CREATE vs ALTER accordingly.
  const existingTables: any[] = await connector.getTables(connInfo.config, table.schema_name);
  const tableExists = existingTables.some(
    (t: any) => (t.table_name || '').toLowerCase() === table.table_name.toLowerCase()
  );

  const statements: string[] = [];
  if (!tableExists) {
    if (dbType === 'postgresql' || dbType === 'redshift') {
      statements.push(`CREATE SCHEMA IF NOT EXISTS "${table.schema_name.replace(/"/g, '""')}"`);
    }
    const create = buildCreateTableDDL(dbType, table.schema_name, table.table_name, columns, (table as any).distribution_style);
    if (create) statements.push(create);
  } else if (hasPendingChanges(columns)) {
    statements.push(...buildAlterDDL(dbType, table.schema_name, table.table_name, columns));
  }

  if (statements.length > 0) {
    try {
      await connector.runDDLBatch(connInfo.config, statements);
    } catch (e: any) {
      throw new HttpError(500, 'Failed to execute DDL', {
        message: e?.message || String(e),
        failedStatement: e?.failedStatement,
      });
    }
  }

  const processedAt = new Date().toISOString();
  const updated = await repo.updateTableMetadata(id, { status: 'processed', reviewed_by: reviewerId, review_comments: null, processed_at: processedAt });

  await createAuditLog({
    action: 'PROCESS_TEMPLATE',
    entity_type: 'table_definition',
    entity_id: id,
    user_name: reviewerId,
    metadata: { target_cluster: connInfo.cluster.name, statements },
  });

  return updated;
};
