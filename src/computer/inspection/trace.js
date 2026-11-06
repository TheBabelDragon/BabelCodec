/**
 * Structured execution event stream.
 * Deterministic ordering, bounded, JSON-exportable.
 */

let globalSeq = 0;

export function makeTraceEvent(partial) {
  globalSeq += 1;
  return {
    sequence: partial.sequence ?? globalSeq,
    cycle: partial.cycle,
    type: partial.type,
    state: partial.state,
    componentId: partial.componentId ?? null,
    operation: partial.operation ?? null,
    inputs: partial.inputs ? { ...partial.inputs } : {},
    outputs: partial.outputs ? { ...partial.outputs } : {},
    changedRegisters: partial.changedRegisters ? [...partial.changedRegisters] : [],
    memoryOps: partial.memoryOps ? partial.memoryOps.map((m) => ({ ...m })) : [],
    signals: partial.signals ? { ...partial.signals } : null,
    block: partial.block ?? null,
    round: partial.round ?? null,
    data: partial.data ? { ...partial.data } : undefined,
  };
}

export class TraceBuffer {
  constructor(max = 4096) {
    this.max = max;
    this.events = [];
    this._seq = 0;
  }

  push(partial) {
    this._seq += 1;
    const ev = makeTraceEvent({ ...partial, sequence: this._seq });
    this.events.push(ev);
    while (this.events.length > this.max) this.events.shift();
    return ev;
  }

  clear() {
    this.events = [];
    this._seq = 0;
  }

  list() {
    return this.events.slice();
  }

  filter(filter = {}) {
    return this.events.filter((e) => {
      if (filter.type != null && e.type !== filter.type) return false;
      if (filter.componentId != null && e.componentId !== filter.componentId) return false;
      if (filter.block != null && e.block !== filter.block) return false;
      if (filter.round != null && e.round !== filter.round) return false;
      return true;
    });
  }

  toJSON() {
    return JSON.stringify({
      schema: 'babelcodec.trace.v1',
      max: this.max,
      count: this.events.length,
      replayCapable: false,
      events: this.events,
    }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  }

  static parseJSON(json) {
    return JSON.parse(json);
  }
}
