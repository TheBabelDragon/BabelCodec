/**
 * Computer Lab — interactive SHA-256 workbench.
 * All controls drive the real Sha256Machine via architecture adapters.
 */

import {
  createSha256Machine,
  MachineState,
  ExecutionHistory,
  snapshotSha256Machine,
  createSha256ArchitectureAdapter,
  InteractionController,
  BranchingHistory,
  ExecutionScheduler,
} from '../computer/index.js?v=0.8.0';
import { sha256Hex } from '../sha256/index.js?v=0.8.0';
import { createHardwareView } from './hardware-view.js?v=0.8.0';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'hidden') { if (v) node.hidden = true; }
    else if (k === 'value') node.value = v;
    else if (k === 'disabled') node.disabled = !!v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function bigJson(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

export function createComputerLab(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  const machine = createSha256Machine();
  machine.traceEnabled = true;
  const arch = createSha256ArchitectureAdapter(machine);
  const interaction = new InteractionController(arch, { origin: 'computer-lab' });
  const history = new ExecutionHistory(machine, { maxFrames: 512 });
  const branchHist = new BranchingHistory(machine, { adapter: arch });
  const scheduler = new ExecutionScheduler(machine, {
    history,
    onCycle: () => refresh(),
    onStop: (reason) => { onDiagnostic(`Stopped: ${reason}`, 'info'); refresh(); },
  });

  let autoTimer = null;
  let hardware = null;
  let memPage = 0;
  const MEM_PAGE_SIZE = 16;

  container.textContent = '';
  container.classList.add('computer-lab', 'workbench');
  container.appendChild(el('div', { className: 'panel-title', textContent: 'Computer Lab — interactive workbench' }));
  container.appendChild(el('p', {
    className: 'diag-meta',
    textContent: 'Real gate-level SHA-256 machine. Writes use the interaction layer (K is protected). History rewinds actual machine state.',
  }));

  const inputPanel = el('section', { className: 'panel lab-panel' });
  inputPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Message' }));
  const inputArea = el('textarea', { rows: '2', placeholder: 'UTF-8 message (e.g. abc)', spellcheck: 'false', className: 'mono' });
  inputArea.value = 'abc';
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
  const btnBack = el('button', { type: 'button', className: 'btn btn-ghost', textContent: '\u25c0 Back' });
  const btnFwd = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Forward \u25b6' });
  const btnLive = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Go live' });
  const btnBranch = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Branch here' });
  const histStatus = el('span', { className: 'diag-meta', textContent: 'history: \u2014' });
  histRow.append(btnBack, btnFwd, btnLive, btnBranch, histStatus);

  const speedRow = el('div', { className: 'btn-row' });
  const speedSel = el('select', { className: 'mono' });
  for (const [v, l] of [['0', 'Manual'], ['50', 'Fast'], ['200', 'Medium'], ['500', 'Slow']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = l; speedSel.appendChild(o);
  }
  const btnAuto = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Auto-clock' });
  const btnStopAuto = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Stop auto' });
  const stateBadge = el('span', { className: 'diag-meta workbench-state', textContent: 'state: IDLE' });
  speedRow.append(el('label', { textContent: 'Speed ' }, [speedSel]), btnAuto, btnStopAuto, stateBadge);
  ctrlPanel.append(row1, histRow, speedRow);

  const hwPanel = el('section', { className: 'panel lab-panel' });
  hwPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Hardware schematic' }));
  const hwRoot = el('div', { className: 'hardware-root' });
  hwPanel.appendChild(hwRoot);

  const regPanel = el('section', { className: 'panel lab-panel' });
  regPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Registers (A\u2013H)' }));
  const regGrid = el('div', { className: 'reg-grid' });
  regPanel.appendChild(regGrid);
  const regWriteRow = el('div', { className: 'btn-row' });
  const regSel = el('select', { className: 'mono' });
  for (const r of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    const o = document.createElement('option'); o.value = r; o.textContent = r; regSel.appendChild(o);
  }
  const regVal = el('input', { type: 'text', className: 'mono', value: '0x0' });
  const btnWriteReg = el('button', { type: 'button', className: 'btn', textContent: 'Write register' });
  regWriteRow.append(regSel, regVal, btnWriteReg);
  regPanel.appendChild(regWriteRow);

  const memPanel = el('section', { className: 'panel lab-panel' });
  memPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Memory explorer' }));
  const memCtrl = el('div', { className: 'btn-row' });
  const memSel = el('select', { className: 'mono' });
  for (const m of [['W', 'W schedule (rw)'], ['H', 'H hash state (rw)'], ['K', 'K constants (ro)']]) {
    const o = document.createElement('option'); o.value = m[0]; o.textContent = m[1]; memSel.appendChild(o);
  }
  const btnMemPrev = el('button', { type: 'button', className: 'btn btn-ghost', textContent: '\u25c0 Page' });
  const btnMemNext = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Page \u25b6' });
  const memPageLabel = el('span', { className: 'diag-meta', textContent: 'page 0' });
  memCtrl.append(memSel, btnMemPrev, btnMemNext, memPageLabel);
  const memTable = el('pre', { className: 'mono inspect-out mem-table', textContent: '\u2014' });
  const memWriteRow = el('div', { className: 'btn-row' });
  const memIdx = el('input', { type: 'number', className: 'mono', value: '0', min: '0' });
  const memVal = el('input', { type: 'text', className: 'mono', value: '0x0' });
  const btnWriteMem = el('button', { type: 'button', className: 'btn', textContent: 'Write word' });
  memWriteRow.append(el('span', { className: 'diag-meta', textContent: 'idx' }), memIdx, memVal, btnWriteMem);
  memPanel.append(memCtrl, memTable, memWriteRow);

  const busPanel = el('section', { className: 'panel lab-panel' });
  busPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Buses & digest' }));
  const busOut = el('pre', { className: 'mono inspect-out', textContent: '\u2014' });
  const cmpOut = el('div', { className: 'diag-meta', textContent: '' });
  busPanel.append(busOut, cmpOut);

  const dbgPanel = el('section', { className: 'panel lab-panel' });
  dbgPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Breakpoints / watchpoints' }));
  const dbgRow = el('div', { className: 'btn-row' });
  const bpCycle = el('input', { type: 'number', className: 'mono', value: '10', min: '0' });
  const btnBp = el('button', { type: 'button', className: 'btn', textContent: 'Add cycle BP' });
  const btnWpA = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Watch A' });
  const btnSchedRun = el('button', { type: 'button', className: 'btn', textContent: 'Scheduler run' });
  const btnSchedStop = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Stop' });
  dbgRow.append(bpCycle, btnBp, btnWpA, btnSchedRun, btnSchedStop);
  const dbgOut = el('pre', { className: 'mono inspect-out', textContent: 'No breakpoints' });
  dbgPanel.append(dbgRow, dbgOut);

  const auditPanel = el('section', { className: 'panel lab-panel' });
  auditPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Mutation audit / export' }));
  const auditOut = el('pre', { className: 'mono inspect-out', textContent: '\u2014' });
  const btnExport = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Export trace JSON' });
  auditPanel.append(auditOut, btnExport);

  const workspace = el('div', { className: 'workbench-grid' });
  workspace.append(regPanel, memPanel, busPanel, dbgPanel);
  container.append(inputPanel, ctrlPanel, hwPanel, workspace, auditPanel);

  // hardware-view requires getMachine(); passing the machine object alone is not enough
  hardware = createHardwareView(hwRoot, {
    getMachine: () => machine,
    onSelect: () => {},
  });

  function stopAuto() { if (autoTimer != null) { clearInterval(autoTimer); autoTimer = null; } }

  function renderRegs() {
    regGrid.textContent = '';
    for (const r of arch.listRegisters()) {
      const cell = el('div', { className: 'reg-cell' });
      cell.appendChild(el('span', { className: 'reg-label', textContent: r.label }));
      cell.appendChild(el('span', { className: 'reg-hex mono', textContent: r.hex }));
      regGrid.appendChild(cell);
    }
  }

  function renderMemory() {
    const id = memSel.value;
    const meta = arch.getMetadata().memories.find((m) => m.id === id);
    const size = meta?.size ?? 64;
    const maxPage = Math.max(0, Math.ceil(size / MEM_PAGE_SIZE) - 1);
    if (memPage > maxPage) memPage = maxPage;
    memPageLabel.textContent = `page ${memPage}/${maxPage} · ${meta?.access || '?'}${meta?.constant ? ' · constant' : ''}`;
    const start = memPage * MEM_PAGE_SIZE;
    const lines = [];
    for (let i = start; i < Math.min(start + MEM_PAGE_SIZE, size); i++) {
      try {
        const w = arch.readMemory(id, i);
        lines.push(`[${String(i).padStart(2, '0')}] ${w.hex}`);
      } catch { lines.push(`[${String(i).padStart(2, '0')}] \u2014`); }
    }
    memTable.textContent = lines.join('\n') || '\u2014';
  }

  function renderBuses() {
    const st = arch.getState();
    const dig = st.digest || machine.digestHex || '';
    busOut.textContent = [
      `T1=${st.buses?.T1 ?? '—'}  T2=${st.buses?.T2 ?? '—'}`,
      `W=${st.buses?.W ?? '—'}  K=${st.buses?.K ?? '—'}`,
      dig ? `digest ${dig}` : '',
    ].filter(Boolean).join('\n');
    if (dig && inputArea.value != null) {
      try {
        const expected = sha256Hex(inputArea.value);
        cmpOut.textContent = dig.toLowerCase() === expected.toLowerCase() ? 'digest matches functional SHA-256' : `functional=${expected}`;
      } catch { cmpOut.textContent = ''; }
    }
  }

  function renderDbg() {
    const bps = scheduler.listBreakpoints?.() || [];
    const wps = scheduler.listWatchpoints?.() || [];
    dbgOut.textContent = [
      `breakpoints: ${bps.length ? bps.map((b) => `${b.id} ${b.type}`).join('; ') : 'none'}`,
      `watchpoints: ${wps.length ? wps.map((w) => `${w.id} ${w.kind}:${w.target}`).join('; ') : 'none'}`,
      `scheduler running: ${scheduler.isRunning?.() ? 'yes' : 'no'}`,
    ].join('\n');
  }

  function refresh() {
    const st = arch.getState();
    stateBadge.textContent = `state: ${st.state} · cycle ${st.cycle}`;
    renderRegs(); renderMemory(); renderBuses(); renderDbg();
    const hs = history.status?.() || {};
    histStatus.textContent = `history: ${(hs.index ?? 0) + 1}/${hs.length ?? 0}${hs.live ? ' (live)' : ''} · branches ${branchHist.listBranches().length}`;
    const audit = interaction.getAudit().slice(-5);
    auditOut.textContent = audit.length ? audit.map((e) => `${e.operation} ${e.componentId} ok=${e.validation.ok}`).join('\n') : 'No mutations yet';
    try {
      if (hardware?.refresh) hardware.refresh();
    } catch (err) {
      onDiagnostic(`Hardware view: ${err && err.message ? err.message : err}`, 'err');
    }
  }

  function afterStep() {
    history.record(snapshotSha256Machine(machine));
    branchHist.record({ kind: 'step' });
    refresh();
  }

  btnLoad.addEventListener('click', () => {
    stopAuto(); history.clear(); branchHist.clear(); interaction.clearAudit();
    machine.loadMessage(inputArea.value || '');
    history.record(snapshotSha256Machine(machine));
    branchHist.record({ kind: 'load' });
    onDiagnostic(`Loaded (${machine.messageLength} bytes, ${machine.totalBlocks} blocks)`, 'ok');
    refresh();
  });
  btnClock.addEventListener('click', () => { history.goLive?.(); machine.resume?.(); machine.clock(); afterStep(); });
  btnRound.addEventListener('click', () => { history.goLive?.(); machine.resume?.(); machine.stepRound(); afterStep(); });
  btnRun.addEventListener('click', () => {
    stopAuto(); history.goLive?.(); machine.resume?.(); machine.runUntilComplete(); afterStep();
    onDiagnostic(machine.state === MachineState.COMPLETE || machine.state === 'COMPLETE' ? 'Complete' : `Stopped: ${machine.state}`, 'ok');
  });
  btnPause.addEventListener('click', () => { machine.pause?.(); machine.paused = true; stopAuto(); scheduler.stop?.('pause'); refresh(); });
  btnResume.addEventListener('click', () => { machine.resume?.(); machine.paused = false; refresh(); });
  btnReset.addEventListener('click', () => { stopAuto(); history.clear(); branchHist.clear(); machine.reset(); onDiagnostic('Reset'); refresh(); });
  btnBack.addEventListener('click', () => { stopAuto(); if (history.stepBack?.()) { onDiagnostic('Stepped back', 'info'); refresh(); } });
  btnFwd.addEventListener('click', () => { if (history.stepForward?.()) { onDiagnostic('Stepped forward', 'info'); refresh(); } });
  btnLive.addEventListener('click', () => { history.goLive?.(); refresh(); });
  btnBranch.addEventListener('click', () => {
    const br = branchHist.activeBranch;
    if (!br?.frames?.length) { onDiagnostic('Nothing to branch from', 'info'); return; }
    const r = branchHist.branchFrom(Math.max(0, br.frames.length - 1), `branch@${machine.cycle}`);
    onDiagnostic(r.ok ? `Branched ${r.branchId}` : r.message, r.ok ? 'ok' : 'err');
    refresh();
  });
  btnAuto.addEventListener('click', () => {
    stopAuto();
    const ms = parseInt(speedSel.value, 10) || 0;
    if (!ms) { onDiagnostic('Select a non-manual speed', 'info'); return; }
    autoTimer = setInterval(() => {
      if (machine.state === MachineState.COMPLETE || machine.state === 'COMPLETE' || machine.paused) { stopAuto(); refresh(); return; }
      history.goLive?.(); machine.resume?.(); machine.clock(); afterStep();
    }, ms);
  });
  btnStopAuto.addEventListener('click', () => { stopAuto(); refresh(); });
  btnWriteReg.addEventListener('click', () => {
    const r = interaction.writeRegister(regSel.value, regVal.value);
    onDiagnostic(r.ok ? `Wrote ${regSel.value}` : r.message, r.ok ? 'ok' : 'err');
    refresh();
  });
  btnWriteMem.addEventListener('click', () => {
    const r = interaction.writeMemory(memSel.value, parseInt(memIdx.value, 10) || 0, memVal.value);
    onDiagnostic(r.ok ? `Wrote ${memSel.value}[${memIdx.value}]` : r.message, r.ok ? 'ok' : 'err');
    refresh();
  });
  btnMemPrev.addEventListener('click', () => { memPage = Math.max(0, memPage - 1); refresh(); });
  btnMemNext.addEventListener('click', () => { memPage += 1; refresh(); });
  memSel.addEventListener('change', () => { memPage = 0; refresh(); });
  btnBp.addEventListener('click', () => {
    scheduler.addBreakpoint?.({ type: 'cycle', cycle: parseInt(bpCycle.value, 10) || 0 });
    refresh();
  });
  btnWpA.addEventListener('click', () => {
    scheduler.addWatchpoint?.({ kind: 'register', target: 'A' });
    refresh();
  });
  btnSchedRun.addEventListener('click', () => { scheduler.run?.(); refresh(); });
  btnSchedStop.addEventListener('click', () => { scheduler.stop?.('user'); refresh(); });
  btnExport.addEventListener('click', () => {
    const blob = new Blob([bigJson({ audit: interaction.getAudit(), history: history.export?.() })], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'computer-trace.json';
    a.click();
  });

  function loadBytes(bytesOrText) {
    stopAuto(); history.clear(); branchHist.clear();
    if (typeof bytesOrText === 'string') { inputArea.value = bytesOrText; machine.loadMessage(bytesOrText); }
    else { inputArea.value = ''; machine.loadMessage(bytesOrText); }
    history.record(snapshotSha256Machine(machine));
    branchHist.record({ kind: 'load' });
    refresh();
  }

  machine.loadMessage(inputArea.value);
  history.record(snapshotSha256Machine(machine));
  branchHist.record({ kind: 'init' });
  refresh();

  return { machine, loadBytes, refresh, architecture: arch, interaction, scheduler, branchHistory: branchHist };
}
