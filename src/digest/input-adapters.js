import { serializeCanonicalToBytes, serializeMorseBlockToBytes } from './serialization.js';
import { sha256Hex } from '../sha256/index.js';

export function digestCanonical(canonical, opts = {}) {
  const { bytes, profile, text } = serializeCanonicalToBytes(canonical, opts);
  return {
    hex: sha256Hex(bytes),
    profile,
    byteLength: bytes.length,
    text,
  };
}

export function digestMorseBlock(block) {
  const { bytes, profile, text } = serializeMorseBlockToBytes(block);
  return {
    hex: sha256Hex(bytes),
    profile,
    byteLength: bytes.length,
    text,
  };
}
