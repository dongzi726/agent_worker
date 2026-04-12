// ============================================================
// adapters/qwen.ts — Qwen (通义千问) adapter (v2)
// Compatible with DashScope OpenAI-compatible endpoint
// ============================================================

import type { AdapterResult } from '../types';
import { ModelAdapter } from './base';
import { log } from '../logger';

function normalizeQwenEndpoint(endpoint: string): string {
  const normalized = endpoint.trim().replace(/\/+$/, '');

  if (normalized.endsWith('/compatible-mode/v1/chat/completions')) {
    return normalized;
  }

  if (normalized.endsWith('/api/v2/apps/protocols/compatible-mode/v1/chat/completions')) {
    return normalized.replace(
      '/api/v2/apps/protocols/compatible-mode/v1/chat/completions',
      '/compatible-mode/v1/chat/completions'
    );
  }

  if (normalized.endsWith('/api/v2/apps/protocols/compatible-mode/v1')) {
    return normalized.replace(
      '/api/v2/apps/protocols/compatible-mode/v1',
      '/compatible-mode/v1/chat/completions'
    );
  }

  if (normalized.endsWith('/compatible-mode/v1')) {
    return `${normalized}/chat/completions`;
  }

  if (/^https?:\/\/[^/]+$/.test(normalized)) {
    return `${normalized}/compatible-mode/v1/chat/completions`;
  }

  return normalized;
}

export class QwenAdapter extends ModelAdapter {
  readonly modelType = 'qwen';
  readonly modelId: string;

  constructor(endpoint: string, apiKey: string, modelName: string, modelId: string) {
    super(endpoint, apiKey, modelName);
    this.modelId = modelId;
  }

  async call(
    prompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt?: string,
    overrideApiKey?: string
  ): Promise<AdapterResult> {
    const requestUrl = normalizeQwenEndpoint(this.endpoint);
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: this.modelName,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    const effectiveKey = this.getEffectiveApiKey(overrideApiKey);

    log.debug('[qwen] Sending request', {
      model: this.modelName,
      maxTokens,
      temperature,
      keyId: overrideApiKey ? 'override' : 'default',
      endpoint: requestUrl,
    });

    try {
      const response = await this.fetchWithTimeout(
        requestUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${effectiveKey}`,
          },
          body: JSON.stringify(body),
        },
        60000
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw Object.assign(new Error(`Qwen API error ${response.status}: ${errorText}`), {
          statusCode: response.status,
          endpoint: requestUrl,
        });
      }

      const data = (await response.json()) as Record<string, unknown>;

      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content ?? '';
      const usage = (data.usage ?? {}) as Record<string, number>;
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

      log.info('[qwen] Response received', {
        promptTokens,
        completionTokens,
        totalTokens,
        contentLength: content.length,
      });

      return {
        content,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      };
    } catch (err) {
      this.logError('Request failed', err);
      throw err;
    }
  }
}
