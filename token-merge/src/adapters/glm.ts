// ============================================================
// adapters/glm.ts — GLM (智谱) adapter (v2)
// ZhipuAI API with its own auth mechanism (JWT with API key signing)
// ============================================================

import * as crypto from 'node:crypto';
import type { AdapterResult } from '../types';
import { ModelAdapter } from './base';
import { log } from '../logger';

export class GLMAdapter extends ModelAdapter {
  readonly modelType = 'glm';
  readonly modelId: string;

  constructor(endpoint: string, apiKey: string, modelName: string, modelId: string) {
    super(endpoint, apiKey, modelName);
    this.modelId = modelId;
  }

  /** Parse a GLM API key into id and secret */
  private parseKey(apiKey: string): { keyId: string; keySecret: string } {
    const parts = apiKey.split('.');
    return { keyId: parts[0] ?? apiKey, keySecret: parts[1] ?? apiKey };
  }

  /** Generate JWT token for ZhipuAI authentication */
  private generateToken(keyId: string, keySecret: string): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // 1 hour

    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', sign_type: 'SIGN', typ: 'JWT' })
    ).toString('base64url');

    const payload = Buffer.from(
      JSON.stringify({
        api_key: keyId,
        exp,
        timestamp: now,
      })
    ).toString('base64url');

    const signingInput = `${header}.${payload}`;
    const signature = crypto
      .createHmac('sha256', keySecret)
      .update(signingInput)
      .digest('base64url');

    return `${signingInput}.${signature}`;
  }

  async call(
    prompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt?: string,
    overrideApiKey?: string
  ): Promise<AdapterResult> {
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

    const effectiveKey = overrideApiKey ?? this.apiKey;
    const { keyId, keySecret } = this.parseKey(effectiveKey);
    const token = this.generateToken(keyId, keySecret);

    log.debug('[glm] Sending request', { model: this.modelName, maxTokens, temperature, keyId: overrideApiKey ? 'override' : 'default' });

    try {
      const response = await this.fetchWithTimeout(
        this.endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
        60000
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GLM API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content = choices?.[0]?.message?.content ?? '';
      const usage = (data.usage ?? {}) as Record<string, number>;
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

      log.info('[glm] Response received', {
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
