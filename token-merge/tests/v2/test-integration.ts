/**
 * v2 Integration Tests: API routes (V2-F3, V2-F6, V2-F7, V2-F8)
 * Tests actual HTTP endpoints with mock data
 */
import http from 'node:http';

let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string) {
  if (condition) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

// Helper: wait for server to be ready
function waitForServer(port: number, retries = 20): Promise<void> {
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const req = http.request(`http://127.0.0.1:${port}/health`, { method: 'GET' }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (retries <= 0) reject(new Error('Server not ready'));
        else { retries--; setTimeout(tryConnect, 200); }
      });
      req.end();
    }
    tryConnect();
  });
}

// Helper: make HTTP request
function httpReq(method: string, path: string, port: number, body?: object): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode!, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  // Check if server is running on port 3000
  try {
    await waitForServer(3000);
    console.log('Server is running, starting integration tests...\n');
  } catch {
    console.log('⚠️  Server not running on port 3000, skipping integration tests\n');
    console.log(`${'='.repeat(50)}`);
    console.log(`Integration Tests: SKIPPED (server not running)`);
    console.log(`${'='.repeat(50)}\n`);
    return;
  }

  // ====== Health endpoint with v2 vendor info ======
  console.log('=== V2-F3.1: GET /health includes vendor key pool status ===');
  {
    const { statusCode, body } = await httpReq('GET', '/health', 3000);
    assert(statusCode === 200, `GET /health returns 200, got ${statusCode}`);
    assert(body.code === 0, `body.code = 0`);
    if (body.data?.vendors) {
      assert(Array.isArray(body.data.vendors), `body.data.vendors is array`);
      if (body.data.vendors.length > 0) {
        const v = body.data.vendors[0];
        assert(v.key_pool_status !== undefined, `vendor has key_pool_status`);
        assert(v.key_pool_status.total !== undefined, `key_pool_status has total`);
        assert(v.key_pool_status.healthy !== undefined, `key_pool_status has healthy`);
        console.log(`    Vendor: ${v.id}, keys: ${v.key_pool_status.total} (healthy: ${v.key_pool_status.healthy})`);
      }
    } else {
      console.log(`    ⚠️  No vendors in health response (possible v1 compat mode)`);
    }
  }

  // ====== GET /admin/keys ======
  console.log('\n=== V2-F7.1: GET /admin/keys returns key states ===');
  {
    const { statusCode, body } = await httpReq('GET', '/admin/keys', 3000);
    assert(statusCode === 200, `GET /admin/keys returns 200, got ${statusCode}`);
    assert(body.code === 0, `body.code = 0`);
    if (body.data?.vendors) {
      assert(Array.isArray(body.data.vendors), `body.data.vendors is array`);
      const totalKeys = body.data.vendors.reduce((sum: number, v: any) => sum + (v.keys?.length || 0), 0);
      console.log(`    Total keys: ${totalKeys}, vendors: ${body.data.vendors.length}`);
      assert(totalKeys > 0, `At least 1 key exists`);

      // Check key structure
      for (const v of body.data.vendors) {
        assert(v.id !== undefined, `vendor has id: ${v.id}`);
        assert(v.routing_strategy !== undefined, `vendor has routing_strategy: ${v.routing_strategy}`);
        for (const key of (v.keys || [])) {
          assert(key.key_id !== undefined, `key has key_id: ${key.key_id}`);
          assert(key.status !== undefined, `key has status: ${key.status}`);
          assert(key.total_calls !== undefined, `key has total_calls`);
          assert(key.total_failures !== undefined, `key has total_failures`);
          assert(key.total_cooldowns !== undefined, `key has total_cooldowns`);
        }
      }
    } else {
      console.log(`    ⚠️  No vendors in keys response`);
    }
  }

  // ====== GET /admin/keys?vendor=qwen ======
  console.log('\n=== V2-F7.2: GET /admin/keys?vendor= filter ===');
  {
    const { statusCode, body } = await httpReq('GET', '/admin/keys?vendor=qwen', 3000);
    assert(statusCode === 200, `Returns 200, got ${statusCode}`);
    if (body.data?.vendors) {
      const vendors = body.data.vendors;
      if (vendors.length > 0) {
        assert(vendors[0].id === 'qwen', `Filtered to qwen vendor, got: ${vendors[0].id}`);
      }
      assert(vendors.length <= 1, `Only qwen vendor returned: ${vendors.length}`);
    }
  }

  // ====== GET /admin/keys/:vendorId/:keyId ======
  console.log('\n=== V2-F7.3: GET /admin/keys/:vendorId/:keyId detail ===');
  {
    // First get a valid key ID
    const { body: allKeys } = await httpReq('GET', '/admin/keys', 3000);
    if (allKeys.data?.vendors?.[0]?.keys?.[0]) {
      const vendorId = allKeys.data.vendors[0].id;
      const keyId = allKeys.data.vendors[0].keys[0].key_id;
      const { statusCode, body } = await httpReq('GET', `/admin/keys/${vendorId}/${keyId}`, 3000);
      assert(statusCode === 200, `GET key detail returns 200, got ${statusCode}`);
      assert(body.data?.key_id === keyId, `key_id matches: ${body.data?.key_id}`);
      assert(body.data?.vendor_id === vendorId, `vendor_id matches: ${body.data?.vendor_id}`);
    } else {
      console.log(`    ⚠️  No keys available for detail test`);
    }
  }

  // ====== GET /admin/keys — 404 for non-existent vendor ======
  console.log('\n=== V2-F7.4: GET /admin/keys/nonexistent/key1 → 404 ===');
  {
    const { statusCode, body } = await httpReq('GET', '/admin/keys/nonexistent/key1', 3000);
    assert(statusCode === 404, `Returns 404, got ${statusCode}`);
    assert(body.code === 'VENDOR_NOT_FOUND', `error code = VENDOR_NOT_FOUND, got ${body.code}`);
  }

  // ====== GET /admin/keys — 404 for non-existent key ======
  console.log('\n=== V2-F7.5: GET /admin/keys/:vendor/nonexistent → 404 ===');
  {
    const { body: allKeys } = await httpReq('GET', '/admin/keys', 3000);
    if (allKeys.data?.vendors?.[0]) {
      const vendorId = allKeys.data.vendors[0].id;
      const { statusCode, body } = await httpReq('GET', `/admin/keys/${vendorId}/nonexistent-key`, 3000);
      assert(statusCode === 404, `Returns 404, got ${statusCode}`);
      assert(body.code === 'KEY_NOT_FOUND', `error code = KEY_NOT_FOUND, got ${body.code}`);
    }
  }

  // ====== PUT /admin/keys/:vendorId/:keyId/status ====
  console.log('\n=== V2-F7.6: PUT /admin/keys/:vendorId/:keyId/status ===');
  {
    const { body: allKeys } = await httpReq('GET', '/admin/keys', 3000);
    if (allKeys.data?.vendors?.[0]?.keys?.[0]) {
      const vendorId = allKeys.data.vendors[0].id;
      const keyId = allKeys.data.vendors[0].keys[0].key_id;

      // Disable
      const { statusCode: s1, body: b1 } = await httpReq('PUT', `/admin/keys/${vendorId}/${keyId}/status`, 3000, { status: 'disabled' });
      assert(s1 === 200, `Disable returns 200, got ${s1}`);
      assert(b1.data?.status === 'disabled', `status = disabled, got ${b1.data?.status}`);

      // Verify
      const { body: detail1 } = await httpReq('GET', `/admin/keys/${vendorId}/${keyId}`, 3000);
      assert(detail1.data?.status === 'disabled', `Key is now disabled`);

      // Re-enable
      const { statusCode: s2, body: b2 } = await httpReq('PUT', `/admin/keys/${vendorId}/${keyId}/status`, 3000, { status: 'healthy' });
      assert(s2 === 200, `Re-enable returns 200, got ${s2}`);
      assert(b2.data?.status === 'healthy', `status = healthy, got ${b2.data?.status}`);

      // Verify re-enabled
      const { body: detail2 } = await httpReq('GET', `/admin/keys/${vendorId}/${keyId}`, 3000);
      assert(detail2.data?.status === 'healthy', `Key is now healthy again`);
      assert(detail2.data?.consecutive_failures === 0, `consecutive_failures reset to 0`);
    }
  }

  // ====== PUT /admin/keys — invalid status ======
  console.log('\n=== V2-F7.7: PUT /admin/keys — invalid status → 400 ===');
  {
    const { body: allKeys } = await httpReq('GET', '/admin/keys', 3000);
    if (allKeys.data?.vendors?.[0]?.keys?.[0]) {
      const vendorId = allKeys.data.vendors[0].id;
      const keyId = allKeys.data.vendors[0].keys[0].key_id;

      const { statusCode, body } = await httpReq('PUT', `/admin/keys/${vendorId}/${keyId}/status`, 3000, { status: 'invalid' });
      assert(statusCode === 400, `Invalid status returns 400, got ${statusCode}`);
      assert(body.code === 'INVALID_STATUS', `error code = INVALID_STATUS, got ${body.code}`);
    }
  }

  // ====== POST /admin/keys/:vendorId/:keyId/reset ======
  console.log('\n=== V2-F7.8: POST /admin/keys/:vendorId/:keyId/reset ===');
  {
    const { body: allKeys } = await httpReq('GET', '/admin/keys', 3000);
    if (allKeys.data?.vendors?.[0]?.keys?.[0]) {
      const vendorId = allKeys.data.vendors[0].id;
      const keyId = allKeys.data.vendors[0].keys[0].key_id;

      const { statusCode, body } = await httpReq('POST', `/admin/keys/${vendorId}/${keyId}/reset`, 3000);
      assert(statusCode === 200, `Reset returns 200, got ${statusCode}`);
      assert(body.data?.status === 'healthy', `status = healthy after reset`);
      assert(body.data?.consecutive_failures === 0, `consecutive_failures = 0 after reset`);
      assert(body.data?.cooldown_until === null, `cooldown_until = null after reset`);
      assert(body.data?.reset_at !== undefined, `reset_at present`);
    }
  }

  // ====== GET /admin/stats/keys ======
  console.log('\n=== V2-F8.1: GET /admin/stats/keys ===');
  {
    const { statusCode, body } = await httpReq('GET', '/admin/stats/keys', 3000);
    assert(statusCode === 200, `Returns 200, got ${statusCode}`);
    if (body.data?.keys) {
      assert(Array.isArray(body.data.keys), `body.data.keys is array`);
      if (body.data.keys.length > 0) {
        const key = body.data.keys[0];
        assert(key.key_id !== undefined, `key has key_id`);
        assert(key.total_calls !== undefined, `key has total_calls`);
        assert(key.success_rate !== undefined, `key has success_rate`);
        assert(key.period_start !== undefined, `key has period_start`);
        assert(key.period_end !== undefined, `key has period_end`);
        console.log(`    Key: ${key.key_id}, calls: ${key.total_calls}, success_rate: ${key.success_rate}`);
      }
    }
  }

  // ====== GET /admin/stats/keys?vendor= filter ======
  console.log('\n=== V2-F8.2: GET /admin/stats/keys?vendor= filter ===');
  {
    const { body: allKeys } = await httpReq('GET', '/admin/keys', 3000);
    if (allKeys.data?.vendors?.[0]) {
      const vendorId = allKeys.data.vendors[0].id;
      const { statusCode, body } = await httpReq('GET', `/admin/stats/keys?vendor=${vendorId}`, 3000);
      assert(statusCode === 200, `Returns 200, got ${statusCode}`);
      if (body.data?.keys) {
        const allSameVendor = body.data.keys.every((k: any) => k.vendor_id === vendorId);
        assert(allSameVendor, `All keys belong to vendor ${vendorId}`);
      }
    }
  }

  // ====== GET /admin/quota — v2 format ======
  console.log('\n=== V2-F3.2: GET /admin/quota returns vendor-grouped data ===');
  {
    const { statusCode, body } = await httpReq('GET', '/admin/quota', 3000);
    assert(statusCode === 200, `GET /admin/quota returns 200, got ${statusCode}`);
    if (body.data?.vendors) {
      assert(Array.isArray(body.data.vendors), `body.data.vendors is array`);
      for (const v of body.data.vendors) {
        assert(v.id !== undefined, `vendor has id: ${v.id}`);
        assert(v.key_pool_size !== undefined, `vendor has key_pool_size: ${v.key_pool_size}`);
        assert(v.healthy_keys !== undefined, `vendor has healthy_keys: ${v.healthy_keys}`);
        assert(Array.isArray(v.models), `vendor has models array`);
        if (v.models.length > 0) {
          assert(v.models[0].remaining_tokens !== undefined, `model has remaining_tokens`);
        }
      }
    } else if (body.data?.models) {
      console.log(`    ⚠️  v1 format returned (Accept-Version: v1 compat)`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Integration Tests: ${pass} passed, ${fail} failed`);
  console.log(`${'='.repeat(50)}\n`);
}

runTests().catch((err) => {
  console.error('Integration test error:', err);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Integration Tests: ERROR — ${err.message}`);
  console.log(`${'='.repeat(50)}\n`);
  process.exit(1);
});
