/**
 * BabelCodec educational CPU package surface.
 * Subpath: babelcodec/cpu
 */

export {
  OP, OP_NAME, OP_FMT,
  encodeR, encodeI, encodeJ, encodeN, decode, MASK32,
} from './opcodes.js';

export { CpuState, CpuMachine, createCpuMachine } from './machine.js';

export { assemble, EXAMPLES } from './assembler.js';

export { snapshotCpuMachine, cpuComponentCatalog } from './adapter.js';
