import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ApprovalModal } from '../components/ApprovalModal';

export const TemplateReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [data, setData] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'approve' | 'reject' | 'process' | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await api.get(`/architect/templates/${id}`);
        setData(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetch();
  }, [id]);

  if (!hasRole('architect')) return <div>Unauthorized</div>;
  if (!data) return <div>Loading...</div>;

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

  return (
    <div>
      <h2>Review: {data.table.table_name}</h2>
      <div>
        <strong>Details</strong>
        <div>Schema: {data.table.schema_name}</div>
        <div>Database: {data.table.database_name}</div>
        <div>Status: {data.table.status}</div>
      </div>

      <div>
        <h3>Columns</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Nullable</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.columns.map((c: any) => (
              <tr key={c.id}>
                <td>{c.column_name}</td>
                <td>{c.data_type}</td>
                <td>{c.is_nullable ? 'YES' : 'NO'}</td>
                <td>{c.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <textarea placeholder="Comment (for rejection/request changes)" value={comment} onChange={e => setComment(e.target.value)} />
      </div>

      <div>
        <button onClick={() => openModal('approve')}>Approve</button>
        <button onClick={() => openModal('reject')}>Reject</button>
        <button onClick={() => openModal('process')}>Process Template</button>
      </div>

      <ApprovalModal open={modalOpen} title={modalMode === 'approve' ? 'Confirm Approve' : modalMode === 'reject' ? 'Confirm Reject' : 'Confirm Process'} onClose={closeModal}>
        <div>
          {modalMode === 'reject' && <div><strong>Rejection comment:</strong><div>{comment}</div></div>}
          <div style={{ marginTop: 12 }}>
            <button onClick={handleConfirm}>Confirm</button>
            <button onClick={closeModal}>Cancel</button>
          </div>
        </div>
      </ApprovalModal>
    </div>
  );
};