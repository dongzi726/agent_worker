// ============================================================
// adapters/minimax.ts — MiniMax adapter (v2)
// MiniMax API has its own format (not OpenAI-compatible)
// ============================================================

import type { AdapterResult } from '../types';
import { ModelAdapter } from './base';
import { log } from '../logger';

export class MiniMaxAdapter extends ModelAdapter {
  readonly modelType = 'minimax';
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
    const messages: Array<{ sender_type: string; text: string }> = [];
    if (systemPrompt) {
      messages.push({ sender_type: 'SYSTEM', text: systemPrompt });
    }
    messages.push({ sender_type: 'USER', text: prompt });

    const body = {
      model: this.modelName,
      messages,
      max_tokens: maxTokens,
      temperature,
      bot_setting: systemPrompt || '',
    };

    const effectiveKey = this.getEffectiveApiKey(overrideApiKey);

    log.debug('[minimax] Sending request', { model: this.modelName, maxTokens, temperature, keyId: overrideApiKey ? 'override' : 'default' });

    try {
      const response = await this.fetchWithTimeout(
        this.endpoint,
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
        throw new Error(`MiniMax API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      let content = '';
      let promptTokens = 0;
      let completionTokens = 0;

      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const usage = (data.usage ?? {}) as Record<string, unknown>;

      if (choices && choices.length > 0) {
        content = choices[0]?.message?.content ?? '';
        promptTokens = (usage.prompt_tokens as number) ?? 0;
        completionTokens = (usage.completion_tokens as number) ?? 0;
      } else if (typeof data.reply === 'string') {
        content = data.reply;
        const tokens = (usage.tokens as Array<{ type?: string; tokens?: number }> | undefined) ?? [];
        promptTokens = tokens.find((t) => t.type === 'prompt')?.tokens ?? 0;
        completionTokens = tokens.find((t) => t.type === 'completion')?.tokens ?? 0;
      } else if (Array.isArray(data.reply_choices)) {
        content = (data.reply_choices[0] as { text?: string })?.text ?? '';
        const totalTokensNum = (usage.total_tokens as number) ?? 0;
        promptTokens = totalTokensNum ? Math.floor(totalTokensNum * 0.3) : 0;
        completionTokens = totalTokensNum ? Math.floor(totalTokensNum * 0.7) : 0;
      }

      const totalTokens = promptTokens + completionTokens;

      log.info('[minimax] Response received', {
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
