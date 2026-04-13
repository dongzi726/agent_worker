// ============================================================
// TokenMerge 前端 TypeScript 类型定义
// ============================================================

// ---- 通用 ----
export interface ApiResponse<T = unknown> {
  code: number | string;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  [key: string]: unknown;
}

// ---- 认证 ----
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserInfo;
}

export interface UserInfo {
  user_id: number;
  email: string;
  username: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'banned';
  quota_tokens: number;
  used_tokens?: number;
  created_at?: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ---- API Key ----
export interface CreateKeyRequest {
  label: string;
  quota_tokens?: number;
  expires_in_days?: number;
}

export interface CreateKeyResponse {
  key_id: string;
  key_value: string;
  label: string;
  status: string;
  quota_tokens: number;
  expires_at: string | null;
  created_at: string;
}

export interface ApiKey {
  key_id: string;
  key_prefix: string;
  label: string;
  status: 'pending' | 'active' | 'disabled' | 'expired';
  quota_tokens: number;
  used_tokens: number;
  remaining_tokens: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiKeyDetail extends ApiKey {
  stats: {
    today_calls: number;
    today_tokens: number;
    total_calls: number;
    total_tokens: number;
  };
}

export interface KeyStatusRequest {
  status: 'active' | 'disabled';
}

export interface RegenerateKeyResponse {
  key_id: string;
  key_value: string;
  label: string;
  status: string;
  regenerated_at: string;
}

// ---- 用户管理（Admin） ----
export interface AdminUser {
  user_id: number;
  email: string;
  username: string;
  status: 'pending' | 'active' | 'banned';
  role: 'user' | 'admin';
  quota_tokens: number;
  used_tokens: number;
  key_count: number;
  created_at: string;
}

export interface UserStatusRequest {
  status: 'active' | 'banned';
  reason?: string;
}

export interface UserQuotaRequest {
  quota_tokens: number;
  reason?: string;
}

// ---- Key 管理（Admin） ----
export interface AdminKey extends ApiKey {
  user_id: number;
  username: string;
}

export interface KeyApproveRequest {
  approved: boolean;
  quota_tokens?: number;
  reject_reason?: string;
}

// ---- 用量统计 ----
export interface UsageOverview {
  period: 'today' | 'week' | 'month';
  total_calls: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  success_calls: number;
  error_calls: number;
  avg_latency_ms: number;
  by_model: Array<{
    model_id: string;
    calls: number;
    tokens: number;
  }>;
}

export interface UsageTrend {
  daily: Array<{
    date: string;
    calls: number;
    tokens: number;
  }>;
}

export interface QuotaInfo {
  total_tokens: number;
  used_tokens: number;
  remaining_tokens: number;
  usage_percent: number;
  history: Array<{
    date: string;
    adjustment: number;
    reason: string;
  }>;
}

// ---- Dashboard ----
export interface DashboardData {
  total_users: number;
  active_users_24h: number;
  total_api_keys: number;
  active_api_keys: number;
  today_api_calls: number;
  today_tokens: number;
  avg_latency_ms: number;
  error_rate: number;
  system_health: {
    backend: string;
    database: string;
    redis: string;
    vendors: Array<{
      id: string;
      status: string;
      healthy_keys: number;
      total_keys: number;
    }>;
  };
}

// ---- 监控 ----
export interface MonitoringPoint {
  time: string;
  total_requests: number;
  success_requests: number;
  error_requests: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  total_tokens: number;
}

export interface MonitoringData {
  resolution: 'minute' | 'hour';
  points: MonitoringPoint[];
}

export interface ModelStats {
  model_id: string;
  calls: number;
  percent: number;
  avg_latency_ms: number;
}

// ---- 系统状态 ----
export interface SystemStatus {
  version: string;
  uptime_seconds: number;
  node_version: string;
  services: {
    database: { status: string; pool_size: number; active_connections: number };
    redis: { status: string; memory_used_mb: number };
    backend: { status: string; memory_heap_mb: number };
  };
  vendors: Array<{
    id: string;
    status: string;
    healthy_keys: number;
    total_keys: number;
  }>;
}
