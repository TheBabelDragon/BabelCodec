/**
 * BabelCodec educational 32-bit CPU — Harvard architecture.
 * R0 hardwired zero. Word-addressed program memory; byte-addressed data RAM.
 */

import { OP, decode } from './opcodes.js';

export const CpuState = Object.freeze({
  IDLE: 'IDLE',
  FETCH: 'FETCH',
  DECODE: 'DECODE',
  EXECUTE: 'EXECUTE',
  HALTED: 'HALTED',
  ERROR: 'ERROR',
});

const PROG_WORDS = 4096;
const DATA_BYTES = 65536;

export class CpuMachine {
  constructor() {
    this.regs = new Array(16).fill(0);
    this.pc = 0;
    this.ir = 0;
    this.flags = { z: false, n: false, c: false };
    this.state = CpuState.IDLE;
    this.cycle = 0;
    this.paused = false;
    this.error = null;
    this.halted = false;
    this.program = new Uint32Array(PROG_WORDS);
    this.data = new Uint8Array(DATA_BYTES);
    this.endian = 'LE';
    this.trace = [];
    this.traceEnabled = true;
    this.maxTrace = 4096;
    this.lastAlu = null;
    this.busAddr = 0;
    this.busData = 0;
  }

  loadProgram(words, start = 0) {
    this.reset();
    const arr = words instanceof Uint32Array ? words : Uint32Array.from(words);
    for (let i = 0; i < arr.length && start + i < PROG_WORDS; i++) {
      this.program[start + i] = arr[i] >>> 0;
    }
    this.state = CpuState.FETCH;
    this._record('loadProgram', { words: arr.length, start });
  }

  reset() {
    this.regs.fill(0);
    this.pc = 0;
    this.ir = 0;
    this.flags = { z: false, n: false, c: false };
    this.state = CpuState.IDLE;
    this.cycle = 0;
    this.paused = false;
    this.error = null;
    this.halted = false;
    this.trace = [];
    this.lastAlu = null;
    this.busAddr = 0;
    this.busData = 0;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  clock() {
    if (this.paused) return this.getMachineState();
    if (this.state === CpuState.HALTED || this.state === CpuState.ERROR || this.state === CpuState.IDLE) {
      return this.getMachineState();
    }
    this.cycle += 1;
    try {
      switch (this.state) {
        case CpuState.FETCH:
          this._fetch();
          this.state = CpuState.DECODE;
          break;
        case CpuState.DECODE:
          this.state = CpuState.EXECUTE;
          break;
        case CpuState.EXECUTE:
          this._execute();
          if (this.state === CpuState.EXECUTE) {
            this.state = this.halted ? CpuState.HALTED : CpuState.FETCH;
          }
          break;
        default:
          break;
      }
    } catch (e) {
      this.state = CpuState.ERROR;
      this.error = e.message || String(e);
      this._record('error', { message: this.error });
    }
    return this.getMachineState();
  }

  stepInstruction() {
    if (this.state === CpuState.IDLE) this.state = CpuState.FETCH;
    const guard = 8;
    let n = 0;
    const startCycle = this.cycle;
    while (
      n < guard &&
      this.state !== CpuState.HALTED &&
      this.state !== CpuState.ERROR &&
      !this.paused
    ) {
      this.clock();
      n += 1;
      if (this.state === CpuState.FETCH && this.cycle > startCycle + 1) break;
    }
    return this.getMachineState();
  }

  runUntilHalt(maxCycles = 1_000_000) {
    if (this.state === CpuState.IDLE) this.state = CpuState.FETCH;
    let n = 0;
    while (
      this.state !== CpuState.HALTED &&
      this.state !== CpuState.ERROR &&
      !this.paused &&
      n < maxCycles
    ) {
      this.clock();
      n += 1;
    }
    return this.getMachineState();
  }

  getMachineState() {
    return {
      state: this.state,
      cycle: this.cycle,
      pc: this.pc,
      ir: this.ir,
      halted: this.halted,
      paused: this.paused,
      error: this.error,
      flags: { ...this.flags },
    };
  }

  getRegisterSnapshot() {
    return this.regs.map((v, i) => ({
      id: `reg.R${i}`,
      label: `R${i}`,
      hex: (v >>> 0).toString(16).padStart(8, '0'),
      value: v >>> 0,
    }));
  }

  loadWord(addr) {
    if (addr < 0 || addr + 3 >= DATA_BYTES || (addr & 3) !== 0) {
      throw new RangeError(`LOAD address out of bounds or unaligned: ${addr}`);
    }
    return (
      this.data[addr] |
      (this.data[addr + 1] << 8) |
      (this.data[addr + 2] << 16) |
      (this.data[addr + 3] << 24)
    ) >>> 0;
  }

  storeWord(addr, value) {
    if (addr < 0 || addr + 3 >= DATA_BYTES || (addr & 3) !== 0) {
      throw new RangeError(`STORE address out of bounds or unaligned: ${addr}`);
    }
    const v = value >>> 0;
    this.data[addr] = v & 0xff;
    this.data[addr + 1] = (v >>> 8) & 0xff;
    this.data[addr + 2] = (v >>> 16) & 0xff;
    this.data[addr + 3] = (v >>> 24) & 0xff;
  }

  _fetch() {
    if (this.pc < 0 || this.pc >= PROG_WORDS) {
      throw new RangeError(`PC out of range: ${this.pc}`);
    }
    this.ir = this.program[this.pc] >>> 0;
    this._record('fetch', { pc: this.pc, ir: this.ir });
  }

  _reg(i) {
    if (i === 0) return 0;
    return this.regs[i] >>> 0;
  }

  _setReg(i, v) {
    if (i === 0) return;
    this.regs[i] = v >>> 0;
  }

  _setZN(v) {
    const u = v >>> 0;
    this.flags.z = u === 0;
    this.flags.n = (u & 0x80000000) !== 0;
  }

  _execute() {
    const d = decode(this.ir);
    const { opcode, rd, rs, rt, imm, offset } = d;
    let nextPc = this.pc + 1;

    switch (opcode) {
      case OP.NOP:
        break;
      case OP.MOVI: {
        this._setReg(rd, imm);
        this._setZN(imm);
        this.lastAlu = { op: 'MOVI', result: imm >>> 0 };
        break;
      }
      case OP.MOV: {
        const v = this._reg(rs);
        this._setReg(rd, v);
        this._setZN(v);
        break;
      }
      case OP.ADD: {
        const a = this._reg(rs);
        const b = this._reg(rt);
        const sum = (a + b) >>> 0;
        this.flags.c = a + b > 0xffffffff;
        this._setReg(rd, sum);
        this._setZN(sum);
        this.lastAlu = { op: 'ADD', a, b, result: sum, carry: this.flags.c };
        break;
      }
      case OP.SUB: {
        const a = this._reg(rs);
        const b = this._reg(rt);
        const diff = (a - b) >>> 0;
        this.flags.c = a >= b;
        this._setReg(rd, diff);
        this._setZN(diff);
        this.lastAlu = { op: 'SUB', a, b, result: diff, carry: this.flags.c };
        break;
      }
      case OP.AND: {
        const v = (this._reg(rs) & this._reg(rt)) >>> 0;
        this._setReg(rd, v);
        this._setZN(v);
        break;
      }
      case OP.OR: {
        const v = (this._reg(rs) | this._reg(rt)) >>> 0;
        this._setReg(rd, v);
        this._setZN(v);
        break;
      }
      case OP.XOR: {
        const v = (this._reg(rs) ^ this._reg(rt)) >>> 0;
        this._setReg(rd, v);
        this._setZN(v);
        break;
      }
      case OP.SHL: {
        const a = this._reg(rs);
        const sh = this._reg(rt) & 31;
        this.flags.c = sh > 0 ? ((a >>> (32 - sh)) & 1) === 1 : false;
        const v = (a << sh) >>> 0;
        this._setReg(rd, v);
        this._setZN(v);
        break;
      }
      case OP.SHR: {
        const a = this._reg(rs);
        const sh = this._reg(rt) & 31;
        this.flags.c = sh > 0 ? ((a >>> (sh - 1)) & 1) === 1 : false;
        const v = (a >>> sh) >>> 0;
        this._setReg(rd, v);
        this._setZN(v);
        break;
      }
      case OP.LOAD: {
        const addr = (this._reg(rs) + imm) >>> 0;
        this.busAddr = addr;
        const v = this.loadWord(addr);
        this.busData = v;
        this._setReg(rd, v);
        this._setZN(v);
        this._record('load', { addr, value: v });
        break;
      }
      case OP.STORE: {
        const addr = (this._reg(rs) + imm) >>> 0;
        const v = this._reg(rd);
        this.busAddr = addr;
        this.busData = v;
        this.storeWord(addr, v);
        this._record('store', { addr, value: v });
        break;
      }
      case OP.CMP: {
        const a = this._reg(rs);
        const b = this._reg(rt);
        const diff = (a - b) >>> 0;
        this.flags.c = a >= b;
        this._setZN(diff);
        this.lastAlu = { op: 'CMP', a, b, result: diff };
        break;
      }
      case OP.JMP:
        nextPc = this.pc + offset;
        break;
      case OP.JZ:
        if (this.flags.z) nextPc = this.pc + offset;
        break;
      case OP.JNZ:
        if (!this.flags.z) nextPc = this.pc + offset;
        break;
      case OP.HALT:
        this.halted = true;
        this.state = CpuState.HALTED;
        this._record('halt', { pc: this.pc });
        this.pc = nextPc;
        return;
      default:
        throw new Error(`Illegal opcode 0x${opcode.toString(16)} at PC ${this.pc}`);
    }

    this.pc = nextPc;
    this._record('execute', { ...d, nextPc });
  }

  _record(type, data) {
    if (!this.traceEnabled) return;
    if (this.trace.length >= this.maxTrace) this.trace.shift();
    this.trace.push({ cycle: this.cycle, type, state: this.state, data });
  }
}

export function createCpuMachine() {
  return new CpuMachine();
}
