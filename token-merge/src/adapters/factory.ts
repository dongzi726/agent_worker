// ============================================================
// adapters/factory.ts — Adapter factory (v2: vendor-level + v1 compat)
// ============================================================

import type { ModelConfig, VendorConfig, KeyEntryConfig } from '../types';
import type { ModelAdapter } from './base';
import { KeyPool } from '../keyPool';
import { QwenAdapter } from './qwen';
import { MiniMaxAdapter } from './minimax';
import { GLMAdapter } from './glm';
import { log } from '../logger';

/**
 * Create adapter instances from v2 VendorConfig[].
 * Resolves API keys from environment and creates adapters for each model.
 * The default key (label="default") or first key is used as the adapter's default API key.
 * At runtime, the router will pass the specific key to each adapter call.
 */
export function createAdaptersFromVendors(
  vendors: VendorConfig[]
): Map<string, ModelAdapter> {
  const adapters = new Map<string, ModelAdapter>();

  for (const vendor of vendors) {
    // Resolve API keys from config.json
    const keyMap = new Map<string, string>();
    for (const kp of vendor.key_pool) {
      const apiKey = kp.api_key;
      if (!apiKey) {
        log.warn(`Vendor "${vendor.id}" key "${kp.label}": api_key not set, skipping key`);
        continue;
      }
      keyMap.set(kp.label, apiKey);
    }

    // Create adapters for this vendor's models
    for (const m of vendor.models) {
      // Default key: 'default' label if exists, else first key
      const firstKey = keyMap.values().next().value as string | undefined;
      const defaultKey = keyMap.get('default') ?? firstKey ?? '';
      let adapter: ModelAdapter | undefined;
      switch (m.type) {
        case 'qwen':
          adapter = new QwenAdapter(m.endpoint, defaultKey, m.model_name, m.id);
          break;
        case 'minimax':
          adapter = new MiniMaxAdapter(m.endpoint, defaultKey, m.model_name, m.id);
          break;
        case 'glm':
          adapter = new GLMAdapter(m.endpoint, defaultKey, m.model_name, m.id);
          break;
        default:
          log.warn(`Unknown model type "${m.type}" for model ${m.id}, skipping`);
          continue;
      }
      if (adapter) {
        adapters.set(m.id, adapter);
      }
    }
  }

  log.info('Adapters created from vendors', {
    vendorCount: vendors.length,
    adapterCount: adapters.size,
  });

  return adapters;
}

/**
 * Create KeyPool instances from v2 VendorConfig[].
 * This is a separate function so that KeyPool creation can be done independently
 * from adapter creation (e.g., when KeyPools are created in index.ts directly).
 * Returns vendorId → KeyPool map.
 */
export function createKeyPoolsFromVendors(
  vendors: VendorConfig[],
  statsWindowMs: number
): Map<string, KeyPool> {
  const keyPools = new Map<string, KeyPool>();

  for (const vendor of vendors) {
    const keyEntries: { config: KeyEntryConfig; apiKey: string }[] = [];
    for (const kp of vendor.key_pool) {
      const apiKey = kp.api_key;
      if (!apiKey) {
        continue;
      }
      keyEntries.push({ config: kp, apiKey });
    }

    if (keyEntries.length === 0) {
      log.warn(`Vendor "${vendor.id}": no valid keys found, skipping KeyPool`);
      continue;
    }

    const keyPool = new KeyPool(
      vendor.id,
      vendor.key_routing_strategy,
      keyEntries,
      statsWindowMs
    );
    keyPools.set(vendor.id, keyPool);
  }

  log.info('KeyPools created from vendors', {
    vendorCount: vendors.length,
    keyPoolCount: keyPools.size,
  });

  return keyPools;
}

/** Legacy v1 function: create adapters from flat model list. */
export function createAdapters(models: ModelConfig[]): Map<string, ModelAdapter> {
  const adapters = new Map<string, ModelAdapter>();

  for (const m of models) {
    const apiKey = (m as unknown as Record<string, string>)['api_key'];
    if (!apiKey) {
      log.warn(`Skipping model ${m.id}: api_key not configured`);
      continue;
    }

    let adapter: ModelAdapter | undefined;
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
    if (adapter) {
      adapters.set(m.id, adapter);
    }
  }

  return adapters;
}
