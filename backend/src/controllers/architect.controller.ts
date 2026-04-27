import { Request, Response, NextFunction } from 'express';
import * as service from '../services/architect.service';

export const listTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await service.listTemplates();
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

export const getTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const payload = await service.getTemplateDetails(id);
    res.json(payload);
  } catch (err) {
    next(err);
  }
};

export const approveTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reviewerId = req.user!.userId;
    const updated = await service.approveTemplate(id, reviewerId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const rejectTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { comment } = req.body;
    const reviewerId = req.user!.userId;
    const updated = await service.rejectTemplate(id, reviewerId, comment);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const processTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const reviewerId = req.user!.userId;
    const updated = await service.processTemplate(id, reviewerId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};
