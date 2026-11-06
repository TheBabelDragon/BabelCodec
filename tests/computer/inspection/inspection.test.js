/**
 * Hardware inspection contracts, arithmetic, history rewind/replay.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSha256Machine,
  snapshotSha256Machine,
  serializeSnapshot,
  deserializeSnapshot,
  inspectAdd32,
  inspectAdd32Many,
  fullAdderTable,
  OPERATION_FIDELITY,
  ImplKind,
  TraceBuffer,
  ExecutionHistory,
  inspectComponent,
  EXTENSION_POINTS,
} from '../../../src/computer/index.js';
import { sha256Hex } from '../../../src/sha256/index.js';

describe('inspection snapshot', () => {
  it('produces immutable serializable snapshot after load', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    const snap = snapshotSha256Machine(m);
    assert.equal(snap.architecture, 'sha256-gate-machine');
    assert.equal(snap.controllerState, 'LOAD_BLOCK');
    assert.equal(snap.registers.length, 8);
    assert.ok(snap.memories.some((x) => x.id === 'mem.W'));
    const json = serializeSnapshot(snap);
    const back = deserializeSnapshot(json);
    assert.equal(back.cycle, snap.cycle);
  });

  it('updates after clock transitions', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    m.clock();
    const s1 = snapshotSha256Machine(m);
    assert.equal(s1.controllerState, 'PREPARE_SCHEDULE');
    m.runUntilComplete();
    const s2 = snapshotSha256Machine(m);
    assert.equal(s2.controllerState, 'COMPLETE');
    assert.equal(s2.digestHex, sha256Hex('abc'));
  });

  it('inspectComponent resolves registers and controller', () => {
    const m = createSha256Machine();
    m.loadMessage('a');
    m.runUntilComplete();
    const snap = snapshotSha256Machine(m);
    const reg = inspectComponent(snap, 'reg.working.A');
    assert.equal(reg.kind, 'register');
    assert.ok(reg.hex);
    const ctrl = inspectComponent(snap, 'ctrl');
    assert.equal(ctrl.state, 'COMPLETE');
  });
});

describe('arithmetic inspection', () => {
  it('full-adder truth table has 8 rows', () => {
    const rows = fullAdderTable();
    assert.equal(rows.length, 8);
    const one = rows.find((r) => r.a === 1 && r.b === 1 && r.cin === 1);
    assert.equal(one.sum, 1);
    assert.equal(one.cout, 1);
  });

  it('ripple-carry inspect matches modular sum', () => {
    const a = 0xfffffffen;
    const b = 0x3n;
    const d = inspectAdd32(a, b);
    assert.equal(d.sum, 0x1n);
    assert.equal(d.stages.length, 32);
    assert.equal(d.fidelity.kind, ImplKind.GATE_EXPANDED);
    assert.equal(d.finalCarry, 1);
  });

  it('multi-add inspect accumulates', () => {
    const r = inspectAdd32Many(1n, 2n, 3n);
    assert.equal(r.result, 6n);
    assert.equal(r.steps.length, 3);
  });

  it('fidelity catalog distinguishes gate vs behavioral', () => {
    assert.equal(OPERATION_FIDELITY.add32.kind, ImplKind.GATE_EXPANDED);
    assert.equal(OPERATION_FIDELITY.ch.kind, ImplKind.BEHAVIORAL);
    assert.equal(OPERATION_FIDELITY.bigSigma0.kind, ImplKind.BEHAVIORAL);
  });
});

describe('trace buffer', () => {
  it('bounds events and exports JSON', () => {
    const buf = new TraceBuffer(5);
    for (let i = 0; i < 10; i++) {
      buf.push({ type: 'tick', cycle: i, state: 'X' });
    }
    assert.equal(buf.list().length, 5);
    const j = JSON.parse(buf.toJSON());
    assert.equal(j.schema, 'babelcodec.trace.v1');
    assert.equal(j.replayCapable, false);
  });
});

describe('execution history rewind/replay', () => {
  it('step back restores prior cycle state', () => {
    const m = createSha256Machine();
    const hist = new ExecutionHistory(m, { maxFrames: 256 });
    m.loadMessage('abc');
    hist.record();
    const cycles = [];
    while (m.state !== 'COMPLETE' && m.state !== 'ERROR') {
      m.clock();
      hist.record();
      cycles.push(m.cycle);
      if (cycles.length > 200) break;
    }
    assert.equal(m.getDigestHex(), sha256Hex('abc'));
    const tipCycle = m.cycle;
    assert.ok(hist.canStepBack());
    hist.stepBack();
    assert.ok(m.cycle < tipCycle);
    hist.goLive();
    assert.equal(m.getDigestHex(), sha256Hex('abc'));
  });

  it('rewind across rounds then replay to same digest', () => {
    const m = createSha256Machine();
    const hist = new ExecutionHistory(m);
    m.loadMessage('abc');
    hist.record();
    for (let i = 0; i < 20; i++) m.clock();
    hist.record();
    const midCycle = m.cycle;
    m.runUntilComplete();
    hist.record();
    assert.equal(m.getDigestHex(), sha256Hex('abc'));
    while (hist.canStepBack() && m.cycle > midCycle) {
      hist.stepBack();
    }
    hist.goLive();
    assert.equal(m.getDigestHex(), sha256Hex('abc'));
    assert.equal(m.state, 'COMPLETE');
  });

  it('reset clears history', () => {
    const m = createSha256Machine();
    const hist = new ExecutionHistory(m);
    m.loadMessage('x');
    hist.record();
    m.clock();
    hist.record();
    hist.clear();
    m.reset();
    assert.equal(hist.status().length, 0);
  });
});

describe('extension points', () => {
  it('lists future CPU hooks', () => {
    assert.ok(EXTENSION_POINTS.includes('alu'));
    assert.ok(EXTENSION_POINTS.includes('register-file'));
    assert.ok(EXTENSION_POINTS.includes('machine-snapshots'));
  });
});
