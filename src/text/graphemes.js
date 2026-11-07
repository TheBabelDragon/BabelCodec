/**
 * Grapheme segmentation via Intl.Segmenter when available.
 */

export function segmentGraphemes(text) {
  if (typeof text !== 'string') {
    return { graphemes: [], method: 'code-point-fallback', diagnostic: 'non-string input' };
  }
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const graphemes = [];
      for (const { segment, index } of seg.segment(text)) {
        graphemes.push({
          text: segment,
          start: index,
          end: index + segment.length,
        });
      }
      return { graphemes, method: 'Intl.Segmenter', diagnostic: null };
    } catch (e) {
      // fall through
    }
  }
  const graphemes = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    const len = cp > 0xffff ? 2 : 1;
    graphemes.push({ text: text.slice(i, i + len), start: i, end: i + len });
    i += len;
  }
  return {
    graphemes,
    method: 'code-point-fallback',
    diagnostic: 'Intl.Segmenter unavailable; code-point fallback used (not full UAX #29)',
  };
}
