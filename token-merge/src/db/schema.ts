// ============================================================
// schema.ts — PostgreSQL schema for iteration 3 (users, auth, API keys, usage)
// ============================================================

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  smallint,
  bigint,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================
// users — 用户表
// ============================================================
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    username: varchar('username', { length: 30 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 16 }).notNull().default('user'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    quotaTokens: bigint('quota_tokens', { mode: 'number' }).notNull().default(0),
    usedTokens: bigint('used_tokens', { mode: 'number' }).notNull().default(0),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex('users_email_uq').on(t.email),
    usernameUq: uniqueIndex('users_username_uq').on(t.username),
    statusIdx: index('users_status_idx').on(t.status),
  })
);

// ============================================================
// user_api_keys — 用户 API Key 表
// ============================================================
export const userApiKeys = pgTable(
  'user_api_keys',
  {
    id: serial('id').primaryKey(),
    keyId: uuid('key_id').notNull().defaultRandom(),
    userId: integer('user_id').notNull().references(() => users.id),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
    label: varchar('label', { length: 50 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    quotaTokens: bigint('quota_tokens', { mode: 'number' }).notNull().default(0),
    usedTokens: bigint('used_tokens', { mode: 'number' }).notNull().default(0),
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    regeneratedAt: timestamp('regenerated_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    keyIdUq: uniqueIndex('uak_key_id_uq').on(t.keyId),
    keyHashUq: uniqueIndex('uak_key_hash_uq').on(t.keyHash),
    userIdIdx: index('uak_user_id_idx').on(t.userId),
    statusIdx: index('uak_status_idx').on(t.status),
  })
);

// ============================================================
// usage_logs — API 调用用量日志
// ============================================================
export const usageLogs = pgTable(
  'usage_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    keyId: uuid('key_id'),
    modelId: varchar('model_id', { length: 64 }).notNull(),
    statusCode: smallint('status_code').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index('ul_user_id_idx').on(t.userId),
    keyIdIdx: index('ul_key_id_idx').on(t.keyId),
    modelIdIdx: index('ul_model_id_idx').on(t.modelId),
    createdAtIdx: index('ul_created_at_idx').on(t.createdAt),
    userIdCreatedAtIdx: index('ul_user_created_idx').on(t.userId, t.createdAt),
  })
);
