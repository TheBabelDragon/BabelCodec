/**
 * Clocked gate-level SHA-256 computer.
 * Arithmetic uses ripple-carry full-adder chain; rounds reuse one datapath.
 */

import { IV, K, BLOCK_BYTES } from '../sha256/constants.js';
import { padMessage, blockCount } from '../sha256/padding.js';
import { parseBlockWords, writeWordBE } from '../sha256/words.js';
import { RegisterBank } from './registers.js';
import { WordMemory } from './memory.js';
import { Bus32 } from './bus.js';
import { MachineState } from './controller.js';
import {
  datapathRound,
  dpAdd,
  dpSmallSigma0,
  dpSmallSigma1,
} from './datapath.js';
import { toUint8Array } from '../core/utils.js';

/**
 * @typedef {object} MachineTraceEntry
 */

export class Sha256Machine {
  constructor() {
    this.bank = new RegisterBank();
    this.schedule = new WordMemory('W', 64);
    this.constants = new WordMemory('K', 64);
    this.constants.load(K);
    this.hashState = new WordMemory('H', 8);
    this.hashState.load(IV);

    this.busT1 = new Bus32('T1');
    this.busT2 = new Bus32('T2');
    this.busW = new Bus32('W');
    this.busK = new Bus32('K');

    this.state = MachineState.IDLE;
    this.blockIndex = 0;
    this.round = 0;
    this.totalBlocks = 0;
    this.padded = null;
    this.messageLength = 0;
    this.error = null;
    this.cycle = 0;
    this.paused = false;
    /** @type {MachineTraceEntry[]} */
    this.trace = [];
    this.traceEnabled = true;
    this.maxTrace = 4096;
    this.lastSignals = null;
  }

  /**
   * @param {Uint8Array|ArrayBuffer|number[]|string} input
   */
  loadMessage(input) {
    this.reset();
    let bytes;
    if (typeof input === 'string') {
      bytes = new TextEncoder().encode(input);
    } else {
      bytes = toUint8Array(/** @type {any} */ (input));
    }
    this.messageLength = bytes.length;
    this.padded = padMessage(bytes);
    this.totalBlocks = blockCount(this.padded);
    this.hashState.load(IV);
    this.state = this.totalBlocks > 0 ? MachineState.LOAD_BLOCK : MachineState.COMPLETE;
    this._record('loadMessage', { length: bytes.length, blocks: this.totalBlocks });
  }

  reset() {
    this.bank = new RegisterBank();
    this.schedule.clear();
    this.hashState.load(IV);
    this.state = MachineState.IDLE;
    this.blockIndex = 0;
    this.round = 0;
    this.totalBlocks = 0;
    this.padded = null;
    this.messageLength = 0;
    this.error = null;
    this.cycle = 0;
    this.paused = false;
    this.trace = [];
    this.lastSignals = null;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  /**
   * Advance one machine cycle.
   * @returns {{ state: string, cycle: number }}
   */
  clock() {
    if (this.paused) return { state: this.state, cycle: this.cycle };
    if (this.state === MachineState.COMPLETE || this.state === MachineState.ERROR) {
      return { state: this.state, cycle: this.cycle };
    }
    this.cycle += 1;

    try {
      switch (this.state) {
        case MachineState.LOAD_BLOCK:
          this._loadBlock();
          this.state = MachineState.PREPARE_SCHEDULE;
          break;
        case MachineState.PREPARE_SCHEDULE:
          this._prepareSchedule();
          this.state = MachineState.INITIALIZE_REGISTERS;
          break;
        case MachineState.INITIALIZE_REGISTERS:
          this.bank.loadAll(this.hashState.words.slice());
          this.round = 0;
          this.state = MachineState.EXECUTE_ROUND;
          this._record('initRegs', { H: this.hashState.words.slice() });
          break;
        case MachineState.EXECUTE_ROUND:
          this._executeRound();
          if (this.round >= 64) {
            this.state = MachineState.ACCUMULATE_STATE;
          }
          break;
        case MachineState.ACCUMULATE_STATE:
          this._accumulate();
          this.state = MachineState.NEXT_BLOCK;
          break;
        case MachineState.NEXT_BLOCK:
          this.blockIndex += 1;
          if (this.blockIndex >= this.totalBlocks) {
            this.state = MachineState.COMPLETE;
            this._record('complete', { digest: this.getDigestHex() });
          } else {
            this.state = MachineState.LOAD_BLOCK;
          }
          break;
        default:
          break;
      }
    } catch (e) {
      this.state = MachineState.ERROR;
      this.error = e.message || String(e);
      this._record('error', { message: this.error });
    }

    return { state: this.state, cycle: this.cycle };
  }

  /**
   * Run until one full round completes (or machine leaves EXECUTE_ROUND).
   */
  stepRound() {
    if (this.state === MachineState.COMPLETE || this.state === MachineState.ERROR) {
      return this.getMachineState();
    }
    // Ensure we reach EXECUTE_ROUND first
    while (
      this.state !== MachineState.EXECUTE_ROUND &&
      this.state !== MachineState.COMPLETE &&
      this.state !== MachineState.ERROR &&
      !this.paused
    ) {
      this.clock();
    }
    if (this.state === MachineState.EXECUTE_ROUND) {
      const before = this.round;
      this.clock(); // performs one round
      // if still in execute and same round somehow, loop guard
      while (
        this.state === MachineState.EXECUTE_ROUND &&
        this.round === before &&
        !this.paused
      ) {
        this.clock();
      }
    }
    return this.getMachineState();
  }

  /** Run until COMPLETE or ERROR. */
  runUntilComplete(maxCycles = 1_000_000) {
    let n = 0;
    while (
      this.state !== MachineState.COMPLETE &&
      this.state !== MachineState.ERROR &&
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
      blockIndex: this.blockIndex,
      totalBlocks: this.totalBlocks,
      round: this.round,
      messageLength: this.messageLength,
      paused: this.paused,
      error: this.error,
      digestHex: this.state === MachineState.COMPLETE ? this.getDigestHex() : null,
    };
  }

  getRegisterSnapshot() {
    return {
      working: {
        A: this.bank.A, B: this.bank.B, C: this.bank.C, D: this.bank.D,
        E: this.bank.E, F: this.bank.F, G: this.bank.G, H: this.bank.H,
      },
      hash: this.hashState.words.slice(),
      T1: this.busT1.value,
      T2: this.busT2.value,
      W: this.busW.value,
      K: this.busK.value,
    };
  }

  getSignalSnapshot() {
    return this.lastSignals;
  }

  getMachineTrace() {
    return this.trace.slice();
  }

  getDigest() {
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      writeWordBE(out, i * 4, this.hashState.words[i]);
    }
    return out;
  }

  getDigestHex() {
    return [...this.getDigest()].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // —— internal steps ——

  _loadBlock() {
    if (!this.padded) throw new Error('No message loaded');
    const words = parseBlockWords(this.padded, this.blockIndex);
    for (let i = 0; i < 16; i++) {
      this.schedule.write(i, words[i]);
    }
    this._record('loadBlock', { block: this.blockIndex, words: words.slice() });
  }

  _prepareSchedule() {
    // W[16..63] using gate-level modular add
    for (let t = 16; t < 64; t++) {
      const Wt = dpAdd(
        dpSmallSigma1(this.schedule.read(t - 2)),
        this.schedule.read(t - 7),
        dpSmallSigma0(this.schedule.read(t - 15)),
        this.schedule.read(t - 16),
      );
      this.schedule.write(t, Wt);
    }
    this._record('prepareSchedule', { block: this.blockIndex });
  }

  _executeRound() {
    const t = this.round;
    const Wt = this.schedule.read(t);
    const Kt = this.constants.read(t);
    this.busW.value = Wt;
    this.busK.value = Kt;

    const regs = {
      A: this.bank.A, B: this.bank.B, C: this.bank.C, D: this.bank.D,
      E: this.bank.E, F: this.bank.F, G: this.bank.G, H: this.bank.H,
    };
    const next = datapathRound(regs, Wt, Kt);
    this.busT1.value = next.T1;
    this.busT2.value = next.T2;

    // Stage atomic register updates
    this.bank.regs.A.write(next.A);
    this.bank.regs.B.write(next.B);
    this.bank.regs.C.write(next.C);
    this.bank.regs.D.write(next.D);
    this.bank.regs.E.write(next.E);
    this.bank.regs.F.write(next.F);
    this.bank.regs.G.write(next.G);
    this.bank.regs.H.write(next.H);
    this.bank.commitAll();

    this.lastSignals = {
      round: t,
      W: Wt,
      K: Kt,
      T1: next.T1,
      T2: next.T2,
      regs: this.bank.snapshot(),
    };
    this._record('round', this.lastSignals);
    this.round = t + 1;
  }

  _accumulate() {
    const snap = this.bank.snapshot();
    for (let i = 0; i < 8; i++) {
      this.hashState.write(i, dpAdd(this.hashState.read(i), snap[i]));
    }
    this._record('accumulate', { H: this.hashState.words.slice() });
  }

  _record(type, data) {
    if (!this.traceEnabled) return;
    if (this.trace.length >= this.maxTrace) this.trace.shift();
    this.trace.push({ cycle: this.cycle, type, state: this.state, data });
  }
}

export function createSha256Machine() {
  return new Sha256Machine();
}

export function loadMessage(machine, input) {
  machine.loadMessage(input);
  return machine;
}

export function clock(machine) {
  return machine.clock();
}

export function stepRound(machine) {
  return machine.stepRound();
}

export function runUntilComplete(machine, maxCycles) {
  return machine.runUntilComplete(maxCycles);
}

export function getMachineState(machine) {
  return machine.getMachineState();
}

export function getRegisterSnapshot(machine) {
  return machine.getRegisterSnapshot();
}

export function getSignalSnapshot(machine) {
  return machine.getSignalSnapshot();
}

export function getMachineTrace(machine) {
  return machine.getMachineTrace();
}

export function resetMachine(machine) {
  machine.reset();
  return machine;
}
