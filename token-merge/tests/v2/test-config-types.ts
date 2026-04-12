/**
 * v2 Tests: Config & Types (V2-F1)
 */
import type {
  VendorConfig, ModelConfig, KeyEntryConfig, KeyRoutingStrategy,
  FailureType, FallbackDetail, RouterResult, KeyStateWithInfo,
  HealthStatus, V2AppConfig, ModelState, ChatResponseDataV2,
} from '../../src/types';
import { classifyErrorType } from '../../src/router';

let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

console.log('\n=== V2-F1.1: classifyErrorType covers all failure types ===');
assert(classifyErrorType(401, 'Unauthorized') === 'auth_failure', '401 → auth_failure');
assert(classifyErrorType(403, 'insufficient balance') === 'token_exhausted', '403 + insufficient → token_exhausted');
assert(classifyErrorType(403, 'quota exceeded') === 'token_exhausted', '403 + quota → token_exhausted');
assert(classifyErrorType(403, 'token limit') === 'token_exhausted', '403 + token → token_exhausted');
assert(classifyErrorType(403, 'some other error') === 'auth_failure', '403 other → auth_failure');
assert(classifyErrorType(429, 'Too Many Requests') === 'rate_limited', '429 → rate_limited');
assert(classifyErrorType(500, 'Internal Server Error') === 'server_error', '500 → server_error');
assert(classifyErrorType(502, 'Bad Gateway') === 'server_error', '502 → server_error');
assert(classifyErrorType(503, 'Service Unavailable') === 'server_error', '503 → server_error');
assert(classifyErrorType(0, 'ETIMEDOUT') === 'timeout', 'ETIMEDOUT → timeout');
assert(classifyErrorType(0, 'ECONNRESET') === 'timeout', 'ECONNRESET → timeout');
assert(classifyErrorType(0, 'request timed out') === 'timeout', 'timed out → timeout');
assert(classifyErrorType(0, 'FetchError: aborted') === 'timeout', 'abort → timeout');
assert(classifyErrorType(999, 'some error') === 'server_error', '999 (>=500) → server_error');
  assert(classifyErrorType(0, 'some error') === 'unknown', 'status 0 + unknown msg → unknown');

console.log('\n=== V2-F1.2: VendorConfig structure ===');
const vendor: VendorConfig = {
  id: 'qwen',
  type: 'qwen',
  key_pool: [
    { api_key_env: 'QWEN_KEY_1', weight: 1, label: 'qwen-prod-1' },
    { api_key_env: 'QWEN_KEY_2', weight: 1, label: 'qwen-prod-2' },
  ],
  key_routing_strategy: 'round_robin',
  models: [
    {
      id: 'qwen-plus',
      name: 'Qwen Plus',
      type: 'qwen',
      vendorId: 'qwen',
      model_name: 'qwen-plus',
      endpoint: 'https://test.endpoint',
      total_tokens: 1000000,
    },
  ],
};
assert(vendor.key_pool.length === 2, 'Vendor has 2 keys in pool');
assert(vendor.models[0].vendorId === 'qwen', 'Model has vendorId');

console.log('\n=== V2-F1.3: FallbackDetail structure ===');
const detail: FallbackDetail = {
  key_fallbacks: 1,
  model_fallbacks: 0,
  tried_keys: ['key-2', 'key-1'],
  tried_models: ['qwen-plus'],
};
assert(detail.key_fallbacks === 1, 'key_fallbacks = 1');
assert(detail.tried_keys.length === 2, 'tried_keys has 2 entries');

console.log('\n=== V2-F1.4: HealthStatus with key pool status ===');
const health: HealthStatus = {
  status: 'ok',
  uptime: 3600,
  vendors: [
    {
      id: 'qwen',
      key_pool_status: { total: 3, healthy: 2, cooldown: 1, disabled: 0 },
      models: [{ id: 'qwen-plus', status: 'available', remaining_tokens: 765433 }],
    },
  ],
};
assert(health.vendors[0].key_pool_status.total === 3, 'key_pool_status.total = 3');
assert(health.vendors[0].key_pool_status.healthy === 2, 'key_pool_status.healthy = 2');

console.log('\n=== V2-F1.5: AppConfig v2 fields ===');
const modelState: ModelState = {
  id: 'qwen-plus',
  name: 'Qwen Plus',
  vendorId: 'qwen',
  total_tokens: 1000000,
  used_tokens: 234567,
  remaining_tokens: 765433,
  status: 'available',
  call_count: 1523,
  total_prompt_tokens: 100000,
  total_completion_tokens: 200000,
};
assert(modelState.vendorId === 'qwen', 'ModelState has vendorId');

console.log(`\n${'='.repeat(50)}`);
console.log(`Config & Type Tests: ${pass} passed, ${fail} failed`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
