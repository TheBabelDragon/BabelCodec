/**
 * Starter projects — produce real editable scene graphs (local Canvas/SVG).
 */

import { createScene, addObject } from '../studio/index.js';

/** @type {{ id: string, label: string, description: string, build: () => object }[]} */
export const STARTER_PROJECTS = [
  {
    id: 'logo_lab',
    label: 'Logo Lab',
    description: 'Centered mark + wordmark on dark field',
    build: () => {
      const scene = createScene(512, 512, '#12151a');
      addObject(scene, { type: 'ellipse', x: 156, y: 120, w: 200, h: 200, fill: '#4a90d9', stroke: '#8ab4f8' });
      addObject(scene, { type: 'rect', x: 206, y: 170, w: 100, h: 100, fill: '#1c2029', stroke: '#8ab4f8' });
      addObject(scene, { type: 'text', x: 140, y: 360, w: 240, h: 40, fill: '#e8eaed', text: 'BABEL', fontSize: 36 });
      return scene;
    },
  },
  {
    id: 'texture_lab',
    label: 'Texture Lab',
    description: 'Tiled geometric texture field',
    build: () => {
      const scene = createScene(512, 512, '#1a1210');
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const odd = (i + j) % 2;
          addObject(scene, {
            type: 'rect',
            x: i * 64,
            y: j * 64,
            w: 64,
            h: 64,
            fill: odd ? '#b87333' : '#3d2314',
            stroke: '#e8c39e',
          });
        }
      }
      return scene;
    },
  },
  {
    id: 'game_asset_lab',
    label: 'Game Asset Lab',
    description: 'Inventory-sized emblem',
    build: () => {
      const scene = createScene(256, 256, '#0d1117');
      addObject(scene, { type: 'ellipse', x: 48, y: 48, w: 160, h: 160, fill: '#2a3038', stroke: '#c0a060' });
      addObject(scene, { type: 'rect', x: 88, y: 88, w: 80, h: 80, fill: '#c0a060', stroke: '#e8c39e' });
      addObject(scene, { type: 'text', x: 70, y: 200, w: 120, h: 24, fill: '#e8eaed', text: 'ITEM', fontSize: 18 });
      return scene;
    },
  },
  {
    id: 'diagram_lab',
    label: 'Diagram Lab',
    description: 'Boxes and connectors',
    build: () => {
      const scene = createScene(640, 400, '#f5f0eb');
      addObject(scene, { type: 'rect', x: 40, y: 140, w: 140, h: 80, fill: '#a8c5d4', stroke: '#333' });
      addObject(scene, { type: 'rect', x: 250, y: 140, w: 140, h: 80, fill: '#c9a0b0', stroke: '#333' });
      addObject(scene, { type: 'rect', x: 460, y: 140, w: 140, h: 80, fill: '#d4c4b0', stroke: '#333' });
      addObject(scene, { type: 'line', x: 180, y: 180, w: 70, h: 0, stroke: '#333', fill: '#333' });
      addObject(scene, { type: 'line', x: 390, y: 180, w: 70, h: 0, stroke: '#333', fill: '#333' });
      addObject(scene, { type: 'text', x: 60, y: 170, w: 100, h: 24, fill: '#111', text: 'Input', fontSize: 16 });
      addObject(scene, { type: 'text', x: 275, y: 170, w: 100, h: 24, fill: '#111', text: 'Process', fontSize: 16 });
      addObject(scene, { type: 'text', x: 490, y: 170, w: 100, h: 24, fill: '#111', text: 'Output', fontSize: 16 });
      return scene;
    },
  },
  {
    id: 'poster_lab',
    label: 'Poster Lab',
    description: 'Title band + body region',
    build: () => {
      const scene = createScene(480, 640, '#0b1a12');
      addObject(scene, { type: 'rect', x: 0, y: 0, w: 480, h: 160, fill: '#1e3d2f', stroke: '#3d6b4f' });
      addObject(scene, { type: 'text', x: 40, y: 70, w: 400, h: 48, fill: '#c4d4a8', text: 'POSTER', fontSize: 42 });
      addObject(scene, { type: 'rect', x: 40, y: 220, w: 400, h: 320, fill: '#123024', stroke: '#3d6b4f' });
      addObject(scene, { type: 'text', x: 60, y: 260, w: 360, h: 24, fill: '#c4d4a8', text: 'Body copy area', fontSize: 18 });
      return scene;
    },
  },
  {
    id: 'product_lab',
    label: 'Product Image Lab',
    description: 'Centered product plate',
    build: () => {
      const scene = createScene(600, 600, '#eeeeee');
      addObject(scene, { type: 'ellipse', x: 150, y: 150, w: 300, h: 300, fill: '#ffffff', stroke: '#888888' });
      addObject(scene, { type: 'rect', x: 220, y: 220, w: 160, h: 160, fill: '#333333', stroke: '#111111' });
      addObject(scene, { type: 'text', x: 200, y: 500, w: 200, h: 28, fill: '#111111', text: 'Product', fontSize: 22 });
      return scene;
    },
  },
  {
    id: 'pattern_lab',
    label: 'Pattern Lab',
    description: 'Repeating diamond pattern',
    build: () => {
      const scene = createScene(512, 512, '#1a1a2e');
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          addObject(scene, {
            type: 'ellipse',
            x: 20 + i * 80,
            y: 20 + j * 80,
            w: 60,
            h: 60,
            fill: (i + j) % 2 ? '#00ffc8' : '#ff2d95',
            stroke: '#ffffff',
          });
        }
      }
      return scene;
    },
  },
];

export function getStarter(id) {
  return STARTER_PROJECTS.find((p) => p.id === id) || null;
}
