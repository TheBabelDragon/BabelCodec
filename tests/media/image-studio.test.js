import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageFormat,
  extensionSuggestsImage,
  inspectPngHeader,
  inspectImageBytes,
} from '../../src/media/image/index.js';
import {
  createScene,
  addObject,
  sceneToSvg,
  CANVAS_PRESETS,
  createBatchQueue,
  processQueue,
} from '../../src/media/studio/index.js';

function png1x1() {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

function jpegTiny() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

describe('detectImageFormat', () => {
  it('detects PNG', () => {
    const r = detectImageFormat(png1x1());
    assert.equal(r.format, 'png');
  });
  it('detects JPEG', () => {
    assert.equal(detectImageFormat(jpegTiny()).format, 'jpeg');
  });
  it('detects GIF', () => {
    const g = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0]);
    assert.equal(detectImageFormat(g).format, 'gif');
  });
  it('detects BMP', () => {
    assert.equal(detectImageFormat(new Uint8Array([0x42, 0x4d, 0, 0, 0, 0])).format, 'bmp');
  });
  it('detects WebP', () => {
    const w = new Uint8Array(12);
    w[0] = 0x52; w[1] = 0x49; w[2] = 0x46; w[3] = 0x46;
    w[8] = 0x57; w[9] = 0x45; w[10] = 0x42; w[11] = 0x50;
    assert.equal(detectImageFormat(w).format, 'webp');
  });
  it('detects HEIF ftyp', () => {
    const h = new Uint8Array(20);
    h[3] = 20;
    h[4] = 0x66; h[5] = 0x74; h[6] = 0x79; h[7] = 0x70;
    assert.equal(detectImageFormat(h).format, 'heif');
  });
  it('unknown for junk', () => {
    assert.equal(detectImageFormat(new Uint8Array([1, 2, 3, 4])).format, 'unknown');
  });
  it('extensionSuggestsImage', () => {
    assert.equal(extensionSuggestsImage('a.PNG'), true);
    assert.equal(extensionSuggestsImage('a.txt'), false);
  });
});

describe('inspect headers', () => {
  it('PNG IHDR dimensions', () => {
    const p = inspectPngHeader(png1x1());
    assert.equal(p.width, 1);
    assert.equal(p.height, 1);
  });
  it('inspectImageBytes reports sha256 and format', async () => {
    const info = await inspectImageBytes(png1x1());
    assert.equal(info.format, 'png');
    assert.equal(info.sha256.length, 64);
  });
});

describe('create scene', () => {
  it('builds SVG with shapes', () => {
    const scene = createScene(200, 100, '#000');
    addObject(scene, { type: 'rect', x: 10, y: 10, w: 50, h: 40, fill: '#f00' });
    addObject(scene, { type: 'text', x: 20, y: 20, text: 'Hi', fill: '#fff' });
    const svg = sceneToSvg(scene);
    assert.match(svg, /<svg/);
    assert.match(svg, /Hi/);
  });
  it('has presets', () => {
    assert.ok(CANVAS_PRESETS.length >= 3);
  });
});

describe('batch queue isolation', () => {
  it('one failure does not stop others', async () => {
    const q = createBatchQueue(10);
    q.add('ok.bin', new Uint8Array([1]));
    q.add('bad.bin', new Uint8Array([2]));
    q.add('ok2.bin', new Uint8Array([3]));
    await processQueue(q.items, async (item) => {
      if (item.name === 'bad.bin') throw new Error('boom');
      item.status = 'done';
    }, { concurrency: 2 });
    assert.equal(q.items[0].status, 'done');
    assert.equal(q.items[1].status, 'error');
    assert.equal(q.items[2].status, 'done');
  });
});
