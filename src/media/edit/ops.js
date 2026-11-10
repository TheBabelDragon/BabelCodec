/**
 * Local-first image edit operations on ImageData / canvas.
 * Deterministic pure transforms where practical. No network.
 */

/**
 * @param {ImageData} imageData
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {ImageData}
 */
export function cropImageData(imageData, rect) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.min(imageData.width - x, Math.floor(rect.w)));
  const h = Math.max(1, Math.min(imageData.height - y, Math.floor(rect.h)));
  const out = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * imageData.width + x) * 4;
    const dst = row * w * 4;
    out.data.set(imageData.data.subarray(src, src + w * 4), dst);
  }
  return out;
}

/**
 * Nearest-neighbor resize (deterministic, no deps).
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 */
export function resizeImageData(imageData, width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(imageData.height - 1, Math.floor((y / h) * imageData.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(imageData.width - 1, Math.floor((x / w) * imageData.width));
      const si = (sy * imageData.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = imageData.data[si];
      out.data[di + 1] = imageData.data[si + 1];
      out.data[di + 2] = imageData.data[si + 2];
      out.data[di + 3] = imageData.data[si + 3];
    }
  }
  return out;
}

export function flipImageData(imageData, axis) {
  const { width: w, height: h, data } = imageData;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = axis === 'x' ? w - 1 - x : x;
      const sy = axis === 'y' ? h - 1 - y : y;
      const si = (sy * w + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = data[si];
      out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2];
      out.data[di + 3] = data[si + 3];
    }
  }
  return out;
}

/** Rotate 90° clockwise k times (0–3). */
export function rotateImageData90(imageData, turns = 1) {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }
  let cur = imageData;
  for (let i = 0; i < t; i++) {
    const w = cur.width;
    const h = cur.height;
    const out = new ImageData(h, w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const nx = h - 1 - y;
        const ny = x;
        const di = (ny * h + nx) * 4;
        out.data[di] = cur.data[si];
        out.data[di + 1] = cur.data[si + 1];
        out.data[di + 2] = cur.data[si + 2];
        out.data[di + 3] = cur.data[si + 3];
      }
    }
    cur = out;
  }
  return cur;
}

/**
 * @param {ImageData} imageData
 * @param {{brightness?:number,contrast?:number,saturation?:number,grayscale?:boolean,threshold?:number|null}} adj
 * brightness/contrast/saturation: multipliers around 1.0
 */
export function adjustImageData(imageData, adj = {}) {
  const brightness = adj.brightness ?? 1;
  const contrast = adj.contrast ?? 1;
  const saturation = adj.saturation ?? 1;
  const grayscale = Boolean(adj.grayscale);
  const threshold = adj.threshold != null ? Number(adj.threshold) : null;
  const out = new ImageData(imageData.width, imageData.height);
  const d = imageData.data;
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    const a = d[i + 3];
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;
    r *= brightness;
    g *= brightness;
    b *= brightness;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    if (grayscale || threshold != null) {
      r = g = b = gray;
    } else if (saturation !== 1) {
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }
    if (threshold != null) {
      const v = gray >= threshold ? 255 : 0;
      r = g = b = v;
    }
    o[i] = clamp(r);
    o[i + 1] = clamp(g);
    o[i + 2] = clamp(b);
    o[i + 3] = a;
  }
  return out;
}

function clamp(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** Simple 3x3 box blur. */
export function blurImageData(imageData, radius = 1) {
  const r = Math.max(1, Math.min(4, radius | 0));
  const { width: w, height: h, data } = imageData;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let as = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          rs += data[i];
          gs += data[i + 1];
          bs += data[i + 2];
          as += data[i + 3];
          n += 1;
        }
      }
      const di = (y * w + x) * 4;
      out.data[di] = (rs / n) | 0;
      out.data[di + 1] = (gs / n) | 0;
      out.data[di + 2] = (bs / n) | 0;
      out.data[di + 3] = (as / n) | 0;
    }
  }
  return out;
}

/** Undo/redo stack of ImageData snapshots (clones). */
export function createEditHistory(limit = 32) {
  /** @type {ImageData[]} */
  const stack = [];
  let index = -1;

  function push(imageData) {
    const snap = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
    stack.splice(index + 1);
    stack.push(snap);
    if (stack.length > limit) stack.shift();
    index = stack.length - 1;
    return snap;
  }

  function canUndo() {
    return index > 0;
  }
  function canRedo() {
    return index >= 0 && index < stack.length - 1;
  }
  function undo() {
    if (!canUndo()) return null;
    index -= 1;
    const s = stack[index];
    return new ImageData(new Uint8ClampedArray(s.data), s.width, s.height);
  }
  function redo() {
    if (!canRedo()) return null;
    index += 1;
    const s = stack[index];
    return new ImageData(new Uint8ClampedArray(s.data), s.width, s.height);
  }
  function current() {
    if (index < 0) return null;
    const s = stack[index];
    return new ImageData(new Uint8ClampedArray(s.data), s.width, s.height);
  }

  return { push, undo, redo, canUndo, canRedo, current, get length() { return stack.length; } };
}
