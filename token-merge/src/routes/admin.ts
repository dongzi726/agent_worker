// ============================================================
// routes/admin.ts — Admin management routes
// ============================================================

import type { Request, Response } from 'express';
import type { TokenPool } from '../tokenPool';
import type { ApiResponse } from '../types';
import { log } from '../logger';

export class AdminRoutes {
  private pool: TokenPool;

  constructor(pool: TokenPool) {
    this.pool = pool;
  }

  /** GET /admin/quota — Query all model quotas */
  getQuota(_req: Request, res: Response): void {
    const states = this.pool.getAllStates();
    const models = Array.from(states.values()).map((m) => ({
      id: m.id,
      name: m.name,
      total_tokens: m.total_tokens,
      used_tokens: m.used_tokens,
      remaining_tokens: m.remaining_tokens,
      status: m.status,
      call_count: m.call_count,
    }));

    const totalAvailableTokens = this.pool.getTotalAvailableTokens();

    res.json({
      code: 0,
      message: 'ok',
      data: {
        models,
        total_available_tokens: totalAvailableTokens,
      },
    } as ApiResponse<{
      models: typeof models;
      total_available_tokens: number;
    }>);
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
        // Check if model exists at all
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
      } as ApiResponse<{
        id: string;
        total_tokens: number;
        used_tokens: number;
        remaining_tokens: number;
        status: string;
      }>);
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
      } as ApiResponse<{
        id: string;
        total_tokens: number;
        used_tokens: number;
        remaining_tokens: number;
        status: string;
        reset_at: string;
      }>);
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

    // Filter by model
    if (modelFilter) {
      states = states.filter((m) => m.id === modelFilter);
    }

    const models = states.map((m) => ({
      id: m.id,
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
    } as ApiResponse<{ models: typeof models }>);
  }
}
