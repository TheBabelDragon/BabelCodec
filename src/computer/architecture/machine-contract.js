/**
 * Architecture-neutral machine contract for BabelCodec 0.8.0.
 */

export const MachineCapability = Object.freeze({
  CLOCK: 'clock',
  STEP_ROUND: 'step-round',
  STEP_INSTRUCTION: 'step-instruction',
  RUN_UNTIL_COMPLETE: 'run-until-complete',
  RUN_UNTIL_HALT: 'run-until-halt',
  PAUSE: 'pause',
  RESET: 'reset',
  LOAD_MESSAGE: 'load-message',
  LOAD_PROGRAM: 'load-program',
  REGISTER_WRITE: 'register-write',
  MEMORY_WRITE: 'memory-write',
  BUS_INSPECT: 'bus-inspect',
  SNAPSHOT: 'snapshot',
  HISTORY: 'history',
  BREAKPOINTS: 'breakpoints',
  WATCHPOINTS: 'watchpoints',
});

export function validateMachineAdapter(adapter) {
  const required = [
    'getMetadata', 'getState', 'clock', 'reset',
    'listRegisters', 'readRegister', 'listMemories', 'readMemory',
    'listBuses', 'readBus', 'listComponents', 'inspectComponent',
    'snapshot', 'restore', 'canWriteRegister', 'canWriteMemory',
  ];
  const missing = required.filter((k) => typeof adapter[k] !== 'function');
  return { ok: missing.length === 0, missing };
}

export function formatWord(v, widthBits = 32) {
  const bits = BigInt(widthBits);
  const mask = (1n << bits) - 1n;
  const n = BigInt(v) & mask;
  const hexDigits = Math.ceil(widthBits / 4);
  return `0x${n.toString(16).toUpperCase().padStart(hexDigits, '0')}`;
}

export function parseWord(input, widthBits = 32) {
  const mask = (1n << BigInt(widthBits)) - 1n;
  if (typeof input === 'bigint') return input & mask;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new RangeError('Invalid number');
    return BigInt(Math.trunc(input)) & mask;
  }
  const s = String(input).trim().replace(/_/g, '');
  if (!s) throw new RangeError('Empty value');
  let n;
  if (/^0x[0-9a-fA-F]+$/.test(s)) n = BigInt(s);
  else if (/^0b[01]+$/.test(s)) n = BigInt(s);
  else if (/^[0-9]+$/.test(s)) n = BigInt(s);
  else if (/^[0-9a-fA-F]+$/.test(s) && /[a-fA-F]/.test(s)) n = BigInt('0x' + s);
  else throw new RangeError(`Cannot parse word: ${s}`);
  return n & mask;
}
