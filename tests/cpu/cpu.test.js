import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assemble, EXAMPLES, createCpuMachine, decode, encodeR, encodeI, OP, CpuState,
} from '../../src/cpu/index.js';

describe('CPU encode/decode', () => {
  it('round-trips R-format ADD', () => {
    const w = encodeR(OP.ADD, 3, 1, 2);
    const d = decode(w);
    assert.equal(d.opcode, OP.ADD);
    assert.equal(d.rd, 3);
    assert.equal(d.rs, 1);
    assert.equal(d.rt, 2);
  });

  it('sign-extends MOVI immediate', () => {
    const w = encodeI(OP.MOVI, 1, 0, -1);
    const d = decode(w);
    assert.equal(d.imm, -1);
  });
});

describe('assembler', () => {
  it('assembles arithmetic example', () => {
    const r = assemble(EXAMPLES.arithmetic);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.ok(r.words.length >= 4);
  });

  it('reports unknown mnemonic', () => {
    const r = assemble('FOO R1, R2');
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /Unknown/.test(e.message)));
  });

  it('resolves labels', () => {
    const r = assemble(`\n      MOVI R1, 1\n      JMP skip\n      MOVI R2, 2\nskip: HALT\n`);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.labels.skip, 3);
  });
});

describe('CPU execution', () => {
  it('R0 stays zero', () => {
    const m = createCpuMachine();
    const r = assemble('MOVI R0, 5\nHALT\n');
    m.loadProgram(r.words);
    m.runUntilHalt();
    assert.equal(m.regs[0], 0);
  });

  it('arithmetic example: R3 = 42', () => {
    const m = createCpuMachine();
    const r = assemble(EXAMPLES.arithmetic);
    assert.equal(r.ok, true);
    m.loadProgram(r.words);
    m.runUntilHalt();
    assert.equal(m.state, CpuState.HALTED);
    assert.equal(m.regs[3], 42);
  });

  it('loop example sums 1..5', () => {
    const m = createCpuMachine();
    const r = assemble(EXAMPLES.loop);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    m.loadProgram(r.words);
    m.runUntilHalt(10000);
    assert.equal(m.regs[3], 15);
  });

  it('memory example load/store', () => {
    const m = createCpuMachine();
    const r = assemble(EXAMPLES.memory);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    m.loadProgram(r.words);
    m.runUntilHalt();
    assert.equal(m.regs[3], 0x123);
    assert.equal(m.loadWord(16), 0x123);
  });

  it('flags after CMP', () => {
    const m = createCpuMachine();
    const r = assemble(`\n      MOVI R1, 5\n      MOVI R2, 5\n      CMP R1, R2\n      HALT\n`);
    m.loadProgram(r.words);
    m.runUntilHalt();
    assert.equal(m.flags.z, true);
  });
});
