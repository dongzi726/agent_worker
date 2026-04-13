// ============================================================
// jwt.ts — JWT token generation and verification
// ============================================================

import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '24h';
const REFRESH_EXPIRES_IN = '7d';

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(
    { ...payload, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

export function generateRefreshToken(userId: number): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign(
    { userId, jti, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN, algorithm: 'HS256' }
  );
  return { token, jti };
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateApiKey(): { keyValue: string; keyHash: string; keyPrefix: string } {
  const raw = `tm_sk_live_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const hash = require('crypto').createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 16);
  return { keyValue: raw, keyHash: hash, keyPrefix: prefix };
}
