/**
 * Offline graphics scene: shapes + text → Canvas / SVG export.
 * No network. Browser Canvas for PNG/JPEG/WebP; SVG string for vectors.
 */

export function createScene(width = 800, height = 600, background = '#1c2029') {
  return {
    width: clampInt(width, 1, 8192),
    height: clampInt(height, 1, 8192),
    background: background || 'transparent',
    objects: [],
  };
}

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n) || 0);
  return Math.max(lo, Math.min(hi, v));
}

function uid() {
  return 'o_' + Math.random().toString(36).slice(2, 10);
}

export function addObject(scene, partial) {
  const obj = {
    id: partial.id || uid(),
    type: partial.type,
    x: partial.x ?? 40,
    y: partial.y ?? 40,
    w: partial.w ?? 120,
    h: partial.h ?? 80,
    rotation: partial.rotation ?? 0,
    fill: partial.fill ?? '#4a7dff',
    stroke: partial.stroke ?? 'transparent',
    strokeWidth: partial.strokeWidth ?? 0,
    text: partial.text ?? '',
    fontSize: partial.fontSize ?? 24,
    fontFamily: partial.fontFamily ?? 'system-ui, sans-serif',
    opacity: partial.opacity ?? 1,
  };
  scene.objects.push(obj);
  return obj;
}

export function removeObject(scene, id) {
  scene.objects = scene.objects.filter((o) => o.id !== id);
}

export function updateObject(scene, id, patch) {
  const o = scene.objects.find((x) => x.id === id);
  if (!o) return null;
  Object.assign(o, patch);
  return o;
}

export function renderSceneToCanvas(scene, canvas) {
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.clearRect(0, 0, scene.width, scene.height);
  if (scene.background && scene.background !== 'transparent') {
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
  for (const o of scene.objects) {
    ctx.save();
    ctx.globalAlpha = o.opacity ?? 1;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    if (o.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((o.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    if (o.type === 'rect') {
      ctx.fillStyle = o.fill;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      if (o.strokeWidth > 0) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      }
    } else if (o.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
      ctx.fillStyle = o.fill;
      ctx.fill();
      if (o.strokeWidth > 0) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.stroke();
      }
    } else if (o.type === 'text') {
      ctx.fillStyle = o.fill;
      ctx.font = `${o.fontSize}px ${o.fontFamily}`;
      ctx.textBaseline = 'top';
      ctx.fillText(o.text || '', o.x, o.y);
    } else if (o.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.strokeStyle = o.stroke || o.fill;
      ctx.lineWidth = o.strokeWidth || 2;
      ctx.stroke();
    }
    ctx.restore();
  }
  return canvas;
}

export function sceneToSvg(scene) {
  const bg =
    scene.background && scene.background !== 'transparent'
      ? `<rect width="100%" height="100%" fill="${escAttr(scene.background)}"/>`
      : '';
  const parts = scene.objects.map((o) => {
    const op = o.opacity != null && o.opacity < 1 ? ` opacity="${o.opacity}"` : '';
    const transform =
      o.rotation
        ? ` transform="rotate(${o.rotation} ${o.x + o.w / 2} ${o.y + o.h / 2})"`
        : '';
    if (o.type === 'rect') {
      return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${escAttr(o.fill)}"${o.strokeWidth ? ` stroke="${escAttr(o.stroke)}" stroke-width="${o.strokeWidth}"` : ''}${op}${transform}/>`;
    }
    if (o.type === 'ellipse') {
      return `<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${Math.abs(o.w / 2)}" ry="${Math.abs(o.h / 2)}" fill="${escAttr(o.fill)}"${o.strokeWidth ? ` stroke="${escAttr(o.stroke)}" stroke-width="${o.strokeWidth}"` : ''}${op}${transform}/>`;
    }
    if (o.type === 'text') {
      return `<text x="${o.x}" y="${(o.y || 0) + (o.fontSize || 24)}" fill="${escAttr(o.fill)}" font-size="${o.fontSize}" font-family="${escAttr(o.fontFamily)}"${op}${transform}>${escXml(o.text || '')}</text>`;
    }
    if (o.type === 'line') {
      return `<line x1="${o.x}" y1="${o.y}" x2="${o.x + o.w}" y2="${o.y + o.h}" stroke="${escAttr(o.stroke || o.fill)}" stroke-width="${o.strokeWidth || 2}"${op}${transform}/>`;
    }
    return '';
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">\n${bg}\n${parts.join('\n')}\n</svg>\n`;
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const CANVAS_PRESETS = [
  { id: 'hd', label: '1280×720', w: 1280, h: 720 },
  { id: 'square', label: '1080×1080', w: 1080, h: 1080 },
  { id: 'story', label: '1080×1920', w: 1080, h: 1920 },
  { id: 'card', label: '1200×630', w: 1200, h: 630 },
  { id: 'sm', label: '800×600', w: 800, h: 600 },
  { id: 'icon', label: '512×512', w: 512, h: 512 },
];
