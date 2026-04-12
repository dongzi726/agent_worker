// ============================================================
// keyPool.ts — Vendor KeyPool management and routing
//
// Key states are ALL IN-MEMORY and lost on service restart.
// This is a known limitation — P2 considers persistence.
//
// CONCURRENCY SAFETY (TR-7):
// All state update methods are synchronous (non-async).
// Node.js single-threaded event loop ensures no race conditions
// as long as no `await` occurs between read and write.
// ============================================================

import type {
  KeyState,
  KeyStateWithInfo,
  KeyRoutingStrategy,
  FailureType,
  KeyEntryConfig,
} from './types';
import { log } from './logger';

/**
 * Cooldown constants
 */
const COOLDOWN_RATE_LIMIT_MS = 60_000;       // 429 → 60s initial
const COOLDOWN_TIMEOUT_MS = 30_000;          // timeout → 30s initial
const COOLDOWN_MAX_MS = 300_000;             // 300s (5 min) max
const TIMEOUT_CONSECUTIVE_THRESHOLD = 3;     // 3 consecutive timeouts → cooldown
const DISABLED_CONSECUTIVE_THRESHOLD = 5;    // 5 consecutive failures → disabled
// const QUICK_RECOVERY_COOLDOWN_MAX_MULTIPLIER = 1; // Reserved for future quick recovery feature

export class KeyPool {
  private vendorId: string;
  private strategy: KeyRoutingStrategy;
  private keyStates: Map<string, KeyState>;
  private keyOrder: string[];                // For round_robin ordering
  private rrCursor: number;                  // Round-robin cursor (index into keyOrder)
  private rrCurrentWeightCount: number;      // How many times current key has been returned
  private statsWindowMs: number;

  /**
   * Initialize a KeyPool for a single vendor.
   * @param vendorId Vendor identifier (e.g., "qwen")
   * @param strategy Routing strategy
   * @param keyEntries Key entries from config (resolved API keys)
   * @param statsWindowMs Sliding window for call_count_24h
   */
  constructor(
    vendorId: string,
    strategy: KeyRoutingStrategy,
    keyEntries: { config: KeyEntryConfig; apiKey: string }[],
    statsWindowMs: number
  ) {
    this.vendorId = vendorId;
    this.strategy = strategy;
    this.statsWindowMs = statsWindowMs;
    this.keyStates = new Map();
    this.keyOrder = [];
    this.rrCursor = 0;
    this.rrCurrentWeightCount = 0;

    for (const entry of keyEntries) {
      const keyId = entry.config.label;
      const state: KeyState = {
        keyId,
        vendorId,
        status: 'healthy',
        callTimestamps: [],
        consecutiveFailures: 0,
        lastUsedAt: null,
        lastFailureAt: null,
        cooldownUntil: null,
        cooldownBaseMs: 0,
        weight: Math.max(1, entry.config.weight ?? 1),
        totalCalls: 0,
        totalFailures: 0,
        totalCooldowns: 0,
        isQuickRecovery: false,
      };
      this.keyStates.set(keyId, state);
      this.keyOrder.push(keyId);
    }

    log.info(`KeyPool initialized`, {
      vendorId,
      strategy,
      keyCount: keyEntries.length,
      keys: keyEntries.map(e => e.config.label),
    });
  }

  /**
   * Get the resolved API key string for a given key ID.
   * Note: This class doesn't store the actual key string —
   * the adapter factory passes resolved keys. Use a lookup map.
   */
  // API key storage is handled externally; adapters receive the key directly.

  /**
   * Get the stored API key for a keyId (used by adapter factory).
   */
  private apiKeyMap: Map<string, string> = new Map();

  /**
   * Set the resolved API key for a keyId (called after construction).
   */
  setApiKey(keyId: string, apiKey: string): void {
    this.apiKeyMap.set(keyId, apiKey);
  }

  /**
   * Get the resolved API key for a keyId.
   */
  getApiKey(keyId: string): string | undefined {
    return this.apiKeyMap.get(keyId);
  }

  // ============================================================
  // Key selection (SYNCHRONOUS — TR-7 concurrency safety)
  // ============================================================

  /**
   * Select a key based on the configured strategy.
   * Returns null if no healthy key is available.
   *
   * This is a synchronous function — no await inside.
   */
  selectKey(): { keyId: string; isQuickRecovery: boolean } | null {
    // Check for cooldown storm: all keys cooldown/disabled
    const allUnavailable = this.areAllKeysUnavailable();
    if (allUnavailable) {
      const candidate = this.getQuickRecoveryCandidateSync();
      if (candidate) {
        log.warn('Quick recovery triggered', {
          vendorId: this.vendorId,
          keyId: candidate.keyId,
        });
        return { keyId: candidate.keyId, isQuickRecovery: true };
      }
      return null;
    }

    // Filter out cooldown/disabled keys (except quick recovery candidates)
    const healthyKeys = this.getHealthyKeysSync();
    if (healthyKeys.length === 0) return null;

    if (this.strategy === 'least_used') {
      return this.selectLeastUsedSync(healthyKeys);
    }

    // round_robin (default)
    return this.selectRoundRobinSync(healthyKeys);
  }

  /**
   * Select the next key for fallback (excluding the failed key).
   *
   * This is a synchronous function — no await inside.
   */
  selectNextKey(excludeKeyIds: Set<string>): { keyId: string; isQuickRecovery: boolean } | null {
    // Try quick recovery first if all remaining keys are unavailable
    const remainingKeys = this.keyOrder.filter(k => !excludeKeyIds.has(k));
    const allRemainingUnavailable = remainingKeys.every(k => {
      const state = this.keyStates.get(k)!;
      if (state.status === 'disabled') return true;
      if (state.status === 'cooldown') {
        if (!state.cooldownUntil) return true;
        if (state.cooldownUntil.getTime() > Date.now()) return true;
      }
      return false;
    });

    if (allRemainingUnavailable && remainingKeys.length > 0) {
      // Try quick recovery among remaining keys
      for (const keyId of remainingKeys) {
        const state = this.keyStates.get(keyId)!;
        if (state.status === 'cooldown') {
          log.warn('Quick recovery for fallback', {
            vendorId: this.vendorId,
            keyId,
          });
          return { keyId, isQuickRecovery: true };
        }
      }
    }

    const healthyKeys = remainingKeys.filter(k => this.isKeyHealthySync(k));
    if (healthyKeys.length === 0) return null;

    if (this.strategy === 'least_used') {
      return this.selectLeastUsedSync(healthyKeys);
    }

    // For fallback with round_robin, just pick the first healthy key (simplest)
    return { keyId: healthyKeys[0], isQuickRecovery: false };
  }

  // ============================================================
  // State updates (SYNCHRONOUS — TR-7 concurrency safety)
  // ============================================================

  /**
   * Record a successful call for a key.
   * Resets consecutive failures and clears quick recovery flag.
   */
  recordSuccess(keyId: string): void {
    const state = this.keyStates.get(keyId);
    if (!state) return;

    state.callTimestamps.push(Date.now());
    state.totalCalls++;
    state.consecutiveFailures = 0;
    state.lastUsedAt = new Date();
    state.isQuickRecovery = false;
    state.lastFailureAt = null;

    // If was in cooldown and recovered, keep it healthy
    if (state.status === 'cooldown') {
      state.status = 'healthy';
      state.cooldownUntil = null;
      state.cooldownBaseMs = 0;
    }
  }

  /**
   * Record a failed call for a key.
   * Updates status based on failure type.
   */
  recordFailure(keyId: string, failureType: FailureType): void {
    const state = this.keyStates.get(keyId);
    if (!state) return;

    state.totalFailures++;
    state.lastFailureAt = new Date();

    if (failureType === 'token_exhausted') {
      // Don't change key status — this is a model-level issue
      state.consecutiveFailures = 0;
      return;
    }

    if (failureType === 'auth_failure') {
      // Immediate disable
      state.status = 'disabled';
      state.cooldownUntil = null;
      state.consecutiveFailures++;
      log.warn(`Key disabled due to auth failure`, {
        vendorId: this.vendorId,
        keyId,
        totalFailures: state.totalFailures,
      });
      return;
    }

    if (failureType === 'server_error') {
      // Log but don't change status — upstream temporary issue
      state.consecutiveFailures = 0;
      return;
    }

    // Rate limited (429) — immediate cooldown
    if (failureType === 'rate_limited') {
      state.consecutiveFailures++;
      this.applyCooldownSync(state, COOLDOWN_RATE_LIMIT_MS);
      return;
    }

    // Timeout/network error — cooldown after threshold
    if (failureType === 'timeout') {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= TIMEOUT_CONSECUTIVE_THRESHOLD) {
        this.applyCooldownSync(state, COOLDOWN_TIMEOUT_MS);
      }
      return;
    }

    // Unknown error
    state.consecutiveFailures++;
    if (state.consecutiveFailures >= DISABLED_CONSECUTIVE_THRESHOLD) {
      state.status = 'disabled';
      log.warn(`Key disabled after ${DISABLED_CONSECUTIVE_THRESHOLD} consecutive failures`, {
        vendorId: this.vendorId,
        keyId,
      });
    }
  }

  /**
   * Check if a cooldown key has expired and auto-recover it.
   * Returns true if the key is now healthy (or was already healthy).
   */
  isKeyAvailable(keyId: string): boolean {
    const state = this.keyStates.get(keyId);
    if (!state) return false;

    if (state.status === 'healthy') return true;
    if (state.status === 'disabled') return false;

    // Check cooldown expiry
    if (state.status === 'cooldown' && state.cooldownUntil) {
      if (state.cooldownUntil.getTime() <= Date.now()) {
        // Auto-recover
        state.status = 'healthy';
        state.cooldownUntil = null;
        state.consecutiveFailures = 0;
        state.isQuickRecovery = false;
        log.info(`Key auto-recovered from cooldown`, {
          vendorId: this.vendorId,
          keyId,
        });
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Reset a key's state (for admin API).
   * Clears cooldown, consecutive failures, but keeps call stats.
   */
  resetKeyState(keyId: string): void {
    const state = this.keyStates.get(keyId);
    if (!state) return;

    state.status = 'healthy';
    state.consecutiveFailures = 0;
    state.cooldownUntil = null;
    state.isQuickRecovery = false;

    log.info(`Key state reset`, { vendorId: this.vendorId, keyId });
  }

  /**
   * Manually set a key's status.
   */
  setKeyStatus(keyId: string, status: 'healthy' | 'disabled'): void {
    const state = this.keyStates.get(keyId);
    if (!state) return;

    state.status = status;
    if (status === 'healthy') {
      state.consecutiveFailures = 0;
      state.cooldownUntil = null;
      state.isQuickRecovery = false;
    } else {
      state.cooldownUntil = null;
    }

    log.info(`Key status manually set`, {
      vendorId: this.vendorId,
      keyId,
      status,
    });
  }

  // ============================================================
  // Query methods
  // ============================================================

  /**
   * Get 24h call count for a key.
   * Also performs lazy cleanup of expired timestamps.
   */
  getCallCount24h(keyId: string): number {
    const state = this.keyStates.get(keyId);
    if (!state) return 0;

    const cutoff = Date.now() - this.statsWindowMs;
    let i = 0;
    while (i < state.callTimestamps.length && state.callTimestamps[i] < cutoff) {
      i++;
    }
    if (i > 0) {
      state.callTimestamps = state.callTimestamps.slice(i);
    }
    return state.callTimestamps.length;
  }

  /**
   * Get all key states for admin API.
   */
  getAllStates(): KeyStateWithInfo[] {
    const result: KeyStateWithInfo[] = [];
    for (const [keyId, state] of this.keyStates) {
      // Auto-recover expired cooldowns
      this.isKeyAvailable(keyId);

      result.push({
        key_id: state.keyId,
        vendor_id: state.vendorId,
        status: state.status,
        call_count_24h: this.getCallCount24h(keyId),
        consecutive_failures: state.consecutiveFailures,
        last_used_at: state.lastUsedAt?.toISOString() ?? null,
        last_failure_at: state.lastFailureAt?.toISOString() ?? null,
        cooldown_until: state.cooldownUntil?.toISOString() ?? null,
        weight: state.weight,
        total_calls: state.totalCalls,
        total_failures: state.totalFailures,
        total_cooldowns: state.totalCooldowns,
      });
    }
    return result;
  }

  /**
   * Get a single key state.
   */
  getState(keyId: string): KeyStateWithInfo | null {
    const state = this.keyStates.get(keyId);
    if (!state) return null;

    this.isKeyAvailable(keyId);

    return {
      key_id: state.keyId,
      vendor_id: state.vendorId,
      status: state.status,
      call_count_24h: this.getCallCount24h(keyId),
      consecutive_failures: state.consecutiveFailures,
      last_used_at: state.lastUsedAt?.toISOString() ?? null,
      last_failure_at: state.lastFailureAt?.toISOString() ?? null,
      cooldown_until: state.cooldownUntil?.toISOString() ?? null,
      weight: state.weight,
      total_calls: state.totalCalls,
      total_failures: state.totalFailures,
      total_cooldowns: state.totalCooldowns,
    };
  }

  /**
   * Check if all keys in this pool are unavailable (cooldown or disabled).
   */
  allKeysUnavailable(): boolean {
    return this.areAllKeysUnavailable();
  }

  /**
   * Get the number of healthy keys.
   */
  getHealthyCount(): number {
    let count = 0;
    for (const keyId of this.keyOrder) {
      if (this.isKeyAvailable(keyId)) count++;
    }
    return count;
  }

  /**
   * Get the total number of keys.
   */
  getKeyCount(): number {
    return this.keyStates.size;
  }

  /**
   * Get vendor ID.
   */
  getVendorId(): string {
    return this.vendorId;
  }

  /**
   * Get routing strategy.
   */
  getStrategy(): KeyRoutingStrategy {
    return this.strategy;
  }

  /**
   * Get key pool status summary for health check.
   */
  getStatusSummary(): { total: number; healthy: number; cooldown: number; disabled: number } {
    let healthy = 0, cooldown = 0, disabled = 0;
    for (const [, state] of this.keyStates) {
      if (state.status === 'healthy') healthy++;
      else if (state.status === 'cooldown') cooldown++;
      else if (state.status === 'disabled') disabled++;
    }
    return {
      total: this.keyStates.size,
      healthy,
      cooldown,
      disabled,
    };
  }

  // ============================================================
  // Periodic cleanup (call every 5 minutes)
  // ============================================================

  /**
   * Clean up expired timestamps from all keys.
   */
  cleanupExpiredTimestamps(): void {
    const cutoff = Date.now() - this.statsWindowMs;
    for (const [, state] of this.keyStates) {
      let i = 0;
      while (i < state.callTimestamps.length && state.callTimestamps[i] < cutoff) {
        i++;
      }
      if (i > 0) {
        state.callTimestamps = state.callTimestamps.slice(i);
      }
    }
  }

  // ============================================================
  // Private helpers (all synchronous)
  // ============================================================

  private isKeyHealthySync(keyId: string): boolean {
    const state = this.keyStates.get(keyId);
    if (!state) return false;
    if (state.status === 'healthy') return true;
    if (state.status === 'cooldown' && state.cooldownUntil) {
      if (state.cooldownUntil.getTime() <= Date.now()) {
        state.status = 'healthy';
        state.cooldownUntil = null;
        state.consecutiveFailures = 0;
        state.isQuickRecovery = false;
        return true;
      }
    }
    return false;
  }

  private getHealthyKeysSync(): string[] {
    return this.keyOrder.filter(k => this.isKeyHealthySync(k));
  }

  private areAllKeysUnavailable(): boolean {
    return this.keyOrder.every(k => {
      const state = this.keyStates.get(k)!;
      if (state.status === 'disabled') return true;
      if (state.status === 'cooldown') {
        if (!state.cooldownUntil) return true;
        if (state.cooldownUntil.getTime() > Date.now()) return true;
      }
      return false;
    });
  }

  private getQuickRecoveryCandidateSync(): { keyId: string } | null {
    let bestKey: string | null = null;
    let bestFailures = Infinity;

    for (const keyId of this.keyOrder) {
      const state = this.keyStates.get(keyId)!;
      if (state.status === 'cooldown' && state.consecutiveFailures < bestFailures) {
        bestFailures = state.consecutiveFailures;
        bestKey = keyId;
      }
    }

    if (bestKey) {
      this.keyStates.get(bestKey)!.isQuickRecovery = true;
      return { keyId: bestKey };
    }
    return null;
  }

  private selectRoundRobinSync(healthyKeys: string[]): { keyId: string; isQuickRecovery: boolean } {
    const n = healthyKeys.length;
    if (n === 0) return null as any;
    if (n === 1) return { keyId: healthyKeys[0], isQuickRecovery: false };

    // Find current key's position in healthyKeys from keyOrder
    // Advance cursor in keyOrder and find the next healthy key
    let selected: string | null = null;

    for (let i = 0; i < this.keyOrder.length; i++) {
      const idx = (this.rrCursor + i) % this.keyOrder.length;
      const candidate = this.keyOrder[idx];
      if (healthyKeys.includes(candidate)) {
        const state = this.keyStates.get(candidate)!;

        // Weight-aware: skip (weight - 1) additional times for this key
        if (this.rrCurrentWeightCount < state.weight - 1) {
          this.rrCurrentWeightCount++;
          selected = candidate;
          break;
        } else {
          this.rrCurrentWeightCount = 0;
          selected = candidate;
          break;
        }
      }
    }

    if (!selected) {
      selected = healthyKeys[0];
    }

    this.rrCursor = (this.keyOrder.indexOf(selected) + 1) % this.keyOrder.length;
    return { keyId: selected, isQuickRecovery: false };
  }

  private selectLeastUsedSync(healthyKeys: string[]): { keyId: string; isQuickRecovery: boolean } {
    let minCount = Infinity;
    let selected = healthyKeys[0];

    for (const keyId of healthyKeys) {
      const count = this.getCallCount24h(keyId);
      if (count < minCount) {
        minCount = count;
        selected = keyId;
      }
    }

    return { keyId: selected, isQuickRecovery: false };
  }

  private applyCooldownSync(state: KeyState, baseMs: number): void {
    state.totalCooldowns++;

    // If this key is already in cooldown, double the duration (exponential backoff)
    if (state.status === 'cooldown' && state.cooldownBaseMs > 0) {
      state.cooldownBaseMs = Math.min(state.cooldownBaseMs * 2, COOLDOWN_MAX_MS);
    } else {
      state.cooldownBaseMs = Math.max(baseMs, state.cooldownBaseMs || baseMs);
    }

    // Cap at max
    const cooldownMs = Math.min(state.cooldownBaseMs, COOLDOWN_MAX_MS);

    // Quick recovery: don't increase cooldown beyond current value
    if (state.isQuickRecovery) {
      // Use the existing cooldownBaseMs without increasing
      state.cooldownBaseMs = Math.min(state.cooldownBaseMs, COOLDOWN_MAX_MS);
    }

    state.status = 'cooldown';
    state.cooldownUntil = new Date(Date.now() + cooldownMs);

    log.warn(`Key entered cooldown`, {
      vendorId: this.vendorId,
      keyId: state.keyId,
      cooldownMs,
      consecutiveFailures: state.consecutiveFailures,
    });

    // Check if should disable after too many cooldowns
    if (state.consecutiveFailures >= DISABLED_CONSECUTIVE_THRESHOLD) {
      state.status = 'disabled';
      state.cooldownUntil = null;
      log.warn(`Key disabled after ${state.consecutiveFailures} consecutive failures`, {
        vendorId: this.vendorId,
        keyId: state.keyId,
      });
    }
  }
}
