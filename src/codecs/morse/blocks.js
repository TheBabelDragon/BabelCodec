/**
 * Morse block representation — babelcodec.morse-block.v1
 */

import { encodeMorseDetailed } from './encoder.js';
import { MORSE_TO_CHAR, PROFILE_ID, DEFAULT_TIMING } from './profiles.js';

export const MORSE_BLOCK_SCHEMA = 'babelcodec.morse-block.v1';

export function patternToSymbols(pattern) {
  const symbols = [];
  for (const ch of pattern) {
    if (ch === '.') symbols.push({ kind: 'dot', units: DEFAULT_TIMING.dot });
    else if (ch === '-') symbols.push({ kind: 'dash', units: DEFAULT_TIMING.dash });
  }
  return symbols;
}

export function textToMorseBlock(text, opts = {}) {
  const enc = encodeMorseDetailed(text, opts);
  if (!enc.ok && opts.strict !== false) {
    return {
      schema: MORSE_BLOCK_SCHEMA,
      profile: PROFILE_ID,
      source: { text: typeof text === 'string' ? text : '' },
      letters: [],
      symbols: [],
      timing: { ...DEFAULT_TIMING },
      diagnostics: enc.diagnostics,
      ok: false,
    };
  }

  const letters = [];
  const allSymbols = [];
  const words = enc.morse ? enc.morse.split(' / ') : [];
  for (let wi = 0; wi < words.length; wi++) {
    if (wi > 0) {
      allSymbols.push({ kind: 'word_gap', units: DEFAULT_TIMING.word_gap });
    }
    const codes = words[wi].split(' ').filter(Boolean);
    for (let li = 0; li < codes.length; li++) {
      if (li > 0) {
        allSymbols.push({ kind: 'letter_gap', units: DEFAULT_TIMING.letter_gap });
      }
      const pattern = codes[li];
      const syms = patternToSymbols(pattern);
      for (let si = 0; si < syms.length; si++) {
        if (si > 0) {
          allSymbols.push({ kind: 'intra_symbol_gap', units: DEFAULT_TIMING.intra_symbol_gap });
        }
        allSymbols.push(syms[si]);
      }
      letters.push({
        pattern,
        char: MORSE_TO_CHAR[pattern] || null,
        symbols: syms,
      });
    }
  }

  return {
    schema: MORSE_BLOCK_SCHEMA,
    profile: PROFILE_ID,
    source: { text: typeof text === 'string' ? text : '' },
    letters,
    symbols: allSymbols,
    timing: { ...DEFAULT_TIMING },
    diagnostics: enc.diagnostics,
    ok: enc.ok,
  };
}

export function blockToMorseString(block) {
  if (!block?.letters) return '';
  return block.letters.map((l) => l.pattern).join(' ');
}

export function blockDuration(block) {
  if (!block?.symbols) return 0;
  return block.symbols.reduce((sum, s) => sum + (s.units || 0), 0);
}

export function blockTimeline(block) {
  let t = 0;
  return (block.symbols || []).map((s) => {
    const entry = {
      kind: s.kind,
      start: t,
      end: t + s.units,
      units: s.units,
      on: s.kind === 'dot' || s.kind === 'dash',
    };
    t += s.units;
    return entry;
  });
}

export function serializeMorseBlock(block) {
  return JSON.stringify(block);
}
