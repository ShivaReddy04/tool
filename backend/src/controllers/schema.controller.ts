import { Request, Response } from 'express';
import { createSchema, getSchemasByClusterId, deleteSchema } from '../models/schema.model';

export const addSchema = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, clusterId } = req.body;
        if (!name || !clusterId) {
            res.status(400).json({ error: 'Name and clusterId are required' });
            return;
        }
        const schema = await createSchema(name, clusterId);
        res.status(201).json(schema);
    } catch (err) {
        console.error('Add schema error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listSchemas = async (req: Request, res: Response): Promise<void> => {
    try {
        const clusterId = req.params.clusterId as string;
        if (!clusterId) {
            res.status(400).json({ error: 'Cluster ID is required' });
            return;
        }
        const schemas = await getSchemasByClusterId(clusterId);
        res.json(schemas);
    } catch (err) {
        console.error('List schemas error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const removeSchema = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const deleted = await deleteSchema(id);
        if (!deleted) {
            res.status(404).json({ error: 'Schema not found' });
            return;
        }
        res.status(204).send();
    } catch (err) {
        console.error('Delete schema error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
