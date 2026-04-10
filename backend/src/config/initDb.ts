import { query } from './db';

export const initializeDatabase = async (): Promise<void> => {
  try {
    // Tables are managed by node-pg-migrate (see migrations/ folder).
    // Run: npm run migrate:up
    // This function only verifies the database connection is working.
    await query('SELECT 1');
    console.log('Database connection verified');
  } catch (err) {
    console.error('Failed to connect to database:', err);
    throw err;
  }
};
