/**
 * Unicode scalar inspection — preserves source, iterates code points.
 */

export function codePointToUPlus(cp) {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function iterateCodePoints(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const len = cp > 0xffff ? 2 : 1;
    out.push({
      text: String.fromCodePoint(cp),
      codePoint: cp,
      utf16Start: i,
      utf16End: i + len,
    });
    i += len;
  }
  return out;
}

export function codePointsUPlus(text) {
  return iterateCodePoints(text).map((c) => codePointToUPlus(c.codePoint));
}

export const SCRIPT_RANGES = Object.freeze([
  { name: 'Latin', ranges: [[0x0041, 0x024f], [0x1e00, 0x1eff]] },
  { name: 'Hebrew', ranges: [[0x0590, 0x05ff], [0xfb1d, 0xfb4f]] },
  { name: 'Arabic', ranges: [[0x0600, 0x06ff], [0x0750, 0x077f], [0x08a0, 0x08ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff]] },
  { name: 'Ethiopic', ranges: [[0x1200, 0x137f], [0x1380, 0x139f], [0x2d80, 0x2ddf]] },
  { name: 'Hiragana', ranges: [[0x3040, 0x309f]] },
  { name: 'Katakana', ranges: [[0x30a0, 0x30ff]] },
  { name: 'Han', ranges: [[0x4e00, 0x9fff], [0x3400, 0x4dbf]] },
  { name: 'Tifinagh', ranges: [[0x2d30, 0x2d7f]] },
  { name: 'Braille', ranges: [[0x2800, 0x28ff]] },
  { name: 'Runic', ranges: [[0x16a0, 0x16ff]] },
  { name: 'Phoenician', ranges: [[0x10900, 0x1091f]] },
  { name: 'Common', ranges: [[0x0000, 0x007f], [0x2000, 0x206f]] },
]);

export function scriptOfCodePoint(cp) {
  for (const s of SCRIPT_RANGES) {
    for (const [lo, hi] of s.ranges) {
      if (cp >= lo && cp <= hi) return s.name;
    }
  }
  return 'Unknown';
}
