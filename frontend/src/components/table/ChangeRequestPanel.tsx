import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, Button, Badge, EmptyState } from '../common';
import { fetchChangeRequests, approveChangeRequest, rejectChangeRequest, ChangeRequest } from '../../api/changeRequests';
import { useDashboard } from '../../context/DashboardContext';

export const ChangeRequestPanel: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await fetchChangeRequests('pending');
      setRequests(data);
    } catch (err) {
      console.error('Failed to load change requests', err);
      addToast('error', 'Failed to load change requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      await approveChangeRequest(id);
      addToast('success', 'Change approved and applied to database');
      loadRequests();
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Failed to approve change');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectChangeRequest(id);
      addToast('success', 'Change request rejected');
      loadRequests();
    } catch (err: any) {
      addToast('error', err.response?.data?.error || 'Failed to reject change');
    }
  };

  if (loading) {
    return <Card><EmptyState title="Loading Requests" description="Fetching pending change requests..." /></Card>;
  }

  if (requests.length === 0) {
    return <Card><EmptyState title="No Pending Requests" description="There are no pending data change requests at the moment." /></Card>;
  }

  const isArchitect = user?.role === 'architect' || user?.role === 'admin';

  return (
    <div className="space-y-4">
      {requests.map(req => {
        const oldDataStr = JSON.stringify(req.old_data, null, 2);
        const newDataStr = JSON.stringify(req.new_data, null, 2);
        
        return (
          <Card key={req.id} title={`Table: ${req.table_name}`} subtitle={`Submitted by ${req.submitter_name || 'Unknown'}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Old Data</h4>
                  <pre className="bg-slate-50 p-3 rounded-lg text-xs font-mono text-slate-700 overflow-x-auto border border-slate-200">
                    {oldDataStr}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">New Data</h4>
                  <pre className="bg-emerald-50 p-3 rounded-lg text-xs font-mono text-emerald-800 overflow-x-auto border border-emerald-200">
                    {newDataStr}
                  </pre>
                </div>
              </div>
              
              {isArchitect ? (
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button variant="danger" onClick={() => handleReject(req.id)}>Reject</Button>
                  <Button variant="primary" onClick={() => handleApprove(req.id)}>Approve & Apply</Button>
                </div>
              ) : (
                <div className="flex justify-end pt-2">
                  <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded border border-amber-200">
                    Pending Architect Review
                  </span>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
