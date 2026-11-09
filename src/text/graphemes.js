/**
 * Grapheme segmentation — canonical path is the Rust Unicode Core (UAX #29).
 * No silent code-point fallback presented as full grapheme segmentation.
 */

import {
  initializeUnicodeCore,
  segmentGraphemes as rustSegmentGraphemes,
  isUnicodeCoreReady,
} from './unicode-core-loader.js';

export async function segmentGraphemes(text) {
  if (typeof text !== 'string') {
    return {
      graphemes: [],
      method: 'error',
      diagnostic: 'non-string input',
    };
  }
  await initializeUnicodeCore();
  const raw = await rustSegmentGraphemes(text);
  const graphemes = (raw || []).map((g) => ({
    text: g.text,
    start: g.start,
    end: g.end,
    codePoints: g.code_points || g.codePoints || [],
  }));
  return {
    graphemes,
    method: 'unicode-segmentation (UAX #29 via Rust WASM)',
    diagnostic: null,
  };
}

export function segmentGraphemesSync(text) {
  if (!isUnicodeCoreReady()) {
    throw new Error(
      'Unicode Core not initialized. Await initializeUnicodeCore() before sync grapheme calls.'
    );
  }
  throw new Error(
    'segmentGraphemesSync is not supported after the Rust migration. Use await segmentGraphemes(text).'
  );
}
