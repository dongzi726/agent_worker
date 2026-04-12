// ============================================================
// routes/system.ts — System routes (health, ready) (v2)
// ============================================================

import type { Request, Response } from 'express';
import type { TokenPool } from '../tokenPool';
import type { KeyPool } from '../keyPool';
import type { ApiResponse, HealthStatus } from '../types';

const startTime = Date.now();

export class SystemRoutes {
  private pool: TokenPool;
  private keyPools: Map<string, KeyPool>;

  constructor(pool: TokenPool, keyPools: Map<string, KeyPool>) {
    this.pool = pool;
    this.keyPools = keyPools;
  }

  /** GET /health — Health check (v2: includes Key pool status) */
  health(_req: Request, res: Response): void {
    const summary = this.pool.getHealthSummary();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    // Build vendor-level health info with key pool status
    const vendorHealth: HealthStatus['vendors'] = [];
    for (const model of summary.models) {
      const vendorId = model.vendorId || 'unknown';
      let vendor = vendorHealth.find((v) => v.id === vendorId);
      if (!vendor) {
        const keyPool = this.keyPools.get(vendorId);
        const keyPoolStatus = keyPool ? keyPool.getStatusSummary() : { total: 0, healthy: 0, cooldown: 0, disabled: 0 };
        vendor = {
          id: vendorId,
          key_pool_status: keyPoolStatus,
          models: [],
        };
        vendorHealth.push(vendor);
      }
      vendor.models.push({
        id: model.id,
        status: model.status,
        remaining_tokens: model.remaining_tokens,
      });
    }

    // Determine overall health
    const totalVendors = vendorHealth.length;
    const healthyVendors = vendorHealth.filter(
      (v) => v.key_pool_status.healthy > 0
    ).length;

    let status: 'ok' | 'degraded' | 'unhealthy';
    if (totalVendors === 0 || healthyVendors === 0) {
      status = 'unhealthy';
    } else if (healthyVendors < totalVendors) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    res.status(status === 'unhealthy' ? 503 : 200).json({
      code: 0,
      message: 'ok',
      data: {
        status,
        uptime: uptimeSeconds,
        vendors: vendorHealth,
      },
    } as ApiResponse<{
      status: string;
      uptime: number;
      vendors: typeof vendorHealth;
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
