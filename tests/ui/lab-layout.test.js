/**
 * Lab layout & rendering regression — lightweight DOM mock (no jsdom dependency).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

function createNode(tag = 'div', ns = null) {
  const node = {
    tagName: String(tag).toUpperCase(),
    namespaceURI: ns,
    className: '',
    classList: {
      _set: new Set(),
      add(...xs) {
        for (const x of xs) this._set.add(x);
        node.className = [...this._set].join(' ');
      },
      contains(x) {
        return this._set.has(x);
      },
      toggle(x, force) {
        if (force === false || (force === undefined && this._set.has(x))) this._set.delete(x);
        else this._set.add(x);
        node.className = [...this._set].join(' ');
      },
    },
    attributes: Object.create(null),
    children: [],
    style: {},
    hidden: false,
    disabled: false,
    value: '',
    type: '',
    textContent: '',
    parentNode: null,
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') {
        this.className = String(v);
        this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
      }
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    appendChild(c) {
      if (c && typeof c === 'object') {
        c.parentNode = this;
        this.children.push(c);
      }
      return c;
    },
    append(...cs) {
      for (const c of cs) this.appendChild(c);
    },
    addEventListener() {},
    removeEventListener() {},
    click() {},
    querySelector(sel) {
      return queryAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(this, sel);
    },
  };
  let _text = '';
  Object.defineProperty(node, 'textContent', {
    get() {
      if (this.children.length) {
        return this.children.map((c) => c.textContent || '').join('');
      }
      return _text;
    },
    set(v) {
      _text = v == null ? '' : String(v);
      this.children = [];
    },
  });
  return node;
}

function matchSimple(node, sel) {
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return node.classList.contains(cls) || (node.className || '').split(/\s+/).includes(cls);
  }
  if (sel.includes('.')) {
    const [tag, cls] = sel.split('.');
    return node.tagName === tag.toUpperCase() && matchSimple(node, '.' + cls);
  }
  return node.tagName === sel.toUpperCase();
}

function queryAll(root, sel) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n !== root && matchSimple(n, sel)) out.push(n);
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  if (matchSimple(root, sel)) out.unshift(root);
  return out;
}

function installDom() {
  const body = createNode('body');
  const doc = {
    body,
    createElement(tag) {
      return createNode(tag);
    },
    createElementNS(ns, tag) {
      return createNode(tag, ns);
    },
    createTextNode(t) {
      const n = createNode('#text');
      n.textContent = t;
      return n;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.document = doc;
  globalThis.window = { document: doc };
  if (!globalThis.URL) globalThis.URL = {};
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:mock';
    globalThis.URL.revokeObjectURL = () => {};
  }
}

describe('Lab layout & rendering', () => {
  before(() => {
    installDom();
  });

  it('Computer Lab builds DOM and refresh does not throw (hardware getMachine wired)', async () => {
    const { createComputerLab } = await import('../../src/ui/computer-lab.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const diagnostics = [];
    const lab = createComputerLab(root, {
      onDiagnostic: (m, level) => diagnostics.push({ m, level }),
    });
    assert.ok(root.classList.contains('computer-lab'));
    assert.ok(root.querySelector('.workbench-grid'), 'workbench-grid present');
    assert.ok(root.querySelector('.reg-grid'), 'reg-grid present');
    assert.ok(
      root.querySelector('.hardware-view') || root.querySelector('.hw-layout'),
      'hardware region present',
    );
    assert.doesNotThrow(() => lab.refresh());
    const hwErr = diagnostics.find((d) => /Hardware view/i.test(String(d.m)));
    assert.equal(hwErr, undefined, `hardware refresh error: ${hwErr?.m}`);
    const cells = root.querySelectorAll('.reg-cell');
    assert.ok(cells.length >= 8, `expected register cells, got ${cells.length}`);
  });

  it('CPU Lab builds hierarchy and shows register state after refresh', async () => {
    const { createCpuLab } = await import('../../src/ui/cpu-lab.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const lab = createCpuLab(root, { onDiagnostic: () => {} });
    assert.ok(root.classList.contains('cpu-lab'));
    const panels = root.querySelectorAll('.lab-panel');
    assert.ok(panels.length >= 3, 'editor / controls / output panels');
    assert.ok(root.querySelector('textarea'), 'assembly editor present');
    assert.ok(root.querySelector('.inspect-out'), 'output region present');
    assert.doesNotThrow(() => lab.refresh());
    const outs = root.querySelectorAll('.inspect-out');
    const joined = outs.map((o) => o.textContent).join('\n');
    assert.match(joined, /state=/);
    assert.match(joined, /pc=/);
  });

  it('Text Lab mounts and shows guidance or WASM wait state', async () => {
    const { createTextLab } = await import('../../src/ui/text-lab.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    createTextLab(root, { onDiagnostic: () => {} });
    assert.ok(root.classList.contains('text-lab'));
    const out = root.querySelector('.inspect-out');
    assert.ok(out, 'output panel present');
    // With Rust Unicode Core, initial state may be waiting for WASM when pkg/ is absent
    assert.match(
      out.textContent,
      /Ready|operation|Canonicalize|Waiting|Unicode Core|WASM|ERROR/i,
    );
    assert.ok(root.querySelector('textarea'), 'source textarea present');
  });

  it('repeated Computer Lab refresh does not duplicate panels', async () => {
    const { createComputerLab } = await import('../../src/ui/computer-lab.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const lab = createComputerLab(root, { onDiagnostic: () => {} });
    const before = root.querySelectorAll('.lab-panel').length;
    lab.refresh();
    lab.refresh();
    const after = root.querySelectorAll('.lab-panel').length;
    assert.equal(after, before, 'refresh must not clone panels');
  });
});
