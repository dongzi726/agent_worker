// ============================================================
// drizzle.config.ts — Drizzle ORM configuration
// ============================================================

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'tokenmerge',
    user: process.env.DB_USER || 'tokenmerge',
    password: process.env.DB_PASSWORD || 'tokenmerge',
  },
  strict: true,
  verbose: true,
});
