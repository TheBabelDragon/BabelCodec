/**
 * CPU snapshot adapter for architecture-neutral inspection.
 */

import { defineComponent } from '../computer/inspection/metadata.js';
import { freezeSnapshot, formatWordEntry } from '../computer/inspection/snapshot.js';
import { decode } from './opcodes.js';

export function cpuComponentCatalog() {
  const regs = Array.from({ length: 16 }, (_, i) =>
    defineComponent({
      id: `reg.R${i}`,
      kind: 'register',
      label: `R${i}`,
      width: 32,
      region: 'gpr',
      implements: ['register-file'],
      description: i === 0 ? 'Hardwired zero' : `General register R${i}`,
    }),
  );
  return [
    ...regs,
    defineComponent({ id: 'reg.PC', kind: 'register', label: 'PC', width: 32, implements: ['program-counter'] }),
    defineComponent({ id: 'reg.IR', kind: 'register', label: 'IR', width: 32, implements: ['instruction-register'] }),
    defineComponent({ id: 'alu', kind: 'alu', label: 'ALU', implements: ['alu'] }),
    defineComponent({ id: 'ctrl', kind: 'controller', label: 'Control unit', implements: ['control-unit'] }),
    defineComponent({ id: 'mem.program', kind: 'memory', label: 'Program memory', implements: ['rom'] }),
    defineComponent({ id: 'mem.data', kind: 'memory', label: 'Data RAM', implements: ['ram'] }),
  ];
}

export function snapshotCpuMachine(machine) {
  const registers = machine.regs.map((v, i) =>
    formatWordEntry(v, `reg.R${i}`, `R${i}`));
  registers.push(formatWordEntry(machine.pc, 'reg.PC', 'PC'));
  registers.push(formatWordEntry(machine.ir, 'reg.IR', 'IR'));

  const progEntries = [];
  for (let i = 0; i < 32; i++) {
    progEntries.push({
      index: i,
      hex: (machine.program[i] >>> 0).toString(16).padStart(8, '0'),
      decoded: decode(machine.program[i]).name,
    });
  }

  const dataEntries = [];
  for (let i = 0; i < 16; i++) {
    const addr = i * 4;
    try {
      const w = machine.loadWord(addr);
      dataEntries.push({ index: addr, hex: (w >>> 0).toString(16).padStart(8, '0') });
    } catch {
      dataEntries.push({ index: addr, hex: '--------' });
    }
  }

  const snap = {
    architecture: 'babelcodec-cpu32',
    machineId: 'cpu32',
    cycle: machine.cycle,
    controllerState: machine.state,
    paused: machine.paused,
    error: machine.error,
    status: {
      pc: machine.pc,
      ir: machine.ir,
      flags: { ...machine.flags },
      halted: machine.halted,
    },
    registers,
    memories: [
      {
        id: 'mem.program',
        label: 'Program memory',
        depth: 4096,
        width: 32,
        entries: progEntries,
        lastAccess: machine.pc,
      },
      {
        id: 'mem.data',
        label: 'Data RAM (first 16 words)',
        depth: 16384,
        width: 32,
        entries: dataEntries,
        lastAccess: machine.busAddr,
      },
    ],
    buses: [
      {
        id: 'bus.addr',
        label: 'ADDR',
        hex: (machine.busAddr >>> 0).toString(16).padStart(8, '0'),
        width: 32,
      },
      {
        id: 'bus.data',
        label: 'DATA',
        hex: (machine.busData >>> 0).toString(16).padStart(8, '0'),
        width: 32,
      },
    ],
    datapath: machine.lastAlu,
    signals: {
      irDecoded: decode(machine.ir),
      flags: { ...machine.flags },
    },
    arithmetic: machine.lastAlu,
    digestHex: null,
    sequence: machine.cycle,
    catalog: cpuComponentCatalog(),
  };
  return freezeSnapshot(snap);
}
