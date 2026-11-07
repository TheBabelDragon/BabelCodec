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
  ExecutionScheduler,
  EXPERIMENT_SCHEMA,
  createExperiment,
  parseExperiment,
  compareSnapshots,
} from './inspection/index.js';

export {
  MachineCapability,
  validateMachineAdapter,
  formatWord,
  parseWord,
  createSha256ArchitectureAdapter,
  createCpuArchitectureAdapter,
} from './architecture/index.js';

export {
  InteractionController,
  makeMutationEvent,
  serializeMutation,
} from './interaction/index.js';

export { BranchingHistory } from './history/index.js';

export {
  EXPERIMENTS,
  listExperiments,
  getExperiment,
} from './experiments/index.js';
