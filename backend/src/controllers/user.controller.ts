import { Request, Response } from 'express';
import { getAllUsers, updateUserRole, findUserById, findArchitects } from '../models/user.model';
import { UserRole } from '../types';

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await getAllUsers();
    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        isActive: u.is_active,
        createdAt: u.created_at,
      }))
    );
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * List active architects, optionally filtered by a search term.
 * Used by developers in the Submit-for-Review flow to pick a reviewer.
 * Available to any authenticated user — selection cannot leak data
 * since only public profile fields are returned.
 */
export const listArchitects = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const architects = await findArchitects(search);
    res.json(
      architects.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
      }))
    );
  } catch (err) {
    console.error('List architects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changeUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;

    const validRoles: UserRole[] = ['developer', 'architect', 'admin', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: 'Valid role is required (developer, architect, admin, viewer)' });
      return;
    }

    const user = await updateUserRole(id, role);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
    });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
