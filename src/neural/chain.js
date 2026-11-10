/**
 * Causal chain reconstruction and integrity checks.
 *
 * Ordering is by explicit causation references, not timestamps.
 */

import {
  SCHEMA_OBSERVATION,
  SCHEMA_INFERENCE,
  SCHEMA_DECISION,
  validateEvent,
} from './events.js';

/**
 * Index events by event_id.
 * @param {object[]} events
 * @returns {{ ok: true, byId: Map } | { ok: false, errors: string[] }}
 */
export function indexEvents(events) {
  const errors = [];
  const byId = new Map();
  if (!Array.isArray(events)) return { ok: false, errors: ['events must be array'] };
  for (const e of events) {
    const v = validateEvent(e);
    if (!v.ok) {
      errors.push(...v.errors.map((x) => `${e?.event_id || '?'}: ${x}`));
      continue;
    }
    if (byId.has(e.event_id)) {
      errors.push(`duplicate event_id: ${e.event_id}`);
    } else {
      byId.set(e.event_id, e);
    }
  }
  // Sequence conflicts per source_node
  const seq = new Map();
  for (const e of byId.values()) {
    if (e.schema !== SCHEMA_OBSERVATION) continue;
    const key = `${e.source_system}::${e.source_node_id}`;
    if (!seq.has(key)) seq.set(key, new Map());
    const m = seq.get(key);
    if (m.has(e.source_sequence)) {
      errors.push(
        `sequence conflict ${key} seq=${e.source_sequence}: ${m.get(e.source_sequence)} vs ${e.event_id}`,
      );
    } else {
      m.set(e.source_sequence, e.event_id);
    }
  }
  return errors.length ? { ok: false, errors, byId } : { ok: true, byId };
}

/**
 * Validate that all causation / input references resolve.
 */
export function validateReferences(events) {
  const indexed = indexEvents(events);
  const errors = [...(indexed.errors || [])];
  const byId = indexed.byId || new Map();
  for (const e of byId.values()) {
    if (e.schema === SCHEMA_INFERENCE) {
      for (const id of e.input_observation_ids || []) {
        const ref = byId.get(id);
        if (!ref) errors.push(`inference ${e.event_id} missing observation ${id}`);
        else if (ref.schema !== SCHEMA_OBSERVATION) {
          errors.push(`inference ${e.event_id} ref ${id} is not observation`);
        }
      }
    }
    if (e.schema === SCHEMA_DECISION) {
      for (const id of e.causation_ids || []) {
        if (!byId.has(id)) errors.push(`decision ${e.event_id} missing causation ${id}`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Reconstruct chain from a terminal event_id walking causation/input refs.
 * @returns {{ ok: boolean, chain?: object[], errors?: string[] }}
 */
export function reconstructChain(events, terminalEventId) {
  const indexed = indexEvents(events);
  if (!indexed.ok && !indexed.byId?.size) return { ok: false, errors: indexed.errors };
  const byId = indexed.byId;
  const errors = [...(indexed.errors || [])];
  const visited = new Set();
  const chain = [];

  function walk(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const e = byId.get(id);
    if (!e) {
      errors.push(`missing event ${id}`);
      return;
    }
    if (e.schema === SCHEMA_INFERENCE) {
      for (const oid of e.input_observation_ids || []) walk(oid);
    }
    if (e.schema === SCHEMA_DECISION) {
      for (const cid of e.causation_ids || []) walk(cid);
    }
    chain.push(e);
  }

  walk(terminalEventId);
  return errors.length ? { ok: false, errors, chain } : { ok: true, chain };
}

/**
 * Detect sequence gaps for a source node (informational).
 */
export function sequenceGaps(events, sourceSystem, sourceNodeId) {
  const seqs = events
    .filter(
      (e) =>
        e.schema === SCHEMA_OBSERVATION &&
        e.source_system === sourceSystem &&
        e.source_node_id === sourceNodeId,
    )
    .map((e) => e.source_sequence)
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] !== seqs[i - 1] + 1) {
      gaps.push({ after: seqs[i - 1], before: seqs[i] });
    }
  }
  return gaps;
}
