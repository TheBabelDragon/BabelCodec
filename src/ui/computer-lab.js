/**
 * Computer Lab — gate-level SHA-256 machine (clocked datapath).
 * Driven exclusively by src/computer/Sha256Machine — no parallel mock state.
 */

import {
  createSha256Machine,
  MachineState,
} from '../computer/index.js?v=0.4.0';
import { wordToHex } from '../sha256/arithmetic.js?v=0.4.0';
import { encodeHex } from '../core/hex.js?v=0.4.0';
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

function hx(w) {
  return wordToHex(w ?? 0n);
}

/**
 * @param {HTMLElement} container
 * @param {{ onDiagnostic?: (msg: string, kind?: string) => void }} opts
 */
export function createComputerLab(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  const machine = createSha256Machine();
  machine.traceEnabled = true;

  let autoTimer = null;
  let autoMs = 200;

  container.textContent = '';
  container.classList.add('computer-lab');

  const title = el('div', { className: 'panel-title', textContent: 'Computer Lab (gate-level SHA-256 machine)' });
  const note = el('p', {
    className: 'diag-meta',
    textContent: 'Clocked machine: full adders → ripple-carry → registers. Digests must match the functional engine independently.',
  });

  const inputPanel = el('section', { className: 'panel lab-panel' });
  inputPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Message' }));
  const inputArea = el('textarea', {
    id: 'cpu-input',
    rows: '2',
    placeholder: 'Text message (UTF-8)',
    spellcheck: 'false',
    className: 'mono',
  });
  inputPanel.appendChild(inputArea);

  const ctrlPanel = el('section', { className: 'panel lab-panel' });
  ctrlPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Controls' }));
  const row1 = el('div', { className: 'btn-row' });
  const btnLoad = el('button', { type: 'button', className: 'btn', textContent: 'Load message' });
  const btnClock = el('button', { type: 'button', className: 'btn', textContent: 'Clock' });
  const btnRound = el('button', { type: 'button', className: 'btn', textContent: 'Step round' });
  const btnRun = el('button', { type: 'button', className: 'btn', textContent: 'Run to complete' });
  const btnPause = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Pause' });
  const btnResume = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Resume' });
  const btnReset = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Reset' });
  row1.append(btnLoad, btnClock, btnRound, btnRun, btnPause, btnResume, btnReset);

  const speedRow = el('div', { className: 'btn-row' });
  const speedSel = el('select', { id: 'cpu-speed', 'aria-label': 'Auto step speed' }, [
    el('option', { value: '0', textContent: 'Manual only' }),
    el('option', { value: '500', textContent: 'Auto 2 Hz' }),
    el('option', { value: '200', textContent: 'Auto 5 Hz', selected: 'selected' }),
    el('option', { value: '50', textContent: 'Auto 20 Hz' }),
  ]);
  const btnAuto = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Start auto-clock' });
  const btnStopAuto = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Stop auto' });
  speedRow.append(
    el('label', { textContent: 'Speed ' }, [speedSel]),
    btnAuto,
    btnStopAuto,
  );
  ctrlPanel.append(row1, speedRow);

  const statePanel = el('section', { className: 'panel lab-panel' });
  statePanel.appendChild(el('div', { className: 'panel-title', textContent: 'Machine state' }));
  const stateOut = el('pre', { className: 'mono inspect-out', id: 'cpu-state', textContent: 'IDLE' });
  statePanel.appendChild(stateOut);

  const regPanel = el('section', { className: 'panel lab-panel' });
  regPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Registers & buses' }));
  const regOut = el('pre', { className: 'mono inspect-out', id: 'cpu-regs', textContent: '—' });
  regPanel.appendChild(regOut);

  const digPanel = el('section', { className: 'panel lab-panel' });
  digPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Digest (when COMPLETE)' }));
  const digOut = el('div', { className: 'mono digest-hex', id: 'cpu-digest', textContent: '—' });
  digPanel.appendChild(digOut);

  const tracePanel = el('section', { className: 'panel lab-panel' });
  tracePanel.appendChild(el('div', { className: 'panel-title', textContent: 'Trace (last 12 events)' }));
  const traceOut = el('pre', { className: 'mono inspect-out', id: 'cpu-trace', textContent: '—' });
  tracePanel.appendChild(traceOut);

  container.append(title, note, inputPanel, ctrlPanel, statePanel, regPanel, digPanel, tracePanel);

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  function refresh() {
    const st = machine.getMachineState();
    const snap = machine.getRegisterSnapshot();
    const sig = machine.getSignalSnapshot();
    const lines = [
      `state: ${st.state}`,
      `cycle: ${st.cycle}  block: ${st.blockIndex}/${st.totalBlocks}  round: ${st.round}`,
      `messageLength: ${st.messageLength}  paused: ${st.paused}`,
    ];
    if (st.error) lines.push(`error: ${st.error}`);
    stateOut.textContent = lines.join('\n');

    const w = snap.working;
    const regLines = [
      `A ${hx(w.A)}  B ${hx(w.B)}  C ${hx(w.C)}  D ${hx(w.D)}`,
      `E ${hx(w.E)}  F ${hx(w.F)}  G ${hx(w.G)}  H ${hx(w.H)}`,
      `T1 ${hx(snap.T1)}  T2 ${hx(snap.T2)}  W ${hx(snap.W)}  K ${hx(snap.K)}`,
      `H[0..7]: ${snap.hash.map(hx).join(' ')}`,
    ];
    if (sig) {
      regLines.push(`last signals: round=${sig.round} T1=${hx(sig.T1)} T2=${hx(sig.T2)}`);
    }
    regOut.textContent = regLines.join('\n');

    digOut.textContent = st.digestHex || (st.state === MachineState.COMPLETE ? machine.getDigestHex() : '—');

    const tr = machine.getMachineTrace().slice(-12);
    traceOut.textContent = tr.length
      ? tr.map((e) => `c${e.cycle} ${e.state} ${e.type}`).join('\n')
      : '—';
  }

  function loadMsg(bytesOrText) {
    stopAuto();
    machine.reset();
    machine.loadMessage(bytesOrText);
    refresh();
    onDiagnostic(`Machine loaded (${machine.messageLength} B, ${machine.totalBlocks} block(s)).`, 'ok');
  }

  btnLoad.addEventListener('click', () => {
    try {
      loadMsg(inputArea.value);
    } catch (e) {
      onDiagnostic(e.message || String(e), 'err');
    }
  });
  btnClock.addEventListener('click', () => {
    machine.clock();
    refresh();
  });
  btnRound.addEventListener('click', () => {
    machine.stepRound();
    refresh();
  });
  btnRun.addEventListener('click', () => {
    stopAuto();
    machine.resume();
    machine.runUntilComplete();
    refresh();
    const st = machine.getMachineState();
    if (st.state === MachineState.COMPLETE) {
      onDiagnostic(`COMPLETE · digest ${st.digestHex}`, 'ok');
    } else if (st.error) {
      onDiagnostic(st.error, 'err');
    }
  });
  btnPause.addEventListener('click', () => {
    machine.pause();
    stopAuto();
    refresh();
    onDiagnostic('Paused.', 'info');
  });
  btnResume.addEventListener('click', () => {
    machine.resume();
    refresh();
  });
  btnReset.addEventListener('click', () => {
    stopAuto();
    machine.reset();
    refresh();
    onDiagnostic('Machine reset.', 'info');
  });
  btnAuto.addEventListener('click', () => {
    stopAuto();
    const ms = Number(speedSel.value);
    if (!ms) {
      onDiagnostic('Select a non-manual speed for auto-clock.', 'info');
      return;
    }
    autoMs = ms;
    machine.resume();
    autoTimer = setInterval(() => {
      if (machine.state === MachineState.COMPLETE || machine.state === MachineState.ERROR || machine.paused) {
        stopAuto();
        refresh();
        return;
      }
      machine.clock();
      refresh();
    }, autoMs);
    onDiagnostic(`Auto-clock ${1000 / autoMs} Hz.`, 'info');
  });
  btnStopAuto.addEventListener('click', () => {
    stopAuto();
    onDiagnostic('Auto-clock stopped.', 'info');
  });

  refresh();

  return {
    /** Accept bytes from SHA-256 Lab / inspector. */
    loadBytes(bytes) {
      const b = toUint8Array(bytes);
      inputArea.value = encodeHex(b, { separator: ' ' });
      loadMsg(b);
    },
    getMachine() { return machine; },
    refresh,
  };
}
