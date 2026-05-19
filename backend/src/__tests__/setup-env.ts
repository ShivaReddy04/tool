// utils/jwt.ts now fails at module load if these aren't set. Provide dummies
// so importing controllers/routes inside tests doesn't blow up. Tests that
// actually verify token behavior re-use these constants.
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-do-not-use-in-prod';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-do-not-use-in-prod';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
