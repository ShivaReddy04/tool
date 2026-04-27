import api from './client';

export interface ChangeRequestPayload {
  connection_id: string;
  database_name?: string;
  schema_name?: string;
  table_name: string;
  row_id: string;
  old_data: any;
  new_data: any;
}

export interface ChangeRequest {
  id: number;
  connection_id: string;
  database_name: string;
  schema_name: string;
  table_name: string;
  row_id: string;
  old_data: any;
  new_data: any;
  status: string;
  submitted_by: string;
  reviewed_by: string | null;
  submitter_name?: string;
  reviewer_name?: string;
  created_at: string;
  updated_at: string;
}

export const submitChangeRequest = async (payload: ChangeRequestPayload): Promise<ChangeRequest> => {
  const { data } = await api.post('/change-requests', payload);
  return data;
};

export const fetchChangeRequests = async (status?: string): Promise<ChangeRequest[]> => {
  const { data } = await api.get('/change-requests', { params: status ? { status } : {} });
  return data;
};

export const approveChangeRequest = async (id: number): Promise<void> => {
  await api.put(`/change-requests/${id}/approve`);
};

export const rejectChangeRequest = async (id: number): Promise<void> => {
  await api.put(`/change-requests/${id}/reject`);
};
