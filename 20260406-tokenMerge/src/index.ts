// ============================================================
// index.ts — Application entry point
// ============================================================

import 'dotenv/config';
import express from 'express';
import { loadConfig } from './config';
import { TokenPool } from './tokenPool';
import { createAdapters } from './adapters/factory';
import { ModelRouter } from './router';
import { ChatRoutes } from './routes/chat';
import { AdminRoutes } from './routes/admin';
import { SystemRoutes } from './routes/system';
import { log } from './logger';

async function main() {
  // Load configuration
  const config = loadConfig();
  log.info('Configuration loaded', {
    port: config.port,
    bindAddress: config.bindAddress,
    modelCount: config.models.length,
  });

  // Initialize token pool
  const pool = new TokenPool(config.models);

  // Create model adapters
  const adapters = createAdapters(config.models);
  if (adapters.size === 0) {
    log.error('No model adapters created — check API key configuration');
    process.exit(1);
  }

  // Create model router
  const router = new ModelRouter(
    pool,
    adapters,
    config.maxFallbackAttempts
  );

  // Initialize route handlers
  const chatRoutes = new ChatRoutes(router);
  const adminRoutes = new AdminRoutes(pool);
  const systemRoutes = new SystemRoutes(pool);

  // Create Express app
  const app = express();

  // Global middleware
  app.use(express.json({ limit: '1mb' }));

  // Request logging middleware
  app.use((req, _res, next) => {
    log.info(`${req.method} ${req.path}`);
    next();
  });

  // Register routes
  // User-facing chat APIs
  app.post('/v1/chat', (req, res) => chatRoutes.chat(req, res));
  app.post('/v1/chat/completions', (req, res) => chatRoutes.chatCompletions(req, res));

  // Admin management APIs
  app.get('/admin/quota', (req, res) => adminRoutes.getQuota(req, res));
  app.put('/admin/quota/:modelId', (req, res) => adminRoutes.adjustQuota(req, res));
  app.post('/admin/quota/:modelId/reset', (req, res) => adminRoutes.resetUsage(req, res));
  app.get('/admin/stats', (req, res) => adminRoutes.getStats(req, res));

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

  app.listen(port, bindAddress, () => {
    log.info(`TokenMerge server started`, {
      address: `${bindAddress}:${port}`,
      models: config.models.map((m) => m.id),
      adaptersConfigured: adapters.size,
    });
  });
}

main().catch((err) => {
  log.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
