/**
 * v2 Tests: KeyPool core logic
 * Covers: V2-F2 (routing strategies), V2-F4 (failure handling), V2-F5 (fallback)
 */
import { KeyPool } from '../../src/keyPool';
import type { KeyEntryConfig } from '../../src/types';

let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}

function makePool(
  vendorId: string,
  strategy: 'round_robin' | 'least_used',
  count: number,
  weights?: number[]
) {
  const entries: { config: KeyEntryConfig; apiKey: string }[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      config: { api_key: `sk-test-key-${i}`, label: `key-${i + 1}`, weight: weights?.[i] ?? 1 },
      apiKey: `sk-test-key-${i}`,
    });
  }
  return new KeyPool(vendorId, strategy, entries, 24 * 3600 * 1000);
}

// ====== V2-F2: Round Robin ======
console.log('\n=== V2-F2.1: Round Robin — Equal Weight ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  const counts = { 'key-1': 0, 'key-2': 0, 'key-3': 0 };

  for (let i = 0; i < 99; i++) {
    const sel = pool.selectKey();
    if (sel) counts[sel.keyId as keyof typeof counts]++;
  }

  assert(counts['key-1'] > 25, `key-1 selected ${counts['key-1']} times (expect ~33)`);
  assert(counts['key-2'] > 25, `key-2 selected ${counts['key-2']} times (expect ~33)`);
  assert(counts['key-3'] > 25, `key-3 selected ${counts['key-3']} times (expect ~33)`);
}

// ====== V2-F2: Round Robin with weights ======
console.log('\n=== V2-F2.2: Round Robin — Weighted ===');
{
  const pool = makePool('qwen', 'round_robin', 3, [2, 1, 1]);
  const counts = { 'key-1': 0, 'key-2': 0, 'key-3': 0 };

  for (let i = 0; i < 100; i++) {
    const sel = pool.selectKey();
    if (sel) counts[sel.keyId as keyof typeof counts]++;
  }

  assert(counts['key-1'] > counts['key-2'], `key-1(weight=2)=${counts['key-1']} > key-2(weight=1)=${counts['key-2']}`);
  assert(counts['key-1'] > counts['key-3'], `key-1(weight=2)=${counts['key-1']} > key-3(weight=1)=${counts['key-3']}`);
}

// ====== V2-F2: Least Used ======
console.log('\n=== V2-F2.3: Least Used — selects key with lowest call count ===');
{
  const pool = makePool('qwen', 'least_used', 3);

  // Manually add timestamps to key-1 to simulate higher usage
  for (let i = 0; i < 100; i++) {
    pool.recordSuccess('key-1');
  }
  for (let i = 0; i < 10; i++) {
    pool.recordSuccess('key-2');
  }

  const sel = pool.selectKey();
  assert(sel?.keyId === 'key-3', `Least used selected key-3 (0 calls), got: ${sel?.keyId}`);
}

// ====== V2-F2: All keys cooldown/disabled ======
console.log('\n=== V2-F2.4: No healthy keys — returns null (or quick recovery) ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'rate_limited');
  pool.recordFailure('key-2', 'rate_limited');
  pool.recordFailure('key-3', 'rate_limited');

  const sel = pool.selectKey();
  assert(sel !== null, `Quick recovery provides a candidate: ${sel?.keyId}`);
  assert(sel?.isQuickRecovery === true, `Quick recovery flag is set: ${sel?.isQuickRecovery}`);
}

// ====== V2-F2: Single key ======
console.log('\n=== V2-F2.5: Single key — always returns it ===');
{
  const pool = makePool('glm', 'round_robin', 1);
  for (let i = 0; i < 10; i++) {
    const sel = pool.selectKey();
    assert(sel?.keyId === 'key-1', `Single key always selected, iteration ${i}`);
    pool.recordSuccess('key-1');
  }
}

// ====== V2-F4: Auth failure (401) → disabled ======
console.log('\n=== V2-F4.1: Auth failure → disabled ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'auth_failure');

  const state = pool.getState('key-1');
  assert(state?.status === 'disabled', `key-1 disabled after auth_failure, got: ${state?.status}`);
}

// ====== V2-F4: Rate limit (429) → cooldown ======
console.log('\n=== V2-F4.2: Rate limit → cooldown ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'rate_limited');

  const state = pool.getState('key-1');
  assert(state?.status === 'cooldown', `key-1 cooldown after rate_limited, got: ${state?.status}`);
  assert(state?.cooldown_until !== null, `cooldown_until is set`);
  assert(state?.consecutive_failures === 1, `consecutive_failures = 1, got: ${state?.consecutive_failures}`);
}

// ====== V2-F4: Timeout → cooldown after 3 consecutive ======
console.log('\n=== V2-F4.3: Timeout 2x → still healthy ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'timeout');
  pool.recordFailure('key-1', 'timeout');

  const state = pool.getState('key-1');
  assert(state?.status === 'healthy', `key-1 still healthy after 2 timeouts, got: ${state?.status}`);
}

console.log('=== V2-F4.4: Timeout 3x → cooldown ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'timeout');
  pool.recordFailure('key-1', 'timeout');
  pool.recordFailure('key-1', 'timeout');

  const state = pool.getState('key-1');
  assert(state?.status === 'cooldown', `key-1 cooldown after 3 timeouts, got: ${state?.status}`);
}

// ====== V2-F4: Cooldown auto-recovery ======
console.log('\n=== V2-F4.5: Cooldown auto-recovery ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'rate_limited');

  // Force cooldown to expire by directly setting cooldownUntil to past
  const keyPool = pool as unknown as { keyStates: Map<string, { cooldownUntil: Date | null; status: string }> };
  const ks = keyPool.keyStates.get('key-1')!;
  ks.cooldownUntil = new Date(Date.now() - 1000);

  const available = pool.isKeyAvailable('key-1');
  assert(available === true, `key-1 auto-recovered after cooldown expiry`);

  const state = pool.getState('key-1');
  assert(state?.status === 'healthy', `key-1 healthy after auto-recovery, got: ${state?.status}`);
}

// ====== V2-F4: Exponential backoff ======
console.log('\n=== V2-F4.6: Exponential backoff — cooldown doubles ===');
{
  const pool = makePool('qwen', 'round_robin', 3);

  // First rate limit → 60s cooldown
  pool.recordFailure('key-1', 'rate_limited');
  const state1 = pool.getState('key-1');
  const cooldown1 = state1?.cooldown_until ? new Date(state1.cooldown_until).getTime() - Date.now() : 0;

  // Force cooldown expired and record another failure
  const kp = pool as unknown as { keyStates: Map<string, { cooldownUntil: Date | null; status: string; cooldownBaseMs: number; consecutiveFailures: number }> };
  const ks1 = kp.keyStates.get('key-1')!;
  ks1.cooldownUntil = new Date(Date.now() - 1000);
  ks1.status = 'healthy';
  ks1.consecutiveFailures = 1; // Keep the count

  pool.recordFailure('key-1', 'rate_limited');
  const state2 = pool.getState('key-1');
  const cooldown2 = state2?.cooldown_until ? new Date(state2.cooldown_until).getTime() - Date.now() : 0;

  assert(cooldown2 > cooldown1 * 1.5, `Exponential backoff: ${cooldown2}ms > ${cooldown1}ms * 1.5`);
}

// ====== V2-F4: Success resets consecutiveFailures ======
console.log('\n=== V2-F4.7: Success resets consecutive failures ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'timeout');
  pool.recordFailure('key-1', 'timeout');
  pool.recordSuccess('key-1');

  const state = pool.getState('key-1');
  assert(state?.consecutive_failures === 0, `consecutive_failures reset to 0 after success`);
}

// ====== V2-F4: Token exhausted does NOT change key status ======
console.log('\n=== V2-F4.8: Token exhausted does NOT change key status ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'token_exhausted');

  const state = pool.getState('key-1');
  assert(state?.status === 'healthy', `key-1 still healthy after token_exhausted, got: ${state?.status}`);
  assert(state?.consecutive_failures === 0, `consecutive_failures not incremented for token_exhausted`);
}

// ====== V2-F4: Server error does NOT change key status ======
console.log('\n=== V2-F4.9: Server error does NOT change key status ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'server_error');

  const state = pool.getState('key-1');
  assert(state?.status === 'healthy', `key-1 still healthy after server_error, got: ${state?.status}`);
  assert(state?.consecutive_failures === 0, `consecutive_failures not incremented for server_error`);
}

// ====== V2-F4: Max cooldown 300s ======
console.log('\n=== V2-F4.10: Cooldown capped at 300s ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  const kp = pool as unknown as { keyStates: Map<string, { cooldownBaseMs: number; consecutiveFailures: number }> };
  const ks = kp.keyStates.get('key-1')!;

  // Simulate many backoffs
  ks.cooldownBaseMs = 150_000;
  pool.recordFailure('key-1', 'rate_limited');

  const state = pool.getState('key-1');
  const cooldownMs = state?.cooldown_until ? new Date(state.cooldown_until).getTime() - Date.now() : 0;
  assert(cooldownMs <= 310_000, `Cooldown capped at ~300s, got: ${cooldownMs}ms`);
}

// ====== V2-F5: selectNextKey excludes failed keys ======
console.log('\n=== V2-F5.1: selectNextKey excludes failed key ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  const next = pool.selectNextKey(new Set(['key-1']));
  assert(next !== null, `Next key selected after excluding key-1`);
  assert(next?.keyId !== 'key-1', `Selected key is not key-1, got: ${next?.keyId}`);
}

// ====== V2-F5: selectNextKey returns null when all excluded ======
console.log('\n=== V2-F5.2: selectNextKey null when all excluded ===');
{
  const pool = makePool('qwen', 'round_robin', 2);
  const next = pool.selectNextKey(new Set(['key-1', 'key-2']));
  assert(next === null, `No keys available when all excluded`);
}

// ====== V2-F5: selectNextKey skips disabled keys ======
console.log('\n=== V2-F5.3: selectNextKey skips disabled keys ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'auth_failure');
  pool.recordFailure('key-2', 'auth_failure');

  const next = pool.selectNextKey(new Set(['key-3']));
  assert(next === null, `No healthy keys after excluding key-3, key-1/key-2 disabled`);
}

// ====== V2-F2: cooldown keys not selected in normal routing ======
console.log('\n=== V2-F2.6: Cooldown key not in normal selection ===');
{
  const pool = makePool('qwen', 'round_robin', 2);
  pool.recordFailure('key-1', 'rate_limited');

  let foundKey1 = false;
  for (let i = 0; i < 50; i++) {
    const sel = pool.selectKey();
    if (sel?.keyId === 'key-1') {
      // Quick recovery might select it
      if (sel.isQuickRecovery) continue;
      foundKey1 = true;
    }
    if (sel) pool.recordSuccess(sel.keyId);
  }

  assert(!foundKey1, `Cooldown key-1 not normally selected (only via quick recovery)`);
}

// ====== Query methods ======
console.log('\n=== V2-F2.7: getHealthyCount / getKeyCount ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  assert(pool.getKeyCount() === 3, `getKeyCount = 3, got: ${pool.getKeyCount()}`);
  assert(pool.getHealthyCount() === 3, `getHealthyCount = 3, got: ${pool.getHealthyCount()}`);

  pool.recordFailure('key-1', 'rate_limited');
  assert(pool.getHealthyCount() === 2, `getHealthyCount = 2 after 1 cooldown, got: ${pool.getHealthyCount()}`);
}

// ====== getStatusSummary ======
console.log('\n=== V2-F2.8: getStatusSummary ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'rate_limited');
  pool.recordFailure('key-2', 'auth_failure');

  const summary = pool.getStatusSummary();
  assert(summary.total === 3, `total = 3, got: ${summary.total}`);
  assert(summary.healthy === 1, `healthy = 1, got: ${summary.healthy}`);
  assert(summary.cooldown === 1, `cooldown = 1, got: ${summary.cooldown}`);
  assert(summary.disabled === 1, `disabled = 1, got: ${summary.disabled}`);
}

// ====== resetKeyState ======
console.log('\n=== V2-F2.9: resetKeyState ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-1', 'rate_limited');

  pool.resetKeyState('key-1');
  const state = pool.getState('key-1');
  assert(state?.status === 'healthy', `key-1 healthy after reset`);
  assert(state?.cooldown_until === null, `cooldown_until cleared after reset`);
  assert(state?.consecutive_failures === 0, `consecutive_failures cleared after reset`);
}

// ====== setKeyStatus ======
console.log('\n=== V2-F2.10: setKeyStatus ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.setKeyStatus('key-1', 'disabled');

  const state = pool.getState('key-1');
  assert(state?.status === 'disabled', `key-1 disabled via setKeyStatus`);

  pool.setKeyStatus('key-1', 'healthy');
  const state2 = pool.getState('key-1');
  assert(state2?.status === 'healthy', `key-1 healthy after re-enable`);
  assert(state2?.consecutive_failures === 0, `consecutive_failures cleared on re-enable`);
}

// ====== getApiKey / setApiKey ======
console.log('\n=== V2-F2.11: getApiKey ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  assert(pool.getApiKey('key-1') === 'sk-test-key-0', `getApiKey returns correct value`);
  assert(pool.getApiKey('nonexistent') === undefined, `getApiKey returns undefined for missing key`);
}

// ====== allKeysUnavailable ======
console.log('\n=== V2-F2.12: allKeysUnavailable ===');
{
  const pool = makePool('qwen', 'round_robin', 2);
  assert(pool.allKeysUnavailable() === false, `Not all unavailable initially`);

  pool.recordFailure('key-1', 'auth_failure');
  pool.recordFailure('key-2', 'auth_failure');
  assert(pool.allKeysUnavailable() === true, `All unavailable after both disabled`);
}

// ====== Round Robin skips cooldown keys ======
console.log('\n=== V2-F2.13: Round Robin skips cooldown keys gracefully ===');
{
  const pool = makePool('qwen', 'round_robin', 3);
  pool.recordFailure('key-2', 'rate_limited');

  const counts: Record<string, number> = {};
  for (let i = 0; i < 50; i++) {
    const sel = pool.selectKey();
    if (sel) {
      counts[sel.keyId] = (counts[sel.keyId] || 0) + 1;
      pool.recordSuccess(sel.keyId);
    }
  }

  assert(counts['key-1'] > 0, `key-1 selected: ${counts['key-1'] || 0}`);
  assert(counts['key-3'] > 0, `key-3 selected: ${counts['key-3'] || 0}`);
  assert(!counts['key-2'] || counts['key-2'] <= 3, `key-2 rarely/never selected: ${counts['key-2'] || 0}`);
}

// ====== getCallCount24h accuracy ======
console.log('\n=== V2-F2.14: getCallCount24h counts correctly ===');
{
  const pool = makePool('qwen', 'least_used', 2);
  for (let i = 0; i < 42; i++) {
    pool.recordSuccess('key-1');
  }
  for (let i = 0; i < 17; i++) {
    pool.recordSuccess('key-2');
  }

  assert(pool.getCallCount24h('key-1') === 42, `callCount24h key-1 = 42, got: ${pool.getCallCount24h('key-1')}`);
  assert(pool.getCallCount24h('key-2') === 17, `callCount24h key-2 = 17, got: ${pool.getCallCount24h('key-2')}`);
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`KeyPool Tests: ${pass} passed, ${fail} failed`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
