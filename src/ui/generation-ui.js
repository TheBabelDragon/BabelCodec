/**
 * Image Generation workspace — first-class mode inside Image Studio.
 * Dark creative workstation UI. Offline mock by default.
 */

import {
  ensureGenerationDefaults,
  submitGeneration,
  awaitJob,
  cancelGeneration,
  listJobs,
  getJob,
  discoverTpuCapabilities,
  discoverProviderCapabilities,
  listProviderIds,
  JOB_STATES,
} from '../media/generation/index.js';

/**
 * Build the Generate panel into `panel`.
 * @param {HTMLElement} panel
 * @param {{
 *   el: Function,
 *   btn: Function,
 *   setStatus: Function,
 *   notifyBytes: Function,
 *   onNavigate: Function,
 * }} ctx
 */
export function buildGeneratePanel(panel, ctx) {
  const { el, btn, setStatus, notifyBytes } = ctx;

  ensureGenerationDefaults();

  /** @type {string|null} */
  let activeJobId = null;
  /** @type {string[]} */
  let galleryUrls = [];

  // —— layout ——
  const layout = el('div', 'gen-layout');
  const controls = el('div', 'gen-controls');
  const previewCol = el('div', 'gen-preview-col');
  const sideCol = el('div', 'gen-side-col');

  // Prompt
  const promptLabel = el('label', 'gen-label');
  promptLabel.textContent = 'Prompt';
  const promptArea = el('textarea', 'gen-prompt');
  promptArea.rows = 4;
  promptArea.placeholder = 'Describe the image you want to create…';
  promptArea.value = 'A refined geometric emblem on deep charcoal, subtle cyan accents';

  const negLabel = el('label', 'gen-label');
  negLabel.textContent = 'Negative prompt (optional)';
  const negArea = el('textarea', 'gen-prompt gen-prompt-neg');
  negArea.rows = 2;
  negArea.placeholder = 'Elements to avoid…';

  // Provider / model
  const providerSelect = el('select', 'studio-select gen-select');
  const modelSelect = el('select', 'studio-select gen-select');

  // TPU status
  const tpuStatus = el('div', 'gen-tpu-status');
  tpuStatus.textContent = 'TPU: checking…';

  // Dimensions
  const dimRow = el('div', 'gen-dim-row');
  const wInput = numInput(512);
  const hInput = numInput(512);
  const aspectSelect = el('select', 'studio-select gen-select');
  for (const [v, t] of [
    ['1:1', '1:1'],
    ['16:9', '16:9'],
    ['9:16', '9:16'],
    ['4:3', '4:3'],
    ['custom', 'Custom'],
  ]) {
    const o = el('option');
    o.value = v;
    o.textContent = t;
    aspectSelect.appendChild(o);
  }
  aspectSelect.addEventListener('change', () => {
    const a = aspectSelect.value;
    if (a === '1:1') {
      wInput.value = '512';
      hInput.value = '512';
    } else if (a === '16:9') {
      wInput.value = '768';
      hInput.value = '432';
    } else if (a === '9:16') {
      wInput.value = '432';
      hInput.value = '768';
    } else if (a === '4:3') {
      wInput.value = '640';
      hInput.value = '480';
    }
  });

  // Variants / quality
  const variantsInput = numInput(1);
  variantsInput.min = '1';
  variantsInput.max = '4';
  const qualityInput = el('input', 'studio-input');
  qualityInput.type = 'range';
  qualityInput.min = '0.5';
  qualityInput.max = '1';
  qualityInput.step = '0.01';
  qualityInput.value = '0.92';

  // Advanced disclosure
  const advToggle = btn('Advanced settings', 'studio-btn gen-adv-toggle');
  const advPanel = el('div', 'gen-advanced');
  advPanel.hidden = true;
  const seedInput = el('input', 'studio-input');
  seedInput.type = 'text';
  seedInput.placeholder = 'Seed (optional)';
  const useTpuCheck = el('input');
  useTpuCheck.type = 'checkbox';
  useTpuCheck.id = 'gen-use-tpu';
  const useTpuLabel = el('label', 'gen-check-label');
  useTpuLabel.htmlFor = 'gen-use-tpu';
  useTpuLabel.append(useTpuCheck, document.createTextNode(' Request TPU assist (if available)'));
  advPanel.append(
    field('Seed', seedInput),
    useTpuLabel,
    el('p', 'gen-hint')
  );
  advPanel.querySelector('.gen-hint').textContent =
    'Remote providers require an explicit gateway configuration. No API keys are stored in the client.';
  advToggle.addEventListener('click', () => {
    advPanel.hidden = !advPanel.hidden;
  });

  // Actions
  const actionRow = el('div', 'gen-actions');
  const generateBtn = btn('Generate', 'studio-btn primary gen-btn-generate');
  const cancelBtn = btn('Cancel', 'studio-btn gen-btn-cancel');
  cancelBtn.disabled = true;
  actionRow.append(generateBtn, cancelBtn);

  // Progress
  const progressWrap = el('div', 'gen-progress-wrap');
  const progressBar = el('div', 'gen-progress-bar');
  const progressLabel = el('div', 'gen-progress-label');
  progressLabel.textContent = 'Idle';
  progressWrap.append(progressBar, progressLabel);

  // Assemble controls
  controls.append(
    promptLabel,
    promptArea,
    negLabel,
    negArea,
    field('Provider', providerSelect),
    field('Model', modelSelect),
    tpuStatus,
    field('Aspect', aspectSelect),
    dimRow,
    field('Variants', variantsInput),
    field('Quality', qualityInput),
    advToggle,
    advPanel,
    actionRow,
    progressWrap
  );
  dimRow.append(field('W', wInput), field('H', hInput));

  // Preview / gallery
  const previewFrame = el('div', 'gen-preview-frame');
  const previewImg = el('img', 'gen-preview-img');
  previewImg.alt = 'Generated preview';
  previewFrame.appendChild(previewImg);
  const gallery = el('div', 'gen-gallery');
  const galleryActions = el('div', 'gen-gallery-actions');
  const sendBtn = btn('Send to Image Studio', 'studio-btn');
  const downloadBtn = btn('Download', 'studio-btn');
  sendBtn.disabled = true;
  downloadBtn.disabled = true;
  galleryActions.append(sendBtn, downloadBtn);

  previewCol.append(previewFrame, gallery, galleryActions);

  // History
  const histTitle = el('div', 'studio-side-title');
  histTitle.textContent = 'History';
  const histList = el('div', 'gen-history');
  sideCol.append(histTitle, histList);

  layout.append(controls, previewCol, sideCol);
  panel.appendChild(layout);

  // —— populate providers ——
  async function refreshCapabilities() {
    const providers = await discoverProviderCapabilities();
    providerSelect.textContent = '';
    for (const p of providers) {
      const o = el('option');
      o.value = p.providerId;
      o.textContent = (p.displayName || p.providerId) + (p.requiresNetwork ? ' (remote)' : ' (offline)');
      providerSelect.appendChild(o);
    }
    if (!providers.length) {
      const o = el('option');
      o.value = 'mock';
      o.textContent = 'Mock (offline)';
      providerSelect.appendChild(o);
    }
    await refreshModels();

    const tpu = await discoverTpuCapabilities();
    const available = tpu.filter((c) => c.available);
    if (available.length) {
      tpuStatus.textContent = `TPU: ${available.map((c) => c.displayName || c.backendId).join(', ')} · ${available[0].status}`;
      tpuStatus.classList.add('gen-tpu-ok');
      tpuStatus.classList.remove('gen-tpu-off');
    } else {
      tpuStatus.textContent = 'TPU: none available (browser detection is not used)';
      tpuStatus.classList.add('gen-tpu-off');
      tpuStatus.classList.remove('gen-tpu-ok');
    }
  }

  async function refreshModels() {
    modelSelect.textContent = '';
    const providers = await discoverProviderCapabilities();
    const p = providers.find((x) => x.providerId === providerSelect.value) || providers[0];
    const models = p?.models || [{ id: 'default', name: 'Default' }];
    for (const m of models) {
      const o = el('option');
      o.value = m.id || m;
      o.textContent = m.name || m.id || String(m);
      modelSelect.appendChild(o);
    }
  }

  providerSelect.addEventListener('change', () => refreshModels());

  // —— generate ——
  generateBtn.addEventListener('click', async () => {
    const prompt = promptArea.value.trim();
    if (!prompt) {
      setStatus('Enter a prompt');
      return;
    }
    generateBtn.disabled = true;
    cancelBtn.disabled = false;
    setProgress(0.05, 'QUEUED');

    try {
      const job = await submitGeneration(
        {
          prompt,
          negativePrompt: negArea.value.trim() || undefined,
          providerId: providerSelect.value || 'mock',
          modelId: modelSelect.value || undefined,
          width: parseInt(wInput.value, 10) || 512,
          height: parseInt(hInput.value, 10) || 512,
          variants: parseInt(variantsInput.value, 10) || 1,
          quality: parseFloat(qualityInput.value) || 0.92,
          seed: seedInput.value.trim() || undefined,
          useTpu: useTpuCheck.checked,
          tpuBackendId: useTpuCheck.checked ? 'none' : undefined,
        },
        {
          onProgress: (j) => {
            setProgress(j.progress || 0, j.state);
            activeJobId = j.jobId;
          },
        }
      );
      activeJobId = job.jobId;
      const done = await awaitJob(job.jobId);
      setProgress(done.progress || (done.state === JOB_STATES.COMPLETE ? 1 : 0), done.state);

      if (done.state === JOB_STATES.COMPLETE && done.results?.length) {
        showResults(done.results);
        setStatus(`Generated ${done.results.length} image(s)`);
      } else if (done.state === JOB_STATES.CANCELLED) {
        setStatus('Generation cancelled');
      } else {
        setStatus('Generation failed: ' + (done.error || 'unknown'));
      }
      renderHistory();
    } catch (e) {
      setStatus('Generation error: ' + (e.message || e));
      setProgress(0, 'FAILED');
    } finally {
      generateBtn.disabled = false;
      cancelBtn.disabled = true;
      activeJobId = null;
    }
  });

  cancelBtn.addEventListener('click', () => {
    if (activeJobId) cancelGeneration(activeJobId);
  });

  /** @type {Uint8Array|null} */
  let lastBytes = null;

  function showResults(results) {
    revokeGallery();
    gallery.textContent = '';
    let first = true;
    for (const r of results) {
      const bytes = r.asset.bytes;
      const blob = new Blob([bytes], { type: r.asset.mimeType || 'image/png' });
      const url = URL.createObjectURL(blob);
      galleryUrls.push(url);
      const thumb = el('img', 'gen-thumb');
      thumb.src = url;
      thumb.alt = `Variant ${r.variantIndex}`;
      thumb.addEventListener('click', () => {
        previewImg.src = url;
        lastBytes = bytes;
        sendBtn.disabled = false;
        downloadBtn.disabled = false;
      });
      gallery.appendChild(thumb);
      if (first) {
        previewImg.src = url;
        lastBytes = bytes;
        sendBtn.disabled = false;
        downloadBtn.disabled = false;
        first = false;
      }
    }
  }

  function revokeGallery() {
    for (const u of galleryUrls) URL.revokeObjectURL(u);
    galleryUrls = [];
  }

  sendBtn.addEventListener('click', () => {
    if (lastBytes) {
      notifyBytes(lastBytes);
      setStatus('Sent generated image to Image Studio (Convert / Inspect)');
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!previewImg.src) return;
    const a = el('a');
    a.href = previewImg.src;
    a.download = 'babelcodec-generated.png';
    a.click();
  });

  function setProgress(p, state) {
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
    progressBar.style.width = pct + '%';
    progressBar.dataset.state = state || '';
    progressLabel.textContent = state ? `${state} · ${pct}%` : 'Idle';
  }

  function renderHistory() {
    histList.textContent = '';
    const jobs = listJobs().slice(0, 20);
    for (const j of jobs) {
      const row = el('div', 'gen-hist-row');
      row.textContent = `${j.state} · ${(j.request?.prompt || '').slice(0, 40)}`;
      row.title = j.jobId;
      row.addEventListener('click', () => {
        const full = getJob(j.jobId);
        if (full?.results?.length) showResults(full.results);
        setProgress(full?.progress || 0, full?.state);
      });
      histList.appendChild(row);
    }
  }

  function field(lab, input) {
    const w = el('label', 'studio-field gen-field');
    const s = el('span');
    s.textContent = lab;
    w.append(s, input);
    return w;
  }

  function numInput(val) {
    const i = el('input', 'studio-input');
    i.type = 'number';
    i.value = String(val);
    i.min = '64';
    i.max = '2048';
    return i;
  }

  // init
  refreshCapabilities().then(() => renderHistory());
  setProgress(0, '');

  return {
    refresh: () => {
      refreshCapabilities();
      renderHistory();
    },
  };
}
