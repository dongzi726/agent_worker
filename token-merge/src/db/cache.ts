// ============================================================
// cache.ts — Redis cache client
// ============================================================

import Redis from 'ioredis';
import { log } from '../logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  return redisClient;
}

export async function initRedis(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || '';
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  if (!redisUrl && !redisHost) {
    log.warn('Redis not configured, running without cache');
    return false;
  }

  try {
    if (redisUrl) {
      redisClient = new Redis(redisUrl);
    } else {
      redisClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
        });
    }

    redisClient.on('error', (err) => {
      log.error('Redis error', { error: err.message });
    });

    await redisClient.ping();
    log.info('Redis connection established', { host: redisHost, port: redisPort });
    return true;
  } catch (err: any) {
    log.warn('Redis unavailable, running without cache', { error: err.message });
    redisClient = null;
    return false;
  }
}

export async function checkRedisHealth(): Promise<{ status: string; details: Record<string, any> }> {
  if (!redisClient) {
    return { status: 'unavailable', details: { error: 'Redis not configured' } };
  }
  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;
    const info = await redisClient.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    return {
      status: 'healthy',
      details: { latency_ms: latency, memory: memoryMatch ? memoryMatch[1].trim() : 'unknown' },
    };
  } catch (err: any) {
    return { status: 'unhealthy', details: { error: err.message } };
  }
}

// ============================================================
// Cache helpers
// ============================================================

const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet(key: string): Promise<string | null> {
  if (!redisClient) return null;
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttl = DEFAULT_TTL): Promise<boolean> {
  if (!redisClient) return false;
  try {
    await redisClient.setex(key, ttl, value);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDel(key: string): Promise<boolean> {
  if (!redisClient) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function cacheIncr(key: string, ttl = DEFAULT_TTL): Promise<number> {
  if (!redisClient) return 0;
  try {
    const val = await redisClient.incr(key);
    if (val === 1) {
      await redisClient.expire(key, ttl);
    }
    return val;
  } catch {
    return 0;
  }
}

export async function isBlacklisted(jti: string): Promise<boolean> {
  if (!redisClient) return false;
  try {
    const val = await redisClient.get(`session:${jti}`);
    return val === 'blacklisted';
  } catch {
    return false;
  }
}

export async function blacklistToken(jti: string, ttl = 86400): Promise<boolean> {
  if (!redisClient) return false;
  try {
    await redisClient.setex(`session:${jti}`, ttl, 'blacklisted');
    return true;
  } catch {
    return false;
  }
}

export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  if (!redisClient) return { allowed: true, remaining: limit };
  try {
    const current = await cacheIncr(key, windowSeconds);
    const remaining = Math.max(0, limit - current);
    return { allowed: current <= limit, remaining };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    log.info('Redis client closed');
  }
}
