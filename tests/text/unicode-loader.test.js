/**
 * Unicode Core loader — URL resolution, diagnostics, no silent fallback.
 * Does not require a live WASM binary (probes are unit-tested in isolation).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateJsUrls,
  resolveProjectBase,
} from '../../src/text/unicode-core-loader.js';

describe('resolveProjectBase', () => {
  it('detects GitHub project pages base', () => {
    const loc = {
      href: 'https://thebabeldragon.github.io/BabelCodec/',
      hostname: 'thebabeldragon.github.io',
      pathname: '/BabelCodec/',
      protocol: 'https:',
    };
    // Polyfill URL for hostname check uses real URL
    assert.equal(
      resolveProjectBase({ href: 'https://thebabeldragon.github.io/BabelCodec/' }),
      '/BabelCodec/',
    );
    assert.equal(
      resolveProjectBase({ href: 'https://thebabeldragon.github.io/BabelCodec/index.html' }),
      '/BabelCodec/',
    );
  });

  it('uses / for plain localhost root', () => {
    const base = resolveProjectBase({ href: 'http://localhost:8080/' });
    assert.ok(base === '/' || base === '');
  });

  it('returns empty for file://', () => {
    assert.equal(resolveProjectBase({ href: 'file:///tmp/index.html' }), '');
  });
});

describe('candidateJsUrls', () => {
  it('includes project-pages path for github.io', () => {
    const urls = candidateJsUrls({ href: 'https://thebabeldragon.github.io/BabelCodec/' });
    assert.ok(urls.some((u) => u.includes('/BabelCodec/pkg/unicode_core.js')));
    // Should not prefer bare /pkg/ as first choice on project pages
    assert.ok(urls[0].includes('BabelCodec') || urls[0].startsWith('./'));
  });

  it('includes relative candidates', () => {
    const urls = candidateJsUrls({ href: 'http://127.0.0.1:5500/' });
    assert.ok(urls.some((u) => u.includes('pkg/unicode_core.js')));
  });

  it('deduplicates', () => {
    const urls = candidateJsUrls({ href: 'https://thebabeldragon.github.io/BabelCodec/' });
    assert.equal(urls.length, new Set(urls).size);
  });
});
