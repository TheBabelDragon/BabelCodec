/**
 * Asynchronous cycle-batch execution scheduler.
 * Drives the real machine only — no parallel mock state.
 */

export class ExecutionScheduler {
  constructor(machine, opts = {}) {
    this.machine = machine;
    this.history = opts.history || null;
    this.onCycle = opts.onCycle || (() => {});
    this.onStop = opts.onStop || (() => {});
    this.batchSize = opts.batchSize ?? 8;
    this.yieldMs = opts.yieldMs ?? 0;
    this.breakpoints = [];
    this.watchpoints = [];
    this._running = false;
    this._token = 0;
    this._timer = null;
  }

  isRunning() { return this._running; }

  setBatchSize(n) {
    this.batchSize = Math.max(1, Math.min(256, n | 0));
  }

  addBreakpoint(bp) {
    const id = bp.id || `bp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.breakpoints.push({
      id,
      enabled: bp.enabled !== false,
      type: bp.type,
      params: { ...(bp.params || {}) },
    });
    return id;
  }

  removeBreakpoint(id) {
    this.breakpoints = this.breakpoints.filter((b) => b.id !== id);
  }

  addWatchpoint(wp) {
    const id = wp.id || `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.watchpoints.push({
      id,
      enabled: wp.enabled !== false,
      kind: wp.kind,
      target: wp.target,
      lastHex: null,
    });
    return id;
  }

  removeWatchpoint(id) {
    this.watchpoints = this.watchpoints.filter((w) => w.id !== id);
  }

  stop(reason = 'stop') {
    this._running = false;
    this._token += 1;
    if (this._timer != null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.onStop(reason);
  }

  run(opts = {}) {
    if (this._running) return;
    this._running = true;
    const token = ++this._token;
    const maxCycles = opts.maxCycles ?? 1_000_000;
    let executed = 0;

    const tick = () => {
      if (token !== this._token || !this._running) return;
      if (this.machine.paused) {
        this.stop('pause');
        return;
      }

      let batch = 0;
      while (batch < this.batchSize && executed < maxCycles) {
        const before = this._captureWatch();
        const stBefore = this.machine.getMachineState?.() || {};
        if (stBefore.state === 'COMPLETE' || stBefore.state === 'ERROR') {
          this.stop(stBefore.state === 'COMPLETE' ? 'complete' : 'error');
          return;
        }

        this.machine.clock();
        executed += 1;
        batch += 1;

        if (this.history) this.history.record();
        this.onCycle(this.machine.getMachineState?.() || {});

        const hit = this._checkBreakpoints(stBefore) || this._checkWatchpoints(before);
        if (hit) {
          this.stop('breakpoint', hit);
          return;
        }

        const st = this.machine.getMachineState?.() || {};
        if (st.state === 'COMPLETE' || st.state === 'ERROR') {
          this.stop(st.state === 'COMPLETE' ? 'complete' : 'error');
          return;
        }
      }

      if (executed >= maxCycles) {
        this.stop('maxCycles');
        return;
      }

      this._timer = setTimeout(tick, this.yieldMs);
    };

    this._timer = setTimeout(tick, 0);
  }

  stepCycle() {
    if (this._running) this.stop('interrupted');
    const before = this._captureWatch();
    const stBefore = this.machine.getMachineState?.() || {};
    if (stBefore.state === 'COMPLETE' || stBefore.state === 'ERROR') return stBefore;
    this.machine.clock();
    if (this.history) this.history.record();
    this.onCycle(this.machine.getMachineState?.() || {});
    const hit = this._checkBreakpoints(stBefore) || this._checkWatchpoints(before);
    if (hit) this.onStop('breakpoint', hit);
    return this.machine.getMachineState?.() || {};
  }

  stepRoundWithHistory() {
    if (this._running) this.stop('interrupted');
    while (
      this.machine.state !== 'EXECUTE_ROUND' &&
      this.machine.state !== 'COMPLETE' &&
      this.machine.state !== 'ERROR' &&
      !this.machine.paused
    ) {
      this.machine.clock();
      if (this.history) this.history.record();
      this.onCycle(this.machine.getMachineState?.() || {});
    }
    if (this.machine.state === 'EXECUTE_ROUND') {
      const before = this.machine.round;
      this.machine.clock();
      if (this.history) this.history.record();
      this.onCycle(this.machine.getMachineState?.() || {});
      while (
        this.machine.state === 'EXECUTE_ROUND' &&
        this.machine.round === before &&
        !this.machine.paused
      ) {
        this.machine.clock();
        if (this.history) this.history.record();
        this.onCycle(this.machine.getMachineState?.() || {});
      }
    }
    return this.machine.getMachineState?.() || {};
  }

  _captureWatch() {
    const snap = {};
    for (const w of this.watchpoints) {
      if (!w.enabled) continue;
      snap[w.id] = this._readWatch(w);
    }
    return snap;
  }

  _readWatch(w) {
    try {
      if (w.kind === 'register' && this.machine.bank) {
        const name = w.target.replace(/^reg\.working\./, '');
        const v = this.machine.bank.regs?.[name]?.value ?? this.machine.bank[name];
        return v != null ? (BigInt(v) & 0xffffffffn).toString(16).padStart(8, '0') : null;
      }
      if (w.kind === 'bus') {
        const map = {
          T1: this.machine.busT1,
          T2: this.machine.busT2,
          W: this.machine.busW,
          K: this.machine.busK,
        };
        const key = w.target.replace(/^bus\./, '');
        const bus = map[key];
        return bus ? (BigInt(bus.value) & 0xffffffffn).toString(16).padStart(8, '0') : null;
      }
      if (w.kind === 'memory') {
        const parts = w.target.split('.');
        if (parts[1] === 'hash' && this.machine.hashState) {
          const idx = Number(parts[2]);
          return (BigInt(this.machine.hashState.read(idx)) & 0xffffffffn).toString(16).padStart(8, '0');
        }
        if (parts[1] === 'W' && this.machine.schedule) {
          const idx = Number(parts[2]);
          return (BigInt(this.machine.schedule.read(idx)) & 0xffffffffn).toString(16).padStart(8, '0');
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  _checkWatchpoints(before) {
    for (const w of this.watchpoints) {
      if (!w.enabled) continue;
      const now = this._readWatch(w);
      const prev = before[w.id] ?? w.lastHex;
      w.lastHex = now;
      if (prev != null && now != null && prev !== now) {
        return { type: 'watchpoint', watch: w, previous: prev, current: now };
      }
    }
    return null;
  }

  _checkBreakpoints(stBefore) {
    const st = this.machine.getMachineState?.() || {};
    for (const bp of this.breakpoints) {
      if (!bp.enabled) continue;
      const p = bp.params || {};
      if (bp.type === 'cycle' && st.cycle === p.cycle) {
        return { type: 'breakpoint', breakpoint: bp };
      }
      if (bp.type === 'block' && st.blockIndex === p.block && stBefore.blockIndex !== p.block) {
        return { type: 'breakpoint', breakpoint: bp };
      }
      if (bp.type === 'round' && st.round === p.round && this.machine.state === 'EXECUTE_ROUND') {
        return { type: 'breakpoint', breakpoint: bp };
      }
      if (bp.type === 'state' && this.machine.state === p.state && stBefore.state !== p.state) {
        return { type: 'breakpoint', breakpoint: bp };
      }
    }
    return null;
  }

  destroy() {
    this.stop('destroy');
  }
}
