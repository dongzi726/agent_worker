// ============================================================
// router.ts — Two-layer model routing with KeyPool support (v2)
// Layer 1: vendor/model selection by remaining_tokens
// Layer 2: key selection within vendor (round_robin / least_used)
// ============================================================

import type { ModelAdapter } from './adapters/base';
import type { TokenPool } from './tokenPool';
import type { KeyPool } from './keyPool';
import type {
  AdapterResult,
  ChatRequest,
  FallbackDetail,
  RouterResult,
  ModelState,
} from './types';
import { log } from './logger';

export class ModelRouter {
  private pool: TokenPool;
  private adapters: Map<string, ModelAdapter>;
  private keyPools: Map<string, KeyPool>;
  private maxFallbackAttempts: number;
  private totalRequestTimeoutMs: number;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(
    pool: TokenPool,
    adapters: Map<string, ModelAdapter>,
    keyPools: Map<string, KeyPool>,
    maxFallbackAttempts: number,
    totalRequestTimeoutMs: number = 90000,
    defaultMaxTokens: number = 2048,
    defaultTemperature: number = 0.7
  ) {
    this.pool = pool;
    this.adapters = adapters;
    this.keyPools = keyPools;
    this.maxFallbackAttempts = maxFallbackAttempts;
    this.totalRequestTimeoutMs = totalRequestTimeoutMs;
    this.defaultMaxTokens = defaultMaxTokens;
    this.defaultTemperature = defaultTemperature;
  }

  /**
   * Classify failure type from HTTP error response.
   */
  private classifyFailure(statusCode: number, errorMessage: string): ReturnType<typeof classifyErrorType> {
    return classifyErrorType(statusCode, errorMessage);
  }

  /**
   * Route a chat request with two-layer routing and key fallback.
   *
   * Layer 1: Pick model by remaining_tokens (descending)
   * Layer 2: Pick key within the model's vendor via KeyPool
   * Key fallback on failure (except token_exhausted)
   */
  async route(request: ChatRequest): Promise<RouterResult> {
    const maxTokens = request.max_tokens ?? this.defaultMaxTokens;
    const temperature = request.temperature ?? this.defaultTemperature;
    const prompt = request.prompt;
    const startTime = Date.now();

    let availableModels = this.pool.getAvailableModels();

    if (availableModels.length === 0) {
      const totalAvailable = this.pool.getTotalAvailableTokens();
      throw Object.assign(new Error('All model tokens are exhausted'), {
        code: 'ALL_MODELS_EXHAUSTED',
        statusCode: 503,
        totalAvailableTokens: totalAvailable,
      });
    }

    availableModels = availableModels.filter((m) => this.adapters.has(m.id));

    if (availableModels.length === 0) {
      throw Object.assign(new Error('No models available (no adapters configured)'), {
        code: 'NO_MODELS_AVAILABLE',
        statusCode: 503,
      });
    }

    const maxAttempts = Math.min(this.maxFallbackAttempts, availableModels.length);
    let lastError: Error | null = null;

    const fallbackDetail: FallbackDetail = {
      key_fallbacks: 0,
      model_fallbacks: 0,
      tried_keys: [],
      tried_models: [],
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = availableModels[attempt];
      if (!candidate) break;

      // Check total request timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.totalRequestTimeoutMs) {
        log.warn('Total request timeout reached', { elapsed });
        throw Object.assign(new Error('Request timed out after all fallbacks'), {
          code: 'REQUEST_TIMEOUT',
          statusCode: 504,
        });
      }

      const estimatedTokens = Math.max(maxTokens, 100);
      log.info('Attempting model', {
        modelId: candidate.id,
        vendorId: candidate.vendorId,
        attempt: attempt + 1,
        maxAttempts,
        remaining: candidate.remaining_tokens,
      });

      const preDeductSuccess = await this.pool.preDeduct(candidate.id, estimatedTokens);
      if (!preDeductSuccess) {
        log.warn('Pre-deduct failed, trying next model', { modelId: candidate.id });
        continue;
      }

      const adapter = this.adapters.get(candidate.id);
      if (!adapter) {
        log.warn('No adapter for model, refunding', { modelId: candidate.id });
        await this.pool.adjustDeduction(candidate.id, estimatedTokens, 0, 0);
        continue;
      }

      // === Layer 2: Key selection within vendor ===
      const keyPool = this.keyPools.get(candidate.vendorId);
      if (!keyPool) {
        // No KeyPool — use adapter's default key (v1 compat)
        try {
          const result = await adapter.call(prompt, maxTokens, temperature, request.system_prompt);
          await this.pool.adjustDeduction(
            candidate.id,
            estimatedTokens,
            result.prompt_tokens,
            result.completion_tokens
          );

          return {
            result,
            modelId: candidate.id,
            vendorId: candidate.vendorId,
            keyId: 'default',
            fallbackDetail,
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          await this.pool.adjustDeduction(candidate.id, estimatedTokens, 0, 0);
          fallbackDetail.model_fallbacks++;
          fallbackDetail.tried_models.push(candidate.id);
          continue;
        }
      }

      // Try keys within the vendor
      const keyResult = await this.tryVendorKeys(
        adapter,
        keyPool,
        candidate,
        prompt,
        maxTokens,
        temperature,
        request.system_prompt,
        estimatedTokens,
        fallbackDetail
      );

      if (keyResult.success) {
        return {
          result: keyResult.result!,
          modelId: candidate.id,
          vendorId: candidate.vendorId,
          keyId: keyResult.keyId!,
          fallbackDetail,
        };
      }

      // All keys in this vendor failed, try next model
      lastError = keyResult.error ?? null;
      fallbackDetail.model_fallbacks++;
      fallbackDetail.tried_models.push(candidate.id);

      const stillAvailable = this.pool.getAvailableModels();
      const nextCandidates = stillAvailable.filter(
        (m) => m.id !== candidate.id && this.adapters.has(m.id)
      );
      if (nextCandidates.length === 0) {
        log.error('No more fallback models available');
        break;
      }
      availableModels = nextCandidates;
    }

    // All attempts failed
    if (lastError) {
      const code = lastError.message.includes('timed out') ? 'REQUEST_TIMEOUT' : 'MODEL_CALL_FAILED';
      throw Object.assign(
        new Error(`All model calls failed: ${lastError.message}`),
        { code, statusCode: 502, fallbackDetail }
      );
    }

    throw Object.assign(new Error('No available models to try'), {
      code: 'NO_MODELS_AVAILABLE',
      statusCode: 503,
    });
  }

  /**
   * Try keys within a vendor, with key-level fallback.
   */
  private async tryVendorKeys(
    adapter: ModelAdapter,
    keyPool: KeyPool,
    _modelState: ModelState,
    prompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt: string | undefined,
    estimatedTokens: number,
    fallbackDetail: FallbackDetail
  ): Promise<{ success: boolean; result?: AdapterResult; keyId?: string; error?: Error }> {
    const maxKeyAttempts = this.maxFallbackAttempts;

    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      // Select key from pool
      const selection = keyPool.selectKey();
      if (!selection) {
        return { success: false, error: new Error('All keys in vendor unavailable') };
      }

      const { keyId, isQuickRecovery } = selection;
      const apiKey = keyPool.getApiKey(keyId);
      if (!apiKey) {
        continue;
      }

      log.info('Attempting vendor key', {
        vendorId: keyPool.getVendorId(),
        keyId,
        isQuickRecovery,
      });

      fallbackDetail.tried_keys.push(keyId);

      try {
        const result = await adapter.call(prompt, maxTokens, temperature, systemPrompt, apiKey);

        // Success
        keyPool.recordSuccess(keyId);
        await this.pool.adjustDeduction(
          _modelState.id,
          estimatedTokens,
          result.prompt_tokens,
          result.completion_tokens
        );

        log.info('Request successful', {
          modelId: _modelState.id,
          vendorId: keyPool.getVendorId(),
          keyId,
          promptTokens: result.prompt_tokens,
          completionTokens: result.completion_tokens,
        });

        return { success: true, result, keyId };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Classify the failure
        const statusCode = (err as Record<string, unknown>).statusCode as number | undefined;
        const failureType = this.classifyFailure(statusCode ?? 0, error.message);

        keyPool.recordFailure(keyId, failureType);

        if (failureType === 'token_exhausted') {
          log.warn('Token exhausted, not falling back to another key', {
            vendorId: keyPool.getVendorId(),
            keyId,
          });
          await this.pool.adjustDeduction(_modelState.id, estimatedTokens, 0, 0);
          return { success: false, error };
        }

        log.warn(`Key failed (${failureType}), trying next key`, {
          vendorId: keyPool.getVendorId(),
          keyId,
          fallbackAttempt: keyAttempt + 1,
          errorMessage: error.message,
        });

        fallbackDetail.key_fallbacks++;

        // Check if there are any remaining keys to try
        if (!isQuickRecovery) {
          const remainingHealthy = keyPool.getHealthyCount();
          if (remainingHealthy === 0) {
            break;
          }
        }
      }
    }

    return {
      success: false,
      error: new Error('All keys in vendor failed'),
    };
  }
}

/**
 * Classify failure type from HTTP error response.
 * Extracted as a standalone function for reusability.
 */
export function classifyErrorType(
  statusCode: number,
  errorMessage: string
): 'token_exhausted' | 'auth_failure' | 'rate_limited' | 'timeout' | 'server_error' | 'unknown' {
  if (statusCode === 402 || statusCode === 403) {
    if (errorMessage.toLowerCase().includes('insufficient') ||
        errorMessage.toLowerCase().includes('quota') ||
        errorMessage.toLowerCase().includes('balance') ||
        errorMessage.toLowerCase().includes('token')) {
      return 'token_exhausted';
    }
    return 'auth_failure';
  }
  if (statusCode === 401) return 'auth_failure';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode >= 500) return 'server_error';
  if (errorMessage.toLowerCase().includes('timed out') ||
      errorMessage.toLowerCase().includes('abort') ||
      errorMessage.toLowerCase().includes('etimedout') ||
      errorMessage.toLowerCase().includes('econnreset')) {
    return 'timeout';
  }
  return 'unknown';
}
