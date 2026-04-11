// ============================================================
// router.ts — Model routing with auto-fallback
// ============================================================

import type { ModelAdapter } from './adapters/base';
import type { TokenPool } from './tokenPool';
import type { AdapterResult, ChatRequest } from './types';
import { log } from './logger';

export class ModelRouter {
  private pool: TokenPool;
  private adapters: Map<string, ModelAdapter>;
  private maxFallbackAttempts: number;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(
    pool: TokenPool,
    adapters: Map<string, ModelAdapter>,
    maxFallbackAttempts: number,
    defaultMaxTokens: number = 2048,
    defaultTemperature: number = 0.7
  ) {
    this.pool = pool;
    this.adapters = adapters;
    this.maxFallbackAttempts = maxFallbackAttempts;
    this.defaultMaxTokens = defaultMaxTokens;
    this.defaultTemperature = defaultTemperature;
  }

  /**
   * Route a chat request to the best available model with automatic fallback.
   *
   * Strategy:
   * 1. Get available models sorted by remaining tokens (descending)
   * 2. Try the top model first
   * 3. If it fails or exhausts, fallback to next available model
   * 4. After success, adjust the pre-deduction with actual usage
   */
  async route(
    request: ChatRequest
  ): Promise<{ result: AdapterResult; modelId: string }> {
    const maxTokens = request.max_tokens ?? this.defaultMaxTokens;
    const temperature = request.temperature ?? this.defaultTemperature;
    const prompt = request.prompt;

    // Get available models sorted by remaining tokens (most first)
    let availableModels = this.pool.getAvailableModels();

    if (availableModels.length === 0) {
      const totalAvailable = this.pool.getTotalAvailableTokens();
      throw Object.assign(new Error('All model tokens are exhausted'), {
        code: 'ALL_MODELS_EXHAUSTED',
        statusCode: 503,
        totalAvailableTokens: totalAvailable,
      });
    }

    // Filter to only models that have adapters
    availableModels = availableModels.filter((m) => this.adapters.has(m.id));

    if (availableModels.length === 0) {
      throw Object.assign(new Error('No models available (no adapters configured)'), {
        code: 'NO_MODELS_AVAILABLE',
        statusCode: 503,
      });
    }

    // Limit fallback attempts
    const maxAttempts = Math.min(this.maxFallbackAttempts, availableModels.length);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = availableModels[attempt];
      if (!candidate) break;

      const estimatedTokens = Math.max(maxTokens, 100); // Minimum estimate
      log.info('Attempting model', {
        modelId: candidate.id,
        attempt: attempt + 1,
        maxAttempts,
        remaining: candidate.remaining_tokens,
      });

      // Pre-deduct estimated tokens
      const preDeductSuccess = await this.pool.preDeduct(candidate.id, estimatedTokens);
      if (!preDeductSuccess) {
        log.warn('Pre-deduct failed, trying next model', { modelId: candidate.id });
        continue;
      }

      // Get the adapter
      const adapter = this.adapters.get(candidate.id);
      if (!adapter) {
        log.warn('No adapter for model, refunding', { modelId: candidate.id });
        await this.pool.adjustDeduction(candidate.id, estimatedTokens, 0, 0);
        continue;
      }

      try {
        const result = await adapter.call(prompt, maxTokens, temperature, request.system_prompt);

        // Adjust deduction with actual usage
        await this.pool.adjustDeduction(
          candidate.id,
          estimatedTokens,
          result.prompt_tokens,
          result.completion_tokens
        );

        log.info('Request successful', {
          modelId: candidate.id,
          promptTokens: result.prompt_tokens,
          completionTokens: result.completion_tokens,
        });

        return { result, modelId: candidate.id };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.error(`Model ${candidate.id} call failed, falling back`, {
          error: lastError.message,
          attempt: attempt + 1,
        });

        // Refund the pre-deduction on failure
        await this.pool.adjustDeduction(candidate.id, estimatedTokens, 0, 0);

        // Check if we should try the next model
        const stillAvailable = this.pool.getAvailableModels();
        const nextCandidates = stillAvailable.filter((m) => m.id !== candidate.id && this.adapters.has(m.id));
        if (nextCandidates.length === 0) {
          log.error('No more fallback models available');
          break;
        }
        // Re-sort available models for next iteration
        availableModels = nextCandidates;
      }
    }

    // All attempts failed
    if (lastError) {
      const code = lastError.message.includes('timed out') ? 'REQUEST_TIMEOUT' : 'MODEL_CALL_FAILED';
      throw Object.assign(
        new Error(`All model calls failed: ${lastError.message}`),
        { code, statusCode: 502 }
      );
    }

    throw Object.assign(new Error('No available models to try'), {
      code: 'NO_MODELS_AVAILABLE',
      statusCode: 503,
    });
  }
}
