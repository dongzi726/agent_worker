// ============================================================
// adapters/base.ts — Base adapter interface and helper
// ============================================================

import type { AdapterResult } from '../types';
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

  /** Call the model API and return standardized result */
  abstract call(
    prompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt?: string
  ): Promise<AdapterResult>;

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
