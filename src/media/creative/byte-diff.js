/**
 * Lightweight byte comparison for source vs transformed assets.
 * Does not invent byte-range mappings for pixel edits.
 */

/**
 * @param {Uint8Array|null} a
 * @param {Uint8Array|null} b
 */
export function compareBytes(a, b) {
  const aa = a || new Uint8Array(0);
  const bb = b || new Uint8Array(0);
  const len = Math.min(aa.length, bb.length);
  let firstDiff = -1;
  let diffCount = 0;
  for (let i = 0; i < len; i++) {
    if (aa[i] !== bb[i]) {
      if (firstDiff < 0) firstDiff = i;
      diffCount++;
    }
  }
  diffCount += Math.abs(aa.length - bb.length);
  return {
    lengthA: aa.length,
    lengthB: bb.length,
    identical: aa.length === bb.length && diffCount === 0,
    firstDiffOffset: firstDiff,
    approximateDiffBytes: diffCount,
    note:
      aa.length === bb.length && diffCount === 0
        ? 'Byte streams are identical.'
        : 'Differences reflect encoded output vs source; pixel edits are re-encoded and do not map 1:1 to source offsets.',
  };
}
