// ============================================================
// db/pool.ts — PostgreSQL connection pool
// ============================================================

import { Pool, type PoolConfig } from 'pg';
import { log } from '../logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'tokenmerge',
      user: process.env.DB_USER || 'tokenmerge',
      password: process.env.DB_PASSWORD || 'tokenmerge',
      max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    pool = new Pool(config);

    pool.on('error', (err) => {
      log.error('Unexpected PostgreSQL pool error', { error: err.message });
    });

    log.info('PostgreSQL pool created', {
      host: config.host,
      port: config.port,
      database: config.database,
      maxConnections: config.max,
    });
  }

  return pool;
}

export async function initDatabase(): Promise<void> {
  const p = getPool();
  // Verify connection
  const client = await p.connect();
  try {
    const result = await client.query('SELECT NOW()');
    log.info('PostgreSQL connection verified', { serverTime: result.rows[0].now });
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info('PostgreSQL pool closed');
  }
}

// ============================================================
// db query helper (raw pg)
// ============================================================
export const db = {
  async query(text: string, values?: unknown[]) {
    return getPool().query(text, values);
  },
};
