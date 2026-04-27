import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { TableGrid } from '../components/TableGrid';

export const ArchitectDashboard: React.FC = () => {
  const { hasRole } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data } = await api.get('/architect/templates');
        setTemplates(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, []);

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
      <h2>Architect Review Dashboard</h2>
      {loading ? <div>Loading...</div> : <TableGrid columns={columns} data={templates} rowKey={(r:any) => r.id} />}
    </div>
  );
};