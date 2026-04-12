// ============================================================
// adapters/base.ts — Base adapter interface and helper (v2)
// ============================================================

import type { AdapterResult, FailureType } from '../types';
import { log } from '../logger';

/** Base adapter that all model adapters extend */
export abstract class ModelAdapter {
  abstract readonly modelType: string;
  abstract readonly modelId: string;
  protected endpoint: string;
  protected apiKey: string;
  protected modelName: string;

  constructor(endpoint: string, apiKey: string, modelName: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  /**
   * Call the model API and return standardized result.
   * @param apiKey - Optional override API key. If provided, uses this key instead of constructor key.
   */
  abstract call(
    prompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt?: string,
    apiKey?: string
  ): Promise<AdapterResult>;

  /** Get the effective API key (override or default) */
  protected getEffectiveApiKey(overrideKey?: string): string {
    return overrideKey || this.apiKey;
  }

  /**
   * Classify an HTTP error response into a FailureType.
   * This is used by the router to decide key fallback behavior.
   */
  static classifyFailure(statusCode: number | undefined, errorMessage: string): FailureType {
    if (statusCode === 402 || statusCode === 403) {
      // Check if it's an auth failure or token exhaustion
      const msg = errorMessage.toLowerCase();
      if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('quota') ||
          msg.includes('token') || msg.includes('credit')) {
        return 'token_exhausted';
      }
      return 'auth_failure';
    }
    if (statusCode === 401) return 'auth_failure';
    if (statusCode === 429) return 'rate_limited';
    if (statusCode === 500 || statusCode === 502 || statusCode === 503) return 'server_error';
    // Check for timeout indicators in error message
    if (errorMessage.includes('timed out') || errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ECONNRESET') || errorMessage.includes('ECONNREFUSED')) {
      return 'timeout';
    }
    if (statusCode === 504) return 'timeout';
    return 'unknown';
  }

  /** Generic fetch wrapper with timeout and error handling */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${this.modelType} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Log adapter errors */
  protected logError(message: string, error: unknown): void {
    log.error(`[${this.modelType}] ${message}`, {
      error: error instanceof Error ? error.message : String(error),
      model: this.modelName,
    });
  }
}
