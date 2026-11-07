/**
 * CPU Lab — educational 32-bit CPU with assembler and debugger.
 */

import {
  createCpuMachine,
  assemble,
  EXAMPLES,
  CpuState,
  decode,
} from '../cpu/index.js?v=0.7.0';

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

export function createCpuLab(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  const machine = createCpuMachine();
  machine.traceEnabled = true;

  container.textContent = '';
  container.classList.add('cpu-lab');

  container.appendChild(el('div', { className: 'panel-title', textContent: 'CPU Lab — educational 32-bit processor' }));
  container.appendChild(el('p', {
    className: 'diag-meta',
    textContent: 'Harvard architecture · R0=0 · 16 GPRs · LE data RAM · assemble → load → step/run real encoded instructions.',
  }));

  const editorPanel = el('section', { className: 'panel lab-panel' });
  editorPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Assembly' }));
  const source = el('textarea', { className: 'mono', rows: '12', spellcheck: 'false' });
  source.value = EXAMPLES.arithmetic;
  editorPanel.appendChild(source);

  const exRow = el('div', { className: 'btn-row' });
  for (const [key, label] of [['arithmetic', 'Example: arithmetic'], ['loop', 'Example: loop'], ['memory', 'Example: memory']]) {
    const b = el('button', { type: 'button', className: 'btn btn-ghost', textContent: label });
    b.addEventListener('click', () => { source.value = EXAMPLES[key]; onDiagnostic(`Loaded ${key} example`); });
    exRow.appendChild(b);
  }
  editorPanel.appendChild(exRow);

  const ctrl = el('section', { className: 'panel lab-panel' });
  ctrl.appendChild(el('div', { className: 'panel-title', textContent: 'Execution' }));
  const row = el('div', { className: 'btn-row' });
  const btnAsm = el('button', { type: 'button', className: 'btn', textContent: 'Assemble' });
  const btnLoad = el('button', { type: 'button', className: 'btn', textContent: 'Load program' });
  const btnStep = el('button', { type: 'button', className: 'btn', textContent: 'Step instruction' });
  const btnClock = el('button', { type: 'button', className: 'btn', textContent: 'Clock' });
  const btnRun = el('button', { type: 'button', className: 'btn', textContent: 'Run' });
  const btnReset = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Reset' });
  row.append(btnAsm, btnLoad, btnStep, btnClock, btnRun, btnReset);
  ctrl.appendChild(row);

  const listPanel = el('section', { className: 'panel lab-panel' });
  listPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Listing / diagnostics' }));
  const listOut = el('pre', { className: 'mono inspect-out', textContent: '—' });
  listPanel.appendChild(listOut);

  const statePanel = el('section', { className: 'panel lab-panel' });
  statePanel.appendChild(el('div', { className: 'panel-title', textContent: 'Registers & state' }));
  const stateOut = el('pre', { className: 'mono inspect-out', textContent: '—' });
  statePanel.appendChild(stateOut);

  container.append(editorPanel, ctrl, listPanel, statePanel);

  let lastWords = [];

  function refresh() {
    const st = machine.getMachineState();
    const regs = machine.getRegisterSnapshot().map((r) => `${r.label}=${r.hex}`).join('  ');
    const ir = decode(machine.ir);
    stateOut.textContent = [
      `state=${st.state} cycle=${st.cycle} pc=${st.pc} halted=${st.halted}`,
      `flags z=${st.flags.z} n=${st.flags.n} c=${st.flags.c}`,
      `IR ${ir.name} rd=${ir.rd} rs=${ir.rs} rt=${ir.rt} imm=${ir.imm} off=${ir.offset}`,
      regs,
      machine.error ? `error: ${machine.error}` : '',
    ].filter(Boolean).join('\n');
  }

  btnAsm.addEventListener('click', () => {
    const result = assemble(source.value);
    if (!result.ok) {
      listOut.textContent = result.errors.map((e) => `L${e.line}: ${e.message}${e.token ? ` (${e.token})` : ''}`).join('\n');
      onDiagnostic('Assemble failed', 'err');
      return;
    }
    lastWords = result.words;
    listOut.textContent = result.listing.map((l) => l.text).join('\n') || '(empty)';
    onDiagnostic(`Assembled ${result.words.length} instruction(s)`, 'ok');
  });

  btnLoad.addEventListener('click', () => {
    const result = assemble(source.value);
    if (!result.ok) {
      listOut.textContent = result.errors.map((e) => `L${e.line}: ${e.message}`).join('\n');
      onDiagnostic('Assemble failed', 'err');
      return;
    }
    lastWords = result.words;
    machine.loadProgram(result.words);
    listOut.textContent = result.listing.map((l) => l.text).join('\n');
    onDiagnostic(`Loaded ${result.words.length} word(s)`, 'ok');
    refresh();
  });

  btnStep.addEventListener('click', () => {
    machine.resume();
    if (machine.state === CpuState.IDLE && lastWords.length) machine.loadProgram(lastWords);
    machine.stepInstruction();
    refresh();
  });

  btnClock.addEventListener('click', () => {
    machine.resume();
    if (machine.state === CpuState.IDLE && lastWords.length) machine.loadProgram(lastWords);
    machine.clock();
    refresh();
  });

  btnRun.addEventListener('click', () => {
    machine.resume();
    if (machine.state === CpuState.IDLE && lastWords.length) machine.loadProgram(lastWords);
    machine.runUntilHalt();
    refresh();
    onDiagnostic(machine.halted ? 'Halted' : machine.state, machine.halted ? 'ok' : 'info');
  });

  btnReset.addEventListener('click', () => { machine.reset(); refresh(); onDiagnostic('Reset'); });

  refresh();
  return { machine, refresh };
}
