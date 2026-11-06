/**
 * Documented public JavaScript API for BabelCodec.
 */

import * as core from '../core/index.js';
import * as logic from '../logic/index.js';

export const version = '0.3.0';

export const {
  ConversionError,
  ValidationError,
  MalformedInputError,
  toUint8Array,
  cloneBytes,
  bytesEqual,
  encodeBinary,
  decodeBinary,
  encodeHex,
  decodeHex,
  encodeBase64,
  decodeBase64,
  encodeAscii,
  decodeAscii,
  isAscii,
  encodeUtf8,
  decodeUtf8,
  analyzeUtf8,
  encodeDecimal,
  decodeDecimal,
  encodeOctal,
  decodeOctal,
  encodeMorse,
  decodeMorse,
  listCodecs,
  getCodec,
  listCodecInfo,
  convert,
  validate,
  inspectBytes,
  formatInspectionTable,
  interpretBytes,
  validateLayout,
  decodeLayout,
  TYPE_SIZES,
  searchBytes,
  patternToBytes,
  findNext,
  findPrevious,
  buildHexGrid,
  offsetToCell,
  parseOffset,
  selectionFromClick,
  formatOffset,
  sliceSelection,
} = core;

export const {
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
  toBinaryString,
  asSigned,
  toUnsigned,
  widthMask,
  validateCircuit,
  serializeCircuit,
  parseCircuit,
  byteXorCircuit,
} = logic;

export function bytesToHex(bytes, opts) {
  return core.encodeHex(bytes, opts);
}

export function hexToBytes(hex) {
  return core.decodeHex(hex);
}

export function bytesToBase64(bytes) {
  return core.encodeBase64(bytes);
}

export function base64ToBytes(b64) {
  return core.decodeBase64(b64);
}

export function roundTrip(bytes, format) {
  const { output: encoded } = core.convert(bytes, 'bytes', format);
  const { output: decoded } = core.convert(encoded, format, 'bytes');
  return core.bytesEqual(bytes, decoded);
}

const api = {
  version,
  convert: core.convert,
  validate: core.validate,
  listCodecs: core.listCodecs,
  listCodecInfo: core.listCodecInfo,
  getCodec: core.getCodec,
  inspectBytes: core.inspectBytes,
  formatInspectionTable: core.formatInspectionTable,
  interpretBytes: core.interpretBytes,
  validateLayout: core.validateLayout,
  decodeLayout: core.decodeLayout,
  searchBytes: core.searchBytes,
  patternToBytes: core.patternToBytes,
  findNext: core.findNext,
  findPrevious: core.findPrevious,
  buildHexGrid: core.buildHexGrid,
  parseOffset: core.parseOffset,
  selectionFromClick: core.selectionFromClick,
  sliceSelection: core.sliceSelection,
  encodeBinary: core.encodeBinary,
  decodeBinary: core.decodeBinary,
  encodeHex: core.encodeHex,
  decodeHex: core.decodeHex,
  encodeBase64: core.encodeBase64,
  decodeBase64: core.decodeBase64,
  encodeAscii: core.encodeAscii,
  decodeAscii: core.decodeAscii,
  encodeUtf8: core.encodeUtf8,
  decodeUtf8: core.decodeUtf8,
  encodeDecimal: core.encodeDecimal,
  decodeDecimal: core.decodeDecimal,
  encodeOctal: core.encodeOctal,
  decodeOctal: core.decodeOctal,
  encodeMorse: core.encodeMorse,
  decodeMorse: core.decodeMorse,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  roundTrip,
  bytesEqual: core.bytesEqual,
  toUint8Array: core.toUint8Array,
  cloneBytes: core.cloneBytes,
  TYPE_SIZES: core.TYPE_SIZES,
  ConversionError: core.ConversionError,
  ValidationError: core.ValidationError,
  MalformedInputError: core.MalformedInputError,
  and: logic.and,
  or: logic.or,
  xor: logic.xor,
  not: logic.not,
  nand: logic.nand,
  nor: logic.nor,
  xnor: logic.xnor,
  applyMask: logic.applyMask,
  testBit: logic.testBit,
  setBit: logic.setBit,
  clearBit: logic.clearBit,
  toggleBit: logic.toggleBit,
  leftShift: logic.leftShift,
  rightShift: logic.rightShift,
  andBytes: logic.andBytes,
  orBytes: logic.orBytes,
  xorBytes: logic.xorBytes,
  notBytes: logic.notBytes,
  applyMaskBytes: logic.applyMaskBytes,
  diffBytes: logic.diffBytes,
  evaluateCircuit: logic.evaluateCircuit,
  generateTruthTable: logic.generateTruthTable,
  GATES: logic.GATES,
  GATE_NAMES: logic.GATE_NAMES,
  toBinaryString: logic.toBinaryString,
  asSigned: logic.asSigned,
  toUnsigned: logic.toUnsigned,
  widthMask: logic.widthMask,
  validateCircuit: logic.validateCircuit,
  serializeCircuit: logic.serializeCircuit,
  parseCircuit: logic.parseCircuit,
};

if (typeof window !== 'undefined') {
  window.BabelCodec = api;
}

export default api;
