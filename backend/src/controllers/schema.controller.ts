import { Request, Response } from 'express';
import { createSchema, getSchemasByClusterId, deleteSchema } from '../models/schema.model';
import { HttpError } from '../utils/httpError';

export const addSchema = async (req: Request, res: Response): Promise<void> => {
  const { name, clusterId } = req.body as { name: string; clusterId: string };
  const schema = await createSchema(name, clusterId);
  res.status(201).json(schema);
};

export const listSchemas = async (req: Request, res: Response): Promise<void> => {
  const schemas = await getSchemasByClusterId(req.params.clusterId as string);
  res.json(schemas);
};

export const removeSchema = async (req: Request, res: Response): Promise<void> => {
  const deleted = await deleteSchema(req.params.id as string);
  if (!deleted) throw new HttpError(404, 'Schema not found');
  res.status(204).send();
};
