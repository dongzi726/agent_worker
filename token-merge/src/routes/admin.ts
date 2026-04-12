// ============================================================
// routes/admin.ts — Admin management routes (v2: vendor grouping)
// ============================================================

import type { Request, Response } from 'express';
import type { TokenPool } from '../tokenPool';
import type { KeyPool } from '../keyPool';
import type { ApiResponse, VendorConfig } from '../types';
import { log } from '../logger';

export class AdminRoutes {
  private pool: TokenPool;
  private keyPools: Map<string, KeyPool>;
  private vendors: VendorConfig[];

  constructor(pool: TokenPool, keyPools: Map<string, KeyPool>, vendors: VendorConfig[]) {
    this.pool = pool;
    this.keyPools = keyPools;
    this.vendors = vendors;
  }

  /** GET /admin/quota — Query all model quotas with vendor grouping (v2) */
  getQuota(_req: Request, res: Response): void {
    const states = this.pool.getAllStates();
    const models = Array.from(states.values()).map((m) => ({
      id: m.id,
      name: m.name,
      vendor_id: m.vendorId,
      total_tokens: m.total_tokens,
      used_tokens: m.used_tokens,
      remaining_tokens: m.remaining_tokens,
      status: m.status,
      call_count: m.call_count,
    }));

    const totalAvailableTokens = this.pool.getTotalAvailableTokens();

    // Group by vendor (v2)
    const vendorGroups: Array<{
      id: string;
      key_pool_size: number;
      healthy_keys: number;
      models: typeof models;
    }> = [];

    for (const vendor of this.vendors) {
      const vendorModels = models.filter((m) => m.vendor_id === vendor.id);
      if (vendorModels.length === 0) continue;

      const keyPool = this.keyPools.get(vendor.id);
      const keyPoolSize = keyPool ? keyPool.getKeyCount() : 0;
      const healthyKeys = keyPool ? keyPool.getHealthyCount() : 0;

      vendorGroups.push({
        id: vendor.id,
        key_pool_size: keyPoolSize,
        healthy_keys: healthyKeys,
        models: vendorModels,
      });
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        models,
        vendors: vendorGroups.length > 0 ? vendorGroups : undefined,
        total_available_tokens: totalAvailableTokens,
      },
    });
  }

  /** PUT /admin/quota/:modelId — Adjust single model quota */
  adjustQuota(req: Request, res: Response): void {
    const modelId = req.params.modelId as string;
    const body = req.body as { total_tokens?: number };

    if (typeof body?.total_tokens !== 'number' || body.total_tokens <= 0) {
      res.status(400).json({
        code: 'INVALID_QUOTA',
        message: 'total_tokens must be a positive number',
        data: null,
      } as ApiResponse<null>);
      return;
    }

    this.pool.adjustQuota(modelId, body.total_tokens).then((result) => {
      if (!result) {
        const existing = this.pool.getState(modelId);
        if (!existing) {
          res.status(404).json({
            code: 'MODEL_NOT_FOUND',
            message: `Model '${modelId}' not found`,
            data: null,
          } as ApiResponse<null>);
          return;
        }
        res.status(400).json({
          code: 'INVALID_QUOTA',
          message: `total_tokens (${body.total_tokens}) cannot be less than used_tokens (${existing.used_tokens})`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      log.info('Quota adjusted', { modelId, newTotal: result.total_tokens, remaining: result.remaining_tokens });

      res.json({
        code: 0,
        message: 'ok',
        data: {
          id: result.id,
          total_tokens: result.total_tokens,
          used_tokens: result.used_tokens,
          remaining_tokens: result.remaining_tokens,
          status: result.status,
        },
      });
    }).catch((err: Error) => {
      log.error('Failed to adjust quota', { modelId, error: err.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to adjust quota',
        data: null,
      } as ApiResponse<null>);
    });
  }

  /** POST /admin/quota/:modelId/reset — Reset single model usage */
  resetUsage(req: Request, res: Response): void {
    const modelId = req.params.modelId as string;

    this.pool.resetUsage(modelId).then((result) => {
      if (!result) {
        res.status(404).json({
          code: 'MODEL_NOT_FOUND',
          message: `Model '${modelId}' not found`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      res.json({
        code: 0,
        message: 'ok',
        data: {
          id: result.id,
          total_tokens: result.total_tokens,
          used_tokens: result.used_tokens,
          remaining_tokens: result.remaining_tokens,
          status: result.status,
          reset_at: new Date().toISOString(),
        },
      });
    }).catch((err: Error) => {
      log.error('Failed to reset usage', { modelId, error: err.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset usage',
        data: null,
      } as ApiResponse<null>);
    });
  }

  /** GET /admin/stats — Query usage statistics */
  getStats(req: Request, res: Response): void {
    const modelFilter = Array.isArray(req.query.model) ? req.query.model[0] : (req.query.model as string | undefined);
    const since = Array.isArray(req.query.since) ? req.query.since[0] : (req.query.since as string | undefined);
    const until = Array.isArray(req.query.until) ? req.query.until[0] : (req.query.until as string | undefined);

    let states = Array.from(this.pool.getAllStates().values());

    if (modelFilter) {
      states = states.filter((m) => m.id === modelFilter);
    }

    const models = states.map((m) => ({
      id: m.id,
      vendor_id: m.vendorId,
      total_prompt_tokens: m.total_prompt_tokens,
      total_completion_tokens: m.total_completion_tokens,
      total_tokens: m.used_tokens,
      call_count: m.call_count,
      period_start: since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      period_end: until || new Date().toISOString(),
    }));

    res.json({
      code: 0,
      message: 'ok',
      data: { models },
    });
  }
}
