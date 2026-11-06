/**
 * BabelCodec logic engine — public surface.
 * Boolean gates, width-aware integer bitwise ops, masks/shifts,
 * byte-buffer ops, and circuit evaluation.
 */

export {
  GATES,
  GATE_NAMES,
  evalGate,
  generateTruthTable,
  AND,
  OR,
  XOR,
  NOT,
  NAND,
  NOR,
  XNOR,
} from './gates.js';

export {
  widthMask,
  validateWidth,
  toBigInt,
  toUnsigned,
  toBinaryString,
  asSigned,
  and,
  or,
  xor,
  not,
  nand,
  nor,
  xnor,
} from './bitwise.js';

export {
  validateBit,
  applyMask,
  testBit,
  setBit,
  clearBit,
  toggleBit,
} from './masks.js';

export {
  validateShiftAmount,
  leftShift,
  rightShift,
} from './shifts.js';

export {
  andBytes,
  orBytes,
  xorBytes,
  notBytes,
  applyMaskBytes,
  diffBytes,
} from './buffers.js';

export {
  validateCircuit,
  evaluateCircuit,
  serializeCircuit,
  parseCircuit,
  byteXorCircuit,
} from './circuits.js';
