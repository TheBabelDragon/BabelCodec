/**
 * BabelCodec MCP Server unit tests — protocol shape, tools, security.
 * Engine-dependent cases require WASM (pkg/). CI builds WASM before these run.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
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
import { allowRate, checkAuth, clientKey, assertProductionAuthConfig } from './auth.js';
import { ErrorCode } from './errors.js';
import { config } from './config.js';

const HEBREW = 'שָׁלוֹם';
const HEBREW_WITH_CANT = 'בְּרֵאשִׁית';
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

describe('Unicode tools', () => {
  it('list_codecs uses real registry or explicit failure', async () => {
    const r = await babelcodec_list_codecs();
    if (r.success) {
      assert.ok(Array.isArray(r.result.codecs));
      assert.ok(r.result.codecs.length > 0);
    } else {
      assert.equal(r.code, ErrorCode.INTERNAL_ERROR);
    }
  });

  it('capabilities reports limitations and no translation claim', async () => {
    const r = await babelcodec_capabilities();
    if (!engineAvailable) {
      assert.equal(r.success, false);
      assert.ok(
        [ErrorCode.WASM_INITIALIZATION_FAILED, ErrorCode.ENGINE_NOT_READY].includes(r.code),
      );
      return;
    }
    assert.equal(r.success, true);
    assert.equal(r.result.wasm_ready, true);
    assert.ok(r.result.known_limitations.some((l) => /translation/i.test(l)));
    assert.ok(r.result.normalization_profiles.includes('NFC'));
    assert.ok(Array.isArray(r.result.available_codecs));
  });

  it('inspect ASCII preserves source', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_inspect_text({ text: ASCII });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, ASCII);
    assert.equal(r.result.canonical_representation.source.text, ASCII);
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
    assert.equal(typeof r.result.gematria.sum, 'number');
  });

  it('detect mixed scripts', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_detect_scripts({ text: MIXED });
    assert.equal(r.success, true);
    assert.equal(r.result.mixed_script_status, true);
  });

  it('Arabic Syriac Ethiopic paths', async () => {
    if (!engineAvailable) return;
    for (const sample of [ARABIC, SYRIAC, ETHIOPIC, HEBREW]) {
      const r = await babelcodec_detect_scripts({ text: sample });
      assert.equal(r.success, true);
      assert.ok(r.result.primary_script);
    }
  });

  it('combining and supplementary plane preserve source', async () => {
    if (!engineAvailable) return;
    for (const sample of [COMBINING, SUPP]) {
      const r = await babelcodec_inspect_text({ text: sample });
      assert.equal(r.success, true);
      assert.equal(r.result.original_source, sample);
    }
  });

  it('invalid input type rejected', async () => {
    const r = await babelcodec_inspect_text({ text: 12345 });
    assert.equal(r.success, false);
    assert.equal(r.code, ErrorCode.INVALID_INPUT);
  });
});

describe('Normalization', () => {
  it('NONE preserves text', async () => {
    if (!engineAvailable) return;
    const r = await babelcodec_normalize_text({ text: COMBINING, profile: 'NONE' });
    assert.equal(r.success, true);
    assert.equal(r.result.original_source, COMBINING);
    assert.equal(r.result.normalized_result, COMBINING);
    assert.equal(r.result.changed, false);
  });

  it('invalid profile rejected', async () => {
    const r = await babelcodec_normalize_text({ text: 'a', profile: 'BOGUS' });
    assert.equal(r.success, false);
    assert.equal(r.code, ErrorCode.INVALID_INPUT);
  });

  for (const profile of ['NFC', 'NFD', 'NFKC', 'NFKD']) {
    it(`profile ${profile}`, async () => {
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
    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      if (allowRate('iso-key', 3, store)) allowed++;
    }
    assert.equal(allowed, 3);
  });

  it('does not trust X-Forwarded-For without trusted proxy', () => {
    const req = {
      socket: { remoteAddress: '10.0.0.5' },
      headers: { 'x-forwarded-for': '1.2.3.4' },
    };
    assert.equal(clientKey(req), '10.0.0.5');
  });

  it('auth returns boolean', () => {
    assert.equal(typeof checkAuth({ headers: {} }), 'boolean');
  });

  it('production auth gate helper', () => {
    const r = assertProductionAuthConfig();
    assert.equal(typeof r.ok, 'boolean');
  });
});

describe('HTTP smoke', () => {
  it('health endpoint', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, config.SERVER_NAME);
    assert.equal(body.transport, 'streamable-http');
    await new Promise((resolve) => server.close(resolve));
  });

  it('unauthorized without token when required', async () => {
    if (!config.MCP_TOKEN && !config.REQUIRE_AUTH) return;
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (config.REQUIRE_AUTH || config.MCP_TOKEN) {
      assert.equal(res.status, 401);
    }
    await new Promise((resolve) => server.close(resolve));
  });
});
