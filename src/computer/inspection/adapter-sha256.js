/**
 * SHA-256 machine adapter implementing the architecture-neutral inspection contract.
 */

import { formatWordEntry, freezeSnapshot } from './snapshot.js';
import { sha256ComponentCatalog } from './metadata.js';
import { OPERATION_FIDELITY, wordToHex32 } from './signals.js';

export function snapshotSha256Machine(machine, opts = {}) {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const working = machine.bank.snapshot();
  const registers = names.map((n, i) =>
    formatWordEntry(working[i], `reg.working.${n}`, n));

  const hashEntries = machine.hashState.words.map((w, i) => ({
    index: i,
    hex: wordToHex32(w),
    bin: (BigInt(w) & 0xffffffffn).toString(2).padStart(32, '0'),
  }));

  const wEntries = machine.schedule.words.map((w, i) => ({
    index: i,
    hex: wordToHex32(w),
  }));

  const kEntries = machine.constants.words.map((w, i) => ({
    index: i,
    hex: wordToHex32(w),
  }));

  const lastRound = machine.lastSignals?.round ?? null;

  const memories = [
    {
      id: 'mem.hash',
      label: 'Hash state H',
      depth: 8,
      width: 32,
      entries: hashEntries,
      lastAccess: machine.state === 'ACCUMULATE_STATE' ? 0 : null,
    },
    {
      id: 'mem.W',
      label: 'W schedule',
      depth: 64,
      width: 32,
      entries: wEntries,
      lastAccess: lastRound,
    },
    {
      id: 'mem.K',
      label: 'K constants',
      depth: 64,
      width: 32,
      entries: kEntries,
      lastAccess: lastRound,
    },
  ];

  const buses = [
    formatBus('bus.T1', 'T1', machine.busT1.value),
    formatBus('bus.T2', 'T2', machine.busT2.value),
    formatBus('bus.W', 'W', machine.busW.value),
    formatBus('bus.K', 'K', machine.busK.value),
  ];

  let datapath = null;
  let arithmetic = null;
  if (machine.lastSignals) {
    const s = machine.lastSignals;
    datapath = {
      round: s.round,
      W: wordToHex32(s.W),
      K: wordToHex32(s.K),
      T1: wordToHex32(s.T1),
      T2: wordToHex32(s.T2),
      operations: [
        { ...OPERATION_FIDELITY.bigSigma1, role: 'Σ1(E)' },
        { ...OPERATION_FIDELITY.ch, role: 'Ch(E,F,G)' },
        { ...OPERATION_FIDELITY.add32, role: 'T1 = H+Σ1+Ch+K+W' },
        { ...OPERATION_FIDELITY.bigSigma0, role: 'Σ0(A)' },
        { ...OPERATION_FIDELITY.maj, role: 'Maj(A,B,C)' },
        { ...OPERATION_FIDELITY.add32, role: 'T2 = Σ0+Maj' },
        { ...OPERATION_FIDELITY.add32, role: "A' = T1+T2" },
        { ...OPERATION_FIDELITY.add32, role: "E' = D+T1" },
      ],
    };
    arithmetic = {
      T1: BigInt(s.T1 ?? 0).toString(16),
      T2: BigInt(s.T2 ?? 0).toString(16),
      note: 'T1/T2 recorded post-round. Use inspectAdd32 for bit stages.',
      fidelityCatalog: OPERATION_FIDELITY,
    };
  }

  const snap = {
    architecture: 'sha256-gate-machine',
    machineId: 'sha256',
    cycle: machine.cycle,
    controllerState: machine.state,
    paused: machine.paused,
    error: machine.error,
    status: {
      blockIndex: machine.blockIndex,
      totalBlocks: machine.totalBlocks,
      round: machine.round,
      messageLength: machine.messageLength,
    },
    registers,
    memories,
    buses,
    datapath,
    signals: machine.lastSignals
      ? JSON.parse(JSON.stringify(machine.lastSignals, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v))
      : null,
    arithmetic,
    digestHex: machine.state === 'COMPLETE' ? machine.getDigestHex() : null,
    sequence: opts.sequence ?? machine.cycle,
    catalog: sha256ComponentCatalog().map((c) => ({ ...c })),
  };

  return freezeSnapshot(snap);
}

function formatBus(id, label, value) {
  const w = BigInt(value ?? 0) & 0xffffffffn;
  return {
    id,
    label,
    hex: w.toString(16).padStart(8, '0'),
    bin: w.toString(2).padStart(32, '0'),
    width: 32,
  };
}

export function inspectComponent(snap, componentId) {
  if (!snap || !componentId) return null;
  if (componentId.startsWith('reg.working.')) {
    const reg = snap.registers.find((r) => r.id === componentId);
    return reg ? { kind: 'register', ...reg } : null;
  }
  if (componentId.startsWith('bus.')) {
    const bus = snap.buses.find((b) => b.id === componentId);
    return bus ? { kind: 'bus', ...bus } : null;
  }
  if (componentId === 'mem.W' || componentId === 'mem.K' || componentId === 'mem.hash') {
    const mem = snap.memories.find((m) => m.id === componentId);
    return mem ? { kind: 'memory', ...mem } : null;
  }
  if (componentId.startsWith('mem.hash.')) {
    const idx = Number(componentId.split('.').pop());
    const mem = snap.memories.find((m) => m.id === 'mem.hash');
    const entry = mem?.entries?.[idx];
    return entry ? { kind: 'memory-word', id: componentId, ...entry, region: 'hash' } : null;
  }
  if (componentId === 'ctrl') {
    return {
      kind: 'controller',
      id: 'ctrl',
      state: snap.controllerState,
      cycle: snap.cycle,
      status: snap.status,
    };
  }
  if (componentId === 'datapath.round') {
    return { kind: 'datapath', id: componentId, ...(snap.datapath || {}) };
  }
  if (componentId === 'adder.ripple32') {
    return {
      kind: 'adder',
      id: componentId,
      fidelity: OPERATION_FIDELITY.add32,
      arithmetic: snap.arithmetic,
    };
  }
  return null;
}
