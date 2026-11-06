/**
 * Logic Lab UI — gate simulator, byte workbench, XOR difference inspector.
 */
import * as Logic from '../logic/index.js?v=0.3.0';
import { encodeHex, decodeHex } from '../core/hex.js?v=0.3.0';
import { byteToBinary, isPrintableAscii } from '../core/utils.js';

const GATES = ['AND', 'OR', 'XOR', 'NOT', 'NAND', 'NOR', 'XNOR'];
const WIDTHS = [8, 16, 32, 64];
const BYTE_OPS = [['and','AND'],['or','OR'],['xor','XOR'],['not','NOT'],['nand','NAND'],['nor','NOR'],['xnor','XNOR']];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'dataset') { for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv; }
    else if (k === 'hidden') { if (v) node.hidden = true; }
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function parseIntInput(text, width) {
  const t = text.trim().toLowerCase();
  if (!t) return 0n;
  if (t.startsWith('0x') || t.startsWith('0b')) return Logic.toUnsigned(BigInt(t), width);
  return Logic.toUnsigned(t, width);
}

function formatValue(v, width) {
  const u = typeof v === 'bigint' ? v : BigInt(v);
  const hex = '0x' + u.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0');
  const bin = Logic.toBinaryString(u, width);
  const dec = width <= 53 ? String(Number(u)) : u.toString(10);
  return { hex, bin, dec };
}

function parseHexArea(text) {
  const cleaned = text.replace(/[^0-9a-fA-F]/g, '');
  if (!cleaned) return new Uint8Array(0);
  if (cleaned.length % 2) throw new Error('Hex length must be even');
  return decodeHex(cleaned);
}

export function createLogicView(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  let lastDiff = null;

  container.textContent = '';
  container.classList.add('logic-lab');

  const sectionNav = el('div', { className: 'logic-section-nav' });
  for (const [id, label] of [['gates','Gate Simulator'],['bytes','Byte Logic'],['diff','XOR Difference']]) {
    sectionNav.appendChild(el('button', {
      type: 'button', className: 'btn' + (id === 'gates' ? ' active' : ''),
      textContent: label, dataset: { section: id },
    }));
  }

  const gatePanel = el('div', { className: 'logic-panel', dataset: { panel: 'gates' } });
  const bytePanel = el('div', { className: 'logic-panel', dataset: { panel: 'bytes' } });
  bytePanel.hidden = true;
  const diffPanel = el('div', { className: 'logic-panel', dataset: { panel: 'diff' } });
  diffPanel.hidden = true;
  container.append(sectionNav, gatePanel, bytePanel, diffPanel);

  sectionNav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    const id = btn.dataset.section;
    sectionNav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.section === id));
    for (const p of [gatePanel, bytePanel, diffPanel]) p.hidden = p.dataset.panel !== id;
  });

  const gateSelect = el('select', { 'aria-label': 'Gate' });
  for (const g of GATES) gateSelect.appendChild(el('option', { value: g, textContent: g }));
  gateSelect.value = 'XOR';
  const widthSelect = el('select', { 'aria-label': 'Bit width' });
  for (const w of WIDTHS) widthSelect.appendChild(el('option', { value: String(w), textContent: w + '-bit' }));
  widthSelect.value = '8';
  const inputA = el('input', { type: 'text', className: 'logic-input', value: '0b10101010', 'aria-label': 'Input A' });
  const inputB = el('input', { type: 'text', className: 'logic-input', value: '0b11001100', 'aria-label': 'Input B' });
  const gateResult = el('div', { className: 'logic-result' });
  const truthTable = el('div', { className: 'truth-table' });
  const bitRows = el('div', { className: 'bit-rows' });
  const gateTb = el('div', { className: 'logic-toolbar' });
  gateTb.append(
    el('label', {}, [document.createTextNode('Gate '), gateSelect]),
    el('label', {}, [document.createTextNode('Width '), widthSelect]),
    inputA, inputB,
    el('button', { type: 'button', className: 'btn btn-primary', textContent: 'Evaluate', id: 'btn-gate-eval' }),
  );
  gatePanel.append(
    el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: 'Gate Simulator' })]),
    gateTb, gateResult,
    el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: 'Truth table' })]),
    truthTable,
    el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: 'Per-bit result' })]),
    bitRows,
  );

  function runGateEval() {
    try {
      const gate = gateSelect.value;
      const width = Number(widthSelect.value);
      const a = parseIntInput(inputA.value, width);
      const b = gate === 'NOT' ? 0n : parseIntInput(inputB.value, width);
      inputB.disabled = gate === 'NOT';
      const opts = { width };
      const fn = { AND: Logic.and, OR: Logic.or, XOR: Logic.xor, NOT: Logic.not,
        NAND: Logic.nand, NOR: Logic.nor, XNOR: Logic.xnor }[gate];
      const result = gate === 'NOT' ? fn(a, opts) : fn(a, b, opts);
      const fmt = formatValue(result, width);
      const aFmt = formatValue(a, width);
      gateResult.textContent = '';
      gateResult.appendChild(el('div', { className: 'mono', textContent: 'A = ' + aFmt.bin + '  (' + aFmt.hex + ', ' + aFmt.dec + ')' }));
      if (gate !== 'NOT') {
        const bFmt = formatValue(b, width);
        gateResult.appendChild(el('div', { className: 'mono', textContent: 'B = ' + bFmt.bin + '  (' + bFmt.hex + ', ' + bFmt.dec + ')' }));
      }
      gateResult.appendChild(el('div', { className: 'mono', textContent: gate + ' -> ' + fmt.bin + '  (' + fmt.hex + ', ' + fmt.dec + ')' }));

      const table = Logic.generateTruthTable(gate);
      truthTable.textContent = '';
      const thead = el('div', { className: 'tt-row tt-head' });
      for (const h of [...table.inputs, 'Out']) thead.appendChild(el('span', { className: 'tt-cell', textContent: h }));
      truthTable.appendChild(thead);
      for (const row of table.rows) {
        const r = el('div', { className: 'tt-row' });
        for (const v of row.values) r.appendChild(el('span', { className: 'tt-cell', textContent: v ? '1' : '0' }));
        r.appendChild(el('span', { className: 'tt-cell tt-out', textContent: row.result ? '1' : '0' }));
        truthTable.appendChild(r);
      }

      bitRows.textContent = '';
      for (let i = width - 1; i >= 0; i--) {
        const ab = Number((a >> BigInt(i)) & 1n);
        const bb = gate === 'NOT' ? null : Number((b >> BigInt(i)) & 1n);
        const rb = Number((result >> BigInt(i)) & 1n);
        const row = el('div', { className: 'bit-row' });
        row.appendChild(el('span', { className: 'bit-idx', textContent: 'bit ' + i }));
        row.appendChild(el('span', { className: 'bit-val', textContent: 'A=' + ab }));
        if (bb !== null) row.appendChild(el('span', { className: 'bit-val', textContent: 'B=' + bb }));
        row.appendChild(el('span', { className: 'bit-val bit-out', textContent: '-> ' + rb }));
        bitRows.appendChild(row);
      }
      onDiagnostic(gate + ' evaluated at ' + width + '-bit.', 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  }
  gateSelect.addEventListener('change', () => { inputB.disabled = gateSelect.value === 'NOT'; runGateEval(); });
  widthSelect.addEventListener('change', runGateEval);
  gatePanel.querySelector('#btn-gate-eval').addEventListener('click', runGateEval);
  inputA.addEventListener('keydown', (e) => { if (e.key === 'Enter') runGateEval(); });
  inputB.addEventListener('keydown', (e) => { if (e.key === 'Enter') runGateEval(); });

  const byteOpSelect = el('select', { 'aria-label': 'Byte operation' });
  for (const [v, l] of BYTE_OPS) byteOpSelect.appendChild(el('option', { value: v, textContent: l }));
  byteOpSelect.value = 'xor';
  const hexA = el('textarea', { className: 'logic-hex', rows: '3', spellcheck: 'false', 'aria-label': 'Operand A hex' });
  const hexB = el('textarea', { className: 'logic-hex', rows: '3', spellcheck: 'false', 'aria-label': 'Operand B hex' });
  const byteOut = el('div', { className: 'logic-result' });
  const intWidth = el('select', { 'aria-label': 'Integer width' });
  for (const w of WIDTHS) intWidth.appendChild(el('option', { value: String(w), textContent: w + '-bit' }));
  intWidth.value = '8';
  const maskInput = el('input', { type: 'text', className: 'logic-input', value: '0x0f', 'aria-label': 'Mask' });
  const shiftAmount = el('input', { type: 'text', className: 'logic-input', value: '1', 'aria-label': 'Shift amount' });
  const byteTb = el('div', { className: 'logic-toolbar' });
  byteTb.append(
    el('label', {}, [document.createTextNode('Op '), byteOpSelect]),
    el('label', {}, [document.createTextNode('Width '), intWidth]),
    el('button', { type: 'button', className: 'btn btn-primary', textContent: 'Run', id: 'btn-byte-run' }),
    el('button', { type: 'button', className: 'btn', textContent: 'Mask A', id: 'btn-mask' }),
    el('button', { type: 'button', className: 'btn', textContent: '<< A', id: 'btn-shl' }),
    el('button', { type: 'button', className: 'btn', textContent: '>> A', id: 'btn-shr' }),
    maskInput, shiftAmount,
  );
  bytePanel.append(
    el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: 'Byte Logic Workbench' })]),
    byteTb,
    el('div', { className: 'logic-ops' }, [
      el('div', {}, [el('div', { className: 'panel-title', textContent: 'A (hex)' }), hexA]),
      el('div', {}, [el('div', { className: 'panel-title', textContent: 'B (hex)' }), hexB]),
    ]),
    byteOut,
  );

  function showByteResult(bytes, label) {
    byteOut.textContent = '';
    const hex = encodeHex(bytes, { separator: ' ' });
    const bins = [...bytes].map(byteToBinary).join(' ');
    let ascii = '';
    for (const b of bytes) ascii += isPrintableAscii(b) ? String.fromCharCode(b) : '.';
    byteOut.appendChild(el('div', { className: 'mono', textContent: label + ' (' + bytes.length + ' byte(s))' }));
    byteOut.appendChild(el('div', { className: 'mono', textContent: 'hex  ' + (hex || '(empty)') }));
    byteOut.appendChild(el('div', { className: 'mono', textContent: 'bin  ' + (bins || '(empty)') }));
    if (bytes.length <= 8) {
      let n = 0n;
      for (const b of bytes) n = (n << 8n) | BigInt(b);
      byteOut.appendChild(el('div', { className: 'mono', textContent: 'dec  ' + n.toString(10) + ' (big-endian)' }));
    }
    byteOut.appendChild(el('div', { className: 'mono', textContent: 'asc  ' + (ascii || '(empty)') }));
  }

  bytePanel.querySelector('#btn-byte-run').addEventListener('click', () => {
    try {
      const a = parseHexArea(hexA.value);
      const op = byteOpSelect.value;
      let result;
      if (op === 'not') result = Logic.notBytes(a);
      else {
        const b = parseHexArea(hexB.value);
        if (op === 'and') result = Logic.andBytes(a, b);
        else if (op === 'or') result = Logic.orBytes(a, b);
        else if (op === 'xor') result = Logic.xorBytes(a, b);
        else if (op === 'nand') result = Logic.notBytes(Logic.andBytes(a, b));
        else if (op === 'nor') result = Logic.notBytes(Logic.orBytes(a, b));
        else if (op === 'xnor') result = Logic.notBytes(Logic.xorBytes(a, b));
      }
      showByteResult(result, op.toUpperCase() + ' result');
      onDiagnostic('Byte ' + op.toUpperCase() + ' complete.', 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  bytePanel.querySelector('#btn-mask').addEventListener('click', () => {
    try {
      const a = parseHexArea(hexA.value);
      const w = Number(intWidth.value);
      const mask = parseIntInput(maskInput.value, w);
      const maskByte = Number(mask & 0xffn);
      const m = new Uint8Array(a.length).fill(maskByte);
      showByteResult(Logic.applyMaskBytes(a, m), 'mask 0x' + maskByte.toString(16) + ' result');
      onDiagnostic('Mask applied.', 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  bytePanel.querySelector('#btn-shl').addEventListener('click', () => {
    try {
      const w = Number(intWidth.value);
      const a = parseIntInput(hexA.value.replace(/\s/g, '') || '0', w);
      const amt = Number(shiftAmount.value) | 0;
      const r = Logic.leftShift(a, amt, { width: w });
      const fmt = formatValue(r, w);
      byteOut.textContent = '';
      byteOut.appendChild(el('div', { className: 'mono', textContent: '<< ' + amt + ' -> ' + fmt.bin + ' (' + fmt.hex + ', ' + fmt.dec + ')' }));
      onDiagnostic('Left shift complete.', 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  bytePanel.querySelector('#btn-shr').addEventListener('click', () => {
    try {
      const w = Number(intWidth.value);
      const a = parseIntInput(hexA.value.replace(/\s/g, '') || '0', w);
      const amt = Number(shiftAmount.value) | 0;
      const r = Logic.rightShift(a, amt, { width: w });
      const fmt = formatValue(r, w);
      byteOut.textContent = '';
      byteOut.appendChild(el('div', { className: 'mono', textContent: '>> ' + amt + ' -> ' + fmt.bin + ' (' + fmt.hex + ', ' + fmt.dec + ')' }));
      onDiagnostic('Right shift complete.', 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });

  const diffHexA = el('textarea', { className: 'logic-hex', rows: '3', spellcheck: 'false', 'aria-label': 'Previous hex' });
  const diffHexB = el('textarea', { className: 'logic-hex', rows: '3', spellcheck: 'false', 'aria-label': 'Current hex' });
  const diffOut = el('div', { className: 'logic-result' });
  const fileA = el('input', { type: 'file' }); fileA.style.display = 'none';
  const fileB = el('input', { type: 'file' }); fileB.style.display = 'none';
  const diffTb = el('div', { className: 'logic-toolbar' });
  diffTb.append(
    el('button', { type: 'button', className: 'btn btn-primary', textContent: 'Compare', id: 'btn-diff' }),
    el('button', { type: 'button', className: 'btn', textContent: 'Load file A', id: 'btn-file-a' }),
    el('button', { type: 'button', className: 'btn', textContent: 'Load file B', id: 'btn-file-b' }),
    el('button', { type: 'button', className: 'btn', textContent: 'Download diff', id: 'btn-diff-dl' }),
    fileA, fileB,
  );
  diffPanel.append(
    el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: 'XOR Difference Inspector' })]),
    diffTb,
    el('div', { className: 'logic-ops' }, [
      el('div', {}, [el('div', { className: 'panel-title', textContent: 'Previous' }), diffHexA]),
      el('div', {}, [el('div', { className: 'panel-title', textContent: 'Current' }), diffHexB]),
    ]),
    diffOut,
  );

  function loadFile(input, which) {
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { onDiagnostic('File exceeds 8 MiB limit.', 'err'); return; }
      const buf = new Uint8Array(await f.arrayBuffer());
      const hex = encodeHex(buf, { separator: ' ' });
      if (which === 'a') diffHexA.value = hex; else diffHexB.value = hex;
      onDiagnostic('Loaded ' + f.name + ' (' + buf.length + ' bytes).', 'ok');
      input.value = '';
    });
  }
  loadFile(fileA, 'a'); loadFile(fileB, 'b');
  diffPanel.querySelector('#btn-file-a').addEventListener('click', () => fileA.click());
  diffPanel.querySelector('#btn-file-b').addEventListener('click', () => fileB.click());

  diffPanel.querySelector('#btn-diff').addEventListener('click', () => {
    try {
      const a = parseHexArea(diffHexA.value);
      const b = parseHexArea(diffHexB.value);
      const d = Logic.diffBytes(a, b);
      lastDiff = d;
      diffOut.textContent = '';
      diffOut.appendChild(el('div', { className: 'mono', textContent: 'Changed bytes: ' + d.changedByteCount + ' / ' + a.length }));
      diffOut.appendChild(el('div', { className: 'mono', textContent: 'Changed bits:  ' + d.changedBitCount }));
      diffOut.appendChild(el('div', { className: 'mono', textContent: 'XOR hex: ' + (encodeHex(d.difference, { separator: ' ' }) || '(empty)') }));
      if (d.changedOffsets.length) {
        const list = el('div', { className: 'diff-list' });
        const limit = Math.min(d.changedOffsets.length, 64);
        for (let i = 0; i < limit; i++) {
          const off = d.changedOffsets[i];
          list.appendChild(el('div', { className: 'diff-row mono', textContent:
            '+' + off + '  prev ' + byteToBinary(a[off]) + '  curr ' + byteToBinary(b[off]) + '  xor ' + byteToBinary(d.difference[off]) }));
        }
        if (d.changedOffsets.length > limit) {
          list.appendChild(el('div', { className: 'diag-meta', textContent: '... and ' + (d.changedOffsets.length - limit) + ' more' }));
        }
        diffOut.appendChild(list);
      }
      if (d.changedBits.length) {
        const bitBox = el('div', { className: 'diff-bits' });
        bitBox.appendChild(el('div', { className: 'panel-title', textContent: 'Changed bits' }));
        const limit = Math.min(d.changedBits.length, 32);
        for (let i = 0; i < limit; i++) {
          const c = d.changedBits[i];
          bitBox.appendChild(el('div', { className: 'mono', textContent: 'offset ' + c.offset + ' bit ' + c.bit + ': ' + c.previous + ' -> ' + c.current }));
        }
        if (d.changedBits.length > limit) {
          bitBox.appendChild(el('div', { className: 'diag-meta', textContent: '... and ' + (d.changedBits.length - limit) + ' more bits' }));
        }
        diffOut.appendChild(bitBox);
      }
      onDiagnostic('Diff complete: ' + d.changedByteCount + ' byte(s), ' + d.changedBitCount + ' bit(s) changed.', 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  diffPanel.querySelector('#btn-diff-dl').addEventListener('click', () => {
    if (!lastDiff) { onDiagnostic('Run a comparison first.', 'info'); return; }
    const blob = new Blob([lastDiff.difference], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = 'babelcodec-xor-diff.bin'; a.click();
    URL.revokeObjectURL(url);
    onDiagnostic('Downloaded XOR difference.', 'ok');
  });

  runGateEval();

  return {
    setOperandA(bytes) {
      if (!bytes || !bytes.length) { onDiagnostic('No selection to transfer.', 'info'); return; }
      const copy = new Uint8Array(bytes);
      const hex = encodeHex(copy, { separator: ' ' });
      hexA.value = hex;
      diffHexA.value = hex;
      onDiagnostic('Transferred ' + copy.length + ' byte(s) to Logic Lab operand A.', 'ok');
    },
    setOperandB(bytes) {
      if (!bytes || !bytes.length) return;
      const copy = new Uint8Array(bytes);
      const hex = encodeHex(copy, { separator: ' ' });
      hexB.value = hex;
      diffHexB.value = hex;
      onDiagnostic('Transferred ' + copy.length + ' byte(s) to Logic Lab operand B.', 'ok');
    },
    refresh() {},
  };
}
