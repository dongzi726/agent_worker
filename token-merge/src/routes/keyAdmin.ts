// ============================================================
// routes/keyAdmin.ts — Key management API routes (v2)
// ============================================================

import type { Request, Response } from 'express';
import type { KeyPool } from '../keyPool';
import type { ApiResponse } from '../types';
import { log } from '../logger';

export class KeyAdminRoutes {
  private keyPools: Map<string, KeyPool>;

  constructor(keyPools: Map<string, KeyPool>) {
    this.keyPools = keyPools;
  }

  /** GET /admin/keys — Query all Key statuses */
  getAllKeys(req: Request, res: Response): void {
    try {
      const vendorFilter = (req.query.vendor as string) || undefined;
      const statusFilter = (req.query.status as string) || undefined;

      const vendors: Array<{
        id: string;
        routing_strategy: string;
        keys: ReturnType<KeyPool['getAllStates']>;
      }> = [];

      for (const [vendorId, keyPool] of this.keyPools) {
        if (vendorFilter && vendorId !== vendorFilter) continue;

        let keys = keyPool.getAllStates();

        if (statusFilter) {
          keys = keys.filter((k) => k.status === statusFilter);
        }

        vendors.push({
          id: vendorId,
          routing_strategy: keyPool.getStrategy(),
          keys,
        });
      }

      res.json({
        code: 0,
        message: 'ok',
        data: { vendors },
      } as ApiResponse<{ vendors: typeof vendors }>);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error('Failed to get all keys', { error: error.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to get key statuses',
        data: null,
      } as ApiResponse<null>);
    }
  }

  /** GET /admin/keys/:vendorId/:keyId — Query single Key detail */
  getKeyDetail(req: Request, res: Response): void {
    try {
      const vendorId = req.params.vendorId as string;
      const keyId = req.params.keyId as string;

      const keyPool = this.keyPools.get(vendorId);
      if (!keyPool) {
        res.status(404).json({
          code: 'VENDOR_NOT_FOUND',
          message: `Vendor "${vendorId}" not found`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      const keyState = keyPool.getState(keyId);
      if (!keyState) {
        res.status(404).json({
          code: 'KEY_NOT_FOUND',
          message: `Key "${keyId}" not found in vendor "${vendorId}"`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      res.json({
        code: 0,
        message: 'ok',
        data: keyState,
      } as ApiResponse<typeof keyState>);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error('Failed to get key detail', { error: error.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to get key detail',
        data: null,
      } as ApiResponse<null>);
    }
  }

  /** PUT /admin/keys/:vendorId/:keyId/status — Enable/disable a Key */
  updateKeyStatus(req: Request, res: Response): void {
    try {
      const vendorId = req.params.vendorId as string;
      const keyId = req.params.keyId as string;
      const body = req.body as { status?: string };

      if (body.status !== 'healthy' && body.status !== 'disabled') {
        res.status(400).json({
          code: 'INVALID_STATUS',
          message: `Invalid status "${body.status}". Must be "healthy" or "disabled".`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      const keyPool = this.keyPools.get(vendorId);
      if (!keyPool) {
        res.status(404).json({
          code: 'VENDOR_NOT_FOUND',
          message: `Vendor "${vendorId}" not found`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      const existingState = keyPool.getState(keyId);
      if (!existingState) {
        res.status(404).json({
          code: 'KEY_NOT_FOUND',
          message: `Key "${keyId}" not found in vendor "${vendorId}"`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      // Warn if disabling the last healthy key
      if (body.status === 'disabled') {
        const healthyCount = keyPool.getHealthyCount();
        if (healthyCount <= 1) {
          log.warn(`Disabling last healthy key in vendor "${vendorId}"`, {
            vendorId,
            keyId,
          });
        }
      }

      keyPool.setKeyStatus(keyId, body.status as 'healthy' | 'disabled');

      const updatedState = keyPool.getState(keyId)!;

      res.json({
        code: 0,
        message: 'ok',
        data: {
          key_id: updatedState.key_id,
          vendor_id: updatedState.vendor_id,
          status: updatedState.status,
          updated_at: new Date().toISOString(),
        },
      } as ApiResponse<{
        key_id: string;
        vendor_id: string;
        status: string;
        updated_at: string;
      }>);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error('Failed to update key status', { error: error.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to update key status',
        data: null,
      } as ApiResponse<null>);
    }
  }

  /** POST /admin/keys/:vendorId/:keyId/reset — Reset Key cooldown and failure count */
  resetKey(req: Request, res: Response): void {
    try {
      const vendorId = req.params.vendorId as string;
      const keyId = req.params.keyId as string;

      const keyPool = this.keyPools.get(vendorId);
      if (!keyPool) {
        res.status(404).json({
          code: 'VENDOR_NOT_FOUND',
          message: `Vendor "${vendorId}" not found`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      const existingState = keyPool.getState(keyId);
      if (!existingState) {
        res.status(404).json({
          code: 'KEY_NOT_FOUND',
          message: `Key "${keyId}" not found in vendor "${vendorId}"`,
          data: null,
        } as ApiResponse<null>);
        return;
      }

      keyPool.resetKeyState(keyId);

      const updatedState = keyPool.getState(keyId)!;

      res.json({
        code: 0,
        message: 'ok',
        data: {
          key_id: updatedState.key_id,
          vendor_id: updatedState.vendor_id,
          status: updatedState.status,
          consecutive_failures: updatedState.consecutive_failures,
          cooldown_until: updatedState.cooldown_until,
          reset_at: new Date().toISOString(),
        },
      } as ApiResponse<{
        key_id: string;
        vendor_id: string;
        status: string;
        consecutive_failures: number;
        cooldown_until: string | null;
        reset_at: string;
      }>);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error('Failed to reset key', { error: error.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset key',
        data: null,
      } as ApiResponse<null>);
    }
  }

  /** GET /admin/stats/keys — Query Key-level usage stats */
  getKeyStats(req: Request, res: Response): void {
    try {
      const vendorFilter = (req.query.vendor as string) || undefined;
      const since = (req.query.since as string) || undefined;
      const until = (req.query.until as string) || undefined;

      const periodStart = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const periodEnd = until || new Date().toISOString();

      const keys: Array<{
        key_id: string;
        vendor_id: string;
        total_calls: number;
        total_failures: number;
        total_cooldowns: number;
        success_rate: number;
        period_start: string;
        period_end: string;
      }> = [];

      for (const [vendorId, keyPool] of this.keyPools) {
        if (vendorFilter && vendorId !== vendorFilter) continue;

        const states = keyPool.getAllStates();
        for (const state of states) {
          const totalCalls = state.total_calls;
          const totalFailures = state.total_failures;
          const successRate = totalCalls > 0 ? (totalCalls - totalFailures) / totalCalls : 1;

          keys.push({
            key_id: state.key_id,
            vendor_id: state.vendor_id,
            total_calls: totalCalls,
            total_failures: totalFailures,
            total_cooldowns: state.total_cooldowns,
            success_rate: Math.round(successRate * 1000) / 1000,
            period_start: periodStart,
            period_end: periodEnd,
          });
        }
      }

      res.json({
        code: 0,
        message: 'ok',
        data: { keys },
      } as ApiResponse<{ keys: typeof keys }>);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error('Failed to get key stats', { error: error.message });
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Failed to get key stats',
        data: null,
      } as ApiResponse<null>);
    }
  }
}
