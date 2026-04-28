import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool | null = null;

const getConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'dart_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function createPoolWithRetry(attempts = 5) {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const p = new Pool(getConfig());
      // Try a simple query to ensure connection works
      await p.query('SELECT 1');

      p.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        // don't exit the process here; surface errors to logs
      });

      return p;
    } catch (err) {
      lastErr = err;
      const backoff = Math.pow(2, i) * 1000;
      console.warn(`Postgres connect attempt ${i + 1} failed. Retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

export const getPool = async (): Promise<Pool> => {
  if (pool) return pool;
  pool = await createPoolWithRetry();
  return pool;
};

export const query = async (text: string, params?: any[]) => {
  const p = await getPool();
  return p.query(text, params);
};

export default { getPool, query };
