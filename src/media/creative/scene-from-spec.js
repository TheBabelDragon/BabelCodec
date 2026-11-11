/**
 * Prompt-to-artifact: DesignSpec → editable scene graph.
 * Local procedural construction — labeled local_procedural, not model inference.
 */

import { createScene, addObject } from '../studio/index.js';

/**
 * Build an editable scene from a design specification.
 * @param {object} spec — from interpretCreativeIntent or refinements
 */
export function buildSceneFromSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw Object.assign(new Error('invalid design spec'), { code: 'SPEC_INVALID' });
  }
  const w = Math.max(16, Math.min(2048, spec.dimensions?.width || 512));
  const h = Math.max(16, Math.min(2048, spec.dimensions?.height || 512));
  const palette = Array.isArray(spec.palette) && spec.palette.length ? spec.palette : ['#0d1117', '#4a5568', '#c9a227'];
  const bg = spec.background || palette[0];
  const scene = createScene(w, h, bg);
  scene.provenance = {
    renderingStrategy: 'local_procedural',
    interpretationSource: spec.interpretationSource || 'local_heuristic',
    originalPrompt: spec.originalPrompt || '',
    style: spec.style,
  };

  const style = spec.style || 'geometric';
  const accent = palette[Math.min(2, palette.length - 1)];
  const mid = palette[Math.min(1, palette.length - 1)];
  const fg = palette[palette.length - 1];

  if (style === 'texture' || style === 'pattern') {
    const cell = Math.max(16, Math.min(64, (Math.min(w, h) / 8) | 0));
    for (let i = 0; i < Math.ceil(w / cell); i++) {
      for (let j = 0; j < Math.ceil(h / cell); j++) {
        const odd = (i + j) % 2;
        addObject(scene, {
          type: 'rect',
          x: i * cell,
          y: j * cell,
          w: cell,
          h: cell,
          fill: odd ? accent : mid,
          stroke: fg,
          strokeWidth: 1,
        });
      }
    }
  } else if (style === 'diagram') {
    const bw = Math.min(140, (w / 4) | 0);
    const bh = 80;
    const cy = (h - bh) / 2;
    const gap = (w - 3 * bw) / 4;
    for (let i = 0; i < 3; i++) {
      const x = gap + i * (bw + gap);
      addObject(scene, { type: 'rect', x, y: cy, w: bw, h: bh, fill: palette[1 + (i % (palette.length - 1))] || mid, stroke: fg, strokeWidth: 2 });
      addObject(scene, {
        type: 'text',
        x: x + 12,
        y: cy + 28,
        w: bw - 24,
        h: 24,
        fill: bg === '#f5f0eb' ? '#111' : fg,
        text: ['In', 'Process', 'Out'][i],
        fontSize: 16,
      });
      if (i < 2) {
        addObject(scene, {
          type: 'line',
          x: x + bw,
          y: cy + bh / 2,
          w: gap,
          h: 0,
          stroke: fg,
          fill: fg,
          strokeWidth: 2,
        });
      }
    }
  } else if (style === 'poster') {
    addObject(scene, { type: 'rect', x: 0, y: 0, w, h: Math.round(h * 0.28), fill: mid, stroke: accent, strokeWidth: 2 });
    addObject(scene, {
      type: 'text',
      x: 40,
      y: Math.round(h * 0.1),
      w: w - 80,
      h: 48,
      fill: fg,
      text: (spec.subject || 'POSTER').slice(0, 24).toUpperCase(),
      fontSize: Math.min(42, Math.round(w / 12)),
    });
    addObject(scene, {
      type: 'rect',
      x: 40,
      y: Math.round(h * 0.35),
      w: w - 80,
      h: Math.round(h * 0.5),
      fill: palette[1] || mid,
      stroke: accent,
      strokeWidth: 2,
    });
  } else if (style === 'game_asset' || style === 'icon' || style === 'emblem') {
    const s = Math.min(w, h) * 0.55;
    const ox = (w - s) / 2;
    const oy = (h - s) / 2 - h * 0.05;
    addObject(scene, { type: 'ellipse', x: ox, y: oy, w: s, h: s, fill: mid, stroke: accent, strokeWidth: 4 });
    addObject(scene, {
      type: 'rect',
      x: ox + s * 0.25,
      y: oy + s * 0.25,
      w: s * 0.5,
      h: s * 0.5,
      fill: accent,
      stroke: fg,
      strokeWidth: 2,
    });
    addObject(scene, {
      type: 'text',
      x: w * 0.2,
      y: h * 0.78,
      w: w * 0.6,
      h: 28,
      fill: fg,
      text: (spec.subject || 'ITEM').slice(0, 16),
      fontSize: 18,
    });
  } else if (style === 'product') {
    addObject(scene, {
      type: 'ellipse',
      x: w * 0.2,
      y: h * 0.2,
      w: w * 0.6,
      h: h * 0.6,
      fill: '#ffffff',
      stroke: mid,
      strokeWidth: 2,
    });
    addObject(scene, {
      type: 'rect',
      x: w * 0.35,
      y: h * 0.35,
      w: w * 0.3,
      h: h * 0.3,
      fill: mid,
      stroke: accent,
      strokeWidth: 2,
    });
    addObject(scene, {
      type: 'text',
      x: w * 0.25,
      y: h * 0.82,
      w: w * 0.5,
      h: 28,
      fill: '#111111',
      text: (spec.subject || 'Product').slice(0, 20),
      fontSize: 20,
    });
  } else {
    // logo / geometric / creature / mechanical / default
    const s = Math.min(w, h) * 0.4;
    const ox = (w - s) / 2;
    const oy = h * 0.18;
    addObject(scene, { type: 'ellipse', x: ox, y: oy, w: s, h: s, fill: mid, stroke: accent, strokeWidth: 3 });
    addObject(scene, {
      type: 'rect',
      x: ox + s * 0.22,
      y: oy + s * 0.22,
      w: s * 0.56,
      h: s * 0.56,
      fill: bg,
      stroke: accent,
      strokeWidth: 2,
    });
    if (spec.composition === 'centered' || style === 'logo' || style === 'emblem') {
      addObject(scene, {
        type: 'text',
        x: w * 0.15,
        y: h * 0.72,
        w: w * 0.7,
        h: 40,
        fill: fg,
        text: (spec.subject || 'BABEL').slice(0, 18).toUpperCase(),
        fontSize: Math.min(36, Math.round(w / 14)),
      });
    } else {
      addObject(scene, {
        type: 'text',
        x: 40,
        y: h * 0.72,
        w: w - 80,
        h: 36,
        fill: fg,
        text: (spec.subject || 'Composition').slice(0, 32),
        fontSize: 22,
      });
    }
  }

  // Explicit layers mirror for consumers that care
  scene.layers = [
    { id: 'background', kind: 'background', fill: bg },
    { id: 'objects', kind: 'content', count: scene.objects.length },
  ];
  scene.renderingStrategy = 'local_procedural';
  scene.operationLabel = 'local_procedural';
  return scene;
}

/**
 * Refine an existing spec with another natural-language instruction.
 * Creates a new spec object (does not mutate input).
 */
export function refineDesignSpec(spec, instruction) {
  const base = { ...spec, palette: [...(spec.palette || [])], dimensions: { ...(spec.dimensions || {}) } };
  const lower = String(instruction || '').toLowerCase();
  if (lower.includes('darker') || lower.includes('dark copper')) {
    base.palette = ['#0a0806', '#2a1810', '#8a5a30', '#d4a574'];
    base.background = base.palette[0];
  }
  if (lower.includes('copper')) {
    base.palette = ['#1a1210', '#3d2314', '#b87333', '#e8c39e'];
    base.background = base.palette[0];
  }
  if (lower.includes('neon')) {
    base.palette = ['#0a0a12', '#1a1a2e', '#00ffc8', '#ff2d95'];
    base.background = base.palette[0];
  }
  if (lower.includes('angular') || lower.includes('geometric')) {
    base.geometry = 'orthogonal';
    base.style = base.style === 'creature' ? 'emblem' : base.style;
  }
  if (lower.includes('center')) base.composition = 'centered';
  if (lower.includes('square') || lower.includes('icon')) {
    const s = Math.min(base.dimensions.width || 512, base.dimensions.height || 512, 256);
    base.dimensions = { width: s, height: s };
    base.intendedUse = 'game_icon';
    base.style = base.style === 'poster' ? 'icon' : base.style;
  }
  if (lower.includes('texture') || lower.includes('pattern')) {
    base.style = 'texture';
  }
  if (lower.includes('reduce') && lower.includes('detail')) {
    base.constraints = [...(base.constraints || []), 'reduced_detail'];
  }
  base.originalPrompt = `${spec.originalPrompt || ''} | refine: ${instruction}`;
  base.interpretationSource = 'local_heuristic';
  base.refinedFrom = spec.originalPrompt || null;
  return base;
}
