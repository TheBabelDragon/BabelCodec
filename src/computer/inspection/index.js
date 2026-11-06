/**
 * Architecture-neutral hardware inspection layer.
 * Package surface for snapshots, signals, trace, history, and adapters.
 */

export {
  EXTENSION_POINTS,
  defineComponent,
  sha256ComponentCatalog,
} from './metadata.js';

export {
  freezeSnapshot,
  serializeSnapshot,
  deserializeSnapshot,
  cloneSnapshot,
  formatWordEntry,
} from './snapshot.js';

export {
  ImplKind,
  OPERATION_FIDELITY,
  inspectAdd32,
  inspectAdd32Many,
  fullAdderTable,
  wordToBin32,
  wordToHex32,
  bitOf,
  bitsToWord,
  fullAdder,
} from './signals.js';

export {
  makeTraceEvent,
  TraceBuffer,
} from './trace.js';

export {
  captureMachineBlob,
  restoreMachineBlob,
  ExecutionHistory,
} from './history.js';

export {
  snapshotSha256Machine,
  inspectComponent,
} from './adapter-sha256.js';
