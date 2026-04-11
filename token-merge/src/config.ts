// ============================================================
// config.ts — Configuration loader
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from './types';

/** Resolve config.json path relative to project root */
function resolveConfigPath(): string {
  const envPath = process.env.CONFIG_PATH;
  if (envPath) return path.resolve(envPath);
  const projectRoot = path.resolve(__dirname, '..');
  return path.join(projectRoot, 'config.json');
}

/** Load and validate configuration */
export function loadConfig(): AppConfig {
  const configPath = resolveConfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let config: AppConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }

  // Apply env overrides
  config.port = parseInt(process.env.PORT as string, 10) || config.port || 3000;
  config.bindAddress = process.env.BIND_ADDRESS || config.bindAddress || '127.0.0.1';
  config.requestTimeoutMs =
    parseInt(process.env.REQUEST_TIMEOUT_MS as string, 10) || config.requestTimeoutMs || 60000;
  config.maxFallbackAttempts =
    parseInt(process.env.MAX_FALLBACK_ATTEMPTS as string, 10) || config.maxFallbackAttempts || 3;

  // Validate models
  if (!Array.isArray(config.models) || config.models.length === 0) {
    throw new Error('Config must define at least one model');
  }

  return config;
}
