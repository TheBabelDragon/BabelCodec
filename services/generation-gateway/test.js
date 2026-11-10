import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGenerate, syntheticPng } from './server.js';

describe('gateway validation', () => {
  it('requires prompt', () => {
    assert.equal(validateGenerate({}), 'prompt required');
  });
  it('rejects open-proxy style fields', () => {
    assert.match(validateGenerate({ prompt: 'x', url: 'http://evil' }), /not allowed/);
  });
  it('accepts normal request', () => {
    assert.equal(validateGenerate({ prompt: 'hello', width: 64, height: 64 }), null);
  });
});

describe('synthetic png', () => {
  it('returns PNG signature and is deterministic', () => {
    const a = syntheticPng('p', 8, 8, 's');
    const b = syntheticPng('p', 8, 8, 's');
    assert.equal(a[0], 137);
    assert.equal(a[1], 80);
    assert.deepEqual([...a], [...b]);
  });
});
