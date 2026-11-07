let _seq = 0;

export function makeMutationEvent(partial) {
  _seq += 1;
  return Object.freeze({
    id: partial.id || `mut_${Date.now()}_${_seq}`,
    machineId: partial.machineId || 'unknown',
    componentId: partial.componentId,
    operation: partial.operation,
    previous: partial.previous,
    next: partial.next,
    cycle: partial.cycle ?? 0,
    sequence: _seq,
    timestamp: partial.timestamp ?? Date.now(),
    origin: partial.origin || 'user',
    validation: Object.freeze({ ...(partial.validation || { ok: true }) }),
  });
}

export function serializeMutation(ev) {
  return JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}
