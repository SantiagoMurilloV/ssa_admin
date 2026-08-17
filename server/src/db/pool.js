import pg from 'pg';
import { env } from '../config/env.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000
});

export const query = (text, params) => pool.query(text, params);

export const queryOne = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows[0] ?? null;
};
