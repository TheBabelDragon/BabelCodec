import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeMorseDetailed,
  textToMorseBlock,
  blockDuration,
  CHAR_TO_MORSE,
} from '../../src/codecs/morse/index.js';
import { encodeMorse, decodeMorse } from '../../src/core/morse.js';

describe('Morse encode/decode', () => {
  it('encodes SOS', () => {
    assert.equal(encodeMorse('SOS'), '... --- ...');
  });

  it('round trips ABC', () => {
    const m = encodeMorse('ABC');
    assert.equal(decodeMorse(m), 'ABC');
  });

  it('rejects Hebrew with code-point diagnostic', () => {
    const r = encodeMorseDetailed('\u05d0', { strict: true });
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, 'UNSUPPORTED_CHAR');
    assert.match(r.diagnostics[0].codePoint, /U\+05D0/i);
  });

  it('permissive skips unsupported', () => {
    const r = encodeMorseDetailed('A\u05d0B', { strict: false });
    assert.ok(r.morse.includes('.-'));
    assert.ok(r.diagnostics.length >= 1);
  });

  it('digits and punctuation', () => {
    assert.ok(CHAR_TO_MORSE['0']);
    assert.ok(CHAR_TO_MORSE['.']);
  });
});

describe('Morse blocks', () => {
  it('builds block for A', () => {
    const b = textToMorseBlock('A');
    assert.equal(b.schema, 'babelcodec.morse-block.v1');
    assert.ok(b.symbols.some((s) => s.kind === 'dot'));
    assert.ok(b.symbols.some((s) => s.kind === 'dash'));
    assert.ok(blockDuration(b) > 0);
  });

  it('empty input', () => {
    const b = textToMorseBlock('');
    assert.equal(b.ok, true);
    assert.equal(b.symbols.length, 0);
  });
});
