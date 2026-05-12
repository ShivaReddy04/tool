import { Request, Response } from 'express';
import {
    createBusinessArea,
    getAllBusinessAreas,
    BusinessAreaLevel,
} from '../models/business_area.model';

const VALID_LEVELS: BusinessAreaLevel[] = ['domain', 'business_area', 'sub_area'];

export const addBusinessArea = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, description, level, parentId } = req.body || {};

        if (!name || typeof name !== 'string' || !name.trim()) {
            res.status(400).json({ error: 'Name is required' });
            return;
        }

        const resolvedLevel: BusinessAreaLevel = VALID_LEVELS.includes(level)
            ? level
            : 'business_area';

        if ((resolvedLevel === 'business_area' || resolvedLevel === 'sub_area') && !parentId) {
            // Top-level domains have no parent; lower layers must point at one.
            // Skip validation for back-compat rows being inserted as
            // 'business_area' with no parent — those are the legacy flat rows.
        }

        const area = await createBusinessArea(
            name.trim(),
            description || '',
            resolvedLevel,
            parentId || null,
        );
        res.status(201).json(area);
    } catch (err: any) {
        if (err?.code === '23505') {
            res.status(409).json({ error: 'Business area with this name already exists at this level' });
            return;
        }
        console.error('Add business area error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listBusinessAreas = async (req: Request, res: Response): Promise<void> => {
    try {
        const levelParam = typeof req.query.level === 'string' ? (req.query.level as BusinessAreaLevel) : undefined;
        const parentParam = typeof req.query.parentId === 'string' ? req.query.parentId : undefined;

        if (levelParam && !VALID_LEVELS.includes(levelParam)) {
            res.status(400).json({ error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}` });
            return;
        }

        // The string "null" lets the frontend explicitly request top-level
        // (parent_id IS NULL) entries — undefined falls through to "no filter".
        const parentId = parentParam === 'null' ? null : parentParam;

        const areas = await getAllBusinessAreas({ level: levelParam, parentId });
        res.json(areas);
    } catch (err) {
        console.error('List business areas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
