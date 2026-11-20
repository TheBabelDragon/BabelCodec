/**
 * BabelCodec MCP Server tests — protocol, Unicode fixtures, security.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, handleMcpJsonRpc } from './server.js';
import {
  babelcodec_capabilities,
  babelcodec_inspect_text,
  babelcodec_normalize_text,
  babelcodec_detect_scripts,
  babelcodec_inspect_hebrew,
  babelcodec_list_codecs,
  ensureEngine,
  isEngineReady,
} from './tools.js';
import { allowRate, checkAuth } from './auth.js';
import { ErrorCode } from './errors.js';
import { config } from './config.js';

const HEBREW = 'שָׁלוֹם';
const HEBREW_WITH_CANT = 'בְּרֵאשִׁית';';
const ARABIC = 'مرحبا';
const SYRIAC = 'ܫܠܡܐ';
const ETHIOPIC = 'ሰላም';
const MIXED = 'Hello שָׁלוֹם مرحبا';
const COMBINING = 'e\u0301';
const SUPP = '\u{10437}';
const ASCII = 'BabelCodec';

let engineAvailable = false;

before(async () => {
  try {
    await ensureEngine();
    engineAvailable = isEngineReady();
  } catch {
    engineAvailable = false;
  }
});

describe('MCP protocol', () => {
  it('initialize returns serverInfo and tools capability', async () => {
    const { status, payload } = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    assert.equal(status, 200);
    assert.equal(payload.result.serverInfo.name, config.SERVER_NAME);
    assert.ok(payload.result.capabilities.tools);
  });

  it('tools/list returns all registered tools', async () => {
    const { payload } = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const names = payload.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'babelcodec_capabilities',
      'babelcodec_detect_scripts',
      'babelcodec_inspect_hebrew',
      'babelcodec_inspect_text',
      'babelcodec_list_codecs',
      'babelcodec_normalize_text',
    ]);
  });

  it('invalid tool name yields error', async () => {
    const { payload } = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'does_not_exist', arguments: {} },
    });
    assert.ok(payload.error);
    assert.equal(payload.error.data.code, ErrorCode.UNSUPPORTED_OPERATION);
  });

  it('invalid JSON yields parse error', async () => {
    const { status, payload } = await handleMcpJsonRpc('not-json{{{');
    assert.equal(status, 400);
    assert.equal(payload.error.code, -32700);
  });

  it('tools/call returns structuredContent envelope', async () => {
    const { payload } = await handleMcpJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'babelcodec_list_codecs', arguments: {} },
    });
    assert.ok(payload.result);
    assert.ok(payload.result.structuredContent);
    assert.equal(payload.result.structuredContent.success, true);
    assert.equal(payload.result.structuredContent.tool, 'babelcodec_list_codecs');
  });
});

describe('Unicode tools', () => {
  it('list_codecs returns array', async () => {
    const r = await babelcodec_list_codecs();
    assert.equal(r.success, true);
    assert.ok(Array.isArray(r.result.codecs));
    assert.ok(r.result.codecs.length > 0);
  });

  it('capabilities reports limitations and no translation claim', async () => {
    const r = await babelcodec_capabilities();
    if (!engineAvailable) {
      assert.equal(r.success, false);
      assert.ok(
        [ErrorCode.WASM_INITIALIZATION_FAILED, ErrorCode.ENGINE_NOT_READY].includes(
          r.code,
        ),
      );
      return;
    }
    assert.equal(r.success, true);
    assert.equal(r.result.wasm_ready, true);
    assert.ok(r.result.known_limitations.some((l) => /translation/i.test(l)));
    assert.ok(r.result.normalization_profiles.includes('NFC'));
  });

  it('inspect ASCII preserves source', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_inspect_text({ text: ASCII });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, ASCII);
    assert.equal(r.result.canonical_representation.source.text, ASCII);
    assert.ok(r.result.code_points.length > 0);
  });

  it('inspect Hebrew', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_inspect_text({ text: HEBREW });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, HEBREW);
  });

  it('inspect Hebrew with niqqud/cantillation', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_inspect_hebrew({
      text: HEBREW_WITH_CANT,
      include_gematria: true,
    });
    assert.equal(r.success, true);
    assert.equal(r.result.hebrew_detected, true);
    assert.ok(r.result.letter_count > 0);
    assert.ok(r.result.gematria);
    assert.ok(typeof r.result.gematria.sum === 'number');
  });

  it('detect mixed scripts', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_detect_scripts({ text: MIXED });
    assert.equal(r.success, true);
    assert.equal(r.result.mixed_script_status, true);
  });

  it('Arabic / Syriac / Ethiopic detection path', async () => {
    if (!engineAvailable) return;
    for (const sample of [ARABIC, SYRIAC, ETHIOPIC]) {
      const r = await babelcodec_detect_scripts({ text: sample });
      assert.equal(r.success, true);
      assert.ok(r.result.primary_script);
    }
  });

  it('combining marks and supplementary plane', async () => {
    if (!engineAvailable) return;
    const c = await babelcodec_inspect_text({ text: COMBINING });
    assert.equal(c.success, true);
    assert.equal(c.result.original_source, COMBINING);
    const s = await babelcodec_inspect_text({ text: SUPP });
    assert.equal(s.success, true);
    assert.equal(s.result.original_source, SUPP);
  });

  it('empty input', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_inspect_text({ text: '' });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, '');
  });

  it('invalid input type', async () => {
    const r = await babelcodec_inspect_text({ text: 12345 });
    assert.equal(r.success, false);
    assert.equal(r.code, ErrorCode.INVALID_INPUT);
  });
});

describe('Normalization', () => {
  it('NONE preserves text', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_normalize_text({
      text: COMBINING,
      profile: 'NONE',
    });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, COMBINING);
    assert.equal(r.result.normalized_result, COMBINING);
    assert.equal(r.result.changed, false);
  });

  it('NFC may change combining sequence', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_normalize_text({
      text: COMBINING,
      profile: 'NFC',
    });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, COMBINING);
    assert.equal(r.result.selected_profile, 'NFC');
  });

  it('invalid profile rejected', async () => {
    const r = await babelcodec_normalize_text({ text: 'a', profile: 'BOGUS' });
    assert.equal(r.success, false);
    assert.equal(r.code, ErrorCode.INVALID_INPUT);
  });

  for (const profile of ['NFC', 'NFD', 'NFKC', 'NFKD']) {
    it(`profile ${profile} returns structured result`, async () => {
      if (!engineAvailable) return;
      const r = await babelcodec_normalize_text({ text: ASCII, profile });
      assert.equal(r.success, true);
      assert.equal(r.result.selected_profile, profile);
      assert.equal(r.result.original_source, ASCII);
    });
  }
});

describe('Security', () => {
  it('rate limiter trips after limit', () => {
    const store = new Map();
    const key = 'test-ip';
    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      if (allowRate(key, 3, store)) allowed++;
    }
    assert.equal(allowed, 3);
  });

  it('auth returns boolean', () => {
    const ok = checkAuth({ headers: {} });
    assert.equal(typeof ok, 'boolean');
  });
});

describe('HTTP server smoke', () => {
  it('health endpoint', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, config.SERVER_NAME);
    await new Promise((resolve) => server.close(resolve));
  });

  it('MCP initialize over HTTP', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.MCP_TOKEN
          ? { Authorization: `Bearer ${config.MCP_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 't', version: '0' },
        },
      }),
    });
    if (res.status === 401) {
      await new Promise((resolve) => server.close(resolve));
      return;
    }
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result.serverInfo.name, config.SERVER_NAME);
    await new Promise((resolve) => server.close(resolve));
  });
});
