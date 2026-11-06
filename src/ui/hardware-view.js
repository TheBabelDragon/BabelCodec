/**
 * Live hardware schematic driven by real machine inspection snapshots.
 * SVG + safe DOM; no fabricated animations.
 */

import {
  snapshotSha256Machine,
  inspectComponent,
  inspectAdd32,
  OPERATION_FIDELITY,
  wordToHex32,
} from '../computer/inspection/index.js?v=0.5.0';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.setAttribute('class', v);
    else node.setAttribute(k, String(v));
  }
  return node;
}

export function createHardwareView(container, opts) {
  const getMachine = opts.getMachine;
  const onSelect = opts.onSelect || (() => {});

  container.textContent = '';
  container.classList.add('hardware-view');

  const layout = el('div', { className: 'hw-layout' });
  const schematicWrap = el('div', {
    className: 'hw-schematic-wrap',
    role: 'img',
    'aria-label': 'SHA-256 machine schematic',
  });
  const detailPanel = el('aside', { className: 'hw-detail panel lab-panel' });
  detailPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Component inspector' }));
  const detailBody = el('div', { className: 'hw-detail-body mono', textContent: 'Select a component in the schematic.' });
  detailPanel.appendChild(detailBody);

  const memPanel = el('section', { className: 'panel lab-panel hw-mem' });
  memPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Memory explorer' }));
  const memBody = el('div', { className: 'hw-mem-body' });
  memPanel.appendChild(memBody);

  const arithPanel = el('section', { className: 'panel lab-panel hw-arith' });
  arithPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Bit-level adder inspection' }));
  const arithBody = el('div', { className: 'hw-arith-body' });
  arithPanel.appendChild(arithBody);

  layout.append(schematicWrap, detailPanel);
  container.append(layout, memPanel, arithPanel);

  let selectedId = null;
  let lastSnap = null;

  function select(id) {
    selectedId = id;
    const detail = lastSnap ? inspectComponent(lastSnap, id) : null;
    detailBody.textContent = '';
    if (!detail) {
      detailBody.textContent = id ? `No data for ${id}` : 'Select a component in the schematic.';
    } else {
      const pre = el('pre', { className: 'mono inspect-out' });
      pre.textContent = JSON.stringify(detail, null, 2);
      detailBody.appendChild(pre);
    }
    onSelect(id, detail);
    schematicWrap.querySelectorAll('[data-component]').forEach((n) => {
      n.classList.toggle('hw-selected', n.getAttribute('data-component') === selectedId);
    });
  }

  function buildSchematic(snap) {
    schematicWrap.textContent = '';
    const svg = svgEl('svg', {
      viewBox: '0 0 720 420',
      className: 'hw-svg',
      width: '100%',
      height: 'auto',
    });

    const regions = [
      { x: 20, y: 20, w: 200, h: 160, label: 'Working A–H', id: 'reg.working.A' },
      { x: 240, y: 20, w: 220, h: 160, label: 'Datapath / ALU', id: 'datapath.round' },
      { x: 480, y: 20, w: 220, h: 100, label: 'Controller', id: 'ctrl' },
      { x: 480, y: 140, w: 220, h: 100, label: 'Buses T1 T2 W K', id: 'bus.T1' },
      { x: 20, y: 200, w: 340, h: 200, label: 'W schedule / K constants', id: 'mem.W' },
      { x: 380, y: 200, w: 320, h: 200, label: 'Hash state H[0..7]', id: 'mem.hash' },
    ];

    for (const r of regions) {
      const g = svgEl('g', { 'data-component': r.id, className: 'hw-region' });
      g.appendChild(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, className: 'hw-box' }));
      const t = svgEl('text', { x: r.x + 10, y: r.y + 18, className: 'hw-label' });
      t.textContent = r.label;
      g.appendChild(t);
      g.addEventListener('click', () => select(r.id));
      svg.appendChild(g);
    }

    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    names.forEach((n, i) => {
      const reg = snap?.registers?.find((r) => r.label === n);
      const x = 30 + (i % 4) * 48;
      const y = 50 + Math.floor(i / 4) * 55;
      const g = svgEl('g', { 'data-component': `reg.working.${n}`, className: 'hw-reg' });
      g.appendChild(svgEl('rect', { x, y, width: 44, height: 40, rx: 4, className: 'hw-chip' }));
      const t1 = svgEl('text', { x: x + 22, y: y + 14, className: 'hw-chip-label', 'text-anchor': 'middle' });
      t1.textContent = n;
      const t2 = svgEl('text', { x: x + 22, y: y + 30, className: 'hw-chip-val', 'text-anchor': 'middle' });
      t2.textContent = reg ? reg.hex.slice(0, 4) : '----';
      g.append(t1, t2);
      g.addEventListener('click', (e) => { e.stopPropagation(); select(`reg.working.${n}`); });
      svg.appendChild(g);
    });

    const st = snap?.controllerState ?? 'IDLE';
    const stText = svgEl('text', { x: 590, y: 70, className: 'hw-state', 'text-anchor': 'middle' });
    stText.textContent = st;
    svg.appendChild(stText);
    const cy = svgEl('text', { x: 590, y: 92, className: 'hw-chip-val', 'text-anchor': 'middle' });
    cy.textContent = `cycle ${snap?.cycle ?? 0}`;
    svg.appendChild(cy);

    ['T1', 'T2', 'W', 'K'].forEach((n, i) => {
      const bus = snap?.buses?.find((b) => b.label === n);
      const g = svgEl('g', { 'data-component': `bus.${n}`, className: 'hw-bus' });
      const t = svgEl('text', { x: 500, y: 160 + i * 18, className: 'hw-chip-val' });
      t.textContent = `${n}: ${bus ? bus.hex : '--------'}`;
      g.appendChild(t);
      g.addEventListener('click', (e) => { e.stopPropagation(); select(`bus.${n}`); });
      svg.appendChild(g);
    });

    for (let i = 0; i < 8; i++) {
      const mem = snap?.memories?.find((m) => m.id === 'mem.hash');
      const entry = mem?.entries?.[i];
      const x = 400 + (i % 4) * 70;
      const y = 240 + Math.floor(i / 4) * 50;
      const g = svgEl('g', { 'data-component': `mem.hash.${i}`, className: 'hw-reg' });
      g.appendChild(svgEl('rect', { x, y, width: 64, height: 36, rx: 4, className: 'hw-chip' }));
      const t1 = svgEl('text', { x: x + 32, y: y + 14, className: 'hw-chip-label', 'text-anchor': 'middle' });
      t1.textContent = `H${i}`;
      const t2 = svgEl('text', { x: x + 32, y: y + 28, className: 'hw-chip-val', 'text-anchor': 'middle' });
      t2.textContent = entry ? entry.hex.slice(0, 6) : '------';
      g.append(t1, t2);
      g.addEventListener('click', (e) => { e.stopPropagation(); select(`mem.hash.${i}`); });
      svg.appendChild(g);
    }

    if (snap?.datapath?.round != null) {
      const hint = svgEl('text', { x: 350, y: 100, className: 'hw-active', 'text-anchor': 'middle' });
      hint.textContent = `round ${snap.datapath.round}`;
      svg.appendChild(hint);
    }

    const cap = svgEl('text', { x: 360, y: 410, className: 'hw-caption', 'text-anchor': 'middle' });
    cap.textContent = 'Add: gate-expanded · Ch/Maj/Σ: behavioral Boolean · values from live snapshot';
    svg.appendChild(cap);

    schematicWrap.appendChild(svg);
  }

  function renderMemory(snap) {
    memBody.textContent = '';
    if (!snap) { memBody.textContent = '—'; return; }
    for (const mem of snap.memories || []) {
      const block = el('div', { className: 'hw-mem-region' });
      block.appendChild(el('div', { className: 'hw-mem-title', textContent: `${mem.label} (${mem.depth}×${mem.width})` }));
      const grid = el('div', { className: 'hw-mem-grid' });
      const show = mem.entries.slice(0, mem.depth <= 16 ? mem.depth : 16);
      for (const e of show) {
        const cell = el('button', {
          type: 'button',
          className: 'hw-mem-cell' + (mem.lastAccess === e.index ? ' hw-mem-hot' : ''),
          textContent: `${e.index}:${e.hex}`,
          title: `index ${e.index}`,
        });
        cell.addEventListener('click', () => select(mem.id === 'mem.hash' ? `mem.hash.${e.index}` : mem.id));
        grid.appendChild(cell);
      }
      if (mem.entries.length > show.length) {
        grid.appendChild(el('span', { className: 'diag-meta', textContent: `… +${mem.entries.length - show.length}` }));
      }
      block.appendChild(grid);
      memBody.appendChild(block);
    }
  }

  function renderArithmetic(snap) {
    arithBody.textContent = '';
    arithBody.appendChild(el('p', { className: 'diag-meta', textContent: OPERATION_FIDELITY.add32.note }));
    const row = el('div', { className: 'btn-row' });
    const aIn = el('input', { type: 'text', className: 'mono', value: '00000001', 'aria-label': 'Operand A hex', size: '10' });
    const bIn = el('input', { type: 'text', className: 'mono', value: '00000001', 'aria-label': 'Operand B hex', size: '10' });
    const btn = el('button', { type: 'button', className: 'btn', textContent: 'Inspect add32' });
    const out = el('pre', { className: 'mono inspect-out' });
    btn.addEventListener('click', () => {
      try {
        const a = BigInt('0x' + aIn.value.replace(/^0x/i, ''));
        const b = BigInt('0x' + bIn.value.replace(/^0x/i, ''));
        const detail = inspectAdd32(a, b);
        const stages = detail.stages.slice(0, 8).map((s) =>
          `bit${s.bit}: a=${s.a} b=${s.b} cin=${s.cin} → sum=${s.sum} cout=${s.cout} G=${s.generate} P=${s.propagate}`).join('\n');
        out.textContent = `sum=${wordToHex32(detail.sum)} finalCarry=${detail.finalCarry}\n${stages}\n… (${detail.stages.length} stages, gate-expanded)`;
      } catch (e) {
        out.textContent = String(e.message || e);
      }
    });
    row.append(el('label', { textContent: 'A ' }, [aIn]), el('label', { textContent: 'B ' }, [bIn]), btn);
    arithBody.append(row, out);
    if (snap?.datapath) {
      const ops = el('ul', { className: 'hw-op-list' });
      for (const op of snap.datapath.operations || []) {
        const li = el('li');
        li.textContent = `${op.role || op.label} [${op.kind}]`;
        ops.appendChild(li);
      }
      arithBody.appendChild(el('div', { className: 'panel-title', textContent: 'Last round operations' }));
      arithBody.appendChild(ops);
    }
  }

  function refresh() {
    const machine = getMachine();
    lastSnap = snapshotSha256Machine(machine);
    buildSchematic(lastSnap);
    renderMemory(lastSnap);
    renderArithmetic(lastSnap);
    if (selectedId) select(selectedId);
    return lastSnap;
  }

  refresh();
  return { refresh, select, getSnapshot: () => lastSnap };
}
