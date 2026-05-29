import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { columnFromServer, columnToServer } from '../context/DashboardContext';
import { Card, Button, Badge } from '../components/common';
import { ApprovalModal } from '../components/ApprovalModal';
import { COLUMN_FIELDS, type ColumnFieldSpec } from '../components/columns/columnFields';
import { validateColumnDefault } from '../utils/validation';
import type { ColumnAction, ColumnDefinition, TableDefinition } from '../types';

const statusVariant: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
  applied: 'success',
  processed: 'success',
};

const actionRowStyles: Record<ColumnAction, string> = {
  'No Change': '',
  Modify: 'bg-amber-50 border-l-4 border-l-amber-400',
  Add: 'bg-emerald-50 border-l-4 border-l-emerald-400',
  Drop: 'bg-red-50 border-l-4 border-l-red-400 line-through opacity-60',
};

const actionBadgeVariant: Record<ColumnAction, 'neutral' | 'info' | 'success' | 'danger'> = {
  'No Change': 'neutral',
  Modify: 'info',
  Add: 'success',
  Drop: 'danger',
};

const baseCellClass =
  'w-full bg-transparent px-2 py-1 text-xs text-slate-800 border border-transparent rounded focus:bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 focus:outline-none';

const renderReadOnlyCell = (field: ColumnFieldSpec, col: ColumnDefinition): React.ReactNode => {
  const value = field.get(col);
  if (field.kind === 'checkbox') {
    // Render an explicit two-state pill so `false` reads as "No" rather than
    // "missing". The previous "—" fallback made every non-PK / non-stats /
    // non-sort-key / non-dist-key row look like it had unbound data.
    return value ? (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-100 text-indigo-700" aria-label="Yes">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    ) : (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-300 text-slate-300 text-[10px]"
        aria-label="No"
      >
        ✕
      </span>
    );
  }
  // Numbers (0, sortOrder, etc.) must render as themselves — `0 || '—'` would
  // wipe the value, but a stringified "0" is meaningful and should stay.
  if (typeof value === 'number') {
    return <span className="font-mono">{value}</span>;
  }
  const display = String(value ?? '').trim();
  if (!display) return <span className="text-slate-300">—</span>;
  if (field.kind === 'select' && field.key === 'dataType') {
    return <span className="font-mono">{display}</span>;
  }
  return display;
};

interface EditableCellProps {
  field: ColumnFieldSpec;
  col: ColumnDefinition;
  isDuplicate: boolean;
  defaultError?: string;
  onUpdate: (id: string, patch: Partial<ColumnDefinition>) => void;
}

// Editable cell mirrors the developer-side ColumnDataGrid behavior: emit only
// the keys the field actually touched so an architect tweak (e.g. changing
// data_type) becomes a focused patch on the row.
const EditableCell: React.FC<EditableCellProps> = ({ field, col, isDuplicate, defaultError, onUpdate }) => {
  const value = field.get(col);
  const commit = (v: string | number | boolean) => {
    const next = field.set(col, v);
    const patch: Partial<ColumnDefinition> = {};
    (Object.keys(next) as (keyof ColumnDefinition)[]).forEach((k) => {
      if ((next as any)[k] !== (col as any)[k]) {
        (patch as any)[k] = (next as any)[k];
      }
    });
    if (Object.keys(patch).length > 0) onUpdate(col.id, patch);
  };

  const hasDefaultError = field.key === 'defaultValue' && !!defaultError;
  const errorClass =
    (field.key === 'columnName' && (isDuplicate || !col.columnName.trim())) || hasDefaultError
      ? 'border-red-300 bg-red-50'
      : '';

  if (field.kind === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => commit(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        aria-label={field.label}
      />
    );
  }
  if (field.kind === 'select') {
    return (
      <select
        value={String(value)}
        onChange={(e) => commit(e.target.value)}
        className={`${baseCellClass} ${errorClass}`}
        aria-label={field.label}
      >
        {field.options!.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === 'number') {
    return (
      <input
        type="number"
        value={value as number}
        onChange={(e) => commit(Number(e.target.value) || 0)}
        className={`${baseCellClass} ${errorClass}`}
        aria-label={field.label}
      />
    );
  }
  return (
    <input
      type="text"
      value={String(value)}
      onChange={(e) => commit(e.target.value)}
      className={`${baseCellClass} ${errorClass}`}
      aria-label={field.label}
      placeholder={field.required ? 'required' : ''}
      title={
        field.key === 'columnName' && isDuplicate
          ? 'Duplicate column name'
          : hasDefaultError
          ? defaultError
          : undefined
      }
    />
  );
};

// Mirror the developer-side TableDefinition shape so the architect view uses
// the same labels and ordering instead of leaking snake_case fields.
const tableFromServer = (t: any): TableDefinition => ({
  id: t.id,
  tableName: (t.table_name || '').replace(/_/g, ' '),
  entityLogicalName: t.entity_logical_name || '',
  distributionStyle: t.distribution_style || 'AUTO',
  schemaName: t.schema_name || '',
  verticalName: t.vertical_name || '',
  businessArea: t.business_area || '',
  definition: t.definition || '',
  columns: [],
});

export const TemplateReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [tableDef, setTableDef] = useState<TableDefinition | null>(null);
  const [rawTable, setRawTable] = useState<any>(null);
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [comment, setComment] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'approve' | 'reject' | 'process' | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await api.get(`/architect/templates/${id}`);
        setRawTable(data.table);
        setTableDef(tableFromServer(data.table));
        setColumns((data.columns || []).map(columnFromServer));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const changeCounts = useMemo(() => {
    const added = columns.filter((c) => c.action === 'Add').length;
    const modified = columns.filter((c) => c.action === 'Modify').length;
    const dropped = columns.filter((c) => c.action === 'Drop').length;
    const unchanged = columns.filter((c) => c.action === 'No Change').length;
    return { added, modified, dropped, unchanged };
  }, [columns]);

  const duplicateColumnNames = useMemo(() => {
    const seen = new Map<string, number>();
    const dups = new Set<string>();
    columns.forEach((c) => {
      const name = c.columnName.trim().toLowerCase();
      if (!name) return;
      const count = (seen.get(name) || 0) + 1;
      seen.set(name, count);
      if (count > 1) dups.add(name);
    });
    return dups;
  }, [columns]);

  const defaultErrors = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((c) => {
      const r = validateColumnDefault(c.defaultValue, c.dataType, `Column "${c.columnName || '?'}"`);
      if (!r.valid && r.error) map.set(c.id, r.error);
    });
    return map;
  }, [columns]);

  if (!hasRole('architect')) return <div className="p-6 text-sm text-slate-500">Unauthorized</div>;
  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  if (!tableDef || !rawTable) return <div className="p-6 text-sm text-slate-500">Template not found.</div>;

  const status = rawTable.status || 'draft';
  // Only allow architect edits while the table is still up for review. Once it
  // has been approved/processed the metadata is locked — editing here would
  // bypass the audit trail of the original submission.
  const canEdit = status === 'submitted' || status === 'draft' || status === 'rejected';

  const openModal = (mode: 'approve' | 'reject' | 'process') => { setModalMode(mode); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setModalMode(null); };

  const updateColumn = (colId: string, patch: Partial<ColumnDefinition>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        // Auto-promote 'No Change' → 'Modify' when the architect actually edits
        // a field other than the action itself — matches developer-side
        // updateColumn behavior so apply will pick up the diff.
        const next = { ...c, ...patch };
        if (
          c.action === 'No Change' &&
          !('action' in patch) &&
          Object.keys(patch).some((k) => k !== 'action')
        ) {
          next.action = 'Modify';
        }
        return next;
      }),
    );
    setDirty(true);
    setInfo(null);
  };

  const addColumn = () => {
    const newCol: ColumnDefinition = {
      id: `arch-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      columnName: '',
      dataType: 'VARCHAR',
      isNullable: true,
      isPrimaryKey: false,
      dataClassification: 'Internal',
      dataDomain: '',
      attributeDefinition: '',
      defaultValue: '',
      action: 'Add',
      sortOrder: columns.length,
    };
    setColumns((prev) => [...prev, newCol]);
    setDirty(true);
  };

  const startEdit = () => {
    setIsEditing(true);
    setError(null);
    setInfo(null);
  };

  const cancelEdit = async () => {
    // Reload from server to discard local changes.
    setIsEditing(false);
    setDirty(false);
    setError(null);
    try {
      const { data } = await api.get(`/architect/templates/${id}`);
      setRawTable(data.table);
      setTableDef(tableFromServer(data.table));
      setColumns((data.columns || []).map(columnFromServer));
    } catch (err) {
      console.error(err);
    }
  };

  const saveEdits = async () => {
    setError(null);
    // Block save on the same conditions the developer-side grid surfaces so
    // the architect doesn't ship an unsavable payload.
    for (const c of columns) {
      if (!c.columnName.trim()) {
        setError('Every column needs a non-empty Column Name.');
        return;
      }
    }
    if (duplicateColumnNames.size > 0) {
      setError(`Duplicate column name(s): ${Array.from(duplicateColumnNames).join(', ')}`);
      return;
    }
    if (defaultErrors.size > 0) {
      setError(Array.from(defaultErrors.values())[0]);
      return;
    }

    setSavingEdits(true);
    try {
      const tablePayload = {
        id: rawTable.id,
        connection_id: rawTable.connection_id,
        database_name: rawTable.database_name,
        schema_name: rawTable.schema_name,
        // Persist the canonical underscore form even though the UI displays spaces.
        table_name: (tableDef.tableName || '').trim().replace(/\s+/g, '_'),
        entity_logical_name: tableDef.entityLogicalName || null,
        distribution_style: tableDef.distributionStyle,
        vertical_name: tableDef.verticalName || null,
        business_area: tableDef.businessArea || null,
        definition: tableDef.definition || null,
        status: rawTable.status,
      };
      // Strip synthetic ids on freshly-added rows so the backend treats them
      // as inserts; persisted rows keep their UUIDs.
      const dbColumns = columns.map((c, idx) => ({
        ...(c.id && !c.id.startsWith('arch-new-') ? { id: c.id } : {}),
        ...columnToServer(c, idx),
      }));

      const res = await api.post('/table-definitions', { table: tablePayload, columns: dbColumns });
      setRawTable(res.data.table);
      setTableDef(tableFromServer(res.data.table));
      setColumns((res.data.columns || []).map(columnFromServer));
      setDirty(false);
      setIsEditing(false);
      setInfo('Changes saved. You can now approve, reject, or process the template.');
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to save changes.';
      setError(msg);
    } finally {
      setSavingEdits(false);
    }
  };

  const updateTableField = (patch: Partial<TableDefinition>) => {
    setTableDef((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setInfo(null);
  };

  const handleConfirm = async () => {
    try {
      if (modalMode === 'approve') {
        await api.post(`/architect/templates/${id}/approve`);
      } else if (modalMode === 'reject') {
        await api.post(`/architect/templates/${id}/reject`, { comment });
      } else if (modalMode === 'process') {
        await api.post(`/architect/templates/${id}/process`);
      }
      navigate('/architect');
    } catch (err) {
      console.error('Action failed', err);
    }
  };

  const properties = [
    { label: 'Table Name', value: tableDef.tableName },
    { label: 'Entity Logical Name', value: tableDef.entityLogicalName },
    { label: 'Schema Name', value: tableDef.schemaName },
    { label: 'Database', value: rawTable.database_name || '' },
    { label: 'Distribution Style', value: tableDef.distributionStyle },
    { label: 'Vertical Name', value: tableDef.verticalName },
    { label: 'Business Area', value: tableDef.businessArea || '' },
    { label: 'Total Columns', value: columns.length.toString() },
  ];

  const decisionDisabled = isEditing || dirty;
  const decisionTitle = isEditing
    ? 'Save or cancel your edits first.'
    : dirty
    ? 'You have unsaved column changes — save them before deciding.'
    : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-slate-800 truncate">
                {tableDef.tableName || 'Untitled table'}
              </h3>
              <Badge variant={statusVariant[status] ?? 'neutral'}>
                {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
              </Badge>
              {dirty && (
                <span className="text-xs font-medium text-amber-600">Unsaved changes</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Review the submitted table definition and column attributes. You can edit any
              field before approving, rejecting, or processing the template.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              onClick={() => openModal('reject')}
              disabled={decisionDisabled}
              title={decisionTitle}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              onClick={() => openModal('approve')}
              disabled={decisionDisabled}
              title={decisionTitle}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => openModal('process')}
              disabled={decisionDisabled}
              title={decisionTitle}
            >
              Process Template
            </Button>
          </div>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-600">{error}</p>
        )}
        {info && (
          <p className="mt-3 text-xs text-emerald-600">{info}</p>
        )}
      </Card>

      <Card
        title="Table Properties"
        subtitle={tableDef.tableName}
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      >
        <div className="space-y-3">
          {properties.map((prop) => (
            <div key={prop.label} className="flex items-start justify-between gap-4">
              <span className="text-xs text-slate-500 flex-shrink-0">{prop.label}</span>
              <span className="text-xs font-medium text-slate-700 text-right">
                {prop.value || '—'}
              </span>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Table Definition</div>
            {isEditing ? (
              <textarea
                value={tableDef.definition ?? ''}
                onChange={(e) => updateTableField({ definition: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              />
            ) : (
              <div className="text-xs font-medium text-slate-700 whitespace-pre-wrap break-words">
                {tableDef.definition || '—'}
              </div>
            )}
          </div>
          {rawTable.review_comments && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500 mb-1">Previous Review Comments</div>
              <div className="text-xs font-medium text-slate-700 whitespace-pre-wrap break-words">
                {rawTable.review_comments}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={`Columns (${columns.length})`}
        subtitle={
          isEditing
            ? 'Editable — adjust any cell, then Save Changes to persist before approval.'
            : 'Read-only view of every attribute submitted for review'
        }
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        }
        headerAction={
          canEdit ? (
            isEditing ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={savingEdits}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={saveEdits} disabled={savingEdits}>
                  {savingEdits ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={startEdit}>
                Edit Columns
              </Button>
            )
          ) : undefined
        }
        noPadding
      >
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2">
          {changeCounts.added > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">{changeCounts.added} Added</span>
            </div>
          )}
          {changeCounts.modified > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-amber-700">{changeCounts.modified} Modified</span>
            </div>
          )}
          {changeCounts.dropped > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs font-medium text-red-700">{changeCounts.dropped} Dropped</span>
            </div>
          )}
          {changeCounts.unchanged > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-xs font-medium text-slate-600">{changeCounts.unchanged} Unchanged</span>
            </div>
          )}
        </div>
        <div className="overflow-auto max-h-[60vh]">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th
                  className="sticky top-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200"
                  style={{ minWidth: 40, width: 40 }}
                >
                  #
                </th>
                {COLUMN_FIELDS.map((f) => (
                  <th
                    key={f.key}
                    className="sticky top-0 z-10 bg-slate-50 text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap border-b border-slate-200"
                    style={{ minWidth: f.width, width: f.width }}
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((col, rowIdx) => {
                const isDup =
                  !!col.columnName.trim() &&
                  duplicateColumnNames.has(col.columnName.trim().toLowerCase());
                return (
                  <tr
                    key={col.id}
                    className={`border-b border-slate-50 ${isEditing ? 'hover:bg-slate-50/40' : ''} ${actionRowStyles[col.action]}`}
                  >
                    <td className="px-3 py-1.5 text-slate-500 align-middle">{rowIdx + 1}</td>
                    {COLUMN_FIELDS.map((f) => {
                      const alignCenter = f.kind === 'checkbox';
                      return (
                        <td
                          key={f.key}
                          className={`${isEditing ? 'px-1 py-1' : 'px-3 py-2'} text-slate-700 align-middle ${alignCenter ? 'text-center' : ''}`}
                          style={{ minWidth: f.width, width: f.width }}
                        >
                          {isEditing ? (
                            <EditableCell
                              field={f}
                              col={col}
                              isDuplicate={isDup}
                              defaultError={defaultErrors.get(col.id)}
                              onUpdate={updateColumn}
                            />
                          ) : f.key === 'action' ? (
                            <Badge variant={actionBadgeVariant[col.action]}>{col.action}</Badge>
                          ) : (
                            renderReadOnlyCell(f, col)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isEditing && (
          <div className="px-4 py-3 border-t border-slate-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={addColumn}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Column
            </Button>
          </div>
        )}
      </Card>

      <Card title="Review Comment" subtitle="Required for rejection">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (for rejection / request changes)"
          rows={3}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
      </Card>

      <ApprovalModal
        open={modalOpen}
        title={
          modalMode === 'approve'
            ? 'Confirm Approve'
            : modalMode === 'reject'
            ? 'Confirm Reject'
            : 'Confirm Process'
        }
        onClose={closeModal}
      >
        <div>
          {modalMode === 'reject' && (
            <div>
              <strong>Rejection comment:</strong>
              <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                {comment || <span className="italic text-slate-400">No comment provided.</span>}
              </div>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" onClick={handleConfirm}>Confirm</Button>
          </div>
        </div>
      </ApprovalModal>
    </div>
  );
};
