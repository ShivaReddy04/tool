import React, { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { TableGrid } from '../components/TableGrid';
import { Button } from '../components/common';

export const ArchitectDashboard: React.FC = () => {
  const { hasRole } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data } = await api.get('/architect/templates');
      setTemplates(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchTemplates();
      setLoading(false);
    })();
  }, [fetchTemplates]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTemplates();
    } finally {
      setRefreshing(false);
    }
  };

  if (!hasRole('architect')) return <div>Unauthorized</div>;

  const columns = [
    { key: 'tableName', header: 'Table' },
    { key: 'status', header: 'Status' },
    { key: 'createdBy', header: 'Created By' },
    { key: 'createdAt', header: 'Created Date', render: (row: any) => new Date(row.createdAt).toLocaleString() },
    { key: 'actions', header: 'Actions', render: (row: any) => <Link to={`/architect/templates/${row.id}`}>Review</Link> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>Architect Review Dashboard</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          loading={refreshing}
          title="Reload pending templates from server"
          icon={
            !refreshing ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : undefined
          }
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {loading ? <div>Loading...</div> : <TableGrid columns={columns} data={templates} rowKey={(r:any) => r.id} />}
    </div>
  );
};
