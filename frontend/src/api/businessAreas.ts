import api from './client';
import type { BusinessArea, BusinessAreaLevel } from '../types';

interface RawBusinessArea {
  id: string;
  name: string;
  description?: string;
  parent_id?: string | null;
  level?: BusinessAreaLevel;
}

const normalize = (raw: RawBusinessArea): BusinessArea => ({
  id: raw.id,
  name: raw.name,
  description: raw.description || '',
  parentId: raw.parent_id ?? null,
  level: raw.level,
});

export interface ListBusinessAreasParams {
  level?: BusinessAreaLevel;
  /** Pass `null` for top-level (parent_id IS NULL) entries. */
  parentId?: string | null;
}

export const listBusinessAreas = async (
  params: ListBusinessAreasParams = {},
): Promise<BusinessArea[]> => {
  const query: Record<string, string> = {};
  if (params.level) query.level = params.level;
  if (params.parentId === null) query.parentId = 'null';
  else if (typeof params.parentId === 'string') query.parentId = params.parentId;

  const { data } = await api.get('/business-areas', { params: query });
  return (data as RawBusinessArea[]).map(normalize);
};

export const createBusinessArea = async (input: {
  name: string;
  description?: string;
  level?: BusinessAreaLevel;
  parentId?: string | null;
}): Promise<BusinessArea> => {
  const { data } = await api.post('/business-areas', input);
  return normalize(data);
};
