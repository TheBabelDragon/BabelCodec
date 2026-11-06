/**
 * SHA-256 Lab — functional engine inspection (padding, schedule, rounds, digest).
 * Binds to the real babelcodec/sha256 implementation — no mock digests.
 */

import {
  sha256, sha256Hex, padMessage, blockCount, parseBlockWords,
  createMessageSchedule, compressBlock, IV, K, wordToHex,
} from '../sha256/index.js?v=0.4.0';
import { encodeHex, decodeHex } from '../core/hex.js?v=0.4.0';
import { toUint8Array } from '../core/utils.js?v=0.4.0';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'hidden') { if (v) node.hidden = true; }
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function hexWord(w) {
  return wordToHex(w);
}

/**
 * @param {HTMLElement} container
 * @param {{ onDiagnostic?: (msg: string, kind?: string) => void, onSendToComputer?: (bytes: Uint8Array) => void }} opts
 */
export function createSha256Lab(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  const onSendToComputer = opts.onSendToComputer || (() => {});

  /** @type {Uint8Array|null} */
  let lastBytes = null;
  /** @type {ReturnType<typeof sha256>|null} */
  let lastResult = null;

  container.textContent = '';
  container.classList.add('sha256-lab');

  const title = el('div', { className: 'panel-title', textContent: 'SHA-256 Lab (functional engine)' });
  const note = el('p', {
    className: 'diag-meta',
    textContent: 'Uses the real FIPS 180-4 reference implementation (babelcodec/sha256). Not the gate-level machine.',
  });

  const inputPanel = el('section', { className: 'panel lab-panel' }, [
    el('div', { className: 'panel-title', textContent: 'Message input' }),
  ]);
  const modeSel = el('select', { id: 'sha-mode', 'aria-label': 'Input mode' }, [
    el('option', { value: 'text', textContent: 'Text (UTF-8)' }),
    el('option', { value: 'hex', textContent: 'Hex bytes' }),
  ]);
  const inputArea = el('textarea', {
    id: 'sha-input',
    rows: '3',
    placeholder: 'Message to hash (empty allowed)',
    spellcheck: 'false',
    className: 'mono',
  });
  const btnRow = el('div', { className: 'btn-row' });
  const btnHash = el('button', { type: 'button', className: 'btn', textContent: 'Hash' });
  const btnClear = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Clear' });
  const btnToComputer = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Send to Computer Lab' });
  btnRow.append(btnHash, btnClear, btnToComputer);
  inputPanel.append(modeSel, inputArea, btnRow);

  const outPanel = el('section', { className: 'panel lab-panel' }, [
    el('div', { className: 'panel-title', textContent: 'Digest' }),
  ]);
  const digestHex = el('div', { className: 'mono digest-hex', id: 'sha-digest', textContent: '—' });
  const meta = el('div', { className: 'diag-meta', id: 'sha-meta', textContent: '' });
  const outBtns = el('div', { className: 'btn-row' });
  const btnCopy = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Copy digest' });
  const btnDl = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Download digest' });
  outBtns.append(btnCopy, btnDl);
  outPanel.append(digestHex, meta, outBtns);

  const inspectPanel = el('section', { className: 'panel lab-panel' }, [
    el('div', { className: 'panel-title', textContent: 'Internal inspection' }),
  ]);
  const blockSel = el('select', { id: 'sha-block', 'aria-label': 'Block' });
  const roundSel = el('select', { id: 'sha-round', 'aria-label': 'Round' });
  for (let t = 0; t < 64; t++) {
    roundSel.appendChild(el('option', { value: String(t), textContent: `Round ${t}` }));
  }
  const inspectMeta = el('div', { className: 'btn-row' }, [
    el('label', { textContent: 'Block ' }, [blockSel]),
    el('label', { textContent: 'Round ' }, [roundSel]),
  ]);
  const inspectOut = el('pre', { className: 'mono inspect-out', id: 'sha-inspect', textContent: 'Hash a message to inspect padding, schedule, and rounds.' });
  inspectPanel.append(inspectMeta, inspectOut);

  container.append(title, note, inputPanel, outPanel, inspectPanel);

  function parseInput() {
    const mode = modeSel.value;
    const raw = inputArea.value;
    if (mode === 'hex') {
      const cleaned = raw.replace(/[^0-9a-fA-F]/g, '');
      if (cleaned.length % 2) throw new Error('Hex length must be even');
      return cleaned.length ? decodeHex(cleaned) : new Uint8Array(0);
    }
    return new TextEncoder().encode(raw);
  }

  function runHash() {
    try {
      const bytes = parseInput();
      lastBytes = bytes;
      lastResult = sha256(bytes, { trace: true });
      digestHex.textContent = lastResult.hex;
      meta.textContent =
        `length ${lastResult.messageLength} B · padded ${lastResult.paddedLength} B · ` +
        `${lastResult.blocks} block(s) · digest 32 B`;
      blockSel.textContent = '';
      for (let i = 0; i < lastResult.blocks; i++) {
        blockSel.appendChild(el('option', { value: String(i), textContent: `Block ${i}` }));
      }
      renderInspect();
      onDiagnostic(`SHA-256 digest computed (${lastResult.blocks} block(s)).`, 'ok');
    } catch (e) {
      onDiagnostic(e.message || String(e), 'err');
    }
  }

  function renderInspect() {
    if (!lastResult || !lastBytes) {
      inspectOut.textContent = 'Hash a message first.';
      return;
    }
    const bi = Number(blockSel.value) || 0;
    const rt = Number(roundSel.value) || 0;
    const padded = padMessage(lastBytes);
    const words = parseBlockWords(padded, bi);
    const W = createMessageSchedule(words);
    const bt = lastResult.blockTraces?.[bi];
    const round = bt?.rounds?.[rt];

    const lines = [];
    lines.push(`=== Block ${bi} of ${lastResult.blocks} ===`);
    lines.push(`Padded length: ${padded.length} bytes`);
    lines.push(`Block words W[0..15]:`);
    lines.push(words.map((w, i) => `  W[${i.toString().padStart(2)}] ${hexWord(w)}`).join('\n'));
    lines.push('');
    lines.push(`Schedule sample W[16], W[63]: ${hexWord(W[16])} … ${hexWord(W[63])}`);
    lines.push(`K[${rt}] = ${hexWord(K[rt])}`);
    lines.push('');
    if (round) {
      lines.push(`=== After round ${rt} ===`);
      lines.push(`A ${hexWord(round.a)}  B ${hexWord(round.b)}  C ${hexWord(round.c)}  D ${hexWord(round.d)}`);
      lines.push(`E ${hexWord(round.e)}  F ${hexWord(round.f)}  G ${hexWord(round.g)}  H ${hexWord(round.h)}`);
      lines.push(`T1 ${hexWord(round.T1)}  T2 ${hexWord(round.T2)}  W ${hexWord(round.W)}  K ${hexWord(round.K)}`);
    }
    lines.push('');
    lines.push(`IV: ${IV.map(hexWord).join(' ')}`);
    if (bt?.H) lines.push(`H after block: ${bt.H.map(hexWord).join(' ')}`);
    lines.push(`Final digest: ${lastResult.hex}`);
    inspectOut.textContent = lines.join('\n');
  }

  btnHash.addEventListener('click', runHash);
  btnClear.addEventListener('click', () => {
    inputArea.value = '';
    lastBytes = null;
    lastResult = null;
    digestHex.textContent = '—';
    meta.textContent = '';
    inspectOut.textContent = 'Hash a message to inspect padding, schedule, and rounds.';
    onDiagnostic('SHA-256 Lab cleared.', 'info');
  });
  btnCopy.addEventListener('click', async () => {
    if (!lastResult) return onDiagnostic('Hash first.', 'info');
    try {
      await navigator.clipboard.writeText(lastResult.hex);
      onDiagnostic('Digest copied.', 'ok');
    } catch {
      onDiagnostic('Clipboard unavailable.', 'err');
    }
  });
  btnDl.addEventListener('click', () => {
    if (!lastResult) return onDiagnostic('Hash first.', 'info');
    const blob = new Blob([lastResult.digest], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sha256-digest.bin';
    a.click();
    URL.revokeObjectURL(a.href);
    onDiagnostic('Digest downloaded.', 'ok');
  });
  btnToComputer.addEventListener('click', () => {
    if (!lastBytes) {
      try { lastBytes = parseInput(); } catch (e) {
        return onDiagnostic(e.message, 'err');
      }
    }
    onSendToComputer(lastBytes);
    onDiagnostic(`Sent ${lastBytes.length} byte(s) to Computer Lab.`, 'ok');
  });
  blockSel.addEventListener('change', renderInspect);
  roundSel.addEventListener('change', renderInspect);

  return {
    setBytes(bytes) {
      if (!bytes) return;
      const copy = toUint8Array(bytes);
      lastBytes = copy;
      modeSel.value = 'hex';
      inputArea.value = encodeHex(copy, { separator: ' ' });
      runHash();
    },
    getLastBytes() { return lastBytes ? new Uint8Array(lastBytes) : null; },
    getLastHex() { return lastResult?.hex ?? null; },
  };
}
