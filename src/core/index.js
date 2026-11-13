/**
 * BabelCodec core engine public surface.
 * Independent of DOM / UI.
 */

export { ConversionError, ValidationError, MalformedInputError } from './errors.js';
export {
  toUint8Array,
  cloneBytes,
  bytesEqual,
  byteToBinary,
  byteToHex,
  byteToOctal,
  isPrintableAscii,
  controlCharName,
  displayByte,
} from './utils.js';

export { encodeBinary, decodeBinary, binaryCodec } from './binary.js';
export { encodeHex, decodeHex, hexCodec } from './hex.js';
export { encodeBase64, decodeBase64, base64Codec } from './base64.js';
export { encodeAscii, decodeAscii, isAscii, asciiCodec } from './ascii.js';
export { encodeUtf8, decodeUtf8, analyzeUtf8, utf8Codec } from './utf8.js';
export { encodeDecimal, decodeDecimal, decimalCodec } from './decimal.js';
export { encodeOctal, decodeOctal, octalCodec } from './octal.js';
export { encodeMorse, decodeMorse, morseCodec } from './morse.js';

export {
  listCodecs,
  getCodec,
  listCodecInfo,
  convert,
  validate,
  codecs,
} from './registry.js';

export { inspectBytes, formatInspectionTable } from './inspector.js';

export {
  interpretBytes,
  validateLayout,
  decodeLayout,
  TYPE_SIZES,
} from './structure.js';

export {
  searchBytes,
  patternToBytes,
  findNext,
  findPrevious,
} from './search.js';

export {
  buildHexGrid,
  offsetToCell,
  parseOffset,
  normalizeSelection,
  selectionFromClick,
  formatOffset,
  sliceSelection,
} from './hexgrid.js';

export {
  resolveExportBytes,
  encodeExportText,
  exportFilename,
  writeClipboardText,
} from './inspector-export.js';

export {
  createBufferHistory,
  editByte,
  insertBytes,
  deleteRange,
  replaceRange,
  selectAll,
  clearSelection,
  selectRangeByStartLength,
  revalidateSelection,
  parseByteValue,
} from './buffer-history.js';

export { byteDiff, exportDiffJson } from './byte-diff.js';

// Logic engine (re-exported for convenience; prefer babelcodec/logic subpath)
export {
  and,
  or,
  xor,
  not,
  nand,
  nor,
  xnor,
  applyMask,
  testBit,
  setBit,
  clearBit,
  toggleBit,
  leftShift,
  rightShift,
  andBytes,
  orBytes,
  xorBytes,
  notBytes,
  applyMaskBytes,
  diffBytes,
  evaluateCircuit,
  generateTruthTable,
  GATES,
  GATE_NAMES,
} from '../logic/index.js';
