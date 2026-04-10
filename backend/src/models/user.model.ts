import { query } from '../config/db';
import { User, UserRole } from '../types';

export const findUserByEmail = async (email: string): Promise<User | null> => {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
};

export const findUserById = async (id: string): Promise<User | null> => {
  const result = await query('SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
};

export const createUser = async (
  email: string,
  passwordHash: string,
  firstName: string,
  lastName: string,
  role: UserRole = 'developer'
): Promise<User> => {
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at`,
    [email, passwordHash, firstName, lastName, role]
  );
  return result.rows[0];
};

export const getAllUsers = async (): Promise<User[]> => {
  const result = await query(
    'SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC'
  );
  return result.rows;
};

export const updateUserRole = async (id: string, role: UserRole): Promise<User | null> => {
  const result = await query(
    `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
     RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at`,
    [role, id]
  );
  return result.rows[0] || null;
};

export const saveRefreshToken = async (userId: string, tokenHash: string, expiresAt: Date): Promise<void> => {
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
};

export const findRefreshToken = async (tokenHash: string): Promise<any | null> => {
  const result = await query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP',
    [tokenHash]
  );
  return result.rows[0] || null;
};

export const deleteRefreshToken = async (tokenHash: string): Promise<void> => {
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
};

export const deleteAllUserRefreshTokens = async (userId: string): Promise<void> => {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
};
