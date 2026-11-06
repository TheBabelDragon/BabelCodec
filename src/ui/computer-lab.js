/**
 * Computer Lab — gate-level SHA-256 machine with hardware observability.
 * Driven exclusively by src/computer/Sha256Machine — no parallel mock state.
 */

import {
  createSha256Machine,
  MachineState,
  ExecutionHistory,
  snapshotSha256Machine,
  serializeSnapshot,
} from '../computer/index.js?v=0.5.0';
import { sha256Hex } from '../sha256/index.js?v=0.5.0';
import { createHardwareView } from './hardware-view.js?v=0.5.0';

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

export function createComputerLab(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  const machine = createSha256Machine();
  machine.traceEnabled = true;
  const history = new ExecutionHistory(machine, { maxFrames: 512 });

  let autoTimer = null;
  let hardware = null;

  container.textContent = '';
  container.classList.add('computer-lab');

  const title = el('div', { className: 'panel-title', textContent: 'Computer Lab — hardware observability' });
  const note = el('p', {
    className: 'diag-meta',
    textContent: 'Live schematic + inspection driven by the real Sha256Machine. Add is gate-expanded; Ch/Maj/Σ are behavioral Boolean. Rewind restores full machine state.',
  });

  const inputPanel = el('section', { className: 'panel lab-panel' });
  inputPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Message' }));
  const inputArea = el('textarea', {
    id: 'cpu-input', rows: '2', placeholder: 'Text message (UTF-8)', spellcheck: 'false', className: 'mono',
  });
  inputPanel.appendChild(inputArea);

  const ctrlPanel = el('section', { className: 'panel lab-panel' });
  ctrlPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Execution' }));
  const row1 = el('div', { className: 'btn-row' });
  const btnLoad = el('button', { type: 'button', className: 'btn', textContent: 'Load' });
  const btnClock = el('button', { type: 'button', className: 'btn', textContent: 'Clock' });
  const btnRound = el('button', { type: 'button', className: 'btn', textContent: 'Step round' });
  const btnRun = el('button', { type: 'button', className: 'btn', textContent: 'Run' });
  const btnPause = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Pause' });
  const btnResume = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Resume' });
  const btnReset = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Reset' });
  row1.append(btnLoad, btnClock, btnRound, btnRun, btnPause, btnResume, btnReset);

  const histRow = el('div', { className: 'btn-row' });
  const btnBack = el('button', { type: 'button', className: 'btn btn-ghost', textContent: '◀ Step back' });
  const btnFwd = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Step forward ▶' });
  const btnLive = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Go live' });
  const histStatus = el('span', { className: 'diag-meta', id: 'cpu-hist', textContent: 'history: —' });
  histRow.append(btnBack, btnFwd, btnLive, histStatus);

  const speedRow = el('div', { className: 'btn-row' });
  const speedSel = el('select', { id: 'cpu-speed', 'aria-label': 'Auto step speed' }, [
    el('option', { value: '0', textContent: 'Manual only' }),
    el('option', { value: '500', textContent: 'Auto 2 Hz' }),
    el('option', { value: '200', textContent: 'Auto 5 Hz' }),
    el('option', { value: '50', textContent: 'Auto 20 Hz' }),
  ]);
  speedSel.value = '0';
  const btnAuto = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Start auto-clock' });
  const btnStopAuto = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Stop auto' });
  speedRow.append(el('label', { textContent: 'Speed ' }, [speedSel]), btnAuto, btnStopAuto);
  ctrlPanel.append(row1, histRow, speedRow);

  const statePanel = el('section', { className: 'panel lab-panel' });
  statePanel.appendChild(el('div', { className: 'panel-title', textContent: 'Machine state' }));
  const stateOut = el('pre', { className: 'mono inspect-out', id: 'cpu-state', textContent: 'IDLE' });
  statePanel.appendChild(stateOut);

  const digPanel = el('section', { className: 'panel lab-panel' });
  digPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Digest & independent check' }));
  const digOut = el('div', { className: 'mono digest-hex', id: 'cpu-digest', textContent: '—' });
  const cmpOut = el('div', { className: 'diag-meta', id: 'cpu-cmp', textContent: '' });
  digPanel.append(digOut, cmpOut);

  const tracePanel = el('section', { className: 'panel lab-panel' });
  const traceHead = el('div', { className: 'panel-title' });
  traceHead.appendChild(document.createTextNode('Trace '));
  const btnExport = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Export JSON' });
  traceHead.appendChild(btnExport);
  tracePanel.appendChild(traceHead);
  const traceOut = el('pre', { className: 'mono inspect-out', id: 'cpu-trace', textContent: '—' });
  tracePanel.appendChild(traceOut);

  const hwHost = el('div', { className: 'hw-host' });
  container.append(title, note, inputPanel, ctrlPanel, statePanel, digPanel, hwHost, tracePanel);

  hardware = createHardwareView(hwHost, {
    getMachine: () => machine,
    onSelect: (id) => onDiagnostic(`Selected ${id}`, 'info'),
  });

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  function refresh() {
    const st = machine.getMachineState();
    stateOut.textContent = JSON.stringify(st, null, 2);
    digOut.textContent = st.digestHex || '—';
    if (st.digestHex) {
      try {
        const ref = sha256Hex(inputArea.value);
        cmpOut.textContent = ref === st.digestHex ? '✓ Matches functional engine' : `✗ Mismatch functional=${ref}`;
      } catch { cmpOut.textContent = ''; }
    } else cmpOut.textContent = '';
    const hs = history.status();
    histStatus.textContent = `history: ${hs.index + 1}/${hs.length}${hs.live ? ' (live)' : ''} cycle=${hs.cycle ?? '—'}`;
    const tr = machine.getMachineTrace().slice(-16);
    traceOut.textContent = tr.length ? tr.map((e) => `${e.cycle} ${e.type} ${e.state}`).join('\n') : '—';
    hardware.refresh();
  }

  function afterStep() {
    history.record(snapshotSha256Machine(machine));
    refresh();
  }

  btnLoad.addEventListener('click', () => {
    stopAuto(); history.clear();
    machine.loadMessage(inputArea.value || '');
    history.record(snapshotSha256Machine(machine));
    onDiagnostic(`Loaded message (${machine.messageLength} bytes, ${machine.totalBlocks} blocks)`);
    refresh();
  });
  btnClock.addEventListener('click', () => { history.goLive(); machine.resume(); machine.clock(); afterStep(); });
  btnRound.addEventListener('click', () => { history.goLive(); machine.resume(); machine.stepRound(); afterStep(); });
  btnRun.addEventListener('click', () => {
    stopAuto(); history.goLive(); machine.resume(); machine.runUntilComplete(); afterStep();
    onDiagnostic(machine.state === MachineState.COMPLETE ? 'Complete' : `Stopped: ${machine.state}`);
  });
  btnPause.addEventListener('click', () => { machine.pause(); stopAuto(); refresh(); });
  btnResume.addEventListener('click', () => { machine.resume(); refresh(); });
  btnReset.addEventListener('click', () => { stopAuto(); history.clear(); machine.reset(); onDiagnostic('Reset'); refresh(); });
  btnBack.addEventListener('click', () => { stopAuto(); if (history.stepBack()) { onDiagnostic('Stepped back', 'info'); refresh(); } });
  btnFwd.addEventListener('click', () => { if (history.stepForward()) { onDiagnostic('Stepped forward', 'info'); refresh(); } });
  btnLive.addEventListener('click', () => { history.goLive(); refresh(); });
  btnAuto.addEventListener('click', () => {
    stopAuto();
    const ms = Number(speedSel.value);
    if (!ms) return;
    history.goLive(); machine.resume();
    autoTimer = setInterval(() => {
      if (machine.paused || machine.state === MachineState.COMPLETE || machine.state === MachineState.ERROR) {
        stopAuto(); refresh(); return;
      }
      machine.clock(); afterStep();
    }, ms);
  });
  btnStopAuto.addEventListener('click', () => { stopAuto(); refresh(); });
  btnExport.addEventListener('click', () => {
    const payload = {
      trace: machine.getMachineTrace(),
      history: JSON.parse(history.exportJSON()),
      snapshot: JSON.parse(serializeSnapshot(snapshotSha256Machine(machine))),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'babelcodec-machine-trace.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function loadBytes(bytesOrText) {
    stopAuto(); history.clear();
    if (typeof bytesOrText === 'string') {
      inputArea.value = bytesOrText;
      machine.loadMessage(bytesOrText);
    } else {
      inputArea.value = '';
      machine.loadMessage(bytesOrText);
    }
    history.record(snapshotSha256Machine(machine));
    refresh();
  }

  refresh();
  return { machine, loadBytes, refresh };
}
