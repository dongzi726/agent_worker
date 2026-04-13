// ============================================================
// auth.ts — Authentication routes (register, login, refresh, logout)
// ============================================================

import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getPool } from '../db/pool';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../auth/jwt';
import { blacklistToken } from '../db/cache';
import { checkRateLimit } from '../db/cache';
import { log } from '../logger';

const SALT_ROUNDS = 10;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;

function validatePassword(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password } = req.body as { email?: string; username?: string; password?: string };

    if (!email || !EMAIL_REGEX.test(email)) {
      res.status(400).json({ code: 'INVALID_EMAIL', message: 'Invalid email format', data: null });
      return;
    }

    if (!username || !USERNAME_REGEX.test(username)) {
      res.status(400).json({ code: 'INVALID_USERNAME', message: 'Username must be 3-30 chars, alphanumeric + underscore', data: null });
      return;
    }

    if (!password || !validatePassword(password)) {
      res.status(400).json({ code: 'WEAK_PASSWORD', message: 'Password must be at least 8 chars with uppercase, lowercase, and number', data: null });
      return;
    }

    // Check rate limit
    const { allowed } = await checkRateLimit(`ratelimit:register:${req.ip}`, 5, 3600);
    if (!allowed) {
      res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many registration attempts', data: null });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await getPool().query(
      `INSERT INTO users (email, username, password_hash, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, email, username, status, created_at`,
      [email.toLowerCase(), username, passwordHash]
    );

    const user = rows[0];
    log.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({
      code: 0,
      message: 'ok',
      data: {
        user_id: user.id,
        email: user.email,
        username: user.username,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    if (err.code === '23505') { // unique_violation
      if (err.constraint?.includes('email')) {
        res.status(409).json({ code: 'EMAIL_EXISTS', message: 'Email already registered', data: null });
        return;
      }
      if (err.constraint?.includes('username')) {
        res.status(409).json({ code: 'USERNAME_EXISTS', message: 'Username already taken', data: null });
        return;
      }
    }
    log.error('Registration error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Registration failed', data: null });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password } = req.body as { email?: string; username?: string; password?: string };

    if (!password) {
      res.status(400).json({ code: 'INVALID_REQUEST', message: 'Password is required', data: null });
      return;
    }

    const identifier = email || username;
    if (!identifier) {
      res.status(400).json({ code: 'INVALID_REQUEST', message: 'Email or username is required', data: null });
      return;
    }

    // Rate limit login
    const { allowed } = await checkRateLimit(`ratelimit:login:${req.ip}`, 10, 900);
    if (!allowed) {
      res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many login attempts', data: null });
      return;
    }

    const { rows } = await getPool().query(
      `SELECT id, email, username, password_hash, status, role, quota_tokens, used_tokens
       FROM users WHERE email = $1 OR username = $1`,
      [identifier.toLowerCase()]
    );

    if (rows.length === 0) {
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email/username or password', data: null });
      return;
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email/username or password', data: null });
      return;
    }

    if (user.status === 'pending') {
      res.status(403).json({ code: 'ACCOUNT_PENDING', message: 'Account pending approval', data: null });
      return;
    }

    if (user.status === 'banned') {
      res.status(403).json({ code: 'ACCOUNT_BANNED', message: 'Account has been banned', data: null });
      return;
    }

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      jti: `${user.id}-${Date.now()}`,
    });

    const { token: refreshToken } = generateRefreshToken(user.id);

    // Store refresh token hash in DB
    const crypto = require('crypto');
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await getPool().query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshHash]
    );

    log.info('User logged in', { userId: user.id });

    res.json({
      code: 0,
      message: 'ok',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 86400,
        user: {
          user_id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
          quota_tokens: user.quota_tokens,
        },
      },
    });
  } catch (err: any) {
    log.error('Login error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Login failed', data: null });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refresh_token } = req.body as { refresh_token?: string };
    if (!refresh_token) {
      res.status(400).json({ code: 'INVALID_REQUEST', message: 'Refresh token is required', data: null });
      return;
    }

    const payload = verifyToken(refresh_token);
    if (!payload) {
      res.status(401).json({ code: 'TOKEN_INVALID', message: 'Invalid refresh token', data: null });
      return;
    }

    const crypto = require('crypto');
    const refreshHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

    const { rows } = await getPool().query(
      `SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()`,
      [refreshHash]
    );

    if (rows.length === 0) {
      res.status(401).json({ code: 'TOKEN_INVALID', message: 'Refresh token expired or revoked', data: null });
      return;
    }

    // Get user info
    const { rows: userRows } = await getPool().query(
      `SELECT id, email, role, status FROM users WHERE id = $1`,
      [rows[0].user_id]
    );

    if (userRows.length === 0 || userRows[0].status !== 'active') {
      res.status(403).json({ code: 'ACCOUNT_BANNED', message: 'Account not active', data: null });
      return;
    }

    const user = userRows[0];
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      jti: `${user.id}-${Date.now()}`,
    });

    const { token: newRefreshToken } = generateRefreshToken(user.id);
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    // Delete old refresh token, create new one
    await getPool().query(`DELETE FROM refresh_tokens WHERE id = $1`, [rows[0].id]);
    await getPool().query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newRefreshHash]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 86400,
      },
    });
  } catch (err: any) {
    log.error('Token refresh error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Token refresh failed', data: null });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);
      if (payload && payload.jti) {
        await blacklistToken(payload.jti, 86400);
      }
    }

    // Also delete refresh token if provided
    const { refresh_token } = req.body as { refresh_token?: string };
    if (refresh_token) {
      const crypto = require('crypto');
      const refreshHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
      await getPool().query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [refreshHash]);
    }

    res.json({ code: 0, message: 'ok', data: null });
  } catch (err: any) {
    log.error('Logout error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Logout failed', data: null });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { rows } = await getPool().query(
      `SELECT id, email, username, status, role, quota_tokens, used_tokens, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found', data: null });
      return;
    }

    const user = rows[0];
    res.json({
      code: 0,
      message: 'ok',
      data: {
        user_id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        quota_tokens: user.quota_tokens,
        used_tokens: user.used_tokens,
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    log.error('Get me error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to get user info', data: null });
  }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { old_password, new_password } = req.body as { old_password?: string; new_password?: string };
    if (!old_password || !new_password) {
      res.status(400).json({ code: 'INVALID_REQUEST', message: 'Old and new password required', data: null });
      return;
    }

    if (!validatePassword(new_password)) {
      res.status(400).json({ code: 'WEAK_PASSWORD', message: 'Password must be at least 8 chars with uppercase, lowercase, and number', data: null });
      return;
    }

    const { rows } = await getPool().query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.user!.userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found', data: null });
      return;
    }

    const valid = await bcrypt.compare(old_password, rows[0].password_hash);
    if (!valid) {
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Old password is incorrect', data: null });
      return;
    }

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await getPool().query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, req.user!.userId]);

    // Invalidate all refresh tokens
    await getPool().query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [req.user!.userId]);

    res.json({ code: 0, message: 'Password changed successfully', data: null });
  } catch (err: any) {
    log.error('Change password error', { error: err.message });
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to change password', data: null });
  }
}

// Express router for all auth routes
import { Router } from 'express';
const authRouter = Router();
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', getMe);
authRouter.put('/password', changePassword);
export { authRouter };
