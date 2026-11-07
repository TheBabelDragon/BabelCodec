/**
 * Morse decoder.
 */

import { MORSE_TO_CHAR, PROFILE_ID } from './profiles.js';

export function decodeMorseDetailed(input, opts = {}) {
  const strict = opts.strict !== false;
  const diagnostics = [];
  if (typeof input !== 'string') {
    return {
      ok: false,
      text: '',
      diagnostics: [{ code: 'TYPE_ERROR', message: 'Expected string' }],
      profile: PROFILE_ID,
    };
  }
  if (input.trim().length === 0) {
    return { ok: true, text: '', diagnostics: [], profile: PROFILE_ID };
  }

  const normalized = input.trim().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ');
  const words = normalized.split(' / ');
  const outWords = [];

  for (const word of words) {
    if (word.trim().length === 0) {
      outWords.push('');
      continue;
    }
    const codes = word.trim().split(' ').filter((c) => c.length > 0);
    let letters = '';
    for (const code of codes) {
      const ch = MORSE_TO_CHAR[code];
      if (!ch) {
        const diag = {
          code: 'UNKNOWN_MORSE',
          message: `Unknown Morse sequence: "${code}"`,
          sequence: code,
        };
        diagnostics.push(diag);
        if (strict) {
          return { ok: false, text: '', diagnostics, profile: PROFILE_ID };
        }
        continue;
      }
      letters += ch;
    }
    outWords.push(letters);
  }

  return {
    ok: diagnostics.length === 0 || !strict,
    text: outWords.join(' '),
    diagnostics,
    profile: PROFILE_ID,
  };
}

export function decodeMorse(input) {
  const r = decodeMorseDetailed(input, { strict: true });
  if (!r.ok) {
    const d = r.diagnostics[0] || {};
    const err = new Error(d.message || 'Morse decode failed');
    err.code = d.code;
    throw err;
  }
  return r.text;
}
