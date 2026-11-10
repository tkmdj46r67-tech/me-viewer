'use strict';

/* ── Unified muted accents (used for volume badges) ────── */
const ACCENTS = [
  '#8f7048',  // sepia
  '#6d7d63',  // sage
  '#7a6e84',  // dusty plum
  '#8a7a58',  // ochre
  '#5c7482',  // slate
  '#8a6a5e',  // terracotta
  '#6d7a58',  // olive
  '#7a5e6d',  // mauve
  '#8a8064',  // tan
  '#5a7772',  // teal
];

/* ── Datasets ─────────────────────────────────────────── */
const DATASETS = {
  ireland: {
    key: 'ireland',
    label: 'Ireland',
    url: './MECW_ALL_ireland.json',
    titleHTML: 'Ireland <span>&amp;</span> the Irish Question',
    titlePlain: 'Ireland & the Irish Question',
    loaded: false,
    loading: false,
    error: null,
    volumes: [],
    rawCount: 0,
  },
  hegel: {
    key: 'hegel',
    label: 'Hegel',
    url: './MECW_ALL_hegel.json',
    titleHTML: 'Hegel <span>&amp;</span> Hegelianism',
    titlePlain: 'Hegel & Hegelianism',
    loaded: false,
    loading: false,
    error: null,
    volumes: [],
    rawCount: 0,
  },
};

const STATE = {
  current: 'ireland',
  hitIndex: new Map(),   // hit.__id -> hit object
};

let UID = 0;

/* ── Helpers ──────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hueFor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function plural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; }

function accentFor(i) { return ACCENTS[i % ACCENTS.length]; }

/* ── Keyword highlighting ─────────────────────────────── */
function highlight(raw, keywords) {
  const text = String(raw ?? '');
  if (!keywords || !keywords.length) return escapeHtml(text);

  const sorted = [...new Set(keywords.map(k => String(k).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!sorted.length) return escapeHtml(text);

  const re = new RegExp(sorted.map(escapeRegExp).join('|'), 'gi');
  let out = '', last = 0, m;

  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    const hue = hueFor(m[0].toLowerCase());
    out += `<mark class="kw" style="--kw-hue:${hue}">${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/* ── Data → tree structure ────────────────────────────── */
function buildTree(raw) {
  const byVol = new Map();
  for (const hit of raw) {
    const v = String(hit.volume);
    if (!byVol.has(v)) byVol.set(v, []);
    byVol.get(v).push(hit);
  }

  const maxVol = Math.max(50, ...Array.from(byVol.keys(), Number));
  const volumes = [];

  for (let i = 1; i <= maxVol; i++) {
    const hits = byVol.get(String(i)) || [];

    if (!hits.length) {
      volumes.push({ volume: String(i), hits: [], works: [], empty: true });
      continue;
    }

    const workMap = new Map();
    for (const hit of hits) {
      hit.__id = ++UID;
      STATE.hitIndex.set(hit.__id, hit);

      const title = (hit.title || '').trim();
      const key = title || '__untitled__';
      if (!workMap.has(key)) workMap.set(key, { title: title || null, hits: [] });
      workMap.get(key).hits.push(hit);
    }

    const works = [...workMap.values()];
    for (const w of works) {
      w.hits.sort((a, b) => (Number(a.page) || 0) - (Number(b.page) || 0));
      w.minPage = Number(w.hits[0]?.page) || Infinity;
    }
    works.sort((a, b) => {
      if (a.title === null && b.title !== null) return 1;
      if (b.title === null && a.title !== null) return -1;
      return a.minPage - b.minPage;
    });

    volumes.push({ volume: String(i), hits, works, empty: false });
  }

  return volumes;
}

/* ── Sidebar tree rendering (lazy) ────────────────────── */
function renderTree(volumes) {
  const tree = $('#tree');
  tree.innerHTML = '';
  tree.classList.remove('switching');
  void tree.offsetWidth;         // restart animation
  tree.classList.add('switching');

  volumes.forEach((v, idx) => {
    tree.append(v.empty ? renderEmptyVolume(v, idx) : renderVolume(v, idx));
  });
}

function renderEmptyVolume(v, idx) {
  const div = document.createElement('div');
  div.className = 'vol-empty';
  div.style.setProperty('--accent', accentFor(idx));
  div.innerHTML = `
    <span class="vol-badge">${escapeHtml(v.volume)}</span>
    <span>Volume ${escapeHtml(v.volume)}</span>
    <span style="margin-left:auto">0</span>
  `;
  return div;
}

function renderVolume(volData, index) {
  const details = document.createElement('details');
  details.className = 'vol';
  details.style.setProperty('--accent', accentFor(index));

  const summary = document.createElement('summary');
  summary.innerHTML = `
    <span class="chev">▸</span>
    <span class="vol-badge">${escapeHtml(volData.volume)}</span>
    <span class="vol-title">Volume ${escapeHtml(volData.volume)}</span>
    <span class="vol-count">${plural(volData.hits.length, 'passage')}</span>
  `;

  const body = document.createElement('div');
  body.className = 'vol-body';

  details.append(summary, body);

  details.addEventListener('toggle', () => {
    if (!details.open || body.dataset.rendered === '1') return;
    body.dataset.rendered = '1';
    for (const work of volData.works) body.append(renderWork(work));
  });

  return details;
}

function renderWork(work) {
  const details = document.createElement('details');
  details.className = 'work';

  const summary = document.createElement('summary');
  const isUntitled = work.title === null;
  const titleText = isUntitled ? 'Untitled / Miscellany' : work.title;

  summary.innerHTML = `
    <span class="chev">▸</span>
    <span class="work-title${isUntitled ? ' untitled' : ''}">${escapeHtml(titleText)}</span>
    <span class="work-count">${work.hits.length}</span>
  `;

  const body = document.createElement('div');
  body.className = 'work-body';
  details.append(summary, body);

  details.addEventListener('toggle', () => {
    if (!details.open || body.dataset.rendered === '1') return;
    body.dataset.rendered = '1';
    for (const hit of work.hits) body.append(renderPassage(hit));
  });

  return details;
}

function renderPassage(hit) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'passage';
  btn.dataset.id = String(hit.__id);

  const previewRaw = String(hit.sentence ?? hit.passage ?? '');
  const preview = previewRaw.length > 110
    ? previewRaw.slice(0, 107).trimEnd() + '…'
    : previewRaw;

  const approx = hit.page_source === 'chunk-index'
    ? ' <span class="approx">approx.</span>' : '';

  btn.innerHTML = `
    <span class="passage-meta">p. ${escapeHtml(String(hit.page))}${approx}</span>
    <span class="passage-preview">${escapeHtml(preview)}</span>
  `;

  return btn;
}

/* ── Reader rendering ─────────────────────────────────── */
function renderPlaceholder() {
  const ds = DATASETS[STATE.current];
  $('#reader').innerHTML = `
    <div class="reader-placeholder">
      <div class="placeholder-mark">MECW</div>
      <h2>${escapeHtml(ds.titlePlain)}</h2>
      <p>Choose a passage from the tree on the left to read it here.</p>
    </div>
  `;
}

function pageRange(hit) {
  const p = String(hit.page);
  const pe = hit.page_end ? String(hit.page_end) : p;
  const approx = hit.page_source === 'chunk-index' ? ' · approx.' : '';
  if (pe && pe !== p) return `pp. ${p}–${pe}${approx}`;
  return `p. ${p}${approx}`;
}

function showHit(hit) {
  const reader = $('#reader');
  const keywords = hit.keywords || [];

  const sentence = hit.sentence
    || (hit.passage ? String(hit.passage).split(/(?<=[.!?])\s/)[0] : '');
  const passage = hit.passage || '';

  const chips = [...new Set(keywords)].map(k => {
    const hue = hueFor(k.toLowerCase());
    return `<span class="kw-chip" style="--kw-hue:${hue}">${escapeHtml(k)}</span>`;
  }).join('');

  const title = (hit.title || '').trim() || 'Untitled / Miscellany';

  const metaBits = [];
  if (hit.source_file) metaBits.push(`<span>${escapeHtml(hit.source_file)}</span>`);
  if (hit.sentence_count) metaBits.push(`<span>· ${hit.sentence_count} sentences</span>`);
  if (hit.word_count)     metaBits.push(`<span>· ${hit.word_count} words</span>`);
  if (hit.is_short_important) {
    metaBits.push(`<span class="badge">important remark</span>`);
  }

  reader.innerHTML = `
    <div class="reader-inner">
      <div class="reader-eyebrow">
        MECW · Volume ${escapeHtml(String(hit.volume))} · ${pageRange(hit)}
      </div>
      <h1 class="reader-title">${escapeHtml(title)}</h1>
      <div class="kw-chips">${chips}</div>

      <section class="reader-section focus">
        <h2>Sentence</h2>
        <p class="sentence">${highlight(sentence, keywords)}</p>
      </section>

      <section class="reader-section">
        <h2>Passage</h2>
        <p class="passage-text">${highlight(passage, keywords)}</p>
      </section>

      <footer class="reader-footer">
        <div class="footer-meta">${metaBits.join(' ')}</div>
        <button type="button" class="copy-btn" id="copy-cite">Copy citation</button>
      </footer>
    </div>
  `;

  const copyBtn = reader.querySelector('#copy-cite');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const cite = `MECW, vol. ${hit.volume}, ${pageRange(hit).replace(/ · approx\.$/, '')}`
        + (hit.title ? ` — ${hit.title}` : '');
      try {
        await navigator.clipboard.writeText(cite);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => { copyBtn.textContent = 'Copy citation'; }, 1500);
      } catch {
        copyBtn.textContent = 'Copy failed';
      }
    });
  }

  document.querySelectorAll('.passage.active').forEach(n => n.classList.remove('active'));
  const active = document.querySelector(`.passage[data-id="${hit.__id}"]`);
  if (active) active.classList.add('active');

  reader.scrollTop = 0;
}

/* ── Dataset loading / switching ──────────────────────── */
async function loadDataset(key) {
  const ds = DATASETS[key];
  if (ds.loaded || ds.loading) return ds.loaded;

  ds.loading = true;
  ds.error = null;

  try {
    const res = await fetch(ds.url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${ds.url}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error('JSON is not an array');
    ds.volumes = buildTree(raw);
    ds.rawCount = raw.length;
    ds.loaded = true;
  } catch (err) {
    ds.error = err;
    console.error(err);
  } finally {
    ds.loading = false;
  }

  return ds.loaded;
}

function updateSidebarHeader() {
  const ds = DATASETS[STATE.current];
  $('#dataset-title').innerHTML = ds.titleHTML;

  if (ds.error) {
    $('#stats').textContent = 'Failed to load this dataset';
    return;
  }
  if (!ds.loaded) {
    $('#stats').textContent = 'Loading…';
    return;
  }
  const withRefs = ds.volumes.filter(v => !v.empty).length;
  $('#stats').textContent =
    `${ds.rawCount.toLocaleString()} passages · ${withRefs} volume${withRefs === 1 ? '' : 's'}`;
}

function setToggleDisabled(disabled) {
  document.querySelectorAll('.dataset-btn').forEach(b => {
    b.disabled = disabled;
  });
}

async function switchDataset(key) {
  if (STATE.current === key) return;
  STATE.current = key;

  document.querySelectorAll('.dataset-btn').forEach(b => {
    const isActive = b.dataset.dataset === key;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const ds = DATASETS[key];
  updateSidebarHeader();

  if (!ds.loaded) {
    $('#tree').innerHTML =
      `<div class="tree-loading">Loading ${escapeHtml(ds.label)}…</div>`;
    renderPlaceholder();
    setToggleDisabled(true);
    await loadDataset(key);
    setToggleDisabled(false);
  }

  if (ds.error) {
    $('#tree').innerHTML =
      `<div class="tree-error">Failed to load ${escapeHtml(ds.url)}<br>
       <small>${escapeHtml(String(ds.error.message || ds.error))}</small></div>`;
    updateSidebarHeader();
    return;
  }

  renderPlaceholder();
  renderTree(ds.volumes);
  updateSidebarHeader();
}

/* ── Event wiring ─────────────────────────────────────── */
$('.dataset-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.dataset-btn');
  if (!btn || btn.disabled) return;
  switchDataset(btn.dataset.dataset);
});

$('#tree').addEventListener('click', (e) => {
  const btn = e.target.closest('.passage');
  if (!btn) return;
  const hit = STATE.hitIndex.get(Number(btn.dataset.id));
  if (hit) showHit(hit);
});

/* ── Init ─────────────────────────────────────────────── */
async function init() {
  const loading = $('#loading');

  setToggleDisabled(true);
  await loadDataset(STATE.current);
  setToggleDisabled(false);

  const ds = DATASETS[STATE.current];

  if (ds.error) {
    loading.innerHTML = `
      <p style="color:#d8a395">Could not load the corpus.</p>
      <small>${escapeHtml(String(ds.error.message || ds.error))}</small>
      <small>Make sure ${escapeHtml(ds.url)} sits next to index.html.</small>
    `;
    updateSidebarHeader();
    return;
  }

  renderTree(ds.volumes);
  updateSidebarHeader();
  loading.classList.add('hidden');
}

init();
