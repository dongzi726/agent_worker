// ============================================================
// user.ts — User-facing API calls
// ============================================================

import request from './request';
import type { ApiResponse, UserKey } from '../types';

export const userApi = {
  async getMyKeys(): Promise<ApiResponse<UserKey[]>> {
    try {
      return await request.get('/user/keys');
    } catch {
      return { code: 0, message: 'ok', data: [], mock: true };
    }
  },

  async getKeyDetail(keyId: string): Promise<ApiResponse<UserKey>> {
    try {
      return await request.get(`/user/keys/${keyId}`);
    } catch {
      return { code: 0, message: 'ok', data: {} as UserKey, mock: true };
    }
  },

  async updateKeyStatus(keyId: string, status: string): Promise<ApiResponse> {
    try {
      return await request.put(`/user/keys/${keyId}/status`, { status });
    } catch {
      return { code: 0, message: 'ok', mock: true };
    }
  },

  async resetKey(keyId: string): Promise<ApiResponse> {
    try {
      return await request.post(`/user/keys/${keyId}/regenerate`);
    } catch {
      return { code: 0, message: 'ok', mock: true };
    }
  },

  async getUsage(since?: string, until?: string): Promise<ApiResponse> {
    try {
      const params: Record<string, string> = {};
      if (since) params.since = since;
      if (until) params.until = until;
      return await request.get('/user/stats', { params });
    } catch {
      return { code: 0, message: 'ok', data: { total_calls: 0, total_tokens: 0 }, mock: true };
    }
  },

  async applyKey(purpose: string, vendors?: string[]): Promise<ApiResponse> {
    try {
      return await request.post('/user/keys/apply', { purpose, vendors });
    } catch {
      return { code: 0, message: 'ok', data: { key_id: 'mock-id' }, mock: true };
    }
  },
};
