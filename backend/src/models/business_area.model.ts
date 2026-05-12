import { query } from '../config/db';

export type BusinessAreaLevel = 'domain' | 'business_area' | 'sub_area';

export interface BusinessArea {
    id: string;
    name: string;
    description: string;
    parent_id: string | null;
    level: BusinessAreaLevel;
    created_at: Date;
}

export interface ListBusinessAreasFilter {
    level?: BusinessAreaLevel;
    parentId?: string | null;   // explicit `null` filters to top-level only
}

export const createBusinessArea = async (
    name: string,
    description: string,
    level: BusinessAreaLevel = 'business_area',
    parentId: string | null = null,
): Promise<BusinessArea> => {
    const result = await query(
        `INSERT INTO business_areas (name, description, level, parent_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, description, level, parentId],
    );
    return result.rows[0];
};

export const getAllBusinessAreas = async (filter: ListBusinessAreasFilter = {}): Promise<BusinessArea[]> => {
    const clauses: string[] = [];
    const params: any[] = [];

    if (filter.level) {
        params.push(filter.level);
        clauses.push(`level = $${params.length}`);
    }
    if (filter.parentId === null) {
        clauses.push('parent_id IS NULL');
    } else if (typeof filter.parentId === 'string') {
        params.push(filter.parentId);
        clauses.push(`parent_id = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM business_areas ${where} ORDER BY name ASC`, params);
    return result.rows;
};

export const getBusinessAreaById = async (id: string): Promise<BusinessArea | null> => {
    const result = await query('SELECT * FROM business_areas WHERE id = $1', [id]);
    return result.rows[0] || null;
};
