// ============================================================
// tokenPool.ts — In-memory token management pool (v2)
// Thread-safe via Node.js single-threaded event loop + mutex for async boundaries
// ============================================================

import type { ModelConfig, ModelState } from './types';
import { log } from './logger';

export class TokenPool {
  private models: Map<string, ModelState> = new Map();
  private lock: Promise<void> = Promise.resolve();

  /** Initialize pool from model configs */
  constructor(models: ModelConfig[]) {
    for (const m of models) {
      this.models.set(m.id, {
        id: m.id,
        name: m.name,
        vendorId: m.vendorId,
        total_tokens: m.total_tokens,
        used_tokens: 0,
        remaining_tokens: m.total_tokens,
        status: 'available',
        call_count: 0,
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
      });
    }
    log.info('TokenPool initialized', { modelCount: models.length });
  }

  /** Execute a function under the pool mutex */
  private async withLock<T>(fn: () => T): Promise<T> {
    const currentLock = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await currentLock;
    try {
      return fn();
    } finally {
      release();
    }
  }

  /** Get all model states (read-only snapshot) */
  getAllStates(): ReadonlyMap<string, ModelState> {
    return new Map(this.models);
  }

  /** Get a single model state */
  getState(modelId: string): ModelState | undefined {
    return this.models.get(modelId);
  }

  /** Get available models sorted by remaining tokens (descending) */
  getAvailableModels(): ModelState[] {
    return Array.from(this.models.values())
      .filter((m) => m.status === 'available' && m.remaining_tokens > 0)
      .sort((a, b) => b.remaining_tokens - a.remaining_tokens);
  }

  /** Pre-deduct estimated tokens for a request (mutex-protected) */
  async preDeduct(modelId: string, estimatedTokens: number): Promise<boolean> {
    return this.withLock(() => {
      const model = this.models.get(modelId);
      if (!model || model.status !== 'available') {
        return false;
      }
      if (model.remaining_tokens < estimatedTokens) {
        // Mark as exhausted if truly depleted
        if (model.remaining_tokens <= 0) {
          model.status = 'exhausted';
          log.warn('Model exhausted', { modelId, remaining: model.remaining_tokens });
        }
        return false;
      }
      model.remaining_tokens -= estimatedTokens;
      model.used_tokens += estimatedTokens;
      log.debug('Pre-deducted tokens', { modelId, estimated: estimatedTokens, remaining: model.remaining_tokens });
      return true;
    });
  }

  /** Adjust token deduction after actual usage is known (mutex-protected) */
  async adjustDeduction(
    modelId: string,
    estimatedTokens: number,
    actualPromptTokens: number,
    actualCompletionTokens: number
  ): Promise<void> {
    return this.withLock(() => {
      const model = this.models.get(modelId);
      if (!model) return;

      const actualTotal = actualPromptTokens + actualCompletionTokens;
      const diff = estimatedTokens - actualTotal;

      // Reverse the pre-deduction and apply actual usage
      model.used_tokens = model.used_tokens - estimatedTokens + actualTotal;
      model.remaining_tokens = model.remaining_tokens + diff;
      model.total_prompt_tokens += actualPromptTokens;
      model.total_completion_tokens += actualCompletionTokens;
      model.call_count += 1;

      // Re-evaluate status
      if (model.remaining_tokens <= 0) {
        model.remaining_tokens = Math.max(0, model.remaining_tokens);
        model.status = 'exhausted';
        log.warn('Model exhausted after adjustment', { modelId, remaining: model.remaining_tokens });
      }

      log.debug('Adjusted token deduction', {
        modelId,
        estimated: estimatedTokens,
        actual: actualTotal,
        diff,
        remaining: model.remaining_tokens,
      });
    });
  }

  /** Mark a model as error state (mutex-protected) */
  async markError(modelId: string): Promise<void> {
    return this.withLock(() => {
      const model = this.models.get(modelId);
      if (!model) return;
      model.status = 'error';
      log.warn('Model marked as error', { modelId });
    });
  }

  /** Reset a model's usage (mutex-protected) */
  async resetUsage(modelId: string): Promise<ModelState | undefined> {
    return this.withLock(() => {
      const model = this.models.get(modelId);
      if (!model) return undefined;

      model.used_tokens = 0;
      model.remaining_tokens = model.total_tokens;
      model.status = 'available';
      model.call_count = 0;
      model.total_prompt_tokens = 0;
      model.total_completion_tokens = 0;

      log.info('Model usage reset', { modelId, totalTokens: model.total_tokens });
      return { ...model };
    });
  }

  /** Adjust total quota for a model (mutex-protected) */
  async adjustQuota(modelId: string, newTotal: number): Promise<ModelState | undefined> {
    return this.withLock(() => {
      const model = this.models.get(modelId);
      if (!model) return undefined;

      if (newTotal < model.used_tokens) {
        return undefined; // Can't set below used amount
      }

      model.total_tokens = newTotal;
      model.remaining_tokens = newTotal - model.used_tokens;

      if (model.remaining_tokens > 0 && model.status === 'exhausted') {
        model.status = 'available';
      }

      return { ...model };
    });
  }

  /** Get summary for health check */
  getHealthSummary() {
    const models = Array.from(this.models.values()).map((m) => ({
      id: m.id,
      vendorId: m.vendorId,
      status: m.status,
      remaining_tokens: m.remaining_tokens,
    }));

    const available = models.filter((m) => m.status === 'available').length;
    const total = models.length;

    let status: 'ok' | 'degraded' | 'unhealthy';
    if (available === 0) {
      status = 'unhealthy';
    } else if (available < total) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    return { status, models };
  }

  /** Get total available tokens across all models */
  getTotalAvailableTokens(): number {
    return Array.from(this.models.values())
      .filter((m) => m.status === 'available')
      .reduce((sum, m) => sum + m.remaining_tokens, 0);
  }
}
