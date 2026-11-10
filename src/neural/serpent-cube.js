/**
 * serpent-cube.v1 — OPTIONAL experimental symbolic extension.
 *
 * Not a dependency of the core event contract.
 * Does not assert biological, neural, or linguistic meaning.
 *
 * Coordinate convention: 3×3×3 cube, indices 0..2 on each axis,
 * ordering is row-major over (z, y, x) as documented in mappings.
 */

export const SERPENT_CUBE_SCHEMA = 'serpent-cube.v1';

/** Dinucleotide → Hebrew letter (16 entries). Intentional reuse of labels is allowed. */
export const DINUKE_TO_HEBREW = Object.freeze({
  AA: 'א',
  AT: 'ב',
  AG: 'ג',
  AC: 'ד',
  TA: 'ה',
  TT: 'ו',
  TG: 'ז',
  TC: 'ח',
  GA: 'ט',
  GT: 'י',
  GG: 'כ',
  GC: 'ל',
  CA: 'מ',
  CT: 'נ',
  CG: 'ס',
  CC: 'ע',
});

/** Hebrew letter → standard absolute Gematria value. */
export const GEMATRIA = Object.freeze({
  א: 1,
  ב: 2,
  ג: 3,
  ד: 4,
  ה: 5,
  ו: 6,
  ז: 7,
  ח: 8,
  ט: 9,
  י: 10,
  כ: 20,
  ל: 30,
  מ: 40,
  נ: 50,
  ס: 60,
  ע: 70,
  פ: 80,
  צ: 90,
  ק: 100,
  ר: 200,
  ש: 300,
  ת: 400,
});

/** Hebrew → Latin transliteration (partial, experimental). */
export const TRANS = Object.freeze({
  א: 'A',
  ב: 'B',
  ג: 'G',
  ד: 'D',
  ה: 'H',
  ו: 'V',
  ז: 'Z',
  ח: 'Ch',
  ט: 'T',
  י: 'Y',
  כ: 'K',
  ל: 'L',
  מ: 'M',
  נ: 'N',
  ס: 'S',
  ע: 'A',
  פ: 'P',
  צ: 'Ts',
  ק: 'Q',
  ר: 'R',
  ש: 'Sh',
  ת: 'T',
});

/**
 * 27 cube cells: label + [x,y,z] in 0..2.
 * Ordering: z-major, then y, then x (document explicitly).
 */
export const SERPENT_CUBE = Object.freeze([
  { label: 'א', coord: [0, 0, 0] },
  { label: 'ב', coord: [1, 0, 0] },
  { label: 'ג', coord: [2, 0, 0] },
  { label: 'ד', coord: [0, 1, 0] },
  { label: 'ה', coord: [1, 1, 0] },
  { label: 'ו', coord: [2, 1, 0] },
  { label: 'ז', coord: [0, 2, 0] },
  { label: 'ח', coord: [1, 2, 0] },
  { label: 'ט', coord: [2, 2, 0] },
  { label: 'י', coord: [0, 0, 1] },
  { label: 'כ', coord: [1, 0, 1] },
  { label: 'ל', coord: [2, 0, 1] },
  { label: 'מ', coord: [0, 1, 1] },
  { label: 'נ', coord: [1, 1, 1] },
  { label: 'ס', coord: [2, 1, 1] },
  { label: 'ע', coord: [0, 2, 1] },
  { label: 'פ', coord: [1, 2, 1] },
  { label: 'צ', coord: [2, 2, 1] },
  { label: 'ק', coord: [0, 0, 2] },
  { label: 'ר', coord: [1, 0, 2] },
  { label: 'ש', coord: [2, 0, 2] },
  { label: 'ת', coord: [0, 1, 2] },
  { label: 'ך', coord: [1, 1, 2] },
  { label: 'ם', coord: [2, 1, 2] },
  { label: 'ן', coord: [0, 2, 2] },
  { label: 'ף', coord: [1, 2, 2] },
  { label: 'ץ', coord: [2, 2, 2] },
]);

/** Partial codon table — NOT a complete genetic code. */
export const CODON_TABLE = Object.freeze({
  ATG: 'M',
  TAA: '*',
  TAG: '*',
  TGA: '*',
  TTT: 'F',
  TTC: 'F',
  TTA: 'L',
  TTG: 'L',
  GAA: 'E',
  GAG: 'E',
  AAA: 'K',
  AAG: 'K',
  // intentionally partial
});

/**
 * Validate mapping tables; report collisions without treating reuse as hard error.
 */
export function validateSerpentCube() {
  const reports = [];
  const dinuks = Object.keys(DINUKE_TO_HEBREW);
  if (dinuks.length !== 16) reports.push({ level: 'error', code: 'DINUKE_COUNT', message: `expected 16 dinucleotides, got ${dinuks.length}` });
  const allDin = ['A', 'T', 'G', 'C'].flatMap((a) => ['A', 'T', 'G', 'C'].map((b) => a + b));
  for (const d of allDin) {
    if (!(d in DINUKE_TO_HEBREW)) reports.push({ level: 'error', code: 'MISSING_DINUKE', message: d });
  }

  // Cube coordinates
  if (SERPENT_CUBE.length !== 27) {
    reports.push({ level: 'error', code: 'CUBE_COUNT', message: `expected 27 cells, got ${SERPENT_CUBE.length}` });
  }
  const coordSet = new Set();
  const labelCounts = Object.create(null);
  for (const cell of SERPENT_CUBE) {
    const key = cell.coord.join(',');
    if (coordSet.has(key)) {
      reports.push({ level: 'error', code: 'DUP_COORD', message: key });
    }
    coordSet.add(key);
    labelCounts[cell.label] = (labelCounts[cell.label] || 0) + 1;
    for (const c of cell.coord) {
      if (c < 0 || c > 2) reports.push({ level: 'error', code: 'COORD_RANGE', message: String(cell.coord) });
    }
  }
  for (let z = 0; z < 3; z++)
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        if (!coordSet.has(`${x},${y},${z}`)) {
          reports.push({ level: 'error', code: 'MISSING_COORD', message: `${x},${y},${z}` });
        }
      }

  // Label reuse is informational
  for (const [lab, n] of Object.entries(labelCounts)) {
    if (n > 1) reports.push({ level: 'info', code: 'LABEL_REUSE', message: `${lab} appears ${n} times` });
  }

  // Gematria / transliteration coverage for dinuke targets
  for (const h of Object.values(DINUKE_TO_HEBREW)) {
    if (!(h in GEMATRIA)) reports.push({ level: 'warn', code: 'MISSING_GEMATRIA', message: h });
    if (!(h in TRANS)) reports.push({ level: 'warn', code: 'MISSING_TRANS', message: h });
  }

  // Gematria value collisions (informational)
  const byVal = Object.create(null);
  for (const [ch, val] of Object.entries(GEMATRIA)) {
    byVal[val] = byVal[val] || [];
    byVal[val].push(ch);
  }
  for (const [val, chars] of Object.entries(byVal)) {
    if (chars.length > 1) {
      reports.push({ level: 'info', code: 'GEMATRIA_COLLISION', message: `value ${val}: ${chars.join(',')}` });
    }
  }

  const errors = reports.filter((r) => r.level === 'error');
  return { ok: errors.length === 0, reports };
}

export function dinucleotideToHebrew(dinuke) {
  const k = String(dinuke || '').toUpperCase();
  if (!(k in DINUKE_TO_HEBREW)) return { ok: false, error: `unknown dinucleotide: ${k}` };
  return { ok: true, hebrew: DINUKE_TO_HEBREW[k] };
}

export function gematriaValue(hebrewChar) {
  if (!(hebrewChar in GEMATRIA)) return { ok: false, error: `no gematria for ${hebrewChar}` };
  return { ok: true, value: GEMATRIA[hebrewChar] };
}

/**
 * Encode DNA (ACGT) to Hebrew via overlapping dinucleotides starting at frame 0.
 * Not lossless / not bijective — report reversibility limitation.
 */
export function encodeDnaToHebrew(dna) {
  const s = String(dna || '').toUpperCase().replace(/[^ACGT]/g, '');
  const letters = [];
  const unknown = [];
  for (let i = 0; i + 1 < s.length; i += 2) {
    const d = s.slice(i, i + 2);
    if (d in DINUKE_TO_HEBREW) letters.push(DINUKE_TO_HEBREW[d]);
    else unknown.push(d);
  }
  const trailing = s.length % 2 === 1 ? s.slice(-1) : '';
  return {
    ok: unknown.length === 0,
    hebrew: letters.join(''),
    unknown,
    trailing_nucleotide: trailing || null,
    reversible: false,
    note: 'dinucleotide→Hebrew is not guaranteed invertible; original sequence must be preserved separately',
    original_length: s.length,
  };
}

/**
 * Validate optional neural weights attached to cube cells.
 * @param {number[]} weights length 27
 * @param {{ min?: number, max?: number }} [range]
 */
export function validateCubeWeights(weights, range) {
  const errors = [];
  if (!Array.isArray(weights) || weights.length !== 27) {
    return { ok: false, errors: ['weights must be length-27 array'] };
  }
  for (let i = 0; i < 27; i++) {
    if (typeof weights[i] !== 'number' || !Number.isFinite(weights[i])) {
      errors.push(`weights[${i}] non-finite`);
    } else if (range) {
      if (range.min != null && weights[i] < range.min) errors.push(`weights[${i}] < min`);
      if (range.max != null && weights[i] > range.max) errors.push(`weights[${i}] > max`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}
