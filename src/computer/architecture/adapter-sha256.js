/**
 * SHA-256 computer adapter — real machine, no parallel mock state.
 */

import { MachineState } from '../controller.js';
import { snapshotSha256Machine, inspectComponent } from '../inspection/adapter-sha256.js';
import {
  captureMachineBlob,
  restoreMachineBlob,
} from '../inspection/history.js';
import { MachineCapability, formatWord } from './machine-contract.js';

const SHA256_REGS = [
  { id: 'A', label: 'A', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'B', label: 'B', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'C', label: 'C', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'D', label: 'D', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'E', label: 'E', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'F', label: 'F', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'G', label: 'G', widthBits: 32, access: 'rw', group: 'working' },
  { id: 'H', label: 'H', widthBits: 32, access: 'rw', group: 'working' },
];

const SHA256_MEMORIES = [
  { id: 'W', label: 'Message schedule W[0..63]', size: 64, wordBits: 32, access: 'rw', executable: false, constant: false },
  { id: 'K', label: 'Round constants K[0..63]', size: 64, wordBits: 32, access: 'ro', executable: false, constant: true, description: 'FIPS 180-4 constants — not writable' },
  { id: 'H', label: 'Hash state H[0..7]', size: 8, wordBits: 32, access: 'rw', executable: false, constant: false },
];

const SHA256_BUSES = [
  { id: 'T1', label: 'T1', widthBits: 32, access: 'ro', sources: ['datapath'], destinations: ['bank'] },
  { id: 'T2', label: 'T2', widthBits: 32, access: 'ro', sources: ['datapath'], destinations: ['bank'] },
  { id: 'W', label: 'W bus', widthBits: 32, access: 'ro', sources: ['schedule'], destinations: ['datapath'] },
  { id: 'K', label: 'K bus', widthBits: 32, access: 'ro', sources: ['constants'], destinations: ['datapath'] },
];

export function createSha256ArchitectureAdapter(machine) {
  if (!machine) throw new TypeError('machine required');

  return {
    getMetadata() {
      return {
        architectureId: 'babelcodec.sha256-computer',
        name: 'SHA-256 Gate-Level Computer',
        version: '0.8.0',
        description: 'Clocked FIPS 180-4 machine with ripple-carry datapath',
        capabilities: [
          MachineCapability.CLOCK, MachineCapability.STEP_ROUND, MachineCapability.RUN_UNTIL_COMPLETE,
          MachineCapability.PAUSE, MachineCapability.RESET, MachineCapability.LOAD_MESSAGE,
          MachineCapability.REGISTER_WRITE, MachineCapability.MEMORY_WRITE, MachineCapability.BUS_INSPECT,
          MachineCapability.SNAPSHOT, MachineCapability.HISTORY, MachineCapability.BREAKPOINTS, MachineCapability.WATCHPOINTS,
        ],
        registers: SHA256_REGS,
        memories: SHA256_MEMORIES,
        buses: SHA256_BUSES,
        components: [
          { id: 'datapath', label: 'Round datapath', kind: 'component', implKind: 'gate' },
          { id: 'controller', label: 'Controller', kind: 'controller', implKind: 'behavioral' },
          { id: 'adder', label: '32-bit ripple adder', kind: 'component', implKind: 'gate' },
        ],
        execution: { states: Object.values(MachineState), supportsStepRound: true, supportsStepInstruction: false },
      };
    },
    getState() {
      return {
        state: machine.state, cycle: machine.cycle, blockIndex: machine.blockIndex, round: machine.round,
        totalBlocks: machine.totalBlocks, messageLength: machine.messageLength, paused: !!machine.paused,
        error: machine.error, halted: machine.state === MachineState.DONE || machine.state === MachineState.ERROR,
      };
    },
    clock() { return machine.clock(); },
    stepRound() { return machine.stepRound(); },
    runUntilComplete() { return machine.runUntilComplete(); },
    pause() { machine.paused = true; },
    resume() { machine.paused = false; },
    reset() { machine.reset(); },
    loadMessage(msg) { machine.loadMessage(msg); },
    listRegisters() {
      return SHA256_REGS.map((r) => ({
        ...r, value: machine.bank.regs[r.id].value, hex: formatWord(machine.bank.regs[r.id].value),
      }));
    },
    readRegister(id) {
      const desc = SHA256_REGS.find((r) => r.id === id);
      if (!desc) throw new RangeError(`Unknown register: ${id}`);
      const value = machine.bank.regs[id].value;
      return { id, value, hex: formatWord(value), access: desc.access };
    },
    canWriteRegister(id) {
      const desc = SHA256_REGS.find((r) => r.id === id);
      return !!(desc && desc.access === 'rw');
    },
    writeRegister(id, value) {
      if (!this.canWriteRegister(id)) {
        return { ok: false, code: 'PROTECTED', message: `Register ${id} is not writable` };
      }
      const prev = machine.bank.regs[id].value;
      machine.bank.regs[id].load(value);
      return { ok: true, previous: prev, value: machine.bank.regs[id].value };
    },
    listMemories() {
      return SHA256_MEMORIES.map((m) => {
        const mem = m.id === 'W' ? machine.schedule : m.id === 'K' ? machine.constants : machine.hashState;
        return { ...m, words: mem.words.map((w) => formatWord(w)) };
      });
    },
    readMemory(id, index) {
      const desc = SHA256_MEMORIES.find((m) => m.id === id);
      if (!desc) throw new RangeError(`Unknown memory: ${id}`);
      const mem = id === 'W' ? machine.schedule : id === 'K' ? machine.constants : machine.hashState;
      const value = mem.read(index);
      return { id, index, value, hex: formatWord(value), access: desc.access };
    },
    canWriteMemory(id) {
      const desc = SHA256_MEMORIES.find((m) => m.id === id);
      return !!(desc && desc.access === 'rw' && !desc.constant);
    },
    writeMemory(id, index, value) {
      if (!this.canWriteMemory(id)) {
        return { ok: false, code: 'PROTECTED', message: `Memory ${id} is not writable` };
      }
      const mem = id === 'W' ? machine.schedule : machine.hashState;
      const prev = mem.read(index);
      mem.write(index, value);
      return { ok: true, previous: prev, value: mem.read(index) };
    },
    listBuses() {
      const map = { T1: machine.busT1, T2: machine.busT2, W: machine.busW, K: machine.busK };
      return SHA256_BUSES.map((b) => ({
        ...b, value: map[b.id]?.value ?? 0n, hex: formatWord(map[b.id]?.value ?? 0n),
      }));
    },
    readBus(id) {
      const desc = SHA256_BUSES.find((b) => b.id === id);
      if (!desc) throw new RangeError(`Unknown bus: ${id}`);
      const map = { T1: machine.busT1, T2: machine.busT2, W: machine.busW, K: machine.busK };
      const value = map[id]?.value ?? 0n;
      return { id, value, hex: formatWord(value), access: desc.access };
    },
    listComponents() { return this.getMetadata().components; },
    inspectComponent(id) { return inspectComponent(machine, id); },
    snapshot() { return snapshotSha256Machine(machine); },
    captureBlob() { return captureMachineBlob(machine); },
    restore(blob) { restoreMachineBlob(machine, blob); },
    getDigestHex() { return typeof machine.getDigestHex === 'function' ? machine.getDigestHex() : null; },
    getRawMachine() { return machine; },
  };
}
