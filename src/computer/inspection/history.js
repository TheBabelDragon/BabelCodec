/**
 * Deterministic execution history: periodic full snapshots + replay.
 * Rewind restores machine state; forward moves among recorded frames.
 */

import { cloneSnapshot } from './snapshot.js';

export function captureMachineBlob(machine) {
  return {
    state: machine.state,
    blockIndex: machine.blockIndex,
    round: machine.round,
    totalBlocks: machine.totalBlocks,
    messageLength: machine.messageLength,
    cycle: machine.cycle,
    paused: machine.paused,
    error: machine.error,
    padded: machine.padded ? Array.from(machine.padded) : null,
    bank: machine.bank.snapshot(),
    schedule: machine.schedule.words.slice(),
    hashState: machine.hashState.words.slice(),
    busT1: machine.busT1.value,
    busT2: machine.busT2.value,
    busW: machine.busW.value,
    busK: machine.busK.value,
    lastSignals: machine.lastSignals
      ? JSON.parse(JSON.stringify(machine.lastSignals, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v))
      : null,
  };
}

export function restoreMachineBlob(machine, blob) {
  machine.state = blob.state;
  machine.blockIndex = blob.blockIndex;
  machine.round = blob.round;
  machine.totalBlocks = blob.totalBlocks;
  machine.messageLength = blob.messageLength;
  machine.cycle = blob.cycle;
  machine.paused = blob.paused;
  machine.error = blob.error;
  machine.padded = blob.padded ? new Uint8Array(blob.padded) : null;
  machine.bank.loadAll(blob.bank.map((w) => (typeof w === 'string' ? BigInt(w) : BigInt(w))));
  for (let i = 0; i < 64; i++) {
    const w = blob.schedule[i];
    machine.schedule.write(i, typeof w === 'string' ? BigInt(w) : BigInt(w ?? 0));
  }
  for (let i = 0; i < 8; i++) {
    const w = blob.hashState[i];
    machine.hashState.write(i, typeof w === 'string' ? BigInt(w) : BigInt(w ?? 0));
  }
  machine.busT1.value = blob.busT1 != null ? BigInt(blob.busT1) : 0n;
  machine.busT2.value = blob.busT2 != null ? BigInt(blob.busT2) : 0n;
  machine.busW.value = blob.busW != null ? BigInt(blob.busW) : 0n;
  machine.busK.value = blob.busK != null ? BigInt(blob.busK) : 0n;
  machine.lastSignals = blob.lastSignals;
}

export class ExecutionHistory {
  constructor(machine, opts = {}) {
    this.machine = machine;
    this.maxFrames = opts.maxFrames ?? 512;
    this.snapshotEvery = opts.snapshotEvery ?? 1;
    this.frames = [];
    this.cursor = -1;
    this._seq = 0;
  }

  clear() {
    this.frames = [];
    this.cursor = -1;
    this._seq = 0;
  }

  record(publicSnapshot) {
    if (this.cursor >= 0 && this.cursor < this.frames.length - 1) {
      this.frames = this.frames.slice(0, this.cursor + 1);
    }
    this.cursor = -1;
    const blob = captureMachineBlob(this.machine);
    this._seq += 1;
    const frame = {
      cycle: this.machine.cycle,
      sequence: this._seq,
      stateBlob: JSON.stringify(blob, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      publicSnapshot: publicSnapshot ? cloneSnapshot(publicSnapshot) : null,
    };
    this.frames.push(frame);
    while (this.frames.length > this.maxFrames) this.frames.shift();
  }

  canStepBack() {
    return this._effectiveIndex() > 0;
  }

  canStepForward() {
    if (this.cursor < 0) return false;
    return this.cursor < this.frames.length - 1;
  }

  _effectiveIndex() {
    if (this.cursor >= 0) return this.cursor;
    return this.frames.length - 1;
  }

  stepBack() {
    if (!this.canStepBack()) return false;
    return this.seek(this._effectiveIndex() - 1);
  }

  stepForward() {
    if (!this.canStepForward()) return false;
    return this.seek(this.cursor + 1);
  }

  seek(index) {
    if (index < 0 || index >= this.frames.length) return false;
    const frame = this.frames[index];
    const blob = JSON.parse(frame.stateBlob);
    restoreMachineBlob(this.machine, blob);
    this.cursor = index;
    if (index === this.frames.length - 1) this.cursor = -1;
    return true;
  }

  goLive() {
    if (this.frames.length === 0) return;
    this.seek(this.frames.length - 1);
    this.cursor = -1;
  }

  status() {
    const idx = this._effectiveIndex();
    return {
      index: idx,
      length: this.frames.length,
      live: this.cursor < 0,
      cycle: this.frames[idx]?.cycle ?? null,
    };
  }

  exportJSON() {
    return JSON.stringify({
      schema: 'babelcodec.history.v1',
      replayCapable: true,
      maxFrames: this.maxFrames,
      frames: this.frames,
    });
  }
}
