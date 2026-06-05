// ── コレクション ─────────────────────────────────────────────────────
async function loadCollections() {
  try {
    const res = await fetch('/api/collections');
    if (!res.ok) return;
    const data = await res.json();
    activeCollection  = data.active;
    collectionConfig  = data.config;
    activeDocsDir     = data.docsDir    || '';
    activeGlossaryDir = data.glossaryDir || '';

    const sel = document.getElementById('collection-select');
    sel.innerHTML = Object.entries(data.collections)
      .map(([key, col]) => `<option value="${key}" ${key === data.active ? 'selected' : ''}>⚡ ${col.label}</option>`)
      .join('');

    applyCollectionConfig(data.config);
  } catch (e) {
    console.warn('collections API not ready:', e.message);
  }
}

function applyCollectionConfig(config) {
  if (!config) return;
  const techtreeTab = document.querySelector('.sidebar-tab[data-panel="techtree"]');
  if (techtreeTab) techtreeTab.style.display = config.showTechTree ? '' : 'none';
  document.getElementById('git-panel').style.display = config.git !== false ? '' : 'none';
}

async function switchCollection(key) {
  const res = await fetch('/api/collections/switch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) { showToast('切替失敗', 'error'); return; }
  const data = await res.json();
  activeCollection  = data.active;
  collectionConfig  = data.config;
  activeDocsDir     = data.docsDir     || '';
  activeGlossaryDir = data.glossaryDir || '';
  applyCollectionConfig(data.config);
  const current = document.querySelector('.sidebar-tab.active')?.dataset.panel;
  if (current === 'techtree' && !data.config?.showTechTree) {
    switchToPanel('articles');
  }
  await loadCategories();
  await loadGlossaryTerms();
  await loadArticles();
  showToast(`コレクション切替: ${key}`);
}

document.getElementById('collection-select').onchange = (e) => switchCollection(e.target.value);

async function loadCategories() {
  try {
    const res = await fetch('/api/glossary/categories');
    if (!res.ok) throw new Error('categories API not ready');
    const cats = await res.json();
    GLOSSARY_CATS = cats.sort((a, b) => a.sort - b.sort);
  } catch {
    GLOSSARY_CATS = FALLBACK_CATS;
  }
  GLOSSARY_LABELS = Object.fromEntries(GLOSSARY_CATS.map(c => [c.id, c.label]));

  try {
    const res = await fetch('/api/article-categories');
    if (res.ok) ARTICLE_CATS = await res.json();
  } catch { /* フォールバックは CSS 定義のまま */ }

  injectCatStyles();
  populateCatDropdown();
  renderTermCatList();
}

function injectCatStyles() {
  const glossaryRules = GLOSSARY_CATS.map(c => `
    .gcat-header.${c.id} { background: ${c.bg}; color: ${c.color}; }
    .cat-badge.${c.id}   { background: ${c.bg}; color: ${c.color}; }
  `).join('');
  const articleRules = ARTICLE_CATS.map(c => `
    .category-label[data-cat="${c.id}"] { background: ${c.bg}; color: ${c.color}; border-left: 3px solid ${c.color}; }
  `).join('');
  document.getElementById('cat-styles').textContent = glossaryRules + articleRules;
}

function populateCatDropdown() {
  const sel = document.getElementById('gf-category');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = GLOSSARY_CATS.map(c =>
    `<option value="${c.id}">${c.id} — ${c.label}</option>`
  ).join('');
  if (current) sel.value = current;
}

// ── Git ───────────────────────────────────────────────────────────────
document.getElementById('btn-git-status').onclick = async () => {
  const res = await fetch('/api/git/status');
  const status = await res.json();
  const changed = [...(status.modified || []), ...(status.not_added || []), ...(status.created || [])];
  document.getElementById('git-status').textContent =
    changed.length ? `変更: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? '…' : ''}` : 'Git: クリーン';
};

document.getElementById('btn-push').onclick = async () => {
  const msg = document.getElementById('commit-msg').value.trim() || 'Update articles';
  const res = await fetch('/api/git/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg })
  });
  if (res.ok) { showToast('Push 完了', 'ok'); document.getElementById('commit-msg').value = ''; }
  else { const e = await res.json(); showToast(e.error || 'Push 失敗', 'err'); }
};

// ── WebSocket live reload ──────────────────────────────────────────────
const ws = new WebSocket(`ws://${location.host}`);
ws.onmessage = (e) => {
  let d;
  try { d = JSON.parse(e.data); } catch { return; }
  if (d.type === 'reload') loadArticles();
  if (d.type === 'reload-glossary') {
    loadCategories();
    loadGlossaryTerms();
  }
  if (d.type === 'collection-switched') {
    loadCollections();
  }
  if (d.type === 'checker-progress') {
    window.dispatchEvent(new CustomEvent('checker-progress', { detail: d }));
  }
};

// ── Init ─────────────────────────────────────────────────────────────
import('/elk/mermaid-layout-elk.esm.min.mjs').then(m => {
  mermaid.registerLayoutLoaders(m.default);
}).catch(() => {});
mermaid.initialize({ startOnLoad: false, theme: 'dark' });
(async () => {
  await loadCollections();
  await loadCategories();
  await Promise.all([loadGlossaryTerms(), loadArticles()]);
  const hash = location.hash.slice(1);
  if (hash.startsWith('tab/')) {
    switchToPanel(hash.slice(4), { pushState: false });
  } else if (hash.startsWith('glossary/')) {
    switchToPanel('glossary', { pushState: false });
    viewTerm(hash.slice(9), { pushState: false });
  } else if (hash) {
    openArticle(hash, { pushState: false });
  }
})();
