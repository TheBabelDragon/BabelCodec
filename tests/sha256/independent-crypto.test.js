/**
 * Independent validation against Node.js crypto (test environment only).
 * Browser engines do NOT depend on node:crypto.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex, sha256, padMessage } from '../../src/sha256/index.js';
import { createSha256Machine } from '../../src/computer/index.js';

function nodeSha256Hex(input) {
  const buf = typeof input === 'string'
    ? Buffer.from(input, 'utf8')
    : Buffer.from(input);
  return createHash('sha256').update(buf).digest('hex');
}

const VECTORS = [
  '',
  'a',
  'abc',
  'message digest',
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  'a'.repeat(55),
  'a'.repeat(56),
  'a'.repeat(64),
  'a'.repeat(1000),
  new Uint8Array([0x00, 0xff, 0x80, 0x7f]),
];

describe('independent Node crypto cross-check', () => {
  for (const v of VECTORS) {
    const label = typeof v === 'string'
      ? (v.length === 0 ? '(empty)' : v.length <= 20 ? JSON.stringify(v) : `${v.length} chars`)
      : `bytes[${v.length}]`;
    it(`functional matches Node crypto: ${label}`, () => {
      const ours = sha256Hex(v);
      const ref = nodeSha256Hex(v);
      assert.equal(ours, ref);
    });
    it(`gate-level machine matches Node crypto: ${label}`, () => {
      const m = createSha256Machine();
      m.loadMessage(v);
      m.runUntilComplete();
      assert.equal(m.getMachineState().state, 'COMPLETE');
      assert.equal(m.getDigestHex(), nodeSha256Hex(v));
    });
  }

  it('padding length multiple of 64 for boundary sizes', () => {
    for (const n of [0, 55, 56, 63, 64, 119, 120]) {
      const p = padMessage(new Uint8Array(n));
      assert.equal(p.length % 64, 0);
    }
  });

  it('functional and machine agree without using Node for equality', () => {
    const msg = 'cross-check without crypto equality shortcut';
    const functional = sha256Hex(msg);
    const m = createSha256Machine();
    m.loadMessage(msg);
    m.runUntilComplete();
    assert.equal(m.getDigestHex(), functional);
    assert.equal(functional, nodeSha256Hex(msg));
  });
});
