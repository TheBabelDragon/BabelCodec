/**
 * Documented public JavaScript API for BabelCodec.
 * Version 0.5.0 — encoding, inspection, logic, SHA-256, hardware observability.
 */

import * as core from '../core/index.js?v=0.5.0';
import * as logic from '../logic/index.js?v=0.5.0';
import * as sha256mod from '../sha256/index.js?v=0.5.0';
import * as computer from '../computer/index.js?v=0.5.0';

export const version = '0.5.0';

export const {
  ConversionError, ValidationError, MalformedInputError,
  toUint8Array, cloneBytes, bytesEqual,
  encodeBinary, decodeBinary, encodeHex, decodeHex,
  encodeBase64, decodeBase64, encodeAscii, decodeAscii, isAscii,
  encodeUtf8, decodeUtf8, analyzeUtf8,
  encodeDecimal, decodeDecimal, encodeOctal, decodeOctal,
  encodeMorse, decodeMorse,
  listCodecs, getCodec, listCodecInfo, convert, validate,
  inspectBytes, formatInspectionTable, interpretBytes,
  validateLayout, decodeLayout, TYPE_SIZES,
  searchBytes, patternToBytes, findNext, findPrevious,
  buildHexGrid, offsetToCell, parseOffset, selectionFromClick,
  formatOffset, sliceSelection,
} = core;

export const {
  and, or, xor, not, nand, nor, xnor,
  applyMask, testBit, setBit, clearBit, toggleBit,
  leftShift, rightShift,
  andBytes, orBytes, xorBytes, notBytes, applyMaskBytes, diffBytes,
  evaluateCircuit, generateTruthTable,
  GATES, GATE_NAMES, toBinaryString, asSigned, toUnsigned, widthMask,
  validateCircuit, serializeCircuit, parseCircuit, byteXorCircuit,
} = logic;

export const {
  sha256, sha256Bytes, sha256Hex,
  padMessage, blockCount, createMessageSchedule, compressBlock,
  serializeRound, serializeTrace, parseBlockWords, readWordBE, writeWordBE,
  add32, rotateRight32, shiftRight32, wordToHex,
  ch, maj, bigSigma0, bigSigma1, smallSigma0, smallSigma1,
  IV, K, MASK32, WORD_BITS, BLOCK_BYTES, DIGEST_BYTES,
} = sha256mod;

export const {
  AND, OR, XOR, NOT, NAND, NOR, XNOR, MUX,
  fullAdder, fullAdderTruthTable,
  add32Ripple, add32RippleMany, bitOf, bitsToWord,
  Register32, RegisterBank, Bus32, WordMemory, MachineState,
  dpCh, dpMaj, dpBigSigma0, dpBigSigma1, dpSmallSigma0, dpSmallSigma1,
  dpAdd, datapathRound,
  Sha256Machine, createSha256Machine, loadMessage, clock, stepRound,
  runUntilComplete, getMachineState, getRegisterSnapshot, getSignalSnapshot,
  getMachineTrace, resetMachine,
  EXTENSION_POINTS, defineComponent, sha256ComponentCatalog,
  freezeSnapshot, serializeSnapshot, deserializeSnapshot, cloneSnapshot,
  formatWordEntry, ImplKind, OPERATION_FIDELITY, inspectAdd32, inspectAdd32Many,
  fullAdderTable, wordToBin32, wordToHex32, makeTraceEvent, TraceBuffer,
  captureMachineBlob, restoreMachineBlob, ExecutionHistory,
  snapshotSha256Machine, inspectComponent,
} = computer;

export function bytesToHex(bytes, opts) { return core.encodeHex(bytes, opts); }
export function hexToBytes(hex) { return core.decodeHex(hex); }
export function bytesToBase64(bytes) { return core.encodeBase64(bytes); }
export function base64ToBytes(b64) { return core.decodeBase64(b64); }
export function roundTrip(bytes, format) {
  const { output: encoded } = core.convert(bytes, 'bytes', format);
  const { output: decoded } = core.convert(encoded, format, 'bytes');
  return core.bytesEqual(bytes, decoded);
}

const api = {
  version,
  convert: core.convert, validate: core.validate,
  listCodecs: core.listCodecs, listCodecInfo: core.listCodecInfo, getCodec: core.getCodec,
  inspectBytes: core.inspectBytes, formatInspectionTable: core.formatInspectionTable,
  interpretBytes: core.interpretBytes, validateLayout: core.validateLayout, decodeLayout: core.decodeLayout,
  searchBytes: core.searchBytes, patternToBytes: core.patternToBytes,
  findNext: core.findNext, findPrevious: core.findPrevious,
  buildHexGrid: core.buildHexGrid, parseOffset: core.parseOffset,
  selectionFromClick: core.selectionFromClick, sliceSelection: core.sliceSelection,
  encodeBinary: core.encodeBinary, decodeBinary: core.decodeBinary,
  encodeHex: core.encodeHex, decodeHex: core.decodeHex,
  encodeBase64: core.encodeBase64, decodeBase64: core.decodeBase64,
  encodeAscii: core.encodeAscii, decodeAscii: core.decodeAscii,
  encodeUtf8: core.encodeUtf8, decodeUtf8: core.decodeUtf8,
  encodeDecimal: core.encodeDecimal, decodeDecimal: core.decodeDecimal,
  encodeOctal: core.encodeOctal, decodeOctal: core.decodeOctal,
  encodeMorse: core.encodeMorse, decodeMorse: core.decodeMorse,
  bytesToHex, hexToBytes, bytesToBase64, base64ToBytes, roundTrip,
  bytesEqual: core.bytesEqual, toUint8Array: core.toUint8Array, cloneBytes: core.cloneBytes,
  TYPE_SIZES: core.TYPE_SIZES,
  ConversionError: core.ConversionError, ValidationError: core.ValidationError,
  MalformedInputError: core.MalformedInputError,
  and: logic.and, or: logic.or, xor: logic.xor, not: logic.not,
  nand: logic.nand, nor: logic.nor, xnor: logic.xnor,
  applyMask: logic.applyMask, testBit: logic.testBit, setBit: logic.setBit,
  clearBit: logic.clearBit, toggleBit: logic.toggleBit,
  leftShift: logic.leftShift, rightShift: logic.rightShift,
  andBytes: logic.andBytes, orBytes: logic.orBytes, xorBytes: logic.xorBytes,
  notBytes: logic.notBytes, applyMaskBytes: logic.applyMaskBytes, diffBytes: logic.diffBytes,
  evaluateCircuit: logic.evaluateCircuit, generateTruthTable: logic.generateTruthTable,
  GATES: logic.GATES, GATE_NAMES: logic.GATE_NAMES,
  toBinaryString: logic.toBinaryString, asSigned: logic.asSigned,
  toUnsigned: logic.toUnsigned, widthMask: logic.widthMask,
  validateCircuit: logic.validateCircuit, serializeCircuit: logic.serializeCircuit,
  parseCircuit: logic.parseCircuit,
  sha256: sha256mod.sha256, sha256Bytes: sha256mod.sha256Bytes, sha256Hex: sha256mod.sha256Hex,
  padMessage: sha256mod.padMessage, blockCount: sha256mod.blockCount,
  createMessageSchedule: sha256mod.createMessageSchedule, compressBlock: sha256mod.compressBlock,
  serializeRound: sha256mod.serializeRound, serializeTrace: sha256mod.serializeTrace,
  add32: sha256mod.add32, rotateRight32: sha256mod.rotateRight32,
  IV: sha256mod.IV, K: sha256mod.K,
  createSha256Machine: computer.createSha256Machine, Sha256Machine: computer.Sha256Machine,
  MachineState: computer.MachineState, fullAdder: computer.fullAdder, add32Ripple: computer.add32Ripple,
  Register32: computer.Register32, RegisterBank: computer.RegisterBank,
  Bus32: computer.Bus32, WordMemory: computer.WordMemory,
  clock: computer.clock, stepRound: computer.stepRound, runUntilComplete: computer.runUntilComplete,
  getMachineState: computer.getMachineState, getRegisterSnapshot: computer.getRegisterSnapshot,
  getSignalSnapshot: computer.getSignalSnapshot, getMachineTrace: computer.getMachineTrace,
  resetMachine: computer.resetMachine,
  snapshotSha256Machine: computer.snapshotSha256Machine,
  inspectComponent: computer.inspectComponent,
  inspectAdd32: computer.inspectAdd32,
  ExecutionHistory: computer.ExecutionHistory,
  OPERATION_FIDELITY: computer.OPERATION_FIDELITY,
};

if (typeof window !== 'undefined') {
  window.BabelCodec = api;
}

export default api;
