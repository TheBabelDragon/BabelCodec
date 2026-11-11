/**
 * Image Studio panel visibility — .active + hidden must stay in sync.
 * Default landing is Playground after creative-lab milestone.
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
      remove(...xs) {
        for (const x of xs) this._set.delete(x);
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
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    append(...xs) {
      for (const x of xs) this.appendChild(x);
    },
    removeChild(c) {
      this.children = this.children.filter((x) => x !== c);
      c.parentNode = null;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) {
      return queryAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(this, sel);
    },
    getContext() {
      return {
        clearRect() {},
        fillRect() {},
        beginPath() {},
        arc() {},
        fill() {},
        stroke() {},
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        fillText() {},
        strokeRect() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        drawImage() {},
        getImageData: (x, y, w, h) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData() {},
      };
    },
  };
  if (tag === 'canvas') {
    node.width = 0;
    node.height = 0;
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    node.value = '';
  }
  if (tag === 'select') {
    Object.defineProperty(node, 'options', {
      get() {
        return this.children.filter((c) => c.tagName === 'OPTION');
      },
    });
  }
  node.dataset = new Proxy(
    {},
    {
      set(obj, k, v) {
        obj[k] = String(v);
        node.setAttribute(
          'data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()),
          String(v),
        );
        return true;
      },
      get(obj, k) {
        return obj[k];
      },
    },
  );
  return node;
}

function queryAll(root, sel) {
  const out = [];
  const walk = (n) => {
    if (!n || !n.tagName) return;
    if (match(n, sel)) out.push(n);
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return out;
}

function match(n, sel) {
  if (sel.startsWith('.')) {
    const cls = sel.slice(1).split('.')[0];
    return n.classList.contains(cls) || (n.className || '').split(/\s+/).includes(cls);
  }
  if (sel.startsWith('#')) return n.attributes?.id === sel.slice(1);
  return n.tagName === sel.toUpperCase();
}

function installDom() {
  const body = createNode('body');
  const doc = {
    body,
    createElement: (t) => createNode(t),
    createElementNS: (_ns, t) => createNode(t),
    createTextNode: (text) => {
      const n = createNode('#text');
      n.textContent = String(text ?? '');
      n.nodeType = 3;
      return n;
    },
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
  };
  globalThis.document = doc;
  globalThis.window = { document: doc };
  if (!globalThis.URL) globalThis.URL = {};
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:mock';
    globalThis.URL.revokeObjectURL = () => {};
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = class {
      constructor(w, h) {
        this.width = w;
        this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    };
  }
}

describe('Image Studio panel visibility', () => {
  before(() => {
    installDom();
  });

  it('defaults to Playground with exactly one .active visible panel', async () => {
    const { createMediaLab } = await import('../../src/ui/studio-ui.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const lab = createMediaLab(root, { onDiagnostic: () => {}, onBytes: () => {}, onNavigate: () => {} });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(lab.getMode(), 'playground');
    const st = lab.getWorkspaceState();
    const active = Object.entries(st.panels).filter(([, p]) => p.classList.contains('active'));
    assert.equal(active.length, 1, `expected 1 active panel, got ${active.length}`);
    assert.equal(active[0][0], 'playground');
    assert.equal(active[0][1].hidden, false);
    for (const [k, p] of Object.entries(st.panels)) {
      if (k === 'playground') continue;
      assert.equal(p.classList.contains('active'), false, `${k} must not be active`);
      assert.equal(p.hidden, true, `${k} must be hidden`);
    }
    assert.ok(st.modeButtons.playground.classList.contains('active'));
  });

  it('setMode toggles .active and hidden for all six modes', async () => {
    const { createMediaLab } = await import('../../src/ui/studio-ui.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const lab = createMediaLab(root, { onDiagnostic: () => {}, onBytes: () => {}, onNavigate: () => {} });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    for (const id of ['playground', 'create', 'convert', 'inspect', 'batch', 'generate']) {
      lab.setMode(id);
      assert.equal(lab.getMode(), id);
      const st = lab.getWorkspaceState();
      const actives = Object.entries(st.panels).filter(([, p]) => p.classList.contains('active'));
      assert.equal(actives.length, 1, `${id}: exactly one active`);
      assert.equal(actives[0][0], id);
      assert.equal(actives[0][1].hidden, false);
      for (const [k, p] of Object.entries(st.panels)) {
        if (k === id) continue;
        assert.equal(p.hidden, true, `${id}: ${k} hidden`);
        assert.equal(p.classList.contains('active'), false, `${id}: ${k} not active`);
      }
      assert.ok(st.modeButtons[id].classList.contains('active'), `${id} nav active`);
    }
  });

  it('playground mode status describes local creative readiness', async () => {
    const { createMediaLab } = await import('../../src/ui/studio-ui.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const msgs = [];
    createMediaLab(root, {
      onDiagnostic: (m) => msgs.push(String(m || '')),
      onBytes: () => {},
      onNavigate: () => {},
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const joined = msgs.join('\n');
    assert.match(joined, /Playground ready/i);
  });
});
