// ── Article list ─────────────────────────────────────────────────────
async function loadArticles() {
  const res = await fetch('/api/articles');
  articles = await res.json();
  renderList(articles);
}

function renderList(list) {
  const el = document.getElementById('article-list');
  el.innerHTML = '';
  const grouped = {};
  list.filter(a => !a.path.startsWith('notes/')).forEach(a => {
    const cat = (a.category === '.' ? 'index' : a.category) || 'uncategorized';
    (grouped[cat] = grouped[cat] || []).push(a);
  });
  Object.entries(grouped).sort(([a], [b]) => {
    if (a === 'index') return -1;
    if (b === 'index') return 1;
    return a.localeCompare(b);
  }).forEach(([cat, items]) => {
    const hasActive = items.some(a => a.path === currentPath);
    const isOpen = hasActive;

    const count = items.length;
    const latestDate = items
      .map(a => a.date || '')
      .filter(Boolean)
      .sort()
      .at(-1);
    const dateLabel = latestDate ? latestDate.slice(5).replace('-', '/') : '';

    const label = document.createElement('div');
    label.className = 'category-label' + (isOpen ? ' open' : '');
    label.dataset.cat = cat;
    label.innerHTML = `<span>${cat}</span>`
      + `<span class="cat-meta">`
      + `<span class="cat-count">${count}</span>`
      + (dateLabel ? `<span class="cat-date">${dateLabel}</span>` : '')
      + `</span>`
      + `<span class="cat-arrow">▶</span>`;

    const group = document.createElement('div');
    group.className = 'category-items' + (isOpen ? '' : ' collapsed');

    label.onclick = () => {
      const opening = group.classList.contains('collapsed');
      group.classList.toggle('collapsed', !opening);
      label.classList.toggle('open', opening);
    };

    el.appendChild(label);
    items.forEach(a => {
      const div = document.createElement('div');
      div.className = 'article-item' + (a.path === currentPath ? ' active' : '');
      div.innerHTML = `<span class="article-id">${a.id || '—'}</span><span>${a.title}</span>`;
      div.onclick = () => openArticle(a.path);
      group.appendChild(div);
    });
    el.appendChild(group);
  });
}

// ── Open article ─────────────────────────────────────────────────────
async function openArticle(relPath, { pushState = true } = {}) {
  const res = await fetch(`/api/articles/${relPath}`);
  if (!res.ok) { showToast('読み込み失敗', 'err'); return; }
  const { raw } = await res.json();
  currentPath = relPath;
  currentGlossaryPath = null;
  await monacoReady;
  monacoEditor.setValue(raw);
  document.getElementById('file-path').textContent = relPath;
  document.getElementById('editor-panes').style.display = 'flex';
  document.getElementById('toolbar').style.display = 'flex';
  const sb = document.getElementById('status-bar');
  if (sb) { sb.textContent = activeDocsDir ? `${activeDocsDir}/${relPath}` : relPath; sb.style.display = ''; }
  const isNote = relPath.startsWith('notes/');
  document.querySelector('.mode-tabs').style.display = isNote ? 'none' : '';
  document.getElementById('btn-save').style.display = isNote ? 'none' : '';
  document.getElementById('btn-delete').style.display = isNote ? 'none' : '';
  document.getElementById('btn-edit-viewing').style.display = isNote ? '' : 'none';
  document.getElementById('empty-state').style.display = 'none';
  if (isNote) {
    document.getElementById('monaco-container').style.display = 'none';
    document.getElementById('preview-pane').style.display = 'block';
    viewMode = 'preview';
    updatePreview();
  } else {
    setViewMode('preview');
    monacoEditor?.layout();
  }
  document.getElementById('preview-pane').scrollTop = 0;
  renderList(articles);
  renderNotesList(document.getElementById('notes-search')?.value || '');
  if (pushState) history.pushState({ path: relPath }, '', `#${relPath}`);
}

// ── ブラウザ進む・戻る ────────────────────────────────────────────────
window.addEventListener('popstate', e => {
  if (e.state?.path) {
    restorePanel('articles');
    openArticle(e.state.path, { pushState: false });
  } else if (e.state?.termId) {
    restorePanel('glossary');
    viewTerm(e.state.termId, { pushState: false });
  } else if (e.state?.panel) {
    switchToPanel(e.state.panel, { pushState: false });
  }
});

// ── Save ─────────────────────────────────────────────────────────────
async function saveArticle() {
  if (!currentPath) return;
  let raw = monacoEditor.getValue().replace(/\r\n/g, '\n');

  if (collectionConfig?.autoLink && glossaryTerms.length) {
    raw = await applyAutoLink(raw, currentPath);
    const pos = monacoEditor.getPosition();
    monacoEditor.setValue(raw);
    monacoEditor.setPosition(pos);
  }

  const res = await fetch(`/api/articles/${currentPath}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  if (res.ok) {
    showToast('保存しました', 'ok');
    const { fm } = parseFrontmatter(raw);
    const idx = articles.findIndex(a => a.path === currentPath);
    if (idx !== -1) {
      articles[idx] = {
        ...articles[idx],
        title: fm.title  || articles[idx].title,
        tags:  fm.tags   || articles[idx].tags,
        date:  fm.date   ? String(fm.date).slice(0, 10) : articles[idx].date,
        mtime: Date.now(),
      };
      renderList(articles);
    }
  } else showToast('保存失敗', 'err');
}

async function applyAutoLink(raw, relPath) {
  const { termLinkBase } = await fetch('/api/collection/link-info')
    .then(r => r.json()).catch(() => ({ termLinkBase: '../glossary/terms' }));
  const depth = relPath.split('/').length - 1;
  const prefix = '../'.repeat(depth) + termLinkBase + '/';
  const { fm, body } = parseFrontmatter(raw);
  const linked = autoLinkBodyForSave(body, prefix);
  const fmLines = raw.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0] ?? '';
  return fmLines ? fmLines + '\n\n' + linked : linked;
}

function autoLinkBodyForSave(body, termPrefix) {
  const index = getTermRegexIndex();

  const placeholders = [];
  let result = body;
  const linked = new Set();

  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, match => {
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(match);
    return ph;
  });
  result = result.replace(/```[\s\S]*?```|`[^`]+`/g, match => {
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(match);
    return ph;
  });

  for (const { name, id, regex } of index) {
    if (linked.has(id)) continue;
    if (!regex.test(result)) continue;
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${name}](${termPrefix}${id}.md)`);
    result = result.replace(regex, ph);
    linked.add(id);
  }
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`\x00${i}\x00`, placeholders[i]);
  }
  return result;
}

// ── Delete ───────────────────────────────────────────────────────────
async function deleteArticle() {
  if (!currentPath || !confirm(`「${currentPath}」を削除しますか？`)) return;
  await fetch(`/api/articles/${currentPath}`, { method: 'DELETE' });
  currentPath = null;
  monacoEditor.setValue('');
  document.getElementById('toolbar').style.display = 'none';
  const _sb = document.getElementById('status-bar');
  if (_sb) _sb.style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  loadArticles();
  showToast('削除しました', 'ok');
}

// ── New article / note modal ──────────────────────────────────────────
let _modalMode = 'article';

function populateModalCategorySelect() {
  const sel = document.getElementById('f-category');
  const src = ARTICLE_CATS.length ? ARTICLE_CATS : GLOSSARY_CATS;
  sel.innerHTML = src.length
    ? src.map(c => `<option value="${c.id}">${c.id} — ${c.label}</option>`).join('')
    : `<option value="general">general — 一般</option>`;
}

async function openNewModal(mode = 'article') {
  _modalMode = mode;
  const isNote = mode === 'note';

  document.getElementById('modal-title').textContent    = isNote ? '新規補遺を作成' : '新規記事を作成';
  document.getElementById('modal-id-label').textContent = isNote ? 'スラッグ（ファイル名）' : 'ID（自動）';
  document.getElementById('modal-cat-field').style.display = isNote ? 'none' : '';

  if (!isNote) populateModalCategorySelect();

  const tplRes = await fetch('/api/templates').then(r => r.json()).catch(() => []);
  const tplField = document.getElementById('modal-tpl-field');
  if (tplRes.length) {
    const sel = document.getElementById('f-template');
    sel.innerHTML = '<option value="">デフォルト</option>' +
      tplRes.map(t => `<option value="${t.file}">${t.name}</option>`).join('');
    tplField.style.display = '';
  } else {
    tplField.style.display = 'none';
  }

  if (!isNote) {
    const nextId = await fetch('/api/collection/next-id').then(r => r.json()).catch(() => ({}));
    document.getElementById('f-id').value = nextId.articleId || '';
    document.getElementById('f-id').readOnly = false;
  } else {
    document.getElementById('f-id').value = '';
    document.getElementById('f-id').readOnly = false;
  }

  document.getElementById('f-title').value = '';
  document.getElementById('f-tags').value  = '';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}

document.getElementById('btn-new').onclick      = () => openNewModal('article');
document.getElementById('btn-new-note').onclick  = () => openNewModal('note');
document.getElementById('modal-cancel').onclick  = () => document.getElementById('modal-overlay').classList.remove('open');

document.getElementById('modal-create').onclick = async () => {
  const title    = document.getElementById('f-title').value.trim();
  const id       = document.getElementById('f-id').value.trim();
  const tags     = document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  if (!title) { showToast('タイトルは必須です', 'err'); return; }

  let relPath, frontmatter;

  if (_modalMode === 'note') {
    const slug = id || title.toLowerCase().replace(/[^a-z0-9ぁ-ん一-龥]+/g, '_').slice(0, 40);
    relPath = `notes/${slug}.md`;
    frontmatter = { title, date: new Date().toISOString().slice(0, 10) };
  } else {
    const category = document.getElementById('f-category').value || 'misc';
    const slug = id || document.getElementById('f-id').value || 'article_001';
    relPath = `${category}/${slug}.md`;
    frontmatter = { title, id: slug, category, tags, date: new Date().toISOString().slice(0, 10) };
  }

  const template = document.getElementById('f-template')?.value || '';
  const res = await fetch('/api/articles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relPath, frontmatter, template }),
  });
  if (res.ok) {
    document.getElementById('modal-overlay').classList.remove('open');
    await loadArticles();
    openArticle(relPath);
    showToast(`作成しました: ${relPath}`, 'ok');
  } else {
    const err = await res.json();
    showToast(err.error || '作成失敗', 'err');
  }
};

// ── Prev/Next navigation ─────────────────────────────────────────────
function appendPrevNext(pane, currentArticlePath) {
  pane.querySelectorAll('.article-nav').forEach(el => el.remove());
  const current = articles.find(a => a.path === currentArticlePath);
  if (!current?.id) return;
  const idMatch = current.id.match(/^([a-z_]+)(\d+)$/);
  if (!idMatch) return;
  const [, prefix, numStr] = idMatch;
  const num = parseInt(numStr, 10);
  const regex = new RegExp(`^${prefix}\\d+$`);
  const sorted = articles
    .filter(a => a.id && regex.test(a.id) && !a.path.startsWith('notes/'))
    .sort((a, b) => parseInt(a.id.slice(prefix.length)) - parseInt(b.id.slice(prefix.length)));
  const idx = sorted.findIndex(a => a.id === current.id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
  if (!prev && !next) return;

  const nav = document.createElement('div');
  nav.className = 'article-nav';
  if (prev) {
    const btn = document.createElement('div');
    btn.className = 'article-nav-btn prev';
    btn.innerHTML = `<span class="nav-dir">← 前の記事</span><span class="nav-id">${prev.id}</span><span class="nav-title">${prev.title}</span>`;
    btn.onclick = () => openArticle(prev.path);
    nav.appendChild(btn);
  } else {
    nav.appendChild(document.createElement('div'));
  }
  if (next) {
    const btn = document.createElement('div');
    btn.className = 'article-nav-btn next';
    btn.innerHTML = `<span class="nav-dir">次の記事 →</span><span class="nav-id">${next.id}</span><span class="nav-title">${next.title}</span>`;
    btn.onclick = () => openArticle(next.path);
    nav.appendChild(btn);
  } else {
    nav.appendChild(document.createElement('div'));
  }
  pane.appendChild(nav);
}

// ── Article search ────────────────────────────────────────────────────
document.getElementById('search').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  renderList(articles.filter(a => a.title.toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q)));
};

document.getElementById('btn-save').onclick   = saveArticle;
document.getElementById('btn-delete').onclick = deleteArticle;
