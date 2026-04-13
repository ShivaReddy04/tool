import { query } from '../config/db';

export interface BusinessArea {
    id: string;
    name: string;
    description: string;
    created_at: Date;
}

export const createBusinessArea = async (name: string, description: string): Promise<BusinessArea> => {
    const result = await query(
        'INSERT INTO business_areas (name, description) VALUES ($1, $2) RETURNING *',
        [name, description]
    );
    return result.rows[0];
};

export const getAllBusinessAreas = async (): Promise<BusinessArea[]> => {
    const result = await query('SELECT * FROM business_areas ORDER BY name ASC');
    return result.rows;
};
