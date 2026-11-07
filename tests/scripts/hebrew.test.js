import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hebrewAdapter, GEMATRIA_STANDARD } from '../../src/scripts/hebrew.js';

describe('Hebrew adapter', () => {
  it('detects Hebrew range', () => {
    assert.equal(hebrewAdapter.detects('\u05e9\u05dc\u05d5\u05dd'), true);
    assert.equal(hebrewAdapter.detects('ABC'), false);
  });

  it('preserves niqqud', () => {
    const text = '\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd';
    const p = hebrewAdapter.parse(text);
    assert.ok(p.niqqudCount > 0);
    assert.equal(p.scalars.map((s) => s.text).join(''), text);
  });

  it('identifies final forms', () => {
    const p = hebrewAdapter.parse('\u05da\u05dd\u05df\u05e3\u05e5');
    assert.equal(p.scalars.every((s) => s.isFinal), true);
  });

  it('standard gematria', () => {
    const g = hebrewAdapter.gematriaStandard('\u05d0\u05d1');
    assert.equal(g.sum, 3);
    assert.equal(g.profile, 'gematria-standard');
  });

  it('final form same value as ordinary', () => {
    assert.equal(GEMATRIA_STANDARD['\u05db'], GEMATRIA_STANDARD['\u05da']);
  });
});
