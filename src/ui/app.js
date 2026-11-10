/**
 * BabelCodec application shell — tabs, file load, diagnostics.
 */

import * as BC from '../api/babelcodec.js?v=0.7.0';
import { createInspectorView } from './inspector-view.js?v=0.7.0';
import { createStructureView } from './structure-view.js?v=0.7.0';
import { createLogicView } from './logic-view.js?v=0.7.0';
import { createSha256Lab } from './sha256-lab.js?v=0.7.0';
import { createComputerLab } from './computer-lab.js?v=0.7.0';
import { createTextLab } from './text-lab.js?v=0.7.0';
import { createCpuLab } from './cpu-lab.js?v=0.7.0';
import { createMediaLab } from './media-lab.js?v=0.11.2';

function $(sel, root = document) {
  return root.querySelector(sel);
}

function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

const els = {
  viewConverter: $('#view-converter'),
  viewInspector: $('#view-inspector'),
  viewStructure: $('#view-structure'),
  viewLogic: $('#view-logic'),
  viewSha256: $('#view-sha256'),
  viewComputer: $('#view-computer'),
  viewCpu: $('#view-cpu'),
  viewText: $('#view-text'),
  viewMedia: $('#view-media'),
  diagnostics: $('#diagnostics'),
  fileMeta: $('#file-meta'),
  fileInput: $('#file-input'),
  btnLoad: $('#btn-load'),
};

let mediaView = null;
let currentBytes = null;

function setDiagnostic(msg, level = 'info') {
  if (!els.diagnostics) return;
  const span = document.createElement('span');
  span.className = level === 'error' ? 'diag-error' : level === 'warn' ? 'diag-warn' : 'diag-info';
  span.textContent = msg || 'Ready.';
  els.diagnostics.replaceChildren(span);
}

function activateTab(name) {
  $$('.tab-btn').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (els.viewConverter) els.viewConverter.hidden = name !== 'converter';
  if (els.viewInspector) els.viewInspector.hidden = name !== 'inspector';
  if (els.viewStructure) els.viewStructure.hidden = name !== 'structure';
  if (els.viewLogic) els.viewLogic.hidden = name !== 'logic';
  if (els.viewSha256) els.viewSha256.hidden = name !== 'sha256';
  if (els.viewComputer) els.viewComputer.hidden = name !== 'computer';
  if (els.viewCpu) els.viewCpu.hidden = name !== 'cpu';
  if (els.viewText) els.viewText.hidden = name !== 'text';
  if (els.viewMedia) els.viewMedia.hidden = name !== 'media';
  if (name === 'media' && mediaView?.refresh) mediaView.refresh();
}

function ensureMedia() {
  if (mediaView || !els.viewMedia) return mediaView;
  const root = $('#media-root');
  if (!root) return null;
  mediaView = createMediaLab(root, {
    onDiagnostic: setDiagnostic,
    onBytes: (b) => {
      currentBytes = b;
    },
    onNavigate: (tab) => activateTab(tab),
  });
  return mediaView;
}

$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'media') ensureMedia();
    activateTab(tab);
  });
});

if (els.btnLoad && els.fileInput) {
  els.btnLoad.addEventListener('click', () => els.fileInput.click());
}

// Boot Image Studio shell when media root exists so Create is ready on first visit
if ($('#media-root')) {
  ensureMedia();
}

setDiagnostic('Ready.');
