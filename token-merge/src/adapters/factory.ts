// ============================================================
// adapters/factory.ts — Adapter factory
// ============================================================

import type { ModelConfig } from '../types';
import type { ModelAdapter } from './base';
import { QwenAdapter } from './qwen';
import { MiniMaxAdapter } from './minimax';
import { GLMAdapter } from './glm';
import { log } from '../logger';

/** Create adapter instances for all configured models */
export function createAdapters(models: ModelConfig[]): Map<string, ModelAdapter> {
  const adapters = new Map<string, ModelAdapter>();

  for (const m of models) {
    // Read API key from environment
    const apiKey = process.env[m.api_key_env];
    if (!apiKey) {
      log.warn(`Skipping model ${m.id}: API key not configured (env: ${m.api_key_env})`);
      continue;
    }

    let adapter: ModelAdapter;
    switch (m.type) {
      case 'qwen':
        adapter = new QwenAdapter(m.endpoint, apiKey, m.model_name, m.id);
        break;
      case 'minimax':
        adapter = new MiniMaxAdapter(m.endpoint, apiKey, m.model_name, m.id);
        break;
      case 'glm':
        adapter = new GLMAdapter(m.endpoint, apiKey, m.model_name, m.id);
        break;
      default:
        log.warn(`Unknown model type "${m.type}" for model ${m.id}, skipping`);
        continue;
    }

    adapters.set(m.id, adapter);
    log.info(`Adapter created for ${m.id} (${m.type}: ${m.model_name})`);
  }

  return adapters;
}
