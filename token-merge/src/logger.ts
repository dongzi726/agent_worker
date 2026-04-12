// ============================================================
// logger.ts — Simple structured logger
// ============================================================

import type { LogLevel } from './types';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level.toUpperCase()} ${message}`;
  const formatted = meta && Object.keys(meta).length > 0
    ? `${base} ${JSON.stringify(meta)}`
    : base;
  if (level === 'error') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }
}

export function setLogLevel(level: LogLevel | undefined): void {
  if (!level) return;
  currentLevel = level;
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => writeLog('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => writeLog('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => writeLog('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => writeLog('error', msg, meta),
};
