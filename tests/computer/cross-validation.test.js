import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, sha256Hex, createMessageSchedule, parseBlockWords, padMessage, compressBlock, IV } from '../../src/sha256/index.js';
import { createSha256Machine } from '../../src/computer/index.js';

function runMachine(msg) {
  const m = createSha256Machine();
  m.loadMessage(msg);
  m.runUntilComplete();
  return m;
}

describe('functional / gate-level cross-validation', () => {
  for (const msg of ['', 'abc', 'hello world', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64)]) {
    it(`digest matches for ${msg.length === 0 ? '(empty)' : msg.length < 20 ? JSON.stringify(msg) : msg.length + " a's"}`, () => {
      const ref = sha256Hex(msg);
      const machine = runMachine(msg);
      assert.equal(machine.getMachineState().state, 'COMPLETE');
      assert.equal(machine.getDigestHex(), ref);
    });
  }

  it('round registers track functional compression for abc', () => {
    const msg = 'abc';
    const padded = padMessage(msg);
    const words = parseBlockWords(padded, 0);
    const H = IV.slice();
    const { rounds } = compressBlock(H, words, { trace: true });

    const machine = createSha256Machine();
    machine.loadMessage(msg);
    while (machine.state !== 'EXECUTE_ROUND' && machine.state !== 'COMPLETE') {
      machine.clock();
    }
    for (let t = 0; t < 64; t++) {
      machine.clock();
      const snap = machine.getRegisterSnapshot().working;
      const fr = rounds[t];
      assert.equal(snap.A, fr.a, `round ${t} A`);
      assert.equal(snap.E, fr.e, `round ${t} E`);
    }
  });

  it('pause and resume', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    m.clock();
    m.pause();
    const c = m.cycle;
    m.clock();
    assert.equal(m.cycle, c);
    m.resume();
    m.runUntilComplete();
    assert.equal(m.getDigestHex(), sha256Hex('abc'));
  });

  it('reset clears state', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    m.runUntilComplete();
    m.reset();
    assert.equal(m.state, 'IDLE');
    assert.equal(m.cycle, 0);
  });
});
