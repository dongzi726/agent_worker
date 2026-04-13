// ============================================================
// index.ts — Application entry point (v3: users, auth, API keys)
// ============================================================

import express from 'express';
import { loadConfig, resolveVendorKeys } from './config';
import { TokenPool } from './tokenPool';
import { KeyPool } from './keyPool';
import { createAdaptersFromVendors } from './adapters/factory';
import { ModelRouter } from './router';
import { ChatRoutes } from './routes/chat';
import { AdminRoutes } from './routes/admin';
import { SystemRoutes } from './routes/system';
import { KeyAdminRoutes } from './routes/keyAdmin';
import { log, setLogLevel } from './logger';

// Iteration 3: Auth, User API Key management, User stats
import { authRouter } from './routes/auth';
import userKeysRoutes from './routes/userKeys';
import userStatsRoutes from './routes/userStats';
import adminV2Routes from './routes/adminV2';
import { initDatabase, closeDatabase } from './db/pool';
import { initRedis, closeRedis } from './db/cache';

async function main() {
  // Load configuration (v1 or v2 format, auto-transformed to v2 internal)
  const config = loadConfig();
  setLogLevel(config.logLevel);
  log.info('Configuration loaded', {
    port: config.port,
    bindAddress: config.bindAddress,
    modelCount: config.models.length,
    vendorCount: config.vendors.length,
  });

  // === Iteration 3: Initialize DB and Redis ===
  await initDatabase();
  log.info('PostgreSQL connection established');

  const redisOk = await initRedis();
  log.info(`Redis ${redisOk ? 'connected' : 'unavailable (running without cache)'}`);

  // Initialize token pool
  const pool = new TokenPool(config.models);

  // Initialize KeyPools for each vendor
  const keyPools = new Map<string, KeyPool>();
  const statsWindowMs = config.keyStatsWindowHours * 60 * 60 * 1000;

  for (const vendor of config.vendors) {
    const resolvedKeys = resolveVendorKeys(vendor);
    if (resolvedKeys.length === 0) {
      log.warn(`Skipping vendor "${vendor.id}": no valid API keys resolved`);
      continue;
    }

    const keyPool = new KeyPool(
      vendor.id,
      vendor.key_routing_strategy,
      resolvedKeys,
      statsWindowMs
    );

    // Set API keys in the pool for runtime lookup
    for (const entry of resolvedKeys) {
      keyPool.setApiKey(entry.config.label, entry.apiKey);
    }

    keyPools.set(vendor.id, keyPool);
    log.info(`KeyPool created for vendor "${vendor.id}"`, {
      keyCount: resolvedKeys.length,
      strategy: vendor.key_routing_strategy,
    });
  }

  if (keyPools.size === 0) {
    log.error('No KeyPools created — check API key configuration');
    process.exit(1);
  }

  // Create model adapters (v2: get keys from vendor config)
  const adapters = createAdaptersFromVendors(config.vendors);
  if (adapters.size === 0) {
    log.error('No model adapters created — check model configuration');
    process.exit(1);
  }

  // Create model router with KeyPool integration
  const router = new ModelRouter(
    pool,
    adapters,
    keyPools,
    config.maxFallbackAttempts,
    config.totalRequestTimeoutMs
  );

  // Initialize route handlers
  const chatRoutes = new ChatRoutes(router, config.includeFallbackDetail);
  const adminRoutes = new AdminRoutes(pool, keyPools, config.vendors);
  const systemRoutes = new SystemRoutes(pool, keyPools);
  const keyAdminRoutes = new KeyAdminRoutes(keyPools);

  // Create Express app
  const app = express();

  // Global middleware
  app.use(express.json({ limit: '1mb' }));

  // Request logging middleware
  app.use((req, _res, next) => {
    log.info(`${req.method} ${req.path}`);
    next();
  });

  // === Iteration 3: Authentication routes ===
  app.use('/auth', authRouter);

  // === Iteration 3: User-facing API Key management ===
  app.use('/user', userKeysRoutes);

  // === Iteration 3: User-facing stats & quota ===
  app.use('/user', userStatsRoutes);

  // === Iteration 3: Admin management (users, keys, monitoring, system) ===
  app.use('/admin', adminV2Routes);

  // Register routes
  // User-facing chat APIs
  app.post('/v1/chat', (req, res) => chatRoutes.chat(req, res));
  app.post('/v1/chat/completions', (req, res) => chatRoutes.chatCompletions(req, res));

  // Admin management APIs
  app.get('/admin/quota', (req, res) => adminRoutes.getQuota(req, res));
  app.put('/admin/quota/:modelId', (req, res) => adminRoutes.adjustQuota(req, res));
  app.post('/admin/quota/:modelId/reset', (req, res) => adminRoutes.resetUsage(req, res));
  app.get('/admin/stats', (req, res) => adminRoutes.getStats(req, res));

  // Key management APIs (v2) — Vendor API keys
  app.get('/admin/vendor-keys', (req, res) => keyAdminRoutes.getAllKeys(req, res));
  app.get('/admin/vendor-keys/:vendorId/:keyId', (req, res) => keyAdminRoutes.getKeyDetail(req, res));
  app.put('/admin/vendor-keys/:vendorId/:keyId/status', (req, res) => keyAdminRoutes.updateKeyStatus(req, res));
  app.post('/admin/vendor-keys/:vendorId/:keyId/reset', (req, res) => keyAdminRoutes.resetKey(req, res));
  app.get('/admin/vendor-keys/stats', (req, res) => keyAdminRoutes.getKeyStats(req, res));

  // System APIs
  app.get('/health', (req, res) => systemRoutes.health(req, res));
  app.get('/ready', (req, res) => systemRoutes.ready(req, res));

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      code: 'INVALID_REQUEST',
      message: 'Endpoint not found',
      data: null,
    });
  });

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    });
  });

  // Start server
  const { port, bindAddress } = config;

  // Start periodic cleanup for all KeyPools (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    for (const [, keyPool] of keyPools) {
      keyPool.cleanupExpiredTimestamps();
    }
  }, 5 * 60 * 1000);

  // Don't prevent process exit
  cleanupInterval.unref();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    log.info('Shutting down gracefully...');
    clearInterval(cleanupInterval);
    await closeDatabase();
    await closeRedis();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log.info('Shutting down gracefully...');
    clearInterval(cleanupInterval);
    await closeDatabase();
    await closeRedis();
    process.exit(0);
  });

  app.listen(port, bindAddress, () => {
    log.info(`TokenMerge server started (v3)`, {
      address: `${bindAddress}:${port}`,
      vendors: Array.from(keyPools.keys()),
      models: config.models.map((m) => m.id),
      adaptersConfigured: adapters.size,
    });
  });
}

main().catch((err) => {
  log.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
