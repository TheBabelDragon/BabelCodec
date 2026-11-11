/**
 * Image Playground panel builder — local starters, intent, mutation planner.
 * @param {object} ctx helpers from studio-ui
 */
import {
  interpretCreativeIntent,
  summarizeDesignSpec,
  STARTER_PROJECTS,
  planMutations,
} from '../media/creative/index.js';

export function buildPlaygroundPanel(panel, ctx) {
  const { el, btn, setStatus, setMode, getScene, setScene, redrawCreate, wInput, hInput, bgInput, labelWrap } = ctx;

  const intro = el('div', 'pg-intro');
  intro.textContent =
    'Image Playground — local creative lab. Starters and mutations run offline. AI/TPU is optional and never required.';

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
    card.textContent = '';
    const title = el('div', 'pg-starter-title');
    title.textContent = p.label;
    const desc = el('div', 'pg-starter-desc');
    desc.textContent = p.description;
    card.append(title, desc);
    card.addEventListener('click', () => applyStarter(p.id));
    starterGrid.appendChild(card);
  }

  const intentBox = el('div', 'pg-intent');
  const intentTitle = el('div', 'studio-side-title');
  intentTitle.textContent = 'Creative intent (local heuristic — not remote LLM)';
  const intentInput = el('textarea', 'gen-prompt');
  intentInput.rows = 3;
  intentInput.placeholder =
    'e.g. Make a dark mechanical dragon emblem with copper details, inventory icon';
  const intentOut = el('pre', 'gen-job-details');
  intentOut.textContent = 'Enter a prompt and Interpret.';
  const intentBtn = btn('Interpret intent', 'studio-btn');
  intentBtn.addEventListener('click', () => {
    const spec = interpretCreativeIntent(intentInput.value, { width: 256, height: 256 });
    intentOut.textContent = summarizeDesignSpec(spec);
    setStatus('Intent interpreted locally (heuristic). Apply a starter or open Create to compose.');
  });
  const applyIntentBtn = btn('Apply palette to Create', 'studio-btn');
  applyIntentBtn.addEventListener('click', () => {
    const scene = getScene();
    const spec = interpretCreativeIntent(intentInput.value, { width: scene.width, height: scene.height });
    scene.background = spec.background || scene.background;
    const bg = bgInput();
    if (bg) bg.value = scene.background;
    setMode('create');
    redrawCreate();
    setStatus(`Applied local palette from intent (${spec.style})`);
  });
  intentBox.append(intentTitle, intentInput, intentBtn, applyIntentBtn, intentOut);

  const mutBox = el('div', 'pg-mutation');
  const mutTitle = el('div', 'studio-side-title');
  mutTitle.textContent = 'Mutation Lab (seeded plans; apply via Convert edit ops)';
  const mutSeed = el('input', 'studio-input');
  mutSeed.value = 'babel-seed';
  const mutCount = el('input', 'studio-input');
  mutCount.type = 'number';
  mutCount.value = '4';
  mutCount.min = '1';
  mutCount.max = '8';
  const mutList = el('pre', 'gen-job-details');
  mutList.textContent = 'Plan mutations to see seed + ops.';
  const mutBtn = btn('Plan mutations', 'studio-btn');
  mutBtn.addEventListener('click', () => {
    const plans = planMutations(mutSeed.value || 'babel', parseInt(mutCount.value, 10) || 4);
    mutList.textContent = plans
      .map((p, i) => `#${i + 1} seed=${p.seed}\n  ops=${JSON.stringify(p.ops)}`)
      .join('\n');
    setStatus(`Planned ${plans.length} mutations from seed (local, reproducible)`);
  });
  mutBox.append(mutTitle, labelWrap('Seed', mutSeed), labelWrap('Count', mutCount), mutBtn, mutList);

  const note = el('p', 'gen-hint');
  note.textContent =
    'Technical Lab (Inspect / Hex / Structure) remains fully available. Remote generation stays optional under Generate.';

  panel.append(intro, actions, starterGrid, intentBox, mutBox, note);

  function applyStarter(id) {
    const p = STARTER_PROJECTS.find((x) => x.id === id);
    if (!p) return;
    const scene = p.build();
    setScene(scene);
    const w = wInput();
    const h = hInput();
    const bg = bgInput();
    if (w) w.value = String(scene.width);
    if (h) h.value = String(scene.height);
    if (bg) bg.value = scene.background || '#1c2029';
    setMode('create');
    redrawCreate();
    setStatus(`Starter “${p.label}” loaded into Create — fully editable`);
  }
}
