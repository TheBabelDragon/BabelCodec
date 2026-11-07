/**
 * Morse encoder — code-point safe, never transliterates unsupported scripts.
 */

import { CHAR_TO_MORSE, PROFILE_ID } from './profiles.js';
import { iterateCodePoints, codePointToUPlus } from '../../text/unicode.js';

export function encodeMorseDetailed(text, opts = {}) {
  const strict = opts.strict !== false;
  const diagnostics = [];
  if (typeof text !== 'string') {
    return {
      ok: false,
      morse: '',
      diagnostics: [{ code: 'TYPE_ERROR', message: 'Expected string' }],
      profile: PROFILE_ID,
    };
  }
  if (text.length === 0) {
    return { ok: true, morse: '', diagnostics: [], profile: PROFILE_ID };
  }

  const words = [];
  let current = [];

  for (const { text: ch, codePoint, utf16Start } of iterateCodePoints(text)) {
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (current.length) {
        words.push(current.join(' '));
        current = [];
      }
      continue;
    }
    const upper = ch.length === 1 ? ch.toUpperCase() : ch;
    const code = CHAR_TO_MORSE[upper];
    if (!code) {
      const diag = {
        code: 'UNSUPPORTED_CHAR',
        message: `Unsupported character for Morse: "${ch}" (${codePointToUPlus(codePoint)})`,
        offset: utf16Start,
        char: ch,
        codePoint: codePointToUPlus(codePoint),
      };
      diagnostics.push(diag);
      if (strict) {
        return { ok: false, morse: '', diagnostics, profile: PROFILE_ID };
      }
      continue;
    }
    current.push(code);
  }
  if (current.length) words.push(current.join(' '));

  return {
    ok: diagnostics.length === 0 || !strict,
    morse: words.join(' / '),
    diagnostics,
    profile: PROFILE_ID,
  };
}

export function encodeMorse(text) {
  const r = encodeMorseDetailed(text, { strict: true });
  if (!r.ok) {
    const d = r.diagnostics[0] || {};
    const err = new Error(d.message || 'Morse encode failed');
    err.code = d.code;
    err.offset = d.offset;
    err.details = d;
    throw err;
  }
  return r.morse;
}
