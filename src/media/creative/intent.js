/**
 * Local creative intent — heuristic prompt → structured design specification.
 * No network. Does not claim LLM generation when heuristics produce the plan.
 */

const PALETTE_MAP = {
  dark: ['#0d1117', '#1c2029', '#4a5568', '#c9a227'],
  copper: ['#1a1210', '#3d2314', '#b87333', '#e8c39e'],
  neon: ['#0a0a12', '#1a1a2e', '#00ffc8', '#ff2d95'],
  pastel: ['#f5f0eb', '#d4c4b0', '#a8c5d4', '#c9a0b0'],
  mono: ['#111111', '#333333', '#888888', '#eeeeee'],
  forest: ['#0b1a12', '#1e3d2f', '#3d6b4f', '#c4d4a8'],
  mechanical: ['#12151a', '#2a3038', '#6b7c8c', '#c0a060'],
};

const STYLE_HINTS = [
  ['pixel', 'pixel'],
  ['icon', 'icon'],
  ['emblem', 'emblem'],
  ['logo', 'logo'],
  ['poster', 'poster'],
  ['texture', 'texture'],
  ['pattern', 'pattern'],
  ['diagram', 'diagram'],
  ['game', 'game_asset'],
  ['product', 'product'],
  ['dragon', 'creature'],
  ['mechanical', 'mechanical'],
];

/**
 * Interpret a natural-language creative request into a design spec (local only).
 * @param {string} prompt
 * @param {{ width?: number, height?: number }} [opts]
 */
export function interpretCreativeIntent(prompt, opts = {}) {
  const text = String(prompt || '').trim();
  const lower = text.toLowerCase();
  let style = 'geometric';
  for (const [k, v] of STYLE_HINTS) {
    if (lower.includes(k)) {
      style = v;
      break;
    }
  }
  let paletteKey = 'dark';
  for (const k of Object.keys(PALETTE_MAP)) {
    if (lower.includes(k)) {
      paletteKey = k;
      break;
    }
  }
  if (lower.includes('copper')) paletteKey = 'copper';
  if (lower.includes('neon')) paletteKey = 'neon';

  const w = Math.max(16, Math.min(2048, opts.width || (lower.includes('icon') ? 256 : 512)));
  const h = Math.max(16, Math.min(2048, opts.height || (lower.includes('icon') ? 256 : 512)));

  const subject = text.slice(0, 120) || 'abstract composition';
  return {
    subject,
    composition: lower.includes('center') ? 'centered' : lower.includes('grid') ? 'grid' : 'balanced',
    palette: [...PALETTE_MAP[paletteKey]],
    geometry: style === 'pixel' ? 'orthogonal' : style === 'emblem' ? 'radial' : 'freeform',
    style,
    background: PALETTE_MAP[paletteKey][0],
    dimensions: { width: w, height: h },
    intendedUse: style === 'game_asset' || lower.includes('inventory') ? 'game_icon' : 'general',
    constraints: ['offline', 'no_remote_required'],
    interpretationSource: 'local_heuristic',
    originalPrompt: text,
  };
}

/** @param {object} spec */
export function summarizeDesignSpec(spec) {
  return [
    `Subject: ${spec.subject}`,
    `Style: ${spec.style} · Composition: ${spec.composition}`,
    `Palette: ${spec.palette.join(', ')}`,
    `Size: ${spec.dimensions.width}×${spec.dimensions.height}`,
    `Source: ${spec.interpretationSource} (not remote LLM)`,
  ].join('\n');
}
