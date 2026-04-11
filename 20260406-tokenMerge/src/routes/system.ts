// ============================================================
// routes/system.ts — System routes (health, ready)
// ============================================================

import type { Request, Response } from 'express';
import type { TokenPool } from '../tokenPool';
import type { ApiResponse } from '../types';

const startTime = Date.now();

export class SystemRoutes {
  private pool: TokenPool;

  constructor(pool: TokenPool) {
    this.pool = pool;
  }

  /** GET /health — Health check */
  health(_req: Request, res: Response): void {
    const summary = this.pool.getHealthSummary();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    res.status(summary.status === 'unhealthy' ? 503 : 200).json({
      code: 0,
      message: 'ok',
      data: {
        status: summary.status,
        uptime: uptimeSeconds,
        models: summary.models,
      },
    } as ApiResponse<{
      status: string;
      uptime: number;
      models: Array<{ id: string; status: string; remaining_tokens: number }>;
    }>);
  }

  /** GET /ready — Readiness check */
  ready(_req: Request, res: Response): void {
    res.json({
      code: 0,
      message: 'ok',
      data: {
        ready: true,
      },
    } as ApiResponse<{ ready: boolean }>);
  }
}
