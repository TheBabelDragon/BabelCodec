/**
 * Documented public JavaScript API for BabelCodec.
 */

import * as core from '../core/index.js';

export const version = '0.1.0';

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
} = core;

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
  ConversionError: core.ConversionError,
  ValidationError: core.ValidationError,
  MalformedInputError: core.MalformedInputError,
};

if (typeof window !== 'undefined') {
  window.BabelCodec = api;
}

export default api;
