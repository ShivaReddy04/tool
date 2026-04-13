import { Request, Response } from 'express';
import { createBusinessArea, getAllBusinessAreas } from '../models/business_area.model';

export const addBusinessArea = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, description } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Name is required' });
            return;
        }
        const area = await createBusinessArea(name, description);
        res.status(201).json(area);
    } catch (err) {
        console.error('Add business area error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listBusinessAreas = async (req: Request, res: Response): Promise<void> => {
    try {
        const areas = await getAllBusinessAreas();
        res.json(areas);
    } catch (err) {
        console.error('List business areas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
