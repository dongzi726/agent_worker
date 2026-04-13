// ============================================================
// admin.ts — Admin-facing API calls
// ============================================================

import request from './request';
import type { ApiResponse } from '../types';

export const adminApi = {
  async getQuota(userId?: number): Promise<ApiResponse> {
    try {
      const params = userId ? { user_id: userId } : {};
      return await request.get('/admin/quota', { params });
    } catch {
      return { code: 0, message: 'ok', data: { total_tokens: 0, used_tokens: 0, remaining_tokens: 0, usage_percent: 0, history: [] }, mock: true };
    }
  },

  async adjustQuota(userId: number, quotaTokens: number, reason?: string): Promise<ApiResponse> {
    try {
      return await request.post('/admin/quota/adjust', { user_id: userId, quota_tokens: quotaTokens, reason });
    } catch {
      return { code: 0, message: 'ok', mock: true };
    }
  },

  async resetUsage(userId: number): Promise<ApiResponse> {
    try {
      return await request.post('/admin/quota/reset', { user_id: userId });
    } catch {
      return { code: 0, message: 'ok', mock: true };
    }
  },

  async getApplications(status?: string): Promise<ApiResponse> {
    try {
      const params = status ? { status } : {};
      return await request.get('/admin/applications', { params });
    } catch {
      return { code: 0, message: 'ok', data: { total: 0, page: 1, limit: 20, list: [] }, mock: true };
    }
  },

  async reviewApplication(appId: string, approved: boolean, quotaTokens?: number, rejectReason?: string): Promise<ApiResponse> {
    try {
      return await request.post(`/admin/applications/${appId}/review`, { approved, quota_tokens: quotaTokens, reject_reason: rejectReason });
    } catch {
      return { code: 0, message: 'ok', mock: true };
    }
  },

  async getStats(period?: string): Promise<ApiResponse> {
    try {
      const params = period ? { period } : {};
      return await request.get('/admin/stats', { params });
    } catch {
      return { code: 0, message: 'ok', data: { total_users: 0, active_users_24h: 0, total_api_keys: 0, active_api_keys: 0, today_api_calls: 0, today_tokens: 0 }, mock: true };
    }
  },

  async getKeyStats(keyId?: string): Promise<ApiResponse> {
    try {
      const url = keyId ? `/admin/keys/${keyId}/stats` : '/admin/keys/stats';
      return await request.get(url);
    } catch {
      return { code: 0, message: 'ok', data: { list: [] }, mock: true };
    }
  },
};
