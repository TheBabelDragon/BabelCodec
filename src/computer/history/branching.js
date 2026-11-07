/**
 * Branching execution history — preserves original timeline when mutating from a rewind point.
 */

import { captureMachineBlob, restoreMachineBlob } from '../inspection/history.js';

export class BranchingHistory {
  constructor(machine, opts = {}) {
    this.machine = machine;
    this.adapter = opts.adapter || null;
    this.maxFrames = opts.maxFrames ?? 512;
    this.checkpointEvery = opts.checkpointEvery ?? 16;
    this.branches = [];
    this.activeBranchId = null;
    this._frameSeq = 0;
    this._ensureRoot();
  }

  _ensureRoot() {
    if (this.branches.length === 0) {
      const id = 'branch_root';
      this.branches.push({ id, parentId: null, label: 'main', frames: [], mutations: [] });
      this.activeBranchId = id;
    }
  }

  get activeBranch() {
    return this.branches.find((b) => b.id === this.activeBranchId);
  }

  _capture() {
    if (this.adapter?.captureBlob) return this.adapter.captureBlob();
    return captureMachineBlob(this.machine);
  }

  _restore(blob) {
    if (this.adapter?.restore) {
      this.adapter.restore(blob);
      return;
    }
    restoreMachineBlob(this.machine, blob);
  }

  record(meta = {}) {
    const branch = this.activeBranch;
    if (!branch) return null;
    this._frameSeq += 1;
    const frame = {
      id: `f_${this._frameSeq}`,
      cycle: this.machine.cycle ?? 0,
      blob: this._capture(),
      meta: { ...meta },
      timestamp: Date.now(),
    };
    branch.frames.push(frame);
    while (branch.frames.length > this.maxFrames) {
      const dropIdx = branch.frames.findIndex((f, i) => i > 0 && i % this.checkpointEvery !== 0);
      if (dropIdx === -1) branch.frames.shift();
      else branch.frames.splice(dropIdx, 1);
    }
    return frame;
  }

  rewindTo(frameIndex) {
    const branch = this.activeBranch;
    if (!branch || frameIndex < 0 || frameIndex >= branch.frames.length) {
      return { ok: false, message: 'Invalid frame index' };
    }
    const frame = branch.frames[frameIndex];
    this._restore(frame.blob);
    return { ok: true, frame, index: frameIndex };
  }

  branchFrom(fromIndex, label = 'branch', mutation = null) {
    const parent = this.activeBranch;
    if (!parent || fromIndex < 0 || fromIndex >= parent.frames.length) {
      return { ok: false, message: 'Invalid branch point' };
    }
    this.rewindTo(fromIndex);
    const id = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const frames = parent.frames.slice(0, fromIndex + 1).map((f) => ({
      ...f,
      blob: typeof structuredClone === 'function'
        ? structuredClone(f.blob)
        : JSON.parse(JSON.stringify(f.blob, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
    }));
    const branch = { id, parentId: parent.id, label, frames, mutations: mutation ? [mutation] : [] };
    this.branches.push(branch);
    this.activeBranchId = id;
    if (mutation) this.record({ kind: 'mutation', mutation });
    return { ok: true, branchId: id };
  }

  replayTo(endIndex) {
    return this.rewindTo(endIndex);
  }

  listBranches() {
    return this.branches.map((b) => ({
      id: b.id,
      parentId: b.parentId,
      label: b.label,
      frames: b.frames.length,
      mutations: b.mutations.length,
      active: b.id === this.activeBranchId,
    }));
  }

  switchBranch(id) {
    const b = this.branches.find((x) => x.id === id);
    if (!b) return { ok: false };
    this.activeBranchId = id;
    if (b.frames.length) this._restore(b.frames[b.frames.length - 1].blob);
    return { ok: true };
  }

  clear() {
    this.branches = [];
    this.activeBranchId = null;
    this._frameSeq = 0;
    this._ensureRoot();
  }
}
