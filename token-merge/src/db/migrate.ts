// ============================================================
// db/migrate.ts — Simple migration runner
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPool } from './pool';
import { log } from '../logger';

/** Create migration tracking table if not exists */
async function ensureMigrationTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
}

/** Get list of already applied migrations */
async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY id'
  );
  return new Set(result.rows.map((r) => r.filename));
}

/** Run pending migrations */
export async function runMigrations(migrationsDir?: string): Promise<number> {
  const dir = migrationsDir || path.join(__dirname, '..', 'migrations');
  await ensureMigrationTable();

  const applied = await getAppliedMigrations();

  // Read all .sql files in the migrations directory
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  const pool = getPool();

  for (const file of files) {
    if (applied.has(file)) {
      log.debug(`Migration already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    log.info(`Applying migration: ${file}`);

    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      log.info(`Migration applied: ${file}`);
      count++;
    } catch (err) {
      await pool.query('ROLLBACK');
      log.error(`Migration failed: ${file}`, { error: err });
      throw err;
    }
  }

  log.info(`Migrations complete. Applied ${count} new migration(s).`);
  return count;
}
