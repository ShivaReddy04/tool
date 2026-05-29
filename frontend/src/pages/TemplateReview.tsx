import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { columnFromServer } from '../context/DashboardContext';
import { Card, Button, Badge } from '../components/common';
import { ApprovalModal } from '../components/ApprovalModal';
import { COLUMN_FIELDS, type ColumnFieldSpec } from '../components/columns/columnFields';
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

const renderReadOnlyCell = (field: ColumnFieldSpec, col: ColumnDefinition): React.ReactNode => {
  const value = field.get(col);
  if (field.kind === 'checkbox') {
    return value ? (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-indigo-100 text-indigo-700">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    ) : (
      <span className="text-slate-300">—</span>
    );
  }
  const display = String(value ?? '');
  if (!display) return <span className="text-slate-300">—</span>;
  if (field.kind === 'select' && field.key === 'dataType') {
    return <span className="font-mono">{display}</span>;
  }
  return display;
};

// Mirror the developer-side TableDefinition shape so the read-only architect
// view uses the same labels and ordering instead of leaking snake_case fields.
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

  if (!hasRole('architect')) return <div className="p-6 text-sm text-slate-500">Unauthorized</div>;
  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  if (!tableDef || !rawTable) return <div className="p-6 text-sm text-slate-500">Template not found.</div>;

  const openModal = (mode: 'approve' | 'reject' | 'process') => { setModalMode(mode); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setModalMode(null); };

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

  const status = rawTable.status || 'draft';

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
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Review the submitted table definition and column attributes, then approve,
              reject, or process the template against the target cluster.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="danger" onClick={() => openModal('reject')}>Reject</Button>
            <Button variant="primary" onClick={() => openModal('approve')}>Approve</Button>
            <Button variant="outline" onClick={() => openModal('process')}>Process Template</Button>
          </div>
        </div>
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
            <div className="text-xs font-medium text-slate-700 whitespace-pre-wrap break-words">
              {tableDef.definition || '—'}
            </div>
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
        subtitle="Read-only view of every attribute submitted for review"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
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
              {columns.map((col, rowIdx) => (
                <tr
                  key={col.id}
                  className={`border-b border-slate-50 hover:bg-slate-50/40 ${actionRowStyles[col.action]}`}
                >
                  <td className="px-3 py-1.5 text-slate-500 align-middle">{rowIdx + 1}</td>
                  {COLUMN_FIELDS.map((f) => {
                    const alignCenter = f.kind === 'checkbox';
                    return (
                      <td
                        key={f.key}
                        className={`px-3 py-2 text-slate-700 align-middle ${alignCenter ? 'text-center' : ''}`}
                        style={{ minWidth: f.width, width: f.width }}
                      >
                        {f.key === 'action' ? (
                          <Badge variant={actionBadgeVariant[col.action]}>{col.action}</Badge>
                        ) : (
                          renderReadOnlyCell(f, col)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
