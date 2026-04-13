// ============================================================
// adminV2.ts — Admin management routes (iteration 3: users, keys, monitoring)
// ============================================================

import { Router, type Request, type Response } from 'express';
import { eq, and, or, ilike, desc, count, sql, gte } from 'drizzle-orm';
import { db, users, userApiKeys, usageLogs } from '../db/db';
import { requireAuth, requireAdmin } from '../auth/middleware';
import { log } from '../logger';

const router = Router();

// ============================================================
// Helpers
// ============================================================

function paginateQuery(pageStr: unknown, limitStr: unknown, maxLimit = 100) {
  const page = Math.max(1, Number(pageStr) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(limitStr) || 20));
  return { offset: (page - 1) * limit, limit, page };
}

// ============================================================
// GET /admin/dashboard — Dashboard overview
// ============================================================
router.get('/dashboard', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [totalUsersRow] = await db.select({ count: count() }).from(users);
    const totalUsers = totalUsersRow.count;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers24hResult = await db
      .select({ count: sql<number>`count(distinct user_id)` })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, yesterday));
    const activeUsers24h = activeUsers24hResult[0]?.count ?? 0;

    const [totalKeysRow] = await db.select({ count: count() }).from(userApiKeys);
    const totalApiKeys = totalKeysRow.count;

    const [activeKeysRow] = await db.select({ count: count() }).from(userApiKeys).where(eq(userApiKeys.status, 'active'));
    const activeApiKeys = activeKeysRow.count;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStats = await db
      .select({
        total_calls: sql<number>`count(*)`.mapWith(Number),
        total_tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
        success_calls: sql<number>`count(*) filter (where status_code >= 200 and status_code < 400)`.mapWith(Number),
        error_calls: sql<number>`count(*) filter (where status_code >= 400)`.mapWith(Number),
        avg_latency: sql<number>`coalesce(avg(latency_ms), 0)`.mapWith(Number),
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, today));

    const stats = todayStats[0];
    const errorRate = stats.total_calls > 0 ? Math.round((stats.error_calls / stats.total_calls) * 1000) / 1000 : 0;

    res.json({
      code: 0,
      message: 'ok',
      data: {
        total_users: totalUsers,
        active_users_24h: activeUsers24h,
        total_api_keys: totalApiKeys,
        active_api_keys: activeApiKeys,
        today_api_calls: stats.total_calls,
        today_tokens: stats.total_tokens,
        avg_latency_ms: Math.round(stats.avg_latency),
        error_rate: errorRate,
      },
    });
  } catch (err: any) {
    log.error('Dashboard error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to load dashboard', data: null });
  }
});

// ============================================================
// GET /admin/users — User list
// ============================================================
router.get('/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, search, page: pageStr, limit: limitStr } = req.query;
    const { offset, limit, page } = paginateQuery(pageStr, limitStr);

    const conditions: any[] = [];
    if (status && typeof status === 'string') {
      conditions.push(eq(users.status, status));
    }
    if (search && typeof search === 'string') {
      conditions.push(or(ilike(users.email, `%${search}%`), ilike(users.username, `%${search}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ count: count() }).from(users).where(whereClause);

    const userList = await db.query.users.findMany({
      where: whereClause,
      orderBy: [desc(users.createdAt)],
      limit,
      offset,
      columns: { id: true, email: true, username: true, status: true, role: true, quotaTokens: true, usedTokens: true, createdAt: true },
    });

    const userIds = userList.map((u) => u.id);
    const keyCounts = userIds.length > 0
      ? await db.select({ userId: userApiKeys.userId, count: count() }).from(userApiKeys).where(sql`${userApiKeys.userId} = any(${userIds})`).groupBy(userApiKeys.userId)
      : [];
    const keyCountMap = new Map(keyCounts.map((kc) => [kc.userId, Number(kc.count)]));

    res.json({
      code: 0,
      message: 'ok',
      data: {
        total: totalRow.count,
        page,
        limit,
        users: userList.map((u) => ({
          user_id: u.id,
          email: u.email,
          username: u.username,
          status: u.status,
          role: u.role,
          quota_tokens: Number(u.quotaTokens),
          used_tokens: Number(u.usedTokens),
          key_count: keyCountMap.get(u.id) ?? 0,
          created_at: u.createdAt,
        })),
      },
    });
  } catch (err: any) {
    log.error('Admin users list error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to list users', data: null });
  }
});

// ============================================================
// GET /admin/users/:userId — User detail
// ============================================================
router.get('/users/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      res.status(400).json({ code: 'INVALID_REQUEST', message: 'Invalid user ID', data: null });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found', data: null });
      return;
    }

    const [keyCountRow] = await db.select({ count: count() }).from(userApiKeys).where(eq(userApiKeys.userId, userId));
    const [usageRow] = await db
      .select({
        total_calls: sql<number>`count(*)`.mapWith(Number),
        total_tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
      })
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId));

    res.json({
      code: 0,
      message: 'ok',
      data: {
        user_id: user.id,
        email: user.email,
        username: user.username,
        status: user.status,
        role: user.role,
        quota_tokens: Number(user.quotaTokens),
        used_tokens: Number(user.usedTokens),
        key_count: keyCountRow.count,
        total_api_calls: usageRow.total_calls,
        total_api_tokens: usageRow.total_tokens,
        created_at: user.createdAt,
        last_login_at: user.lastLoginAt,
      },
    });
  } catch (err: any) {
    log.error('Admin user detail error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get user detail', data: null });
  }
});

// ============================================================
// PUT /admin/users/:userId/status — Review/change user status
// ============================================================
router.put('/users/:userId/status', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const { status, reason } = req.body as { status?: string; reason?: string };

    if (!status || !['active', 'banned'].includes(status)) {
      res.status(400).json({ code: 'INVALID_STATUS', message: 'Status must be "active" or "banned"', data: null });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found', data: null });
      return;
    }

    await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
    log.info('Admin updated user status', { userId, status, reason });
    res.json({ code: 0, message: 'ok', data: { user_id: userId, status } });
  } catch (err: any) {
    log.error('Admin update user status error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to update user status', data: null });
  }
});

// ============================================================
// PUT /admin/users/:userId/quota — Adjust user quota
// ============================================================
router.put('/users/:userId/quota', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    const { quota_tokens, reason } = req.body as { quota_tokens?: number; reason?: string };

    if (typeof quota_tokens !== 'number' || quota_tokens < 0) {
      res.status(400).json({ code: 'INVALID_QUOTA', message: 'quota_tokens must be a non-negative number', data: null });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found', data: null });
      return;
    }

    await db.update(users).set({ quotaTokens: quota_tokens, updatedAt: new Date() }).where(eq(users.id, userId));
    log.info('Admin adjusted user quota', { userId, quota_tokens, reason });
    res.json({ code: 0, message: 'ok', data: { user_id: userId, quota_tokens, previous_quota: Number(user.quotaTokens) } });
  } catch (err: any) {
    log.error('Admin adjust user quota error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to adjust quota', data: null });
  }
});

// ============================================================
// GET /admin/keys — Global user API key list
// ============================================================
router.get('/keys', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, user_id: userIdStr, search, page: pageStr, limit: limitStr } = req.query;
    const { offset, limit, page } = paginateQuery(pageStr, limitStr);

    const conditions: any[] = [];
    if (status && typeof status === 'string') conditions.push(eq(userApiKeys.status, status));
    if (userIdStr) conditions.push(eq(userApiKeys.userId, Number(userIdStr)));
    if (search && typeof search === 'string') conditions.push(or(ilike(userApiKeys.keyPrefix, `%${search}%`), ilike(userApiKeys.label, `%${search}%`)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRow] = await db.select({ count: count() }).from(userApiKeys).where(whereClause);

    const keys = await db.query.userApiKeys.findMany({
      where: whereClause,
      orderBy: [desc(userApiKeys.createdAt)],
      limit,
      offset,
      columns: { keyId: true, userId: true, keyPrefix: true, label: true, status: true, quotaTokens: true, usedTokens: true, expiresAt: true, lastUsedAt: true, createdAt: true },
    });

    res.json({
      code: 0,
      message: 'ok',
      data: {
        total: totalRow.count,
        page,
        limit,
        keys: keys.map((k) => ({
          key_id: k.keyId,
          user_id: k.userId,
          key_prefix: k.keyPrefix,
          label: k.label,
          status: k.status,
          quota_tokens: Number(k.quotaTokens),
          used_tokens: Number(k.usedTokens),
          remaining_tokens: Math.max(0, Number(k.quotaTokens) - Number(k.usedTokens)),
          expires_at: k.expiresAt,
          last_used_at: k.lastUsedAt,
          created_at: k.createdAt,
        })),
      },
    });
  } catch (err: any) {
    log.error('Admin keys list error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to list keys', data: null });
  }
});

// ============================================================
// PUT /admin/keys/:keyId/approve — Approve/reject API Key
// ============================================================
router.put('/keys/:keyId/approve', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const keyId = req.params.keyId as string;
    const { approved, quota_tokens, reject_reason } = req.body as { approved?: boolean; quota_tokens?: number; reject_reason?: string };

    if (typeof approved !== 'boolean') {
      res.status(400).json({ code: 'INVALID_REQUEST', message: 'approved is required (boolean)', data: null });
      return;
    }

    const key = await db.query.userApiKeys.findFirst({ where: eq(userApiKeys.keyId, keyId) });
    if (!key) {
      res.status(404).json({ code: 'KEY_NOT_FOUND', message: 'Key not found', data: null });
      return;
    }

    if (approved) {
      await db.update(userApiKeys).set({ status: 'active', quotaTokens: typeof quota_tokens === 'number' ? quota_tokens : key.quotaTokens, updatedAt: new Date() }).where(eq(userApiKeys.keyId, keyId));
    } else {
      await db.update(userApiKeys).set({ status: 'disabled', updatedAt: new Date() }).where(eq(userApiKeys.keyId, keyId));
    }

    log.info('Admin approved/rejected key', { keyId, approved, quota_tokens, reject_reason });
    res.json({ code: 0, message: 'ok', data: { key_id: keyId, status: approved ? 'active' : 'disabled' } });
  } catch (err: any) {
    log.error('Admin approve key error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to approve key', data: null });
  }
});

// ============================================================
// PUT /admin/keys/:keyId/status — Admin manage any key status
// ============================================================
router.put('/keys/:keyId/status', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const keyId = req.params.keyId as string;
    const { status } = req.body as { status?: string };

    if (!status || !['active', 'disabled'].includes(status)) {
      res.status(400).json({ code: 'INVALID_STATUS', message: 'Status must be "active" or "disabled"', data: null });
      return;
    }

    const key = await db.query.userApiKeys.findFirst({ where: eq(userApiKeys.keyId, keyId) });
    if (!key) {
      res.status(404).json({ code: 'KEY_NOT_FOUND', message: 'Key not found', data: null });
      return;
    }

    await db.update(userApiKeys).set({ status, updatedAt: new Date() }).where(eq(userApiKeys.keyId, keyId));
    log.info('Admin updated key status', { keyId, status });
    res.json({ code: 0, message: 'ok', data: { key_id: keyId, status } });
  } catch (err: any) {
    log.error('Admin update key status error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to update key status', data: null });
  }
});

// ============================================================
// GET /admin/monitoring/requests — API request monitoring
// ============================================================
router.get('/monitoring/requests', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const resolution = (req.query.resolution as string) || 'hour';
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const timeBucket = resolution === 'minute'
      ? sql<string>`date_trunc('minute', created_at)`
      : sql<string>`date_trunc('hour', created_at)`;

    const points = await db
      .select({
        time: timeBucket.as('time'),
        total_requests: sql<number>`count(*)`.mapWith(Number),
        success_requests: sql<number>`count(*) filter (where status_code >= 200 and status_code < 400)`.mapWith(Number),
        error_requests: sql<number>`count(*) filter (where status_code >= 400)`.mapWith(Number),
        avg_latency_ms: sql<number>`coalesce(avg(latency_ms), 0)`.mapWith(Number),
        p50_latency_ms: sql<number>`percentile_cont(0.5) within group (order by latency_ms)`.mapWith(Number),
        p95_latency_ms: sql<number>`percentile_cont(0.95) within group (order by latency_ms)`.mapWith(Number),
        p99_latency_ms: sql<number>`percentile_cont(0.99) within group (order by latency_ms)`.mapWith(Number),
        total_tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, startDate))
      .groupBy(timeBucket)
      .orderBy(timeBucket);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        resolution,
        points: points.map((p) => ({
          time: p.time,
          total_requests: p.total_requests,
          success_requests: p.success_requests,
          error_requests: p.error_requests,
          avg_latency_ms: Math.round(p.avg_latency_ms),
          p50_latency_ms: Math.round(p.p50_latency_ms),
          p95_latency_ms: Math.round(p.p95_latency_ms),
          p99_latency_ms: Math.round(p.p99_latency_ms),
          total_tokens: p.total_tokens,
        })),
      },
    });
  } catch (err: any) {
    log.error('Monitoring requests error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get monitoring data', data: null });
  }
});

// ============================================================
// GET /admin/monitoring/models — Model call distribution
// ============================================================
router.get('/monitoring/models', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const modelStats = await db
      .select({
        model_id: usageLogs.modelId,
        calls: sql<number>`count(*)`.mapWith(Number),
        avg_latency_ms: sql<number>`coalesce(avg(latency_ms), 0)`.mapWith(Number),
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, startDate))
      .groupBy(usageLogs.modelId)
      .orderBy(sql`count(*) desc`);

    const totalCalls = modelStats.reduce((sum, m) => sum + m.calls, 0);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        models: modelStats.map((m) => ({
          model_id: m.model_id,
          calls: m.calls,
          percent: totalCalls > 0 ? Math.round((m.calls / totalCalls) * 1000) / 10 : 0,
          avg_latency_ms: Math.round(m.avg_latency_ms),
        })),
      },
    });
  } catch (err: any) {
    log.error('Monitoring models error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get model stats', data: null });
  }
});

// ============================================================
// GET /admin/monitoring/top-users — Top users by usage
// ============================================================
router.get('/monitoring/top-users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const topUsers = await db
      .select({
        userId: usageLogs.userId,
        calls: sql<number>`count(*)`.mapWith(Number),
        tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, startDate))
      .groupBy(usageLogs.userId)
      .orderBy(sql`count(*) desc`)
      .limit(limit);

    const userIds = topUsers.map((u) => u.userId);
    const userDetails = userIds.length > 0
      ? await db.query.users.findMany({ where: sql`${users.id} = any(${userIds})`, columns: { id: true, email: true, username: true } })
      : [];
    const userMap = new Map(userDetails.map((u) => [u.id, u]));

    res.json({
      code: 0,
      message: 'ok',
      data: {
        period_hours: hours,
        users: topUsers.map((u) => {
          const info = userMap.get(u.userId);
          return { user_id: u.userId, email: info?.email ?? 'unknown', username: info?.username ?? 'unknown', calls: u.calls, tokens: u.tokens };
        }),
      },
    });
  } catch (err: any) {
    log.error('Monitoring top users error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get top users', data: null });
  }
});

// ============================================================
// GET /admin/monitoring/top-keys — Top API keys by usage
// ============================================================
router.get('/monitoring/top-keys', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const topKeys = await db
      .select({
        keyId: usageLogs.keyId,
        calls: sql<number>`count(*)`.mapWith(Number),
        tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, startDate))
      .groupBy(usageLogs.keyId)
      .orderBy(sql`count(*) desc`)
      .limit(limit);

    const keyIds = topKeys.map((k) => k.keyId).filter(Boolean) as string[];
    const keyDetails = keyIds.length > 0
      ? await db.query.userApiKeys.findMany({ where: sql`${userApiKeys.keyId} = any(${keyIds})`, columns: { keyId: true, keyPrefix: true, label: true, userId: true } })
      : [];
    const keyMap = new Map(keyDetails.map((k) => [k.keyId, k]));

    res.json({
      code: 0,
      message: 'ok',
      data: {
        period_hours: hours,
        keys: topKeys.map((k) => {
          const info = keyMap.get(k.keyId as string);
          return { key_id: k.keyId, key_prefix: info?.keyPrefix ?? 'unknown', label: info?.label ?? 'unknown', user_id: info?.userId, calls: k.calls, tokens: k.tokens };
        }),
      },
    });
  } catch (err: any) {
    log.error('Monitoring top keys error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get top keys', data: null });
  }
});

// ============================================================
// GET /admin/monitoring/errors — Recent errors
// ============================================================
router.get('/monitoring/errors', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const errors = await db
      .select({
        id: usageLogs.id,
        userId: usageLogs.userId,
        keyId: usageLogs.keyId,
        modelId: usageLogs.modelId,
        statusCode: usageLogs.statusCode,
        errorMessage: usageLogs.errorMessage,
        latencyMs: usageLogs.latencyMs,
        createdAt: usageLogs.createdAt,
      })
      .from(usageLogs)
      .where(and(gte(usageLogs.createdAt, startDate), sql`status_code >= 400`))
      .orderBy(desc(usageLogs.createdAt))
      .limit(limit);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        period_hours: hours,
        total_errors: errors.length,
        errors: errors.map((e) => ({
          id: e.id,
          user_id: e.userId,
          key_id: e.keyId,
          model_id: e.modelId,
          status_code: e.statusCode,
          error_message: e.errorMessage,
          latency_ms: e.latencyMs,
          created_at: e.createdAt,
        })),
      },
    });
  } catch (err: any) {
    log.error('Monitoring errors error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get error logs', data: null });
  }
});

// ============================================================
// GET /admin/system — System status
// ============================================================
router.get('/system', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getPool } = await import('../db/pool');
    const { getRedis } = await import('../db/cache');

    let dbStatus = 'unknown';
    let poolSize = 0;
    let activeConnections = 0;
    try {
      const pool = getPool();
      poolSize = pool.options.max ?? 10;
      activeConnections = pool.totalCount;
      dbStatus = 'healthy';
    } catch {
      dbStatus = 'unhealthy';
    }

    let redisStatus = 'unknown';
    let redisMemoryUsed = 0;
    try {
      const redis = getRedis();
      if (redis) {
        const info = await redis.info('memory');
        const memMatch = info.match(/used_memory_human:(.+)/);
        redisMemoryUsed = memMatch ? parseFloat(memMatch[1].trim()) : 0;
        redisStatus = 'healthy';
      } else {
        redisStatus = 'unavailable';
      }
    } catch {
      redisStatus = 'unhealthy';
    }

    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        version: 'v3.0.0',
        uptime_seconds: Math.round(process.uptime()),
        node_version: process.version,
        services: {
          database: { status: dbStatus, pool_size: poolSize, active_connections: activeConnections },
          redis: { status: redisStatus, memory_used_mb: redisMemoryUsed },
          backend: { status: 'healthy', memory_heap_mb: heapUsedMb },
        },
      },
    });
  } catch (err: any) {
    log.error('Admin system status error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get system status', data: null });
  }
});

export default router;
