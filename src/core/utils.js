/**
 * Shared byte / text utilities for BabelCodec.
 */

/**
 * @param {Uint8Array|ArrayBuffer|number[]|string} input
 * @returns {Uint8Array}
 */
export function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return new Uint8Array(input);
  if (typeof input === 'string') {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = input.charCodeAt(i) & 0xff;
    }
    return out;
  }
  throw new TypeError('Expected Uint8Array, ArrayBuffer, number[], or string');
}

export function cloneBytes(bytes) {
  return new Uint8Array(bytes);
}

export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function byteToBinary(byte) {
  return (byte & 0xff).toString(2).padStart(8, '0');
}

export function byteToHex(byte) {
  return (byte & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

export function byteToOctal(byte) {
  return (byte & 0xff).toString(8).padStart(3, '0');
}

export function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

export function controlCharName(byte) {
  const names = {
    0: 'NUL', 1: 'SOH', 2: 'STX', 3: 'ETX', 4: 'EOT', 5: 'ENQ', 6: 'ACK', 7: 'BEL',
    8: 'BS', 9: 'HT', 10: 'LF', 11: 'VT', 12: 'FF', 13: 'CR', 14: 'SO', 15: 'SI',
    16: 'DLE', 17: 'DC1', 18: 'DC2', 19: 'DC3', 20: 'DC4', 21: 'NAK', 22: 'SYN', 23: 'ETB',
    24: 'CAN', 25: 'EM', 26: 'SUB', 27: 'ESC', 28: 'FS', 29: 'GS', 30: 'RS', 31: 'US',
    127: 'DEL',
  };
  return names[byte] ?? null;
}

export function displayByte(byte) {
  if (isPrintableAscii(byte)) return String.fromCharCode(byte);
  const name = controlCharName(byte);
  if (name) return `\\${name}`;
  return `\\x${byteToHex(byte)}`;
}

export function stripWhitespace(s) {
  return s.replace(/[\s]/g, '');
}
