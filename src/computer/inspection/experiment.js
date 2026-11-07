/**
 * Portable deterministic experiment format (v1).
 */

export const EXPERIMENT_SCHEMA = 'babelcodec.experiment.v1';

export function createExperiment(partial) {
  return {
    schema: EXPERIMENT_SCHEMA,
    architecture: partial.architecture || 'sha256-gate-machine',
    machineId: partial.machineId || 'sha256',
    createdAt: partial.createdAt || new Date().toISOString(),
    input: partial.input ?? null,
    config: partial.config || {},
    initialSnapshot: partial.initialSnapshot || null,
    currentSnapshot: partial.currentSnapshot || null,
    history: partial.history || null,
    trace: partial.trace || [],
    breakpoints: partial.breakpoints || [],
    watches: partial.watches || [],
    selection: partial.selection || null,
    output: partial.output ?? null,
    validation: partial.validation || null,
  };
}

export function parseExperiment(json, limits = {}) {
  const maxFrames = limits.maxFrames ?? 2048;
  const maxTrace = limits.maxTrace ?? 10000;
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Experiment must be an object' };
  }
  if (data.schema !== EXPERIMENT_SCHEMA) {
    return { ok: false, error: `Unsupported schema: ${data.schema}` };
  }
  if (data.history?.frames && data.history.frames.length > maxFrames) {
    return { ok: false, error: `History exceeds maxFrames (${maxFrames})` };
  }
  if (Array.isArray(data.trace) && data.trace.length > maxTrace) {
    return { ok: false, error: `Trace exceeds maxTrace (${maxTrace})` };
  }
  return { ok: true, experiment: data };
}

export function compareSnapshots(a, b) {
  const changes = { registers: [], buses: [], status: {} };
  if (!a || !b) return changes;
  const regsA = a.registers || [];
  const regsB = b.registers || [];
  for (let i = 0; i < Math.max(regsA.length, regsB.length); i++) {
    const ra = regsA[i];
    const rb = regsB[i];
    if (ra && rb && ra.hex !== rb.hex) {
      changes.registers.push({ id: ra.id || rb.id, before: ra.hex, after: rb.hex });
    }
  }
  const busesA = a.buses || [];
  const busesB = b.buses || [];
  for (let i = 0; i < Math.max(busesA.length, busesB.length); i++) {
    const ba = busesA[i];
    const bb = busesB[i];
    if (ba && bb && ba.hex !== bb.hex) {
      changes.buses.push({ id: ba.id || bb.id, before: ba.hex, after: bb.hex });
    }
  }
  if (a.controllerState !== b.controllerState) {
    changes.status.controllerState = { before: a.controllerState, after: b.controllerState };
  }
  if (a.cycle !== b.cycle) {
    changes.status.cycle = { before: a.cycle, after: b.cycle };
  }
  if (a.digestHex !== b.digestHex) {
    changes.status.digestHex = { before: a.digestHex, after: b.digestHex };
  }
  return changes;
}
