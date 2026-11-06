/**
 * BabelCodec gate-level SHA-256 computer.
 * Package subpath: babelcodec/computer
 */

export { AND, OR, XOR, NOT, NAND, NOR, XNOR, MUX } from './gates.js';
export { fullAdder, fullAdderTruthTable } from './full-adder.js';
export { add32Ripple, add32RippleMany, bitOf, bitsToWord } from './adders.js';
export { Register32, RegisterBank } from './registers.js';
export { Bus32 } from './bus.js';
export { WordMemory } from './memory.js';
export { MachineState } from './controller.js';
export {
  dpCh, dpMaj, dpBigSigma0, dpBigSigma1, dpSmallSigma0, dpSmallSigma1,
  dpAdd, datapathRound,
} from './datapath.js';
export {
  Sha256Machine,
  createSha256Machine,
  loadMessage,
  clock,
  stepRound,
  runUntilComplete,
  getMachineState,
  getRegisterSnapshot,
  getSignalSnapshot,
  getMachineTrace,
  resetMachine,
} from './sha256-machine.js';

// Inspection layer (architecture-neutral)
export {
  EXTENSION_POINTS,
  defineComponent,
  sha256ComponentCatalog,
  freezeSnapshot,
  serializeSnapshot,
  deserializeSnapshot,
  cloneSnapshot,
  formatWordEntry,
  ImplKind,
  OPERATION_FIDELITY,
  inspectAdd32,
  inspectAdd32Many,
  fullAdderTable,
  wordToBin32,
  wordToHex32,
  makeTraceEvent,
  TraceBuffer,
  captureMachineBlob,
  restoreMachineBlob,
  ExecutionHistory,
  snapshotSha256Machine,
  inspectComponent,
} from './inspection/index.js';
