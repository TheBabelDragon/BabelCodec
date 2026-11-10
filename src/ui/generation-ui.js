/**
 * Image Generation workspace — first-class mode inside Image Studio.
 * Dark creative workstation UI. Offline mock + procedural by default.
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
  JOB_STATES,
  SSTV_PRESETS,
} from '../media/generation/index.js';
import { exportSstvHandoff } from '../media/integrations/index.js';
import { describeGatewayStatus, saveGatewayUrl } from './generation-status.js';

/**
 * Build the Generate panel into `panel`.
 * @param {HTMLElement} panel
 * @param {{ el: Function, btn: Function, setStatus: Function, notifyBytes: Function, onNavigate: Function }} ctx
 */
export function buildGeneratePanel(panel, ctx) {
  const { el, btn, setStatus, notifyBytes } = ctx;

  ensureGenerationDefaults();

  /** @type {string|null} */
  let activeJobId = null;
  /** @type {string[]} */
  let galleryUrls = [];

  const layout = el('div', 'gen-layout');
  const controls = el('div', 'gen-controls');
  const previewCol = el('div', 'gen-preview-col');
  const sideCol = el('div', 'gen-side-col');

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

  const providerSelect = el('select', 'studio-select gen-select');
  const modelSelect = el('select', 'studio-select gen-select');

  const tpuStatus = el('div', 'gen-tpu-status');
  tpuStatus.textContent = 'TPU: checking…';

  const configBanner = el('div', 'gen-config-banner');
  const st0 = describeGatewayStatus();
  configBanner.className = st0.className;
  configBanner.textContent = st0.text;
  const gwUrlInput = el('input', 'studio-input');
  gwUrlInput.type = 'url';
  gwUrlInput.placeholder = 'Gateway URL (optional) — https://…';
  const gwSave = btn('Save gateway', 'studio-btn');
  const gwClear = btn('Clear gateway', 'studio-btn');
  const gwRow = el('div', 'gen-gw-row');
  gwRow.append(gwSave, gwClear);

  const dimRow = el('div', 'gen-dim-row');
  const wInput = numInput(512);
  const hInput = numInput(512);
  const aspectSelect = el('select', 'studio-select gen-select');
  for (const [v, t] of [
    ['1:1', '1:1'],
    ['16:9', '16:9'],
    ['9:16', '9:16'],
    ['4:3', '4:3'],
    ['martin_m1', SSTV_PRESETS.martin_m1.label],
    ['robot36', SSTV_PRESETS.robot36.label],
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
    } else if (a === 'martin_m1') {
      wInput.value = String(SSTV_PRESETS.martin_m1.width);
      hInput.value = String(SSTV_PRESETS.martin_m1.height);
    } else if (a === 'robot36') {
      wInput.value = String(SSTV_PRESETS.robot36.width);
      hInput.value = String(SSTV_PRESETS.robot36.height);
    }
  });

  const variantsInput = numInput(1);
  variantsInput.min = '1';
  variantsInput.max = '4';
  const qualityInput = el('input', 'studio-input');
  qualityInput.type = 'range';
  qualityInput.min = '0.5';
  qualityInput.max = '1';
  qualityInput.step = '0.01';
  qualityInput.value = '0.92';

  const advToggle = btn('Advanced settings', 'studio-btn gen-adv-toggle');
  const advPanel = el('div', 'gen-advanced');
  advPanel.hidden = true;
  const seedInput = el('input', 'studio-input');
  seedInput.type = 'text';
  seedInput.placeholder = 'Seed (optional — required for exact procedural replay)';
  const useTpuCheck = el('input');
  useTpuCheck.type = 'checkbox';
  useTpuCheck.id = 'gen-use-tpu';
  const useTpuLabel = el('label', 'gen-check-label');
  useTpuLabel.htmlFor = 'gen-use-tpu';
  useTpuLabel.append(useTpuCheck, document.createTextNode(' Request TPU assist (if available)'));
  advPanel.append(field('Seed', seedInput), useTpuLabel, el('p', 'gen-hint'));
  advPanel.querySelector('.gen-hint').textContent =
    'Procedural provider is fully offline and deterministic. Remote providers need a gateway; no API keys in the client.';
  advToggle.addEventListener('click', () => {
    advPanel.hidden = !advPanel.hidden;
  });

  const actionRow = el('div', 'gen-actions');
  const generateBtn = btn('Generate', 'studio-btn primary gen-btn-generate');
  const cancelBtn = btn('Cancel', 'studio-btn gen-btn-cancel');
  cancelBtn.disabled = true;
  actionRow.append(generateBtn, cancelBtn);

  const progressWrap = el('div', 'gen-progress-wrap');
  const progressBar = el('div', 'gen-progress-bar');
  const progressLabel = el('div', 'gen-progress-label');
  progressLabel.textContent = 'Idle';
  progressWrap.append(progressBar, progressLabel);

  const detailsPanel = el('pre', 'gen-job-details mono');
  detailsPanel.textContent = 'Job details appear after generate.';

  controls.append(
    configBanner,
    field('Gateway URL', gwUrlInput),
    gwRow,
    promptLabel,
    promptArea,
    negLabel,
    negArea,
    field('Provider', providerSelect),
    field('Model', modelSelect),
    tpuStatus,
    field('Aspect / SSTV', aspectSelect),
    dimRow,
    field('Variants', variantsInput),
    field('Quality', qualityInput),
    advToggle,
    advPanel,
    actionRow,
    progressWrap,
    detailsPanel,
  );
  dimRow.append(field('W', wInput), field('H', hInput));

  const previewFrame = el('div', 'gen-preview-frame');
  const previewImg = el('img', 'gen-preview-img');
  previewImg.alt = 'Generated preview';
  previewFrame.appendChild(previewImg);
  const gallery = el('div', 'gen-gallery');
  const galleryActions = el('div', 'gen-gallery-actions');
  const sendBtn = btn('Send to Image Studio', 'studio-btn');
  const downloadBtn = btn('Download', 'studio-btn');
  const inspectBtn = btn('Inspect full size', 'studio-btn');
  const sstvBtn = btn('Export SSTV handoff', 'studio-btn');
  sendBtn.disabled = true;
  downloadBtn.disabled = true;
  inspectBtn.disabled = true;
  sstvBtn.disabled = true;
  sstvBtn.title = 'Download PNG + Signal Processor contract v1 JSON (file-based handoff)';
  galleryActions.append(sendBtn, downloadBtn, inspectBtn, sstvBtn);

  previewCol.append(previewFrame, gallery, galleryActions);

  const histTitle = el('div', 'studio-side-title');
  histTitle.textContent = 'History';
  const histList = el('div', 'gen-history');
  sideCol.append(histTitle, histList);

  const lightbox = el('div', 'gen-lightbox');
  lightbox.hidden = true;
  const lightboxImg = el('img', 'gen-lightbox-img');
  lightboxImg.alt = 'Full size';
  const lightboxClose = btn('Close', 'studio-btn gen-lightbox-close');
  lightbox.append(lightboxClose, lightboxImg);
  lightbox.addEventListener('click', (ev) => {
    if (ev.target === lightbox || ev.target === lightboxClose) lightbox.hidden = true;
  });
  layout.append(controls, previewCol, sideCol);
  panel.append(layout, lightbox);

  async function refreshCapabilities() {
    const providers = await discoverProviderCapabilities();
    providerSelect.textContent = '';
    for (const p of providers) {
      const o = el('option');
      o.value = p.providerId;
      o.textContent =
        (p.displayName || p.providerId) + (p.requiresNetwork ? ' (remote)' : ' (offline)');
      providerSelect.appendChild(o);
    }
    if (!providers.length) {
      const o = el('option');
      o.value = 'mock';
      o.textContent = 'Mock (offline)';
      providerSelect.appendChild(o);
    }
    if ([...providerSelect.options].some((o) => o.value === 'procedural')) {
      providerSelect.value = 'procedural';
    }
    await refreshModels();

    const st = describeGatewayStatus();
    configBanner.className = st.className;
    configBanner.textContent = st.text;

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

  function showJobDetails(job) {
    if (!job) {
      detailsPanel.textContent = 'Job details appear after generate.';
      return;
    }
    const meta = job.results?.[0]?.providerMetadata || job.provenance?.providerMetadata || {};
    const lines = [
      `state: ${job.state}`,
      `jobId: ${job.jobId}`,
      `provider: ${job.request?.providerId}`,
      `model: ${job.request?.modelId || '—'}`,
      `size: ${job.request?.width}×${job.request?.height}`,
      `seed: ${job.request?.seed ?? job.provenance?.seed ?? meta.seed ?? '—'}`,
      `digest: ${job.provenance?.digestHex || meta.digestHex || '—'}`,
      `generator: ${job.provenance?.generator || meta.generator || '—'}`,
      `providerVersion: ${job.provenance?.providerVersion || meta.providerVersion || '—'}`,
    ];
    const params = job.provenance?.params || meta.params;
    if (params) lines.push('params: ' + JSON.stringify(params, null, 0));
    detailsPanel.textContent = lines.join('\n');
  }

  gwSave.addEventListener('click', () => {
    saveGatewayUrl(gwUrlInput.value.trim());
    refreshCapabilities().then(() => setStatus('Gateway settings updated'));
  });
  gwClear.addEventListener('click', () => {
    gwUrlInput.value = '';
    saveGatewayUrl('');
    refreshCapabilities().then(() => setStatus('Gateway cleared — offline only'));
  });

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
          providerId: providerSelect.value || 'procedural',
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
        },
      );
      activeJobId = job.jobId;
      const done = await awaitJob(job.jobId);
      setProgress(done.progress || (done.state === JOB_STATES.COMPLETE ? 1 : 0), done.state);
      showJobDetails(done);

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
  /** @type {{ width?: number, height?: number }} */
  let lastMeta = {};

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
        lastMeta = {
          width: r.asset.width || parseInt(wInput.value, 10),
          height: r.asset.height || parseInt(hInput.value, 10),
        };
        sendBtn.disabled = false;
        downloadBtn.disabled = false;
        inspectBtn.disabled = false;
        sstvBtn.disabled = false;
      });
      gallery.appendChild(thumb);
      if (first) {
        previewImg.src = url;
        lastBytes = bytes;
        lastMeta = {
          width: r.asset.width || parseInt(wInput.value, 10),
          height: r.asset.height || parseInt(hInput.value, 10),
        };
        sendBtn.disabled = false;
        downloadBtn.disabled = false;
        inspectBtn.disabled = false;
        sstvBtn.disabled = false;
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

  function openLightbox() {
    if (!previewImg.src) return;
    lightboxImg.src = previewImg.src;
    lightbox.hidden = false;
  }
  inspectBtn.addEventListener('click', openLightbox);
  previewImg.addEventListener('click', openLightbox);

  sstvBtn.addEventListener('click', async () => {
    if (!lastBytes) return;
    try {
      sstvBtn.disabled = true;
      await exportSstvHandoff(lastBytes, {
        width: lastMeta.width,
        height: lastMeta.height,
        mode: 'martin_m1',
        filename: 'babelcodec-sstv-source.png',
      });
      setStatus('Exported SSTV handoff (PNG + .job.json) — import in Signal Processor');
    } catch (e) {
      setStatus('SSTV handoff failed: ' + (e.message || e));
    } finally {
      sstvBtn.disabled = !lastBytes;
    }
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
        showJobDetails(full);
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

  refreshCapabilities().then(() => renderHistory());
  setProgress(0, '');

  return {
    refresh: () => {
      refreshCapabilities();
      renderHistory();
    },
  };
}
