/**
 * Educational CPU architecture adapter.
 */

import { CpuState } from '../../cpu/machine.js';
import { snapshotCpuMachine } from '../../cpu/adapter.js';
import { MachineCapability, formatWord } from './machine-contract.js';

export function createCpuArchitectureAdapter(machine) {
  if (!machine) throw new TypeError('machine required');
  const regIds = Array.from({ length: 16 }, (_, i) => `r${i}`);

  return {
    getMetadata() {
      return {
        architectureId: 'babelcodec.cpu32',
        name: 'Educational 32-bit CPU',
        version: '0.8.0',
        description: 'Harvard architecture · R0 hardwired zero · 16 GPRs',
        capabilities: [
          MachineCapability.CLOCK, MachineCapability.STEP_INSTRUCTION, MachineCapability.RUN_UNTIL_HALT,
          MachineCapability.PAUSE, MachineCapability.RESET, MachineCapability.LOAD_PROGRAM,
          MachineCapability.REGISTER_WRITE, MachineCapability.MEMORY_WRITE, MachineCapability.SNAPSHOT,
          MachineCapability.HISTORY, MachineCapability.BREAKPOINTS, MachineCapability.WATCHPOINTS,
        ],
        registers: [
          { id: 'pc', label: 'PC', widthBits: 32, access: 'rw', group: 'control' },
          { id: 'ir', label: 'IR', widthBits: 32, access: 'ro', group: 'control' },
          ...regIds.map((id, i) => ({
            id, label: `R${i}`, widthBits: 32, access: i === 0 ? 'ro' : 'rw', group: 'gpr',
          })),
        ],
        memories: [
          { id: 'program', label: 'Instruction memory', size: machine.program?.length ?? 4096, wordBits: 32, access: 'rw', executable: true },
          { id: 'data', label: 'Data RAM', size: machine.data?.length ?? 65536, wordBits: 8, access: 'rw', executable: false },
        ],
        buses: [
          { id: 'addr', label: 'Address bus', widthBits: 32, access: 'ro' },
          { id: 'data', label: 'Data bus', widthBits: 32, access: 'ro' },
        ],
        components: [
          { id: 'alu', label: 'ALU', kind: 'component', implKind: 'behavioral' },
          { id: 'controller', label: 'Controller', kind: 'controller', implKind: 'behavioral' },
        ],
        execution: { states: Object.values(CpuState), supportsStepRound: false, supportsStepInstruction: true },
      };
    },
    getState() {
      return {
        state: machine.state, cycle: machine.cycle, pc: machine.pc, halted: !!machine.halted,
        paused: !!machine.paused, error: machine.error, flags: { ...(machine.flags || {}) },
      };
    },
    clock() { return machine.clock(); },
    stepInstruction() { return machine.stepInstruction(); },
    runUntilHalt(max = 10000) { return machine.runUntilHalt(max); },
    pause() { machine.paused = true; },
    resume() { machine.resume(); },
    reset() { machine.reset(); },
    loadProgram(words) { machine.loadProgram(words); },
    listRegisters() {
      const out = [
        { id: 'pc', label: 'PC', value: BigInt(machine.pc >>> 0), hex: formatWord(machine.pc), access: 'rw' },
        { id: 'ir', label: 'IR', value: BigInt(machine.ir >>> 0), hex: formatWord(machine.ir), access: 'ro' },
      ];
      for (let i = 0; i < 16; i++) {
        const v = machine.regs[i] >>> 0;
        out.push({ id: `r${i}`, label: `R${i}`, value: BigInt(v), hex: formatWord(v), access: i === 0 ? 'ro' : 'rw' });
      }
      return out;
    },
    readRegister(id) {
      if (id === 'pc') return { id, value: BigInt(machine.pc >>> 0), hex: formatWord(machine.pc), access: 'rw' };
      if (id === 'ir') return { id, value: BigInt(machine.ir >>> 0), hex: formatWord(machine.ir), access: 'ro' };
      const m = /^r(\d+)$/.exec(id);
      if (!m) throw new RangeError(`Unknown register: ${id}`);
      const i = Number(m[1]);
      const value = BigInt(machine.regs[i] >>> 0);
      return { id, value, hex: formatWord(value), access: i === 0 ? 'ro' : 'rw' };
    },
    canWriteRegister(id) {
      if (id === 'pc') return true;
      if (id === 'ir') return false;
      const m = /^r(\d+)$/.exec(id);
      if (!m) return false;
      const i = Number(m[1]);
      return i >= 1 && i <= 15;
    },
    writeRegister(id, value) {
      if (!this.canWriteRegister(id)) {
        return { ok: false, code: 'PROTECTED', message: `Register ${id} is not writable` };
      }
      const v = Number(BigInt(value) & 0xffffffffn) >>> 0;
      if (id === 'pc') {
        const prev = BigInt(machine.pc >>> 0);
        machine.pc = v;
        return { ok: true, previous: prev, value: BigInt(machine.pc >>> 0) };
      }
      const i = Number(/^r(\d+)$/.exec(id)[1]);
      const prev = BigInt(machine.regs[i] >>> 0);
      machine.regs[i] = v;
      return { ok: true, previous: prev, value: BigInt(machine.regs[i] >>> 0) };
    },
    listMemories() {
      return this.getMetadata().memories.map((m) => {
        if (m.id === 'program') {
          const words = [];
          for (let i = 0; i < Math.min(64, machine.program.length); i++) words.push(formatWord(machine.program[i]));
          return { ...m, words, truncated: machine.program.length > 64 };
        }
        const words = [];
        for (let i = 0; i < Math.min(64, machine.data.length); i++) words.push(formatWord(machine.data[i], 8));
        return { ...m, words, truncated: machine.data.length > 64 };
      });
    },
    readMemory(id, index) {
      if (id === 'program') {
        const value = BigInt(machine.program[index] >>> 0);
        return { id, index, value, hex: formatWord(value), access: 'rw' };
      }
      if (id === 'data') {
        const value = BigInt(machine.data[index]);
        return { id, index, value, hex: formatWord(value, 8), access: 'rw' };
      }
      throw new RangeError(`Unknown memory: ${id}`);
    },
    canWriteMemory(id) { return id === 'program' || id === 'data'; },
    writeMemory(id, index, value) {
      if (!this.canWriteMemory(id)) {
        return { ok: false, code: 'PROTECTED', message: `Memory ${id} is not writable` };
      }
      if (id === 'program') {
        const prev = BigInt(machine.program[index] >>> 0);
        machine.program[index] = Number(BigInt(value) & 0xffffffffn) >>> 0;
        return { ok: true, previous: prev, value: BigInt(machine.program[index] >>> 0) };
      }
      const prev = BigInt(machine.data[index]);
      machine.data[index] = Number(BigInt(value) & 0xffn);
      return { ok: true, previous: prev, value: BigInt(machine.data[index]) };
    },
    listBuses() {
      return [
        { id: 'addr', value: BigInt(machine.busAddr >>> 0), hex: formatWord(machine.busAddr), access: 'ro' },
        { id: 'data', value: BigInt(machine.busData >>> 0), hex: formatWord(machine.busData), access: 'ro' },
      ];
    },
    readBus(id) {
      if (id === 'addr') return { id, value: BigInt(machine.busAddr >>> 0), hex: formatWord(machine.busAddr), access: 'ro' };
      if (id === 'data') return { id, value: BigInt(machine.busData >>> 0), hex: formatWord(machine.busData), access: 'ro' };
      throw new RangeError(`Unknown bus: ${id}`);
    },
    listComponents() { return this.getMetadata().components; },
    inspectComponent(id) {
      if (id === 'alu') return { id, lastAlu: machine.lastAlu || null };
      return snapshotCpuMachine(machine);
    },
    snapshot() { return snapshotCpuMachine(machine); },
    captureBlob() {
      return {
        kind: 'cpu', state: machine.state, cycle: machine.cycle, pc: machine.pc, ir: machine.ir,
        regs: Array.from(machine.regs), flags: { ...machine.flags }, halted: machine.halted,
        program: Array.from(machine.program), data: Array.from(machine.data),
      };
    },
    restore(blob) {
      if (!blob || blob.kind !== 'cpu') throw new TypeError('Invalid CPU blob');
      machine.state = blob.state; machine.cycle = blob.cycle; machine.pc = blob.pc; machine.ir = blob.ir;
      machine.halted = blob.halted; machine.flags = { ...blob.flags };
      for (let i = 0; i < 16; i++) machine.regs[i] = blob.regs[i] >>> 0;
      if (blob.program) for (let i = 0; i < blob.program.length; i++) machine.program[i] = blob.program[i] >>> 0;
      if (blob.data) for (let i = 0; i < blob.data.length; i++) machine.data[i] = blob.data[i] & 0xff;
    },
    getRawMachine() { return machine; },
  };
}
