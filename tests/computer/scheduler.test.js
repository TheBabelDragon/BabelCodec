import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSha256Machine,
  ExecutionHistory,
  ExecutionScheduler,
} from '../../src/computer/index.js';
import { sha256Hex as refHex } from '../../src/sha256/index.js';

describe('cycle-accurate history', () => {
  it('records a frame per clock during run', async () => {
    const m = createSha256Machine();
    const hist = new ExecutionHistory(m, { maxFrames: 4096 });
    m.loadMessage('abc');
    hist.record();
    const initial = hist.status().length;

    await new Promise((resolve) => {
      const sched = new ExecutionScheduler(m, {
        history: hist,
        onStop: () => resolve(),
        batchSize: 32,
        yieldMs: 0,
      });
      sched.run();
    });

    assert.equal(m.getDigestHex(), refHex('abc'));
    assert.ok(hist.status().length > initial + 10, `expected many frames, got ${hist.status().length}`);
  });

  it('rewind then goLive preserves digest', async () => {
    const m = createSha256Machine();
    const hist = new ExecutionHistory(m, { maxFrames: 4096 });
    m.loadMessage('a');
    hist.record();
    await new Promise((resolve) => {
      const sched = new ExecutionScheduler(m, {
        history: hist,
        onStop: () => resolve(),
        batchSize: 64,
      });
      sched.run();
    });
    const digest = m.getDigestHex();
    assert.ok(hist.canStepBack());
    hist.stepBack();
    hist.goLive();
    assert.equal(m.getDigestHex(), digest);
  });
});

describe('scheduler breakpoints', () => {
  it('stops on cycle breakpoint', async () => {
    const m = createSha256Machine();
    const hist = new ExecutionHistory(m);
    m.loadMessage('abc');
    hist.record();
    let stopReason = null;
    await new Promise((resolve) => {
      const sched = new ExecutionScheduler(m, {
        history: hist,
        onStop: (reason) => { stopReason = reason; resolve(); },
        batchSize: 4,
      });
      sched.addBreakpoint({ type: 'cycle', params: { cycle: 3 } });
      sched.run();
    });
    assert.equal(stopReason, 'breakpoint');
    assert.equal(m.cycle, 3);
  });
});
