// ============================================================
// userKeys.ts — User API Key management routes (iteration 3)
// ============================================================

import { Router } from 'express';
import { eq, and, desc, count } from 'drizzle-orm';
import { db, userApiKeys } from '../db/db';
import { requireAuth } from '../auth/middleware';
import { createHash, randomBytes } from 'node:crypto';

const router = Router();

// ============================================================
// Helpers
// ============================================================
function generateKeyValue(): string {
  return `tm_sk_live_${randomBytes(24).toString('base64url')}`;
}

function getKeyPrefix(value: string): string {
  return value.slice(0, 16);
}

function paginate(page: number, limit: number) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  return { offset: (p - 1) * l, limit: l };
}

// ============================================================
// POST /user/keys — 申请 API Key
// ============================================================
router.post('/keys', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const { label, quota_tokens, expires_in_days } = req.body;

  if (!label || typeof label !== 'string' || label.length < 1 || label.length > 50) {
    return res.status(400).json({ code: 'INVALID_LABEL', message: 'Label must be 1-50 characters', data: null });
  }

  const keyValue = generateKeyValue();
  const keyHash = createHash('sha256').update(keyValue).digest('hex');
  const keyPrefix = getKeyPrefix(keyValue);

  const expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86_400_000) : null;

  const [newKey] = await db
    .insert(userApiKeys)
    .values({
      userId,
      keyHash,
      keyPrefix,
      label,
      status: 'pending',
      quotaTokens: quota_tokens ?? 0,
      expiresAt,
    })
    .returning();

  return res.status(201).json({
    code: 0,
    message: 'ok',
    data: {
      key_id: newKey.keyId,
      key_value: keyValue,
      label: newKey.label,
      status: newKey.status,
      quota_tokens: Number(newKey.quotaTokens),
      expires_at: newKey.expiresAt,
      created_at: newKey.createdAt,
    },
  });
});

// ============================================================
// GET /user/keys — 查看自己的 Key 列表
// ============================================================
router.get('/keys', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const { status, page: pageStr, limit: limitStr } = req.query;

  const { offset, limit } = paginate(Number(pageStr) || 1, Number(limitStr) || 20);

  const whereConditions = [eq(userApiKeys.userId, userId)];
  if (status && typeof status === 'string') {
    whereConditions.push(eq(userApiKeys.status, status));
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(userApiKeys)
    .where(and(...whereConditions));

  const keys = await db.query.userApiKeys.findMany({
    where: and(...whereConditions),
    orderBy: [desc(userApiKeys.createdAt)],
    limit,
    offset,
    columns: {
      keyId: true,
      keyPrefix: true,
      label: true,
      status: true,
      quotaTokens: true,
      usedTokens: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      total: totalResult.count,
      page: Math.floor(offset / limit) + 1,
      limit,
      keys: keys.map((k) => ({
        key_id: k.keyId,
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
});

// ============================================================
// GET /user/keys/:keyId — 查看 Key 详情
// ============================================================
router.get('/keys/:keyId', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const keyId = req.params.keyId as string;

  const key = await db.query.userApiKeys.findFirst({
    where: and(eq(userApiKeys.keyId, keyId), eq(userApiKeys.userId, userId)),
  });

  if (!key) {
    return res.status(404).json({ code: 'KEY_NOT_FOUND', message: 'Key not found', data: null });
  }

  // Simple stats (would be better from Redis in production)
  const stats = { today_calls: 0, today_tokens: 0, total_calls: 0, total_tokens: Number(key.usedTokens) };

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      key_id: key.keyId,
      key_prefix: key.keyPrefix,
      label: key.label,
      status: key.status,
      quota_tokens: Number(key.quotaTokens),
      used_tokens: Number(key.usedTokens),
      remaining_tokens: Math.max(0, Number(key.quotaTokens) - Number(key.usedTokens)),
      expires_at: key.expiresAt,
      last_used_at: key.lastUsedAt,
      created_at: key.createdAt,
      stats,
    },
  });
});

// ============================================================
// PUT /user/keys/:keyId/status — 禁用/启用自己的 Key
// ============================================================
router.put('/keys/:keyId/status', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const keyId = req.params.keyId as string;
  const { status } = req.body;

  if (status !== 'active' && status !== 'disabled') {
    return res.status(400).json({ code: 'INVALID_STATUS', message: 'Status must be "active" or "disabled"', data: null });
  }

  const key = await db.query.userApiKeys.findFirst({
    where: and(eq(userApiKeys.keyId, keyId), eq(userApiKeys.userId, userId)),
  });

  if (!key) {
    return res.status(404).json({ code: 'KEY_NOT_FOUND', message: 'Key not found', data: null });
  }

  if (key.status === 'pending') {
    return res.status(400).json({ code: 'INVALID_OPERATION', message: 'Cannot change status of pending key', data: null });
  }

  await db.update(userApiKeys)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(userApiKeys.keyId, keyId), eq(userApiKeys.userId, userId)));

  return res.json({ code: 0, message: 'ok', data: { key_id: keyId, status } });
});

// ============================================================
// POST /user/keys/:keyId/regenerate — 重新生成 Key
// ============================================================
router.post('/keys/:keyId/regenerate', requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const keyId = req.params.keyId as string;

  const key = await db.query.userApiKeys.findFirst({
    where: and(eq(userApiKeys.keyId, keyId), eq(userApiKeys.userId, userId)),
  });

  if (!key) {
    return res.status(404).json({ code: 'KEY_NOT_FOUND', message: 'Key not found', data: null });
  }

  const newKeyValue = generateKeyValue();
  const newKeyHash = createHash('sha256').update(newKeyValue).digest('hex');
  const newKeyPrefix = getKeyPrefix(newKeyValue);

  await db.update(userApiKeys)
    .set({
      keyHash: newKeyHash,
      keyPrefix: newKeyPrefix,
      regeneratedAt: new Date(),
      updatedAt: new Date(),
      status: 'pending', // requires re-approval
    })
    .where(and(eq(userApiKeys.keyId, keyId), eq(userApiKeys.userId, userId)));

  return res.json({
    code: 0,
    message: 'ok',
    data: {
      key_id: keyId,
      key_value: newKeyValue,
      label: key.label,
      status: 'pending',
      regenerated_at: new Date(),
    },
  });
});

export default router;
