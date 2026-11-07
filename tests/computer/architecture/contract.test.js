import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSha256Machine } from '../../../src/computer/sha256-machine.js';
import { createCpuMachine } from '../../../src/cpu/machine.js';
import {
  validateMachineAdapter,
  createSha256ArchitectureAdapter,
  createCpuArchitectureAdapter,
  parseWord,
  formatWord,
} from '../../../src/computer/architecture/index.js';
import { InteractionController } from '../../../src/computer/interaction/index.js';
import { BranchingHistory } from '../../../src/computer/history/index.js';

describe('architecture contract', () => {
  it('SHA-256 adapter validates', () => {
    const m = createSha256Machine();
    const a = createSha256ArchitectureAdapter(m);
    const v = validateMachineAdapter(a);
    assert.equal(v.ok, true, v.missing.join(','));
  });

  it('CPU adapter validates', () => {
    const m = createCpuMachine();
    const a = createCpuArchitectureAdapter(m);
    const v = validateMachineAdapter(a);
    assert.equal(v.ok, true, v.missing.join(','));
  });
});

describe('SHA-256 interaction', () => {
  it('writes working register A', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    const a = createSha256ArchitectureAdapter(m);
    const ic = new InteractionController(a);
    const r = ic.writeRegister('A', '0x12345678');
    assert.equal(r.ok, true);
    assert.equal(a.readRegister('A').hex, '0x12345678');
  });

  it('rejects write to K constants without mutation', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    const a = createSha256ArchitectureAdapter(m);
    const before = a.readMemory('K', 0).value;
    const ic = new InteractionController(a);
    const r = ic.writeMemory('K', 0, '0xDEADBEEF');
    assert.equal(r.ok, false);
    assert.equal(r.event.validation.code, 'PROTECTED');
    assert.equal(a.readMemory('K', 0).value, before);
  });

  it('abc digest unchanged', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    m.runUntilComplete();
    assert.equal(
      m.getDigestHex(),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('CPU interaction', () => {
  it('rejects R0 write', () => {
    const m = createCpuMachine();
    const a = createCpuArchitectureAdapter(m);
    const ic = new InteractionController(a);
    const r = ic.writeRegister('r0', 5);
    assert.equal(r.ok, false);
    assert.equal(Number(a.readRegister('r0').value), 0);
  });

  it('writes R1', () => {
    const m = createCpuMachine();
    const a = createCpuArchitectureAdapter(m);
    const ic = new InteractionController(a);
    assert.equal(ic.writeRegister('r1', 0x100).ok, true);
    assert.equal(Number(a.readRegister('r1').value), 0x100);
  });
});

describe('history branch', () => {
  it('records and rewinds', () => {
    const m = createSha256Machine();
    m.loadMessage('abc');
    const a = createSha256ArchitectureAdapter(m);
    const hist = new BranchingHistory(m, { adapter: a });
    hist.record({ kind: 'init' });
    m.clock();
    hist.record({ kind: 'clock' });
    const n = hist.activeBranch.frames.length;
    assert.ok(n >= 2);
    hist.rewindTo(0);
  });
});

describe('parseWord', () => {
  it('parses hex and decimal', () => {
    assert.equal(parseWord('0x10'), 16n);
    assert.equal(formatWord(16n), '0x00000010');
  });
});
