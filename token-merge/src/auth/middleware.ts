// ============================================================
// middleware.ts — JWT & API Key authentication middleware
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { verifyToken as verifyAccessToken } from './jwt';
import { db, userApiKeys, users } from '../db/db';
import { eq, and, or, isNull, gt } from 'drizzle-orm';
import { createHash } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; email: string; role: string; status: string };
      apiKey?: { keyId: string; userId: number };
    }
  }
}

// ============================================================
// JWT authentication middleware (for /auth/*, /user/*, /admin/*)
// ============================================================
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ code: 'TOKEN_INVALID', message: 'Missing or invalid Authorization header', data: null });
    return;
  }

  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Token expired or invalid', data: null });
    return;
  }

  // Check user still exists and is active
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
    columns: { id: true, status: true, role: true },
  });

  if (!user) {
    res.status(401).json({ code: 'TOKEN_INVALID', message: 'User not found', data: null });
    return;
  }
  if (user.status === 'pending') {
    res.status(403).json({ code: 'ACCOUNT_PENDING', message: 'Account pending approval', data: null });
    return;
  }
  if (user.status === 'banned') {
    res.status(403).json({ code: 'ACCOUNT_BANNED', message: 'Account banned', data: null });
    return;
  }

  req.user = { userId: payload.userId, email: payload.email, role: user.role, status: user.status };
  next();
}

// ============================================================
// Admin role check middleware
// ============================================================
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ code: 'INSUFFICIENT_PERMISSION', message: 'Admin access required', data: null });
    return;
  }
  next();
}

// ============================================================
// API Key authentication middleware (for /v1/chat, /v1/chat/completions)
// ============================================================
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (!apiKeyHeader) {
    res.status(401).json({ code: 'API_KEY_MISSING', message: 'Missing X-API-Key header', data: null });
    return;
  }

  const keyHash = createHash('sha256').update(apiKeyHeader).digest('hex');

  const keyRecord = await db.query.userApiKeys.findFirst({
    where: and(
      eq(userApiKeys.keyHash, keyHash),
      or(
        isNull(userApiKeys.expiresAt),
        gt(userApiKeys.expiresAt, new Date())
      )
    ),
    columns: {
      id: true,
      userId: true,
      status: true,
      quotaTokens: true,
      usedTokens: true,
      keyId: true,
    },
  });

  if (!keyRecord) {
    res.status(401).json({ code: 'API_KEY_INVALID', message: 'API Key not found or expired', data: null });
    return;
  }
  if (keyRecord.status === 'disabled') {
    res.status(403).json({ code: 'API_KEY_DISABLED', message: 'API Key has been disabled', data: null });
    return;
  }
  if (keyRecord.status === 'pending') {
    res.status(403).json({ code: 'API_KEY_PENDING', message: 'API Key pending approval', data: null });
    return;
  }
  if (keyRecord.status === 'expired') {
    res.status(403).json({ code: 'API_KEY_EXPIRED', message: 'API Key has expired', data: null });
    return;
  }

  // Check quota
  if (keyRecord.quotaTokens > 0 && keyRecord.usedTokens >= keyRecord.quotaTokens) {
    res.status(429).json({ code: 'QUOTA_EXHAUSTED', message: 'Key quota exhausted', data: null });
    return;
  }

  req.apiKey = { keyId: keyRecord.keyId, userId: keyRecord.userId };
  next();
}
