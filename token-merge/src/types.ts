// ============================================================
// types.ts — Core type definitions for TokenMerge (v2)
// ============================================================

/** Model provider type */
export type ModelType = 'qwen' | 'minimax' | 'glm';

/** Key routing strategy within a vendor */
export type KeyRoutingStrategy = 'round_robin' | 'least_used';

/** Key state for health tracking */
export type KeyStatus = 'healthy' | 'cooldown' | 'disabled';

// ============================================================
// v2: KeyPool configuration types
// ============================================================

/** A single API Key entry in config */
export interface KeyEntryConfig {
  api_key_env: string;      // Environment variable name containing the actual key
  weight?: number;          // Load balancing weight (default 1, only for round_robin)
  label: string;            // Human-readable identifier for logging and monitoring
}

/** Vendor-level configuration */
export interface VendorConfig {
  id: string;
  type: ModelType;
  key_pool: KeyEntryConfig[];
  key_routing_strategy: KeyRoutingStrategy;
  models: ModelConfig[];
}

// ============================================================
// v2: Key runtime state
// ============================================================

/** Runtime key state (in-memory, lost on restart) */
export interface KeyState {
  keyId: string;                        // Unique identifier (label)
  vendorId: string;                     // Owning vendor
  status: KeyStatus;
  callTimestamps: number[];             // Unix ms timestamps within 24h window
  consecutiveFailures: number;
  lastUsedAt: Date | null;
  lastFailureAt: Date | null;
  cooldownUntil: Date | null;
  cooldownBaseMs: number;               // Base cooldown duration before exponential backoff
  weight: number;                       // Load balancing weight
  totalCalls: number;                   // Lifetime total calls
  totalFailures: number;                // Lifetime total failures
  totalCooldowns: number;               // Lifetime total cooldowns entered
  isQuickRecovery: boolean;             // Whether this key was selected via quick recovery
}

/** Key state with computed fields (for API responses) */
export interface KeyStateWithInfo {
  key_id: string;
  vendor_id: string;
  status: KeyStatus;
  call_count_24h: number;
  consecutive_failures: number;
  last_used_at: string | null;
  last_failure_at: string | null;
  cooldown_until: string | null;
  weight: number;
  total_calls: number;
  total_failures: number;
  total_cooldowns: number;
}

// ============================================================
// v2: Failure type classification
// ============================================================

/** Classified failure type for cooldown/fallback decisions */
export type FailureType =
  | 'token_exhausted'     // 402/403 (insufficient balance) — no key status change
  | 'auth_failure'        // 401/403 (auth) — immediate disabled
  | 'rate_limited'        // 429 — cooldown
  | 'timeout'             // ETIMEDOUT/ECONNRESET — cooldown after 3 consecutive
  | 'server_error'        // 500/502/503 — log, no status change, but fallback
  | 'unknown';            // Other errors — fallback only

// ============================================================
// v2: Fallback detail (returned in response)
// ============================================================

export interface FallbackDetail {
  key_fallbacks: number;
  model_fallbacks: number;
  tried_keys: string[];
  tried_models: string[];
}

// ============================================================
// v2: Extended response types
// ============================================================

/** Extended chat response data (v2) */
export interface ChatResponseDataV2 {
  id: string;
  content: string;
  model_used: string;
  vendor_used: string;
  key_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  fallback_count: number;
  fallback_detail?: FallbackDetail; // Only included in debug mode
}

// ============================================================
// Model configuration (extended with vendorId)
// ============================================================

/** Model configuration from config file */
export interface ModelConfig {
  id: string;
  name: string;
  type: ModelType;
  vendorId: string;                       // v2: owning vendor ID
  model_name: string;
  endpoint: string;
  total_tokens: number;
}

// ============================================================
// v1 compatibility: Legacy flat model config (input only)
// ============================================================

/** Legacy model config (from v1 config, input only) */
export interface LegacyModelConfig {
  id: string;
  name: string;
  type: ModelType;
  model_name: string;
  endpoint: string;
  api_key_env: string;
  total_tokens: number;
}

// ============================================================
// Root configuration
// ============================================================

/** Root configuration (v2 — vendor-level) */
export interface V2AppConfig {
  port: number;
  bindAddress: string;
  requestTimeoutMs: number;
  maxFallbackAttempts: number;
  totalRequestTimeoutMs: number;       // Total timeout including fallbacks (default 90s)
  includeFallbackDetail: boolean;      // Whether to include fallback_detail in responses
  keyStatsWindowHours: number;         // Sliding window hours for call_count_24h (default 24)
  vendors: VendorConfig[];
}

/** Internal normalized config */
export interface AppConfig {
  port: number;
  bindAddress: string;
  requestTimeoutMs: number;
  maxFallbackAttempts: number;
  totalRequestTimeoutMs: number;
  includeFallbackDetail: boolean;
  keyStatsWindowHours: number;
  models: ModelConfig[];
  vendors: VendorConfig[];
}

/** Runtime model state (mutable) */
export interface ModelState {
  id: string;
  name: string;
  vendorId: string;                     // v2: owning vendor ID
  total_tokens: number;
  used_tokens: number;
  remaining_tokens: number;
  status: 'available' | 'exhausted' | 'error';
  call_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
}

/** Chat request (user-facing) */
export interface ChatRequest {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  system_prompt?: string;
}

/** OpenAI-compatible request */
export interface OpenAIChatRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

/** Standardized result from model adapter */
export interface AdapterResult {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Router result including vendor and key info */
export interface RouterResult {
  result: AdapterResult;
  modelId: string;
  vendorId: string;
  keyId: string;
  fallbackDetail: FallbackDetail;
}

/** Standard API response wrapper */
export interface ApiResponse<T> {
  code: number | string;
  message: string;
  data: T | null;
}

/** Business error codes (v1 + v2) */
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'PROMPT_TOO_LONG'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_QUOTA'
  | 'ALL_MODELS_EXHAUSTED'
  | 'NO_MODELS_AVAILABLE'
  | 'MODEL_CALL_FAILED'
  | 'REQUEST_TIMEOUT'
  | 'INTERNAL_ERROR'
  // v2 error codes
  | 'VENDOR_NOT_FOUND'
  | 'KEY_NOT_FOUND'
  | 'INVALID_STATUS'
  | 'ALL_KEYS_UNAVAILABLE'
  | 'CONFIG_VALIDATION_FAILED';

/** Health check response */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  uptime: number;
  vendors: Array<{
    id: string;
    key_pool_status: {
      total: number;
      healthy: number;
      cooldown: number;
      disabled: number;
    };
    models: Array<{
      id: string;
      status: string;
      remaining_tokens: number;
    }>;
  }>;
}

/** Quota adjustment request */
export interface QuotaAdjustRequest {
  total_tokens: number;
}
