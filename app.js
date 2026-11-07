'use strict';

/* ── Constants & state ─────────────────────────────────── */
const ACCENTS = [
  '#c9a227', '#0f766e', '#b91c1c', '#4338ca', '#7c3aed',
  '#b45309', '#0e7490', '#be123c', '#4d7c0f', '#a21caf'
];

const ID_MAP = new Map();
let UID = 0;

/* ── Small helpers ─────────────────────────────────────── */
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

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function accentFor(index) {
  return ACCENTS[index % ACCENTS.length];
}

/* ── Highlight keywords in raw text ────────────────────── */
function highlight(raw, keywords) {
  const safeRaw = String(raw ?? '');
  if (!keywords || !keywords.length) return escapeHtml(safeRaw);

  const sorted = [...new Set(keywords.map(k => k.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  if (!sorted.length) return escapeHtml(safeRaw);

  const re = new RegExp(sorted.map(escapeRegExp).join('|'), 'gi');
  let out = '';
  let last = 0;
  let m;

  while ((m = re.exec(safeRaw)) !== null) {
    out += escapeHtml(safeRaw.slice(last, m.index));
    const hue = hueFor(m[0].toLowerCase());
    out += `<mark class="kw" style="--kw-hue:${hue}">${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  out += escapeHtml(safeRaw.slice(last));
  return out;
}

/* ── Data → tree structure ─────────────────────────────── */
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
    const volStr = String(i);
    const hits = byVol.get(volStr) || [];

    if (hits.length === 0) {
      volumes.push({ volume: volStr, hits: [], works: [], empty: true });
      continue;
    }

    const workMap = new Map();

    for (const hit of hits) {
      hit.__id = ++UID;
      ID_MAP.set(hit.__id, hit);

      const title = (hit.title || '').trim();
      const key = title || '__untitled__';

      if (!workMap.has(key)) {
        workMap.set(key, { title: title || null, hits: [] });
      }
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

    volumes.push({ volume: volStr, hits, works, empty: false });
  }

  return volumes;
}

/* ── Sidebar rendering (lazy) ──────────────────────────── */
function renderTree(volumes) {
  const tree = $('#tree');
  tree.innerHTML = '';

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

    for (const work of volData.works) {
      body.append(renderWork(work, volData.volume));
    }
  });

  return details;
}

function renderWork(work, volume) {
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

    for (const hit of work.hits) {
      body.append(renderPassage(hit, volume));
    }
  });

  return details;
}

function renderPassage(hit) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'passage';
  btn.dataset.id = String(hit.__id);

  const previewRaw = String(hit.sentence ?? '');
  const preview = previewRaw.length > 110
    ? previewRaw.slice(0, 107).trimEnd() + '…'
    : previewRaw;

  const approx = hit.page_source === 'chunk-index'
    ? ' <span class="approx">approx.</span>'
    : '';

  btn.innerHTML = `
    <span class="passage-meta">p. ${escapeHtml(String(hit.page))}${approx}</span>
    <span class="passage-preview">${escapeHtml(preview)}</span>
  `;

  return btn;
}

/* ── Reading pane ──────────────────────────────────────── */
function showHit(hit) {
  const reader = $('#reader');
  const keywords = hit.keywords || [];

  const chips = [...new Set(keywords)].map(k => {
    const hue = hueFor(k.toLowerCase());
    return `<span class="kw-chip" style="--kw-hue:${hue}">${escapeHtml(k)}</span>`;
  }).join('');

  const approx = hit.page_source === 'chunk-index' ? ' · approx.' : '';
  const title = (hit.title || '').trim() || 'Untitled / Miscellany';

  reader.innerHTML = `
    <div class="reader-inner">
      <div class="reader-eyebrow">
        MECW · Volume ${escapeHtml(String(hit.volume))} · p. ${escapeHtml(String(hit.page))}${approx}
      </div>
      <h1 class="reader-title">${escapeHtml(title)}</h1>
      <div class="kw-chips">${chips}</div>

      <section class="reader-section focus">
        <h2>Sentence</h2>
        <p class="sentence">${highlight(hit.sentence, keywords)}</p>
      </section>

      <section class="reader-section">
        <h2>Passage</h2>
        <p class="passage-text">${highlight(hit.passage, keywords)}</p>
      </section>

      <footer class="reader-footer">
        <span>Source file: ${escapeHtml(hit.source_file || '')}</span>
        <button type="button" class="copy-btn" id="copy-cite">Copy citation</button>
      </footer>
    </div>
  `;

  const copyBtn = reader.querySelector('#copy-cite');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const cite = `MECW, vol. ${hit.volume}, p. ${hit.page}${hit.title ? ' — ' + hit.title : ''}`;
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

/* ── Event delegation ──────────────────────────────────── */
$('#tree').addEventListener('click', (e) => {
  const btn = e.target.closest('.passage');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const hit = ID_MAP.get(id);
  if (hit) showHit(hit);
});

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  const loading = $('#loading');

  try {
    const res = await fetch('./MECW_ALL_ireland.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();
    const volumes = buildTree(raw);

    renderTree(volumes);

    const withRefs = volumes.filter(v => !v.empty).length;
    $('#stats').textContent =
      `${raw.length.toLocaleString()} passages · ${withRefs} volumes with references`;

    loading.classList.add('hidden');
  } catch (err) {
    loading.innerHTML = `
      <p style="color:#fca5a5">Could not load the corpus.</p>
      <small>${escapeHtml(String(err?.message || err))}</small>
      <small>Make sure MECW_ALL_ireland.json sits next to index.html.</small>
    `;
    console.error(err);
  }
}

init();
