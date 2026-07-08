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
import { HttpError } from '../utils/httpError';
import { withTransaction } from '../config/db';
import type { SubmitForReviewInput, ReviewSubmissionInput } from '../schemas/submission';

// Builds the same statement list that the apply step will run at approval
// time. Shared by submit-time pre-flight and the approval handler so both
// agree on exactly what DDL is being validated / executed.
//
// The ALTER branch reconciles the requested actions against the CURRENT cluster
// columns: an Add whose column already exists, or a Drop whose column is already
// gone, is dropped from the batch. This is what makes approval retry-safe on
// EVERY dialect — not just the ones that accept ADD/DROP COLUMN IF [NOT] EXISTS
// (only Postgres does for both). After a partial failure — cluster DDL applied
// but the local bookkeeping transaction rolled back — the retry recomputes here
// against the now-updated cluster and simply emits nothing for the parts already
// applied. CREATE is guarded by the tableExists check above plus IF NOT EXISTS
// where supported.
export const computeApplyStatements = async (
  connector: any,
  dbType: DbType,
  config: any,
  schemaName: string,
  tableName: string,
  columns: DDLColumn[],
  distStyle?: string | null,
): Promise<string[]> => {
  const existingTables: any[] = await connector.getTables(config, schemaName);
  const tableExists = existingTables.some(
    (t) => (t.table_name || '').toLowerCase() === tableName.toLowerCase(),
  );

  const statements: string[] = [];
  if (!tableExists) {
    if (dbType === 'postgresql' || dbType === 'redshift') {
      statements.push(`CREATE SCHEMA IF NOT EXISTS "${schemaName.replace(/"/g, '""')}"`);
    }
    const create = buildCreateTableDDL(dbType, schemaName, tableName, columns, distStyle);
    if (create) statements.push(create);
  } else if (hasPendingChanges(columns)) {
    let effectiveColumns = columns;
    try {
      const liveColumns: any[] = await connector.getColumns(config, schemaName, tableName);
      const liveNames = new Set(
        liveColumns.map((c) => (c.column_name || '').toLowerCase()),
      );
      effectiveColumns = columns.filter((c) => {
        const name = (c.column_name || '').toLowerCase();
        if (c.action === 'Add') return !liveNames.has(name); // already added → skip
        if (c.action === 'Drop') return liveNames.has(name); // already gone → skip
        return true; // Modify / No Change are idempotent — pass through
      });
    } catch (e: any) {
      // Couldn't read live columns — fall back to the unreconciled batch (the
      // IF [NOT] EXISTS guards still cover Postgres). Never block on a metadata
      // read hiccup.
      console.warn('[apply] column reconcile skipped (getColumns failed):', e?.message || e);
    }
    statements.push(...buildAlterDDL(dbType, schemaName, tableName, effectiveColumns));
  }
  return statements;
};

// Turns a connector/driver error into the same structured detail object that
// the approval handler returns (`{ details, column, statement, pgCode }`) so
// pre-flight failures look identical to apply-time failures on the client.
const buildDDLErrorDetail = (err: any) => {
  const failedStatement: string | undefined = err?.failedStatement;
  let column: string | undefined;
  if (failedStatement) {
    const altered = failedStatement.match(
      /(?:ADD|ALTER|MODIFY|DROP)\s+COLUMN\s+["`[]?([A-Za-z_][A-Za-z0-9_]*)/i,
    );
    if (altered) column = altered[1];
    if (!column) {
      const created = failedStatement.match(
        /CREATE\s+TABLE\s+[^(]*\(\s*["`[]?([A-Za-z_][A-Za-z0-9_]*)/i,
      );
      if (created) column = created[1];
    }
  }
  const baseMessage = err?.message || String(err);
  const detail = column ? `Column "${column}": ${baseMessage}` : baseMessage;
  return {
    details: detail,
    column,
    statement: failedStatement,
    pgCode: err?.code,
  };
};

export const submitTableForReview = async (req: Request, res: Response): Promise<void> => {
  const { tableId, assignedArchitectId } = req.body as SubmitForReviewInput;
  const submittedBy = req.user?.userId;
  if (!submittedBy) throw new HttpError(401, 'Not authenticated');

  console.log('[submission] incoming POST /submissions', { tableId, assignedArchitectId, submittedBy });

  // Re-validate the assigned architect server-side. Frontend uses a constrained
  // picker, but never trust the client — a developer could otherwise escalate
  // by submitting against an arbitrary user id.
  const architect = await findUserById(assignedArchitectId);
  if (!architect) throw new HttpError(404, 'Selected architect not found');
  if ((architect.role || '').toLowerCase() !== 'architect' || architect.is_active === false) {
    throw new HttpError(400, 'Selected user is not an active architect');
  }

  // Composite physical-table key (connId::db::schema::table): create or
  // resolve the matching table_definition before proceeding.
  let tableDefinitionId = tableId;
  if (tableId.includes('::')) {
    const [connectionId, databaseName, schemaName, tableName] = tableId.split('::');
    const existing = await getTableDefinitionByKey(connectionId, databaseName, schemaName, tableName);
    if (existing) {
      tableDefinitionId = existing.id;
    } else {
      const newTableDef = await createOrUpdateTableDefinition({
        connection_id: connectionId,
        database_name: databaseName,
        schema_name: schemaName,
        table_name: tableName,
        created_by: submittedBy,
      } as any);
      tableDefinitionId = newTableDef.id;
    }
  }

  const tableSnapshot = await getTableDefinitionDetails(tableDefinitionId);
  if (!tableSnapshot) throw new HttpError(404, 'Table definition not found for the provided tableId');

  const columnsSnapshot = await getColumnDefinitionsByTableId(tableDefinitionId);

  // Pre-flight: dry-run the same DDL the approval would execute against the
  // target cluster, inside a transaction we always roll back. Catches data /
  // type incompatibilities (e.g. ALTER COLUMN TYPE TIMESTAMP failing because
  // the column holds non-castable strings) before the architect ever sees the
  // submission. MySQL DDL auto-commits so dry-run is impossible there — fall
  // back to apply-time validation on that backend.
  const connInfo = await getClusterConnectionConfig(tableSnapshot.connection_id);
  if (!connInfo) throw new HttpError(404, 'Connection configuration not found');
  const dbType = connInfo.cluster.db_type as DbType;
  const connector = getConnector(dbType);

  // Compute the DDL once and reuse it for: (1) optional dry-run validation,
  // (2) embedding in the submission payload so the architect's review drawer
  // can show the literal CREATE/ALTER statements before approval. For dialects
  // that support dry-run, computation failures still block submission (original
  // behavior). For MySQL (no dry-run) we treat it as best-effort so a transient
  // connectivity hiccup doesn't gate the submission.
  let ddlStatements: string[] = [];
  if (connector.supportsDDLDryRun) {
    ddlStatements = await computeApplyStatements(
      connector,
      dbType,
      connInfo.config,
      tableSnapshot.schema_name,
      tableSnapshot.table_name,
      columnsSnapshot as unknown as DDLColumn[],
      (tableSnapshot as any).distribution_style,
    );
    if (ddlStatements.length > 0) {
      try {
        await connector.dryRunDDLBatch(connInfo.config, ddlStatements);
      } catch (dryErr: any) {
        throw new HttpError(
          400,
          'Submission rejected: proposed schema change cannot be applied to the target cluster.',
          buildDDLErrorDetail(dryErr),
          true,
        );
      }
    }
  } else {
    try {
      ddlStatements = await computeApplyStatements(
        connector,
        dbType,
        connInfo.config,
        tableSnapshot.schema_name,
        tableSnapshot.table_name,
        columnsSnapshot as unknown as DDLColumn[],
        (tableSnapshot as any).distribution_style,
      );
    } catch (e: any) {
      console.warn('[submission] DDL preview computation failed; payload will omit it:', e?.message || e);
    }
  }

  // Capture the live cluster state for the architect's OLD → NEW diff view.
  // Empty array for brand-new tables (nothing exists on the cluster yet) or
  // when the cluster is unreachable — non-fatal; the UI shows NEW only.
  let previousColumns: SubmissionPayload['previousColumns'] = [];
  try {
    previousColumns = await connector.getColumns(
      connInfo.config,
      tableSnapshot.schema_name,
      tableSnapshot.table_name,
    );
  } catch (e: any) {
    console.warn('[submission] getColumns failed; previousColumns will be empty:', e?.message || e);
  }

  await updateTableStatus(tableDefinitionId, 'submitted');

  const payload: SubmissionPayload = {
    table: tableSnapshot,
    columns: columnsSnapshot,
    previousColumns,
    ddlStatements,
    dbType,
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
    },
  });

  broadcastSubmissionEvent('SUBMITTED', {
    submittedBy,
    tableName: tableSnapshot.table_name || tableId,
    linkId: submission.id,
  }).catch((e) => console.error('Webhook broadcast failed softly:', e));

  res.status(201).json(submission);
};

export const listPendingSubmissions = async (req: Request, res: Response): Promise<void> => {
  // Architects only see submissions assigned to them (Jira-style "my queue").
  // Admins see the full firehose so they can monitor or unblock.
  const role = (req.user?.role || '').toLowerCase();
  const scopedArchitectId = role === 'architect' ? req.user?.userId : undefined;

  const submissions = await getPendingSubmissions(scopedArchitectId);
  const enriched = submissions.map((s: any) => ({
    id: s.id,
    table_id: s.table_id,
    submitted_by: s.submitted_by,
    submitter_name: s.submitter_first_name
      ? `${s.submitter_first_name} ${s.submitter_last_name || ''}`.trim()
      : s.submitter_email || s.submitted_by,
    assigned_architect_id: s.assigned_architect_id,
    assigned_architect_name: s.architect_first_name
      ? `${s.architect_first_name} ${s.architect_last_name || ''}`.trim()
      : s.architect_email || null,
    assigned_architect_email: s.architect_email,
    table_name: s.table_name,
    schema_name: s.schema_name,
    database_name: s.database_name,
    status: s.status,
    submitted_at: s.submitted_at,
    payload: s.payload,
  }));
  res.status(200).json(enriched);
};

export const handleReviewAndSync = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, reviewedBy: reviewedByName, rejectionReason } = req.body as ReviewSubmissionInput;

  // submissions.reviewed_by is a uuid FK — use the authenticated user's UUID,
  // never whatever display name the frontend sent in the body.
  const reviewerId = req.user?.userId;
  if (!reviewerId) throw new HttpError(401, 'Not authenticated');

  // Load the submission up-front: its table_id drives the apply step, and (for
  // architects) it's needed to authorize the action.
  const existing = await getSubmissionById(id);
  if (!existing) throw new HttpError(404, 'Submission not found');

  // Architects can only act on submissions assigned to them. Admins can act on
  // anything (e.g. to unblock when the assigned architect is OOO).
  const role = (req.user?.role || '').toLowerCase();
  if (role === 'architect' && existing.assigned_architect_id !== reviewerId) {
    throw new HttpError(403, 'This submission is assigned to a different architect');
  }

  const tableId = existing.table_id;
  let reviewedSubmission: Awaited<ReturnType<typeof reviewSubmission>>;

  if (status === 'approved') {
    // Apply the DDL to the target cluster BEFORE recording the approval. If the
    // push fails, nothing is marked approved — reviewSubmission never runs, so
    // the submission stays 'pending' and the architect can fix the offending
    // column and retry. (Previously the row was flipped to 'approved' first, so
    // a failed push left an approved-but-not-applied submission that had also
    // dropped out of the pending queue.)
    const tableDef = await getTableDefinitionDetails(tableId);
    if (!tableDef) throw new HttpError(404, 'Table definition not found');

    // Drive the apply step from the CURRENT table_definition columns. The
    // architect may edit columns during review (persisted to table_definition
    // before approval), so the live columns — not the original submission
    // snapshot — are what gets applied and committed.
    const snapshotColumns: DDLColumn[] =
      (await getColumnDefinitionsByTableId(tableId)) as unknown as DDLColumn[];

    const connInfo = await getClusterConnectionConfig(tableDef.connection_id);
    if (!connInfo) throw new HttpError(404, 'Connection configuration not found');

    const dbType = connInfo.cluster.db_type as DbType;
    const connector = getConnector(dbType);

    const statements = await computeApplyStatements(
      connector,
      dbType,
      connInfo.config,
      tableDef.schema_name,
      tableDef.table_name,
      snapshotColumns,
      (tableDef as any).distribution_style,
    );

    if (statements.length > 0) {
      console.log('[approval] Applying DDL to', connInfo.cluster.name, statements);
      try {
        await connector.runDDLBatch(connInfo.config, statements);
      } catch (syncErr: any) {
        // Push failed — leave the submission pending for retry. runDDLBatch
        // attaches the failing statement so we can name the column that broke.
        if (syncErr instanceof HttpError) throw syncErr;
        throw new HttpError(
          500,
          'Schema push failed — submission left pending for retry.',
          buildDDLErrorDetail(syncErr),
          true,
        );
      }
    }

    // Push succeeded — now commit the decision, the column actions and the
    // statuses in a single transaction so they can't land partially. Any
    // failure here rolls all of them back, leaving the submission 'pending'
    // (reviewSubmission is the write that removes it from the queue). The
    // cluster DDL is already applied and can't be rolled back with these, so a
    // retry re-runs the same idempotent-where-possible statements.
    reviewedSubmission = await withTransaction(async (tx) => {
      const reviewed = await reviewSubmission(id, reviewerId, status, rejectionReason, tx);
      await commitColumnActions(tableId, tx);
      await updateTableStatus(tableId, 'applied', tx);

      await createAuditLog({
        action: 'APPROVE_SUBMISSION',
        entity_type: 'submission',
        entity_id: id,
        user_name: reviewedByName || reviewerId,
        metadata: { table_id: tableId, reason: rejectionReason },
      }, tx);
      await createAuditLog({
        action: 'EXECUTE_DDL',
        entity_type: 'table_definition',
        entity_id: tableId,
        user_name: 'DART_SYSTEM',
        metadata: {
          target_cluster: connInfo.cluster.name,
          target_schema: tableDef.schema_name,
          target_table: tableDef.table_name,
          statements,
        },
      }, tx);

      return reviewed;
    });
  } else {
    // Rejection: no cluster change — record the decision and its statuses
    // atomically so an audit/status write can't be left dangling.
    reviewedSubmission = await withTransaction(async (tx) => {
      const reviewed = await reviewSubmission(id, reviewerId, status, rejectionReason, tx);
      await updateTableStatus(tableId, status, tx);

      await createAuditLog({
        action: 'REJECT_SUBMISSION',
        entity_type: 'submission',
        entity_id: id,
        user_name: reviewedByName || reviewerId,
        metadata: { table_id: tableId, reason: rejectionReason },
      }, tx);

      return reviewed;
    });
  }

  const tableDef = await getTableDefinitionDetails(tableId);
  broadcastSubmissionEvent(status === 'approved' ? 'APPROVED' : 'REJECTED', {
    submittedBy: reviewedByName || reviewerId,
    tableName: tableDef?.table_name || tableId,
    linkId: id,
    reason: rejectionReason,
  }).catch((e) => console.error('Webhook broadcast failed softly:', e));

  res.status(200).json(reviewedSubmission);
};
