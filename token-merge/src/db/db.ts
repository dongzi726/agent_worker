// ============================================================
// db.ts — PostgreSQL connection (Drizzle ORM) with schema
// ============================================================

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { users, userApiKeys, usageLogs } from './schema';

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'token_merge',
  max: Number(process.env.DB_POOL_SIZE) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, {
  schema: { users, userApiKeys, usageLogs },
});
export { pool };

// re-export schema for convenience
export * from './schema';
