import { Request, Response } from 'express';
import * as service from '../services/architect.service';

export const listTemplates = async (_req: Request, res: Response): Promise<void> => {
  res.json(await service.listTemplates());
};

export const getTemplate = async (req: Request, res: Response): Promise<void> => {
  res.json(await service.getTemplateDetails(req.params.id as string));
};

export const approveTemplate = async (req: Request, res: Response): Promise<void> => {
  res.json(await service.approveTemplate(req.params.id as string, req.user!.userId));
};

export const rejectTemplate = async (req: Request, res: Response): Promise<void> => {
  const { comment } = req.body as { comment?: string };
  res.json(await service.rejectTemplate(req.params.id as string, req.user!.userId, comment));
};

export const processTemplate = async (req: Request, res: Response): Promise<void> => {
  res.json(await service.processTemplate(req.params.id as string, req.user!.userId));
};
