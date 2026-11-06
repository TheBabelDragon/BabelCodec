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
