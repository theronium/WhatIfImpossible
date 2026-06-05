// ── Notes / Techtree ──────────────────────────────────────────────────
function renderTechtreeToc(pane) {
  const toc = document.getElementById('techtree-toc');
  toc.innerHTML = '';
  const headings = Array.from(pane.querySelectorAll('h2'));
  if (!headings.length) return;
  headings.forEach(h => {
    const text = h.textContent.trim();
    const item = document.createElement('div');
    item.className = 'toc-item h2';
    item.textContent = text;
    item.style.fontSize = '12px';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      const hRect    = h.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      const delta    = hRect.top - paneRect.top - 8;
      pane.scrollTop += delta;
    });
    toc.appendChild(item);
  });
}

async function loadTechtree() {
  const pane = document.getElementById('preview-pane');
  const empty = document.getElementById('empty-state');
  try {
    const res = await fetch('/api/articles/notes/tech_tree.md');
    if (!res.ok) throw new Error('tech_tree.md not found');
    const { content } = await res.json();
    currentPath = 'notes/tech_tree.md';
    empty.style.display = 'none';
    document.getElementById('editor-panes').style.display = 'flex';
    document.getElementById('monaco-container').style.display = 'none';
    pane.style.display = 'block';
    renderToPane(content, pane).then(() => {
      addSvgZoom(pane);
      renderTechtreeToc(pane);
    });
  } catch (e) {
    empty.style.display = 'none';
    pane.style.display = 'block';
    pane.innerHTML = `<p style="color:var(--text-muted)">技術ツリーを読み込めませんでした: ${e.message}</p>`;
  }
}

function renderNotesList(query = '') {
  const el = document.getElementById('notes-list');
  el.innerHTML = '';
  const idx = document.createElement('div');
  idx.className = 'article-item' + ('notes/README.md' === currentPath ? ' active' : '');
  idx.innerHTML = `<span style="color:var(--accent2);">📋 補遺一覧（README）</span>`;
  idx.onclick = () => openArticle('notes/README.md');
  el.appendChild(idx);
  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid var(--border);margin:4px 8px;';
  el.appendChild(sep);
  const q = query.toLowerCase();
  const notes = articles
    .filter(a => a.path.startsWith('notes/') && a.path !== 'notes/README.md')
    .filter(a => !q || a.title.toLowerCase().includes(q))
    .sort((a, b) => (b.birthtime || 0) - (a.birthtime || 0));
  if (!notes.length) {
    el.innerHTML = `<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);">補遺なし</div>`;
    return;
  }
  notes.forEach(a => {
    const div = document.createElement('div');
    div.className = 'article-item' + (a.path === currentPath ? ' active' : '');
    div.innerHTML = `<span>${a.title}</span>`;
    div.onclick = () => openArticle(a.path);
    el.appendChild(div);
  });
}

document.getElementById('notes-search').oninput = (e) => {
  renderNotesList(e.target.value);
};

// ── Keyboard shortcuts ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveArticle(); }
});

// ── Sidebar toggle ────────────────────────────────────────────────────
function restorePanel(panel) {
  sidebarMode = panel;
  document.querySelectorAll('.sidebar-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.panel === panel)
  );
  const isArticles = panel === 'articles';
  const isGlossary = panel === 'glossary';
  const isNotes    = panel === 'notes';
  const isTechtree = panel === 'techtree';
  const isSearch   = panel === 'search';
  document.getElementById('articles-search-bar').style.display = isArticles ? '' : 'none';
  document.getElementById('article-list').style.display        = isArticles ? '' : 'none';
  document.getElementById('glossary-search-bar').style.display = isGlossary ? '' : 'none';
  document.getElementById('glossary-list').style.display       = isGlossary ? 'block' : 'none';
  document.getElementById('notes-search-bar').style.display    = isNotes    ? '' : 'none';
  document.getElementById('notes-list').style.display          = isNotes    ? 'block' : 'none';
  document.getElementById('techtree-panel').style.display      = isTechtree ? 'block' : 'none';
  document.getElementById('search-panel').style.display        = isSearch   ? 'flex' : 'none';
  document.querySelector('.mode-tabs').style.display = isArticles ? '' : 'none';
  if (isSearch && window._searchPanelActivated) window._searchPanelActivated();
}

function switchToPanel(panel, { pushState = true } = {}) {
  restorePanel(panel);
  const isGlossary = panel === 'glossary';
  const isNotes    = panel === 'notes';
  const isTechtree = panel === 'techtree';

  if (pushState) {
    document.getElementById('glossary-form-area').classList.remove('active');
    document.getElementById('preview-pane').innerHTML = '';
    document.getElementById('preview-pane').style.display = 'none';
    document.getElementById('monaco-container').style.display = 'none';
    document.getElementById('editor-panes').style.display = 'flex';
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('btn-edit-viewing').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    const _sbClear = document.getElementById('status-bar');
    if (_sbClear) _sbClear.style.display = 'none';
    const _gfsbClear = document.getElementById('gf-status-bar');
    if (_gfsbClear) _gfsbClear.style.display = 'none';
    currentPath = null;
    currentTermId = null;
    viewingTermId = null;
    document.getElementById('toc-aside').style.display = 'none';
    history.pushState({ panel }, '', `#tab/${panel}`);
  }

  if (isGlossary) {
    if (pushState) document.getElementById('glossary-search').value = '';
  } else if (isNotes) {
    if (pushState) document.getElementById('notes-search').value = '';
    renderNotesList();
  } else if (isTechtree) {
    loadTechtree();
  }
}

document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.onclick = () => switchToPanel(tab.dataset.panel);
});

// ── セマンティック検索 ────────────────────────────────────────────────
(function () {
  const input     = document.getElementById('semantic-search');
  const statusEl  = document.getElementById('search-status');
  const resultsEl = document.getElementById('search-results');
  let debounceTimer = null;

  const progressBar  = document.getElementById('search-progress-bar');
  const progressWrap = document.getElementById('search-progress-wrap');
  let _ready = false;
  let _pollTimer = null;

  function setReady(entries) {
    _ready = true;
    clearInterval(_pollTimer);
    progressWrap.style.display = 'none';
    statusEl.textContent = `${entries} エントリ`;
    input.disabled = false;
  }

  async function pollReady() {
    try {
      const r = await fetch('/api/checker/ready');
      if (!r.ok) return;
      const d = await r.json();
      if (d.ready) setReady(d.entries);
    } catch { /* サーバー未起動は無視 */ }
  }

  window._searchPanelActivated = () => {
    if (_ready) { input.focus(); return; }
    pollReady();
    if (!_pollTimer) _pollTimer = setInterval(pollReady, 1500);
  };

  window.addEventListener('checker-progress', (ev) => {
    const msg = ev.detail;
    if (msg.status === 'downloading') {
      statusEl.textContent = `モデルDL中… ${msg.pct}% (${msg.mb} / ${msg.tot} MB)`;
      progressBar.style.width = `${msg.pct}%`;
      progressWrap.style.display = '';
    } else if (msg.status === 'loading') {
      statusEl.textContent = `モデルロード中…`;
      progressBar.style.transition = 'none';
      progressBar.style.width = '100%';
      progressBar.style.opacity = '0.5';
      progressWrap.style.display = '';
    } else if (msg.status === 'ready') {
      pollReady();
    }
  });

  function srcLabel(source) {
    if (source === 'doc')  return '記事';
    if (source === 'wiim') return '用語';
    return source;
  }

  async function openResult(item) {
    if (item.source === 'doc') {
      const found = articles.find(a => a.id === item.id)
                 ?? articles.find(a => a.path.replace(/^.*\//, '').replace(/\.md$/, '') === item.id);
      if (found) openArticle(found.path);
    } else {
      if (!glossaryTerms.length) await loadGlossaryTerms();
      viewTerm(item.id);
    }
  }

  function renderResults({ terms, similar }) {
    let html = '';

    if (terms.length) {
      html += `<div class="sr-section">用語ヒット</div>`;
      html += terms.map(t => `
        <div class="sr-kw-badge" data-id="${t.id}" data-source="wiim">
          <span class="sr-kw-name">${t.keyword}</span>
          <span class="sr-kw-id">${t.id}</span>
        </div>`).join('');
    }

    if (similar.length) {
      html += `<div class="sr-section">類似エントリ</div>`;
      html += similar.map(e => {
        const pct = Math.round(e.score * 100);
        return `
          <div class="sr-card" data-id="${e.id}" data-source="${e.source}">
            <div class="sr-header">
              <span class="sr-name">${e.name}</span>
              <span class="sr-score">${pct}%</span>
            </div>
            <div class="sr-meta">
              <span class="sr-source">${srcLabel(e.source)}</span>
              <span class="sr-id">${e.id}</span>
            </div>
            <div class="sr-excerpt">${e.excerpt}</div>
            <div class="sr-bar"><div class="sr-fill" style="width:${pct}%"></div></div>
          </div>`;
      }).join('');
    }

    if (!html) html = `<div style="padding:16px;font-size:12px;color:var(--text-muted);">結果なし</div>`;
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.sr-card, .sr-kw-badge').forEach(el => {
      el.onclick = () => openResult({ id: el.dataset.id, source: el.dataset.source });
    });
  }

  async function doSearch(q) {
    if (!q.trim()) { resultsEl.innerHTML = ''; statusEl.textContent = ''; return; }
    statusEl.textContent = '照合中…';
    try {
      const res  = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topN: 8 }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(res.status === 404 ? 'サーバーを再起動してください' : text);
      const data = JSON.parse(text);
      renderResults(data);
      statusEl.textContent = `${data.terms.length + data.similar.length} 件`;
    } catch (e) {
      statusEl.textContent = `エラー: ${e.message}`;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value), 600);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(debounceTimer); doSearch(input.value); }
  });
})();

// ── Refresh ───────────────────────────────────────────────────────────
document.getElementById('btn-refresh').onclick = () => {
  if (sidebarMode === 'articles') loadArticles();
  else loadGlossaryTerms();
};
