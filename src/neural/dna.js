/**
 * DNA / codon utilities — partial translation table only.
 * Not a complete genetic code. Incomplete trailing codons are never discarded.
 */

import { CODON_TABLE } from './serpent-cube.js';

const STOP = new Set(['TAA', 'TAG', 'TGA']);

/**
 * @param {string} dna
 * @param {{ frame?: number }} [opts] frame 0..2
 */
export function translatePartial(dna, opts = {}) {
  const frame = opts.frame == null ? 0 : opts.frame;
  if (![0, 1, 2].includes(frame)) {
    return { ok: false, errors: ['frame must be 0, 1, or 2'] };
  }
  const raw = String(dna || '').toUpperCase();
  const cleaned = raw.replace(/[^ACGT]/g, '');
  const invalid = [...raw].filter((c) => c !== '\n' && c !== ' ' && !'ACGT'.includes(c.toUpperCase()));
  const seq = cleaned.slice(frame);
  const codons = [];
  const amino = [];
  const unknown = [];
  let i = 0;
  for (; i + 3 <= seq.length; i += 3) {
    const c = seq.slice(i, i + 3);
    codons.push(c);
    if (c in CODON_TABLE) {
      amino.push(CODON_TABLE[c]);
    } else {
      amino.push('?');
      unknown.push(c);
    }
  }
  const trailing = seq.slice(i);
  return {
    ok: true,
    frame,
    original: raw,
    sequence: cleaned,
    sequence_length: cleaned.length,
    codons,
    amino_acids: amino.join(''),
    unknown_codons: unknown,
    stop_codons: codons.filter((c) => STOP.has(c)),
    incomplete_trailing: trailing || null,
    incomplete_trailing_discarded: false,
    table_coverage: 'partial',
    note: 'CODON_TABLE is a partial mapping; unknown codons become ?; trailing bases preserved',
    invalid_nucleotides: invalid.length ? invalid : [],
  };
}
