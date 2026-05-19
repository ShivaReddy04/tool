import { Request, Response } from 'express';
import { getAllUsers, updateUserRole, findArchitects } from '../models/user.model';
import { HttpError } from '../utils/httpError';
import { UserRole } from '../types';

const publicProfile = (u: any) => ({
  id: u.id,
  email: u.email,
  firstName: u.first_name,
  lastName: u.last_name,
  role: u.role,
  isActive: u.is_active,
  createdAt: u.created_at,
});

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await getAllUsers();
  res.json(users.map(publicProfile));
};

// Architect picker for the Submit-for-Review flow. Available to any
// authenticated user — only safe profile fields are returned.
export const listArchitects = async (req: Request, res: Response): Promise<void> => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const architects = await findArchitects(search);
  res.json(architects.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    role: u.role,
  })));
};

export const changeUserRole = async (req: Request, res: Response): Promise<void> => {
  const { role } = req.body as { role: UserRole };
  const user = await updateUserRole(req.params.id as string, role);
  if (!user) throw new HttpError(404, 'User not found');
  res.json(publicProfile(user));
};
