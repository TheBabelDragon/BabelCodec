/**
 * Image Playground — starters, prompt-to-artifact, real Mutation Lab.
 * All creative paths local-first; intelligence optional and labeled honestly.
 */
import {
  STARTER_PROJECTS,
  planMutations,
  renderMutationPlans,
  promptToScene,
  refinePromptToScene,
  discoverIntelligenceCapabilities,
  compareBytes,
} from '../media/creative/index.js';
import { getDefaultRegistry } from '../media/assets/index.js';

export function buildPlaygroundPanel(panel, ctx) {
  const {
    el,
    btn,
    setStatus,
    setMode,
    getScene,
    setScene,
    redrawCreate,
    wInput,
    hInput,
    bgInput,
    labelWrap,
    onBytes,
    onNavigate,
  } = ctx;

  /** @type {object|null} */
  let lastSpec = null;
  /** @type {{ plan: object, imageData: ImageData, canvas?: HTMLCanvasElement }[]} */
  let lastMutations = [];
  /** @type {string|null} */
  let sourceAssetId = null;

  const intro = el('div', 'pg-intro');
  intro.textContent =
    'Image Playground — describe → create → mutate → inspect. Offline by default. Models optional and never required.';

  const intel = el('div', 'pg-intel');
  intel.textContent = 'Intelligence: checking…';
  discoverIntelligenceCapabilities()
    .then((c) => {
      intel.textContent = `Intelligence: intent=${c.intent.source}; image-gen=${c.imageGeneration.source}. ${c.message}`;
    })
    .catch(() => {
      intel.textContent = 'Intelligence: local heuristic only (capability probe failed).';
    });

  const actions = el('div', 'pg-actions');
  const surprise = btn('Surprise Me', 'studio-btn primary');
  surprise.addEventListener('click', () => {
    const pick = STARTER_PROJECTS[(Math.random() * STARTER_PROJECTS.length) | 0];
    applyStarter(pick.id);
  });
  const toCreate = btn('Start from Scratch', 'studio-btn');
  toCreate.addEventListener('click', () => setMode('create'));
  const toTech = btn('Open Technical Lab', 'studio-btn');
  toTech.addEventListener('click', () => setMode('inspect'));
  const toGen = btn('Generate (providers)', 'studio-btn');
  toGen.addEventListener('click', () => setMode('generate'));
  actions.append(surprise, toCreate, toTech, toGen);

  const starterGrid = el('div', 'pg-starter-grid');
  for (const p of STARTER_PROJECTS) {
    const card = btn('', 'pg-starter-card');
    const title = el('div', 'pg-starter-title');
    title.textContent = p.label;
    const desc = el('div', 'pg-starter-desc');
    desc.textContent = p.description;
    card.append(title, desc);
    card.addEventListener('click', () => applyStarter(p.id));
    starterGrid.appendChild(card);
  }

  // —— Prompt → Artifact ——
  const intentBox = el('div', 'pg-intent');
  const intentTitle = el('div', 'studio-side-title');
  intentTitle.textContent = 'Prompt → Artifact (local procedural — not remote LLM)';
  const intentInput = el('textarea', 'gen-prompt');
  intentInput.rows = 3;
  intentInput.placeholder =
    'e.g. Make a dark mechanical dragon emblem with copper details, inventory icon';
  const intentOut = el('pre', 'gen-job-details');
  intentOut.textContent = 'Enter a prompt, then Build artifact.';
  const buildBtn = btn('Build artifact', 'studio-btn primary');
  buildBtn.addEventListener('click', () => {
    try {
      const result = promptToScene(intentInput.value, { width: 512, height: 512 });
      lastSpec = result.spec;
      intentOut.textContent =
        result.summary +
        `\n\nOperation: ${result.operationLabel}\nObjects: ${result.scene.objects.length}`;
      loadScene(result.scene);
      setStatus(`Artifact built (${result.operationLabel}) — editable in Create`);
    } catch (e) {
      setStatus(String(e.message || e), 'err');
    }
  });
  const refineInput = el('input', 'studio-input');
  refineInput.placeholder = 'Refine: darker copper, square icon…';
  const refineBtn = btn('Refine derivative', 'studio-btn');
  refineBtn.addEventListener('click', () => {
    if (!lastSpec) {
      setStatus('Build an artifact first.', 'info');
      return;
    }
    try {
      const result = refinePromptToScene(lastSpec, refineInput.value);
      lastSpec = result.spec;
      intentOut.textContent =
        result.summary + `\n\nOperation: ${result.operationLabel} (derivative)`;
      loadScene(result.scene);
      setStatus('Refinement applied as new scene (source prompt preserved in provenance)');
    } catch (e) {
      setStatus(String(e.message || e), 'err');
    }
  });
  intentBox.append(intentTitle, intentInput, buildBtn, refineInput, refineBtn, intentOut);

  // —— Mutation Lab ——
  const mutBox = el('div', 'pg-mutation');
  const mutTitle = el('div', 'studio-side-title');
  mutTitle.textContent = 'Mutation Lab — real rendered variations';
  const mutSeed = el('input', 'studio-input');
  mutSeed.value = 'babel-seed';
  const mutCount = el('input', 'studio-input');
  mutCount.type = 'number';
  mutCount.value = '4';
  mutCount.min = '1';
  mutCount.max = '8';
  const mutGrid = el('div', 'pg-mut-grid');
  const mutMeta = el('pre', 'gen-job-details');
  mutMeta.textContent = 'Generate variations from the current Create canvas (or a solid probe).';
  const mutBtn = btn('Generate variations', 'studio-btn primary');
  mutBtn.addEventListener('click', () => generateMutations());
  const applyMutBtn = btn('Apply selected to Create', 'studio-btn');
  applyMutBtn.disabled = true;
  let selectedMut = -1;
  applyMutBtn.addEventListener('click', () => {
    if (selectedMut < 0 || !lastMutations[selectedMut]) return;
    const { imageData, plan } = lastMutations[selectedMut];
    // Put pixels onto create canvas via a simple rect-filled approximation is not ideal;
    // instead push imageData through a temporary canvas → user can export from Convert.
    // For Create editability we store as background-sized single bitmap note in status.
    try {
      const c = document.createElement('canvas');
      c.width = imageData.width;
      c.height = imageData.height;
      c.getContext('2d').putImageData(imageData, 0, 0);
      c.toBlob(async (blob) => {
        if (!blob) return;
        const buf = new Uint8Array(await blob.arrayBuffer());
        const reg = getDefaultRegistry();
        const parent = sourceAssetId;
        const asset = parent
          ? await reg.derive(parent, buf, {
              filename: `mutation-${plan.seed}.png`,
              mimeType: 'image/png',
              width: imageData.width,
              height: imageData.height,
              source: 'mutated',
              seed: plan.seed,
              historyEntry: { op: 'mutate', detail: { ops: plan.ops, seed: plan.seed } },
              provenance: { operationLabel: 'local_procedural', seed: plan.seed, ops: plan.ops },
            })
          : await reg.createFromBytes(buf, {
              filename: `mutation-${plan.seed}.png`,
              mimeType: 'image/png',
              width: imageData.width,
              height: imageData.height,
              source: 'mutated',
              seed: plan.seed,
              provenance: { operationLabel: 'local_procedural', seed: plan.seed, ops: plan.ops },
            });
        sourceAssetId = asset.id;
        setStatus(
          `Mutation saved as asset ${asset.id} (hash ${asset.contentHash?.slice(0, 12)}…). Open Convert/Inspect to edit bytes.`,
        );
        refreshHistory();
      }, 'image/png');
    } catch (e) {
      setStatus(String(e.message || e), 'err');
    }
  });
  const compareBtn = btn('Compare selected vs source bytes', 'studio-btn');
  compareBtn.addEventListener('click', async () => {
    if (selectedMut < 0 || !lastMutations[selectedMut] || !sourceAssetId) {
      setStatus('Need a source asset and a selected mutation.', 'info');
      return;
    }
    const reg = getDefaultRegistry();
    const parentBytes = reg.getBytes(sourceAssetId);
    const { imageData, plan } = lastMutations[selectedMut];
    const c = document.createElement('canvas');
    c.width = imageData.width;
    c.height = imageData.height;
    c.getContext('2d').putImageData(imageData, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    const diff = compareBytes(parentBytes, buf);
    mutMeta.textContent =
      `Compare vs parent ${sourceAssetId}\n` +
      `identical=${diff.identical} firstDiff=${diff.firstDiffOffset} approxDiffBytes=${diff.approximateDiffBytes}\n` +
      `${diff.note}\nplan seed=${plan.seed}`;
  });
  mutBox.append(
    mutTitle,
    labelWrap('Seed', mutSeed),
    labelWrap('Count', mutCount),
    mutBtn,
    mutGrid,
    applyMutBtn,
    compareBtn,
    mutMeta,
  );

  // —— Asset history ——
  const histBox = el('div', 'pg-history');
  const histTitle = el('div', 'studio-side-title');
  histTitle.textContent = 'Asset history (persisted when IndexedDB available)';
  const histList = el('pre', 'gen-job-details');
  histList.textContent = 'No assets yet.';
  const restoreBtn = btn('Restore from IndexedDB', 'studio-btn');
  restoreBtn.addEventListener('click', async () => {
    const r = await getDefaultRegistry().restoreAll();
    setStatus(`Restored ${r.restored} asset(s); idb=${r.available}`);
    refreshHistory();
  });
  const handoffBtn = btn('Send selected asset → Hex', 'studio-btn');
  handoffBtn.addEventListener('click', () => {
    if (!sourceAssetId) {
      setStatus('No asset selected.', 'info');
      return;
    }
    const bytes = getDefaultRegistry().getBytes(sourceAssetId);
    if (!bytes) {
      setStatus('Asset bytes missing.', 'err');
      return;
    }
    if (typeof onBytes === 'function') onBytes(bytes);
    if (typeof onNavigate === 'function') onNavigate('inspector');
    setStatus(`Sent ${bytes.length} bytes to Hex Inspector`);
  });
  histBox.append(histTitle, restoreBtn, handoffBtn, histList);

  const note = el('p', 'gen-hint');
  note.textContent =
    'Labels: local_procedural / local_heuristic only unless a model is explicitly configured. Technical Lab remains fully available.';

  panel.append(intro, intel, actions, starterGrid, intentBox, mutBox, histBox, note);

  // auto-restore once
  getDefaultRegistry()
    .restoreAll()
    .then((r) => {
      if (r.restored) setStatus(`Restored ${r.restored} persisted asset(s)`);
      refreshHistory();
    })
    .catch(() => {});

  function loadScene(scene) {
    setScene(scene);
    const w = wInput();
    const h = hInput();
    const bg = bgInput();
    if (w) w.value = String(scene.width);
    if (h) h.value = String(scene.height);
    if (bg) bg.value = scene.background || '#1c2029';
    setMode('create');
    redrawCreate();
  }

  function applyStarter(id) {
    const p = STARTER_PROJECTS.find((x) => x.id === id);
    if (!p) return;
    const scene = p.build();
    scene.operationLabel = 'local_procedural';
    loadScene(scene);
    setStatus(`Starter “${p.label}” loaded into Create — fully editable`);
  }

  function generateMutations() {
    mutGrid.textContent = '';
    lastMutations = [];
    selectedMut = -1;
    applyMutBtn.disabled = true;
    const seed = mutSeed.value || 'babel';
    const count = parseInt(mutCount.value, 10) || 4;
    const plans = planMutations(seed, count);

    // Source: try create canvas pixels; fall back to synthetic gradient
    let source;
    try {
      const scene = getScene();
      const c = document.createElement('canvas');
      c.width = scene.width || 128;
      c.height = scene.height || 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = scene.background || '#1c2029';
      ctx.fillRect(0, 0, c.width, c.height);
      for (const o of scene.objects || []) {
        ctx.fillStyle = o.fill || '#4a7dff';
        if (o.type === 'rect') ctx.fillRect(o.x, o.y, o.w, o.h);
        else if (o.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      source = ctx.getImageData(0, 0, c.width, c.height);
    } catch {
      source = new ImageData(128, 128);
      for (let i = 0; i < source.data.length; i += 4) {
        source.data[i] = (i * 3) & 255;
        source.data[i + 1] = (i * 5) & 255;
        source.data[i + 2] = (i * 7) & 255;
        source.data[i + 3] = 255;
      }
    }

    const rendered = renderMutationPlans(source, plans);
    lastMutations = rendered;
    rendered.forEach((item, idx) => {
      const card = el('button', 'pg-mut-card');
      card.type = 'button';
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(120, item.imageData.width);
      canvas.height = Math.min(120, item.imageData.height);
      // scale draw
      const tmp = document.createElement('canvas');
      tmp.width = item.imageData.width;
      tmp.height = item.imageData.height;
      tmp.getContext('2d').putImageData(item.imageData, 0, 0);
      canvas.getContext('2d').drawImage(tmp, 0, 0, canvas.width, canvas.height);
      const lab = el('div', 'pg-mut-label');
      lab.textContent = `#${idx + 1} ${item.plan.ops.map((o) => o.type).join('+')}`;
      card.append(canvas, lab);
      card.addEventListener('click', () => {
        selectedMut = idx;
        applyMutBtn.disabled = false;
        mutMeta.textContent = `Selected #${idx + 1}\nseed=${item.plan.seed}\nops=${JSON.stringify(item.plan.ops, null, 0)}`;
        [...mutGrid.children].forEach((ch, i) => ch.classList.toggle('active', i === idx));
      });
      mutGrid.appendChild(card);
    });
    setStatus(`Rendered ${rendered.length} real mutation images (source unchanged)`);
  }

  function refreshHistory() {
    const reg = getDefaultRegistry();
    const items = reg.list();
    if (!items.length) {
      histList.textContent = 'No assets in registry.';
      return;
    }
    histList.textContent = items
      .map((m) => {
        const line = `${m.id}  ${m.source}  ${m.mimeType}  ${m.byteLength}B  parent=${m.parentId || '—'}  hash=${(m.contentHash || '').slice(0, 10)}`;
        return line;
      })
      .join('\n');
  }
}
