// ============================================================
// types.ts — Core type definitions for TokenMerge
// ============================================================

/** Model provider type */
export type ModelType = 'qwen' | 'minimax' | 'glm';

/** Model configuration from config file */
export interface ModelConfig {
  id: string;
  name: string;
  type: ModelType;
  model_name: string;
  endpoint: string;
  api_key_env: string;
  total_tokens: number;
}

/** Root configuration */
export interface AppConfig {
  port: number;
  bindAddress: string;
  requestTimeoutMs: number;
  maxFallbackAttempts: number;
  models: ModelConfig[];
}

/** Runtime model state (mutable) */
export interface ModelState {
  id: string;
  name: string;
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

/** Chat response (user-facing) */
export interface ChatResponse {
  id: string;
  content: string;
  model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** OpenAI-compatible request */
export interface OpenAIChatRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

/** OpenAI-compatible response */
export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Standardized result from model adapter */
export interface AdapterResult {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Unified API response wrapper */
export interface ApiResponse<T> {
  code: number | string;
  message: string;
  data: T | null;
}

/** Business error codes */
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'PROMPT_TOO_LONG'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_QUOTA'
  | 'ALL_MODELS_EXHAUSTED'
  | 'NO_MODELS_AVAILABLE'
  | 'MODEL_CALL_FAILED'
  | 'REQUEST_TIMEOUT'
  | 'INTERNAL_ERROR';

/** Health check response */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  uptime: number;
  models: Array<{
    id: string;
    status: string;
    remaining_tokens: number;
  }>;
}

/** Quota adjustment request */
export interface QuotaAdjustRequest {
  total_tokens: number;
}
