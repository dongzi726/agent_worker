// ============================================================
// config.ts — Configuration loader (v2: vendor-level + v1 backward compat)
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AppConfig,
  VendorConfig,
  ModelConfig,
  KeyEntryConfig,
} from './types';
import { log } from './logger';

/** Resolve config.json path relative to project root */
function resolveConfigPath(): string {
  const projectRoot = path.resolve(__dirname, '..');
  return path.join(projectRoot, 'config.json');
}

/**
 * Load and validate configuration.
 * Supports both v2 (vendor-level) and v1 (flat models array) formats.
 * v1 format is automatically transformed into v2 internal representation.
 */
export function loadConfig(): AppConfig {
  const configPath = resolveConfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let rawConfig: Record<string, unknown>;
  try {
    rawConfig = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }

  const port = (rawConfig.port as number) || 3000;
  const bindAddress = (rawConfig.bindAddress as string) || '127.0.0.1';
  const logLevelRaw = (rawConfig.logLevel as string) || 'info';
  const logLevel =
    logLevelRaw === 'debug' || logLevelRaw === 'info' || logLevelRaw === 'warn' || logLevelRaw === 'error'
      ? logLevelRaw
      : 'info';
  const requestTimeoutMs = (rawConfig.requestTimeoutMs as number) || 60000;
  const maxFallbackAttempts = (rawConfig.maxFallbackAttempts as number) || 3;
  const totalRequestTimeoutMs = (rawConfig.totalRequestTimeoutMs as number) || 90000;
  const includeFallbackDetail = (rawConfig.includeFallbackDetail as boolean) || false;
  const keyStatsWindowHours = (rawConfig.keyStatsWindowHours as number) || 24;

  // Detect v2 vs v1 format
  const hasVendors = rawConfig.vendors !== undefined && rawConfig.vendors !== null;
  const hasModels = Array.isArray(rawConfig.models) && (rawConfig.models as unknown[]).length > 0;

  if (hasVendors) {
    return parseV2Config(rawConfig, {
      port, bindAddress, requestTimeoutMs, maxFallbackAttempts,
      totalRequestTimeoutMs, includeFallbackDetail, keyStatsWindowHours, logLevel,
    });
  } else if (hasModels) {
    log.info('Detected v1 config format, auto-transforming to v2 internal representation');
    return transformV1ToV2(rawConfig, {
      port, bindAddress, requestTimeoutMs, maxFallbackAttempts,
      totalRequestTimeoutMs, includeFallbackDetail, keyStatsWindowHours, logLevel,
    });
  } else {
    throw new Error(
      'Config must define either "vendors" (v2 format) or "models" (v1 format) with at least one entry'
    );
  }
}

/**
 * Parse v2 vendor-level configuration.
 */
function parseV2Config(
  rawConfig: Record<string, unknown>,
  serverSettings: {
    port: number;
    bindAddress: string;
    requestTimeoutMs: number;
    maxFallbackAttempts: number;
    totalRequestTimeoutMs: number;
    includeFallbackDetail: boolean;
    keyStatsWindowHours: number;
    logLevel: AppConfig['logLevel'];
  }
): AppConfig {
  const vendorsRaw = rawConfig.vendors as Record<string, unknown>;
  const vendors: VendorConfig[] = [];

  for (const [vendorId, vendorRaw] of Object.entries(vendorsRaw)) {
    const v = vendorRaw as Record<string, unknown>;
    const vendorType = v.type as string;

    if (!vendorType) {
      throw new Error(`Vendor "${vendorId}": missing required field "type"`);
    }

    // Check for mix of api_key and key_pool
    const hasApiKey = typeof v.api_key === 'string';
    const hasKeyPool = Array.isArray(v.key_pool);

    if (hasApiKey && hasKeyPool) {
      throw new Error(
        `Vendor "${vendorId}": cannot mix "api_key" and "key_pool". Use one or the other.`
      );
    }

    let keyPool: KeyEntryConfig[];

    if (hasKeyPool) {
      const poolEntries = v.key_pool as Array<Record<string, unknown>>;
      if (poolEntries.length === 0) {
        throw new Error(`Vendor "${vendorId}": key_pool must contain at least one key`);
      }

      const keySet = new Set<string>();
      const labelSet = new Set<string>();
      keyPool = poolEntries.map((entry, index) => {
        const apiKey = entry.api_key as string;
        if (!apiKey) {
          throw new Error(`Vendor "${vendorId}": key_pool[${index}] missing "api_key"`);
        }

        const label = (entry.label as string) || `key-${index + 1}`;
        const weight = typeof entry.weight === 'number' && entry.weight > 0 ? entry.weight : 1;

        if (keySet.has(apiKey)) {
          throw new Error(
            `Vendor "${vendorId}": duplicate api_key in key_pool`
          );
        }
        keySet.add(apiKey);

        if (labelSet.has(label)) {
          throw new Error(`Vendor "${vendorId}": duplicate label "${label}" in key_pool`);
        }
        labelSet.add(label);

        return { api_key: apiKey, weight, label };
      });
    } else if (hasApiKey) {
      const apiKey = v.api_key as string;
      const label = (v.key_label as string) || 'default';
      keyPool = [{ api_key: apiKey, weight: 1, label }];
    } else {
      throw new Error(
        `Vendor "${vendorId}": must define either "key_pool" array or "api_key"`
      );
    }

    // Parse models
    const modelsRaw = v.models as Array<Record<string, unknown>>;
    if (!Array.isArray(modelsRaw) || modelsRaw.length === 0) {
      throw new Error(`Vendor "${vendorId}": must define at least one model`);
    }

    const models: ModelConfig[] = modelsRaw.map((m, index) => {
      const modelId = m.id as string;
      if (!modelId) {
        throw new Error(`Vendor "${vendorId}": model[${index}] missing "id"`);
      }
      return {
        id: modelId,
        name: (m.name as string) || modelId,
        type: vendorType as ModelConfig['type'],
        vendorId,
        model_name: (m.model_name as string) || modelId,
        endpoint: m.endpoint as string,
        total_tokens: m.total_tokens as number,
      };
    });

    const strategy = (v.key_routing_strategy as string) || 'round_robin';
    if (strategy !== 'round_robin' && strategy !== 'least_used') {
      throw new Error(
        `Vendor "${vendorId}": invalid key_routing_strategy "${strategy}". Use "round_robin" or "least_used".`
      );
    }

    vendors.push({
      id: vendorId,
      type: vendorType as ModelConfig['type'],
      key_pool: keyPool,
      key_routing_strategy: strategy,
      models,
    });
  }

  const allModels: ModelConfig[] = vendors.flatMap((v) => v.models);

  return {
    ...serverSettings,
    models: allModels,
    vendors,
  };
}

/**
 * Transform v1 flat models array into v2 internal representation.
 * Groups models by type, each type becomes a vendor with a single-key KeyPool.
 */
function transformV1ToV2(
  rawConfig: Record<string, unknown>,
  serverSettings: {
    port: number;
    bindAddress: string;
    requestTimeoutMs: number;
    maxFallbackAttempts: number;
    totalRequestTimeoutMs: number;
    includeFallbackDetail: boolean;
    keyStatsWindowHours: number;
    logLevel: AppConfig['logLevel'];
  }
): AppConfig {
  const modelsRaw = rawConfig.models as Array<Record<string, unknown>>;

  if (!Array.isArray(modelsRaw) || modelsRaw.length === 0) {
    throw new Error('Config "models" must be a non-empty array');
  }

  // Group by type
  const byType = new Map<string, Array<Record<string, unknown>>>();
  for (const m of modelsRaw) {
    const t = m.type as string;
    const list = byType.get(t) || [];
    list.push(m);
    byType.set(t, list);
  }

  // Check for same type with different api_key (migration required)
  for (const [type, models] of byType) {
    const apiKeys = new Set(models.map((mm) => mm.api_key));
    if (apiKeys.size > 1) {
      throw new Error(
        `Migration required: models of type "${type}" have different api_key values. ` +
          `In v2, all models of the same vendor must share a KeyPool. ` +
          `Please reconfigure using the v2 "vendors" format.`
      );
    }
  }

  log.info('v1 config: model-level api_key will be used as vendor-level single Key');

  const vendors: VendorConfig[] = [];
  const allModels: ModelConfig[] = [];

  for (const [type, models] of byType) {
    const vendorId = type;
    const apiKey = models[0].api_key as string;

    if (!apiKey) {
      log.warn(`Skipping vendor "${vendorId}": api_key not set`);
      continue;
    }

    const vendorModels: ModelConfig[] = models.map((m) => ({
      id: m.id as string,
      name: (m.name as string) || (m.id as string),
      type: type as ModelConfig['type'],
      vendorId,
      model_name: (m.model_name as string) || (m.id as string),
      endpoint: m.endpoint as string,
      total_tokens: m.total_tokens as number,
    }));

    const keyPool: KeyEntryConfig[] = [
      { api_key: apiKey, weight: 1, label: 'default' },
    ];

    vendors.push({
      id: vendorId,
      type: type as ModelConfig['type'],
      key_pool: keyPool,
      key_routing_strategy: 'round_robin',
      models: vendorModels,
    });

    allModels.push(...vendorModels);
  }

  if (vendors.length === 0) {
    throw new Error(
      'No vendors could be loaded from v1 config — check that all api_key fields are set'
    );
  }

  return {
    ...serverSettings,
    models: allModels,
    vendors,
  };
}

/**
 * Resolve all API keys directly from vendor key_pool configuration.
 * Returns array of { config, apiKey } pairs.
 */
export function resolveVendorKeys(vendor: VendorConfig): { config: KeyEntryConfig; apiKey: string }[] {
  const results: { config: KeyEntryConfig; apiKey: string }[] = [];

  for (const entry of vendor.key_pool) {
    const apiKey = entry.api_key;
    if (!apiKey) {
      log.warn(`Vendor "${vendor.id}": api_key missing, skipping key "${entry.label}"`);
      continue;
    }
    results.push({ config: entry, apiKey });
  }

  return results;
}
