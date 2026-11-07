/**
 * BabelCodec HEIF / HEIC media module.
 * Structural inspection always available; pixel decode via optional backend.
 */

export {
  decodeHEIF,
  inspectHEIFSync,
  setHeifDecoderBackend,
  getHeifDecoderBackend,
  DEFAULT_MAX_BYTES,
} from './decoder.js';

export {
  classifyHeif,
  hasFtypSignature,
  extensionSuggestsHeif,
  inspectContainer,
  HEVC_BRANDS,
  HEIF_BRANDS,
  AVIF_BRANDS,
} from './detect.js';

export {
  walkBoxes,
  parseBoxHeader,
  parseFtyp,
  flattenBoxTree,
  readUint32BE,
  readFourCC,
  HEIF_BOX_TYPES,
} from './boxes.js';

export {
  rgbaToBlob,
  canEncode,
  exportFilename,
  convertDecodedImage,
} from './convert.js';
