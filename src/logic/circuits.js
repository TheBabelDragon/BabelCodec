/**
 * Reusable circuit evaluator — pure, serializable, no DOM.
 *
 * Circuit definition format:
 * {
 *   inputs: string[],
 *   nodes: [{ id: string, gate: GateName, inputs: string[] }],
 *   outputs: { [name: string]: string }
 * }
 */

import { ValidationError } from '../core/errors.js';
import { GATES, evalGate } from './gates.js';

export function validateCircuit(def) {
  if (!def || typeof def !== 'object') {
    throw new ValidationError('Circuit definition must be an object', { code: 'INVALID_CIRCUIT' });
  }
  const d = /** @type {any} */ (def);
  if (!Array.isArray(d.inputs) || d.inputs.some((x) => typeof x !== 'string')) {
    throw new ValidationError('Circuit.inputs must be an array of strings', { code: 'INVALID_CIRCUIT' });
  }
  if (!Array.isArray(d.nodes)) {
    throw new ValidationError('Circuit.nodes must be an array', { code: 'INVALID_CIRCUIT' });
  }
  if (!d.outputs || typeof d.outputs !== 'object' || Array.isArray(d.outputs)) {
    throw new ValidationError('Circuit.outputs must be an object map', { code: 'INVALID_CIRCUIT' });
  }

  const inputSet = new Set(d.inputs);
  const nodeIds = new Set();

  for (const node of d.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id) {
      throw new ValidationError('Each node must have a non-empty string id', { code: 'INVALID_CIRCUIT' });
    }
    if (inputSet.has(node.id) || nodeIds.has(node.id)) {
      throw new ValidationError(`Duplicate or conflicting id: ${node.id}`, { code: 'INVALID_CIRCUIT' });
    }
    if (!GATES[node.gate]) {
      throw new ValidationError(`Unknown gate "${node.gate}" on node ${node.id}`, { code: 'INVALID_CIRCUIT' });
    }
    if (!Array.isArray(node.inputs) || node.inputs.length !== GATES[node.gate].arity) {
      throw new ValidationError(
        `Node ${node.id} (${node.gate}) requires ${GATES[node.gate].arity} input(s)`,
        { code: 'INVALID_CIRCUIT' },
      );
    }
    nodeIds.add(node.id);
  }

  const known = new Set([...inputSet, ...nodeIds]);
  for (const node of d.nodes) {
    for (const src of node.inputs) {
      if (!known.has(src)) {
        throw new ValidationError(
          `Node ${node.id} references unknown source "${src}"`,
          { code: 'INVALID_CIRCUIT' },
        );
      }
    }
  }
  for (const [outName, src] of Object.entries(d.outputs)) {
    if (!known.has(src)) {
      throw new ValidationError(
        `Output "${outName}" references unknown source "${src}"`,
        { code: 'INVALID_CIRCUIT' },
      );
    }
  }

  detectCycles(d.inputs, d.nodes);
  return d;
}

function detectCycles(inputs, nodes) {
  const deps = new Map();
  for (const id of inputs) deps.set(id, []);
  for (const n of nodes) deps.set(n.id, n.inputs.slice());

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of deps.keys()) color.set(id, WHITE);

  function visit(id) {
    color.set(id, GRAY);
    for (const pred of deps.get(id) || []) {
      const c = color.get(pred);
      if (c === GRAY) {
        throw new ValidationError(
          `Circuit contains a cycle involving "${id}"`,
          { code: 'CIRCUIT_CYCLE', details: { node: id } },
        );
      }
      if (c === WHITE) visit(pred);
    }
    color.set(id, BLACK);
  }

  for (const id of deps.keys()) {
    if (color.get(id) === WHITE) visit(id);
  }
}

function topoOrder(circuit) {
  const remaining = new Map();
  const ready = [];
  const order = [];
  const dependents = new Map();

  for (const id of circuit.inputs) {
    remaining.set(id, 0);
    ready.push(id);
  }
  for (const n of circuit.nodes) {
    remaining.set(n.id, n.inputs.length);
    for (const src of n.inputs) {
      if (!dependents.has(src)) dependents.set(src, []);
      dependents.get(src).push(n.id);
    }
  }

  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const dep of dependents.get(id) || []) {
      const left = remaining.get(dep) - 1;
      remaining.set(dep, left);
      if (left === 0) ready.push(dep);
    }
  }

  if (order.length !== circuit.inputs.length + circuit.nodes.length) {
    throw new ValidationError('Circuit evaluation order incomplete (possible cycle)', {
      code: 'CIRCUIT_CYCLE',
    });
  }
  return order;
}

export function evaluateCircuit(circuitDef, inputValues = {}) {
  const circuit = validateCircuit(circuitDef);
  const values = new Map();

  for (const id of circuit.inputs) {
    if (!(id in inputValues)) {
      throw new ValidationError(
        `Missing input value for "${id}"`,
        { code: 'MISSING_INPUT', details: { input: id } },
      );
    }
    values.set(id, Boolean(inputValues[id]));
  }

  const nodeById = new Map(circuit.nodes.map((n) => [n.id, n]));
  const order = topoOrder(circuit);

  for (const id of order) {
    if (values.has(id)) continue;
    const node = nodeById.get(id);
    const args = node.inputs.map((src) => values.get(src));
    values.set(id, evalGate(node.gate, args[0], args[1]));
  }

  const outputs = {};
  for (const [name, src] of Object.entries(circuit.outputs)) {
    outputs[name] = values.get(src);
  }

  const intermediates = {};
  for (const n of circuit.nodes) {
    intermediates[n.id] = values.get(n.id);
  }

  return { outputs, intermediates };
}

export function serializeCircuit(circuitDef) {
  const c = validateCircuit(circuitDef);
  return JSON.stringify({
    inputs: c.inputs,
    nodes: c.nodes.map((n) => ({ id: n.id, gate: n.gate, inputs: n.inputs.slice() })),
    outputs: { ...c.outputs },
  });
}

export function parseCircuit(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new ValidationError(`Invalid circuit JSON: ${e.message}`, { code: 'INVALID_CIRCUIT' });
  }
  return validateCircuit(data);
}

export function byteXorCircuit() {
  const inputs = [];
  const nodes = [];
  const outputs = {};
  for (let i = 0; i < 8; i++) {
    inputs.push(`A${i}`, `B${i}`);
    nodes.push({ id: `x${i}`, gate: 'XOR', inputs: [`A${i}`, `B${i}`] });
    outputs[`Y${i}`] = `x${i}`;
  }
  return { inputs, nodes, outputs };
}
