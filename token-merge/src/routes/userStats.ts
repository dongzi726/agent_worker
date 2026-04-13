// ============================================================
// userStats.ts — User stats & quota routes (iteration 3)
// ============================================================

import { Router } from 'express';
import { eq, and, sql, gte } from 'drizzle-orm';
import { db, usageLogs, users } from '../db/db';
import { requireAuth } from '../auth/middleware';

const router = Router();

// ============================================================
// GET /user/stats/overview — 用量总览
// ============================================================
router.get('/stats/overview', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const period = (req.query.period as string) || 'today';

  let start: Date;
  const now = new Date();
  switch (period) {
    case 'week':
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      break;
    default: // today
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
  }

  const logs = await db
    .select({
      total_calls: sql<number>`count(*)`.mapWith(Number),
      total_tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
      prompt_tokens: sql<number>`coalesce(sum(prompt_tokens), 0)`.mapWith(Number),
      completion_tokens: sql<number>`coalesce(sum(completion_tokens), 0)`.mapWith(Number),
      success_calls: sql<number>`count(*) filter (where status_code >= 200 and status_code < 400)`.mapWith(Number),
      error_calls: sql<number>`count(*) filter (where status_code >= 400)`.mapWith(Number),
      avg_latency: sql<number>`coalesce(avg(latency_ms), 0)`.mapWith(Number),
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, start)));

  const byModel = await db
    .select({
      model_id: usageLogs.modelId,
      calls: sql<number>`count(*)`.mapWith(Number),
      tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, start)))
    .groupBy(usageLogs.modelId);

  const stats = logs[0];
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      period,
      total_calls: stats.total_calls,
      total_tokens: stats.total_tokens,
      prompt_tokens: stats.prompt_tokens,
      completion_tokens: stats.completion_tokens,
      success_calls: stats.success_calls,
      error_calls: stats.error_calls,
      avg_latency_ms: Math.round(stats.avg_latency),
      by_model: byModel.map((m) => ({
        model_id: m.model_id,
        calls: m.calls,
        tokens: m.tokens,
      })),
    },
  });
});

// ============================================================
// GET /user/stats/trend — 用量趋势
// ============================================================
router.get('/stats/trend', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  const daily = await db
    .select({
      date: sql<string>`date(created_at)`.as('date'),
      calls: sql<number>`count(*)`.mapWith(Number),
      tokens: sql<number>`coalesce(sum(total_tokens), 0)`.mapWith(Number),
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, startDate)))
    .groupBy(sql`date(created_at)`)
    .orderBy(sql`date(created_at)`);

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      daily: daily.map((d) => ({
        date: d.date,
        calls: d.calls,
        tokens: d.tokens,
      })),
    },
  });
});

// ============================================================
// GET /user/quota — 配额查询
// ============================================================
router.get('/quota', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;

  const userRows = await db
    .select({
      quotaTokens: users.quotaTokens,
      usedTokens: users.usedTokens,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (userRows.length === 0) {
    return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found', data: null });
  }

  const u = userRows[0];
  const total = Number(u.quotaTokens);
  const used = Number(u.usedTokens);
  const remaining = Math.max(0, total - used);
  const usagePercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      total_tokens: total,
      used_tokens: used,
      remaining_tokens: remaining,
      usage_percent: usagePercent,
      history: [], // TODO: populate from quota_adjustments table when implemented
    },
  });
});

export default router;
