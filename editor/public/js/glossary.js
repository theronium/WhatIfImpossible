// ── 記事プレビューのテキストノード収集（共通ヘルパー） ──────────────────
function _walkTextNodes(pane) {
  const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('code, pre, a, .term-link, .symbol-link, h1, h2, h3, h4, .mermaid'))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  return textNodes;
}

// ── 記事プレビューの用語リンク化 ─────────────────────────────────────
function linkTermsInPreview(pane) {
  if (!glossaryTerms.length) return;
  const index = getTermRegexIndex();
  const textNodes = _walkTextNodes(pane);

  for (const node of textNodes) {
    let html = node.textContent
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const placeholders = [];
    const linked = new Set();

    html = html.replace(/\bwiim_\d+\b/g, id => {
      const art = articles.find(a => a.id === id);
      if (!art) return id;
      const ph = `\x00${placeholders.length}\x00`;
      placeholders.push(`<a href="#" class="article-inline-link" data-art-path="${art.path}">${id}</a>`);
      return ph;
    });

    for (const { name, id, regex } of index) {
      if (linked.has(id)) continue;
      if (!regex.test(html)) continue;
      const ph = `\x00${placeholders.length}\x00`;
      placeholders.push(`<span class="term-link" data-term-id="${id}">${name}</span>`);
      html = html.replace(regex, ph);
      linked.add(id);
    }
    if (!placeholders.length) continue;

    for (let i = 0; i < placeholders.length; i++)
      html = html.replace(`\x00${i}\x00`, placeholders[i]);

    const wrap = document.createElement('span');
    wrap.innerHTML = html;
    node.parentNode.replaceChild(wrap, node);
  }
}

document.addEventListener('click', e => {
  const link = e.target.closest('.article-inline-link');
  if (!link) return;
  e.preventDefault();
  openArticle(link.dataset.artPath);
});

// ── 記事プレビューの記号リンク化 ─────────────────────────────────────
function linkSymbolsInPreview(pane) {
  if (!symbolTerms.length) return;
  const { regex, map } = getSymbolData();
  const textNodes = _walkTextNodes(pane);

  for (const node of textNodes) {
    const text = node.textContent;
    regex.lastIndex = 0;
    if (!regex.test(text)) continue;

    regex.lastIndex = 0;
    const html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(regex, match => {
        const id = map[match];
        return id ? `<span class="symbol-link" data-symbol-id="${id}">${match}</span>` : match;
      });

    const wrap = document.createElement('span');
    wrap.innerHTML = html;
    node.parentNode.replaceChild(wrap, node);
  }
}

// ── 記号ポップアップの表示 ────────────────────────────────────────────
function _positionPopup(popup, anchorRect) {
  popup.style.top  = '-9999px';
  popup.style.left = '-9999px';
  popup.classList.add('visible');
  const ph = popup.offsetHeight;
  const pw = popup.offsetWidth;
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
  const top = spaceBelow >= ph
    ? anchorRect.bottom + 6
    : Math.max(8, anchorRect.top - ph - 6);
  const left = Math.min(anchorRect.left, window.innerWidth - pw - 8);
  popup.style.top  = `${top}px`;
  popup.style.left = `${Math.max(8, left)}px`;
}

document.addEventListener('click', e => {
  const link = e.target.closest('.symbol-link');
  const popup = document.getElementById('symbol-popup');
  if (link) {
    const s = symbolTerms.find(s => s.id === link.dataset.symbolId);
    if (!s) return;
    document.getElementById('sp-symbol').textContent = s.symbol;
    document.getElementById('sp-name').textContent = s.name + (s.en ? `（${s.en}）` : '');
    document.getElementById('sp-latex').textContent = s.latex || '';
    document.getElementById('sp-body').innerHTML = md.render(s.body || '');
    _positionPopup(popup, link.getBoundingClientRect());
    e.stopPropagation();
    return;
  }
  if (!e.target.closest('#symbol-popup')) popup?.classList.remove('visible');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('symbol-popup')?.classList.remove('visible');
});

// ── 用語ポップアップの表示 ────────────────────────────────────────────
function getTermPopup() { return document.getElementById('term-popup'); }

document.addEventListener('click', e => {
  const popup = getTermPopup();
  const link = e.target.closest('.term-link');
  if (link) {
    const t = glossaryTerms.find(t => t.id === link.dataset.termId);
    if (!t) return;
    document.getElementById('tp-name').textContent = t.name;
    document.getElementById('tp-en').textContent = t.en || '';
    document.getElementById('tp-badge').innerHTML =
      `<span class="cat-badge ${t.category}">${GLOSSARY_LABELS[t.category] || t.category}</span>`;
    const _tpBody = document.getElementById('tp-body');
    _tpBody.innerHTML = md.render(t.body || '');
    _tpBody.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('/')) {
        img.src = '/repo' + new URL(src, 'http://x/glossary/terms/').pathname;
      }
    });
    document.getElementById('tp-goto').onclick = () => {
      popup.classList.remove('visible');
      document.querySelector('.tab-btn[data-tab="glossary"]')?.click();
      setTimeout(() => viewTerm(t.id), 100);
    };
    _positionPopup(popup, link.getBoundingClientRect());
    e.stopPropagation();
    return;
  }
  if (!e.target.closest('#term-popup')) popup?.classList.remove('visible');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') getTermPopup()?.classList.remove('visible');
});

// ── 用語本文の自動リンク化（エディタ用） ──────────────────────────────
function autoLinkBodyEditor(body, selfId) {
  const index = getTermRegexIndex();

  const placeholders = [];
  let result = body;
  const linked = new Set();

  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, match => {
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(match);
    return ph;
  });

  result = result.replace(/\bwiim_\d+\b/g, id => {
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${id}](#${id})`);
    return ph;
  });

  for (const { name, id, regex } of index) {
    if (id === selfId) continue;
    if (linked.has(id)) continue;
    if (!regex.test(result)) continue;
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${name}](#${id})`);
    result = result.replace(regex, ph);
    linked.add(id);
  }
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`\x00${i}\x00`, placeholders[i]);
  }
  return result;
}

// ── 関連記事フィールドのHTML生成 ────────────────────────────────────
function buildRelatedHtml(related) {
  if (!related || related.length === 0) return '—';
  return related.map(id => {
    if (/^g\d+$/.test(id)) {
      const t = glossaryTerms.find(t => t.id === id);
      const label = t ? t.name : id;
      return `<a href="#" class="rel-link" data-rel-type="term" data-rel-id="${id}">${label}</a>`;
    }
    if (/^wiim_\d+$/.test(id)) {
      const a = articles.find(a => a.id === id);
      if (a) return `<a href="#" class="rel-link" data-rel-type="article" data-rel-path="${a.path}">${id}</a>`;
      return `<span>${id}</span>`;
    }
    return `<span>${id}</span>`;
  }).join(', ');
}

// ── Glossary search ───────────────────────────────────────────────────
document.getElementById('glossary-search').oninput = (e) => {
  renderGlossaryList(e.target.value);
};

// ── Glossary ──────────────────────────────────────────────────────────
async function loadGlossaryTerms() {
  const res = await fetch('/api/glossary/terms');
  glossaryTerms = await res.json();
  _termRegexIndex = null;
  renderGlossaryList();
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _termRowHtml(t, extra = '') {
  const isActive = t.id === viewingTermId || t.id === currentTermId;
  return `<div class="gterm-row${extra}${isActive ? ' active' : ''}">` +
    `<span class="gterm-name" data-view="${t.id}" title="${_esc(t.en || '')}">${_esc(t.name)}</span>` +
    `<button class="btn-edit-sm" data-edit="${t.id}">編集</button></div>`;
}

function _symbolRowHtml(s) {
  const isActive = s.id === viewingSymbolId;
  return `<div class="gterm-row${isActive ? ' active' : ''}">` +
    `<span class="gterm-name symbol-row-name" data-view-symbol="${s.id}" title="${_esc(s.en || '')}">` +
    `<span class="symbol-row-char">${_esc(s.symbol)}</span> ${_esc(s.name)}</span></div>`;
}

const _GROUP_CONFIG = {
  'wiim-concepts': {
    order: ['particles', 'fungi-bio', 'qualia', 'metric', 'casimir', 'communication', 'concept'],
    labels: { particles: '粒子', 'fungi-bio': '菌類・生命', qualia: 'クオリア', metric: '時空計量', casimir: 'カシミール', communication: '通信', concept: '概念' },
  },
  'wiim-engineering': {
    order: ['particles', 'fungi-bio', 'qualia', 'metric', 'casimir', 'communication', 'concept'],
    labels: { particles: '粒子', 'fungi-bio': '菌類・生命', qualia: 'クオリア', metric: '時空計量', casimir: 'カシミール', communication: '通信', concept: '概念' },
  },
  'physics': {
    order: ['thermodynamics', 'relativity', 'electromagnetism', 'optics', 'mechanics', 'bh-info', 'acoustics', 'condensed-matter', 'geometry', 'information'],
    labels: { thermodynamics: '熱力学・統計力学', relativity: '相対論・時空', electromagnetism: '電磁気学', optics: '光学', mechanics: '古典力学・流体', 'bh-info': 'ブラックホール・情報物理', acoustics: '音響・波動', 'condensed-matter': '磁性・物性', geometry: '幾何・構造', information: '情報・計算' },
  },
  'astronomy': {
    order: ['black-holes', 'cosmology', 'observation', 'stellar', 'orbital'],
    labels: { 'black-holes': 'ブラックホール・相対論天体', cosmology: '宇宙論・宇宙構造', observation: '天文観測・測定', stellar: '恒星・星雲・小天体', orbital: '軌道力学・宇宙工学' },
  },
  'quantum': {
    order: ['foundations', 'quantum-info', 'quantum-gravity', 'quantum-matter'],
    labels: { foundations: '量子力学の基礎・解釈', 'quantum-info': '量子情報・通信', 'quantum-gravity': '量子重力・ホログラフィー', 'quantum-matter': '量子物性・超低温' },
  },
  'mathematics': {
    order: ['logic-foundations', 'topology', 'algebra-number', 'analysis-probability'],
    labels: { 'logic-foundations': '論理・基礎論', topology: '位相・幾何', 'algebra-number': '代数・数論', 'analysis-probability': '解析・確率' },
  },
  'philosophy': {
    order: ['consciousness', 'metaphysics', 'epistemology'],
    labels: { consciousness: '意識・心の哲学', metaphysics: '形而上学・存在論', epistemology: '認識論・科学哲学' },
  },
  'particle': {
    order: ['standard-model', 'beyond-sm', 'nuclear'],
    labels: { 'standard-model': '標準模型・素粒子', 'beyond-sm': '統一理論・超弦', nuclear: '核物理・核融合' },
  },
  'biology': {
    order: ['evolution', 'ecology-microbio'],
    labels: { evolution: '進化・遺伝学', 'ecology-microbio': '生態・微生物・菌類' },
  },
  'sf-concepts': {
    order: ['megastructures', 'paradox-civilization', 'mythology-legend'],
    labels: { megastructures: '巨大構造物・宇宙探査', 'paradox-civilization': 'パラドックス・文明', 'mythology-legend': '神話・伝説・古代技術' },
  },
  'speculative': {
    order: ['dark-cosmos', 'exotic-matter'],
    labels: { 'dark-cosmos': 'ダーク宇宙論', 'exotic-matter': 'エキゾチック物質・仮説粒子' },
  },
};

function renderGlossaryList(query = '') {
  const el = document.getElementById('glossary-list');
  const q = query.toLowerCase();
  const filtered = glossaryTerms.filter(t =>
    !q ||
    t.name.toLowerCase().includes(q) ||
    t.reading.includes(q) ||
    (t.en || '').toLowerCase().includes(q) ||
    (t.aliases || []).some(a => a.toLowerCase().includes(q))
  );

  const filteredSymbols = symbolTerms.filter(s =>
    !q ||
    s.symbol.includes(q) ||
    s.name.toLowerCase().includes(q) ||
    (s.en || '').toLowerCase().includes(q) ||
    (s.latex || '').toLowerCase().includes(q) ||
    (s.reading || '').includes(q) ||
    (s.aliases || []).some(a => a.toLowerCase().includes(q))
  );

  if (filtered.length === 0 && filteredSymbols.length === 0) {
    el.innerHTML = `<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);">該当なし</div>`;
    return;
  }

  const parts = [];

  if (!q) {
    const RECENT_COUNT = 10;
    const recent = [...glossaryTerms].sort((a, b) => b.id.localeCompare(a.id)).slice(0, RECENT_COUNT);
    const rid = '__recent__';
    const collapsed = collapsedCats.has(rid);
    parts.push(
      `<div class="gcat-header${collapsed ? ' collapsed' : ''}" data-gcat="${rid}" style="background:#1a2020;color:#34d399;">` +
      `NEW <span class="gcat-count">(直近${RECENT_COUNT}件)</span><span class="arrow">▼</span></div>`
    );
    if (!collapsed) {
      parts.push('<div class="gcat-terms">');
      recent.forEach(t => parts.push(_termRowHtml(t)));
      parts.push('</div>');
    }
  }

  for (const cat of GLOSSARY_CATS) {
    const terms = filtered.filter(t => t.category === cat.id);
    if (!terms.length) continue;
    const collapsed = collapsedCats.has(cat.id);
    parts.push(
      `<div class="gcat-header ${_esc(cat.id)}${collapsed ? ' collapsed' : ''}" data-gcat="${_esc(cat.id)}">` +
      `${_esc(cat.label)} <span class="gcat-count">(${terms.length})</span><span class="arrow">▼</span></div>`
    );
    if (collapsed) continue;

    parts.push('<div class="gcat-terms">');
    const cfg = !q && _GROUP_CONFIG[cat.id];
    if (cfg) {
      const byGroup = {};
      for (const t of terms) {
        const g = t.group || '__other__';
        (byGroup[g] = byGroup[g] || []).push(t);
      }
      const keys = [...cfg.order.filter(k => byGroup[k]), ...(byGroup['__other__'] ? ['__other__'] : [])];
      for (const key of keys) {
        parts.push(`<div class="ggroup-header">${cfg.labels[key] || key}</div>`);
        [...byGroup[key]].sort((a, b) => a.reading.localeCompare(b.reading, 'ja'))
          .forEach(t => parts.push(_termRowHtml(t, ' grouped')));
      }
    } else {
      [...terms].sort((a, b) => a.reading.localeCompare(b.reading, 'ja'))
        .forEach(t => parts.push(_termRowHtml(t)));
    }
    parts.push('</div>');
  }

  // ── 記号セクション ──────────────────────────────────────────────────
  if (filteredSymbols.length > 0) {
    const sid = '__symbols__';
    const collapsed = collapsedCats.has(sid);
    parts.push(
      `<div class="gcat-header${collapsed ? ' collapsed' : ''}" data-gcat="${sid}" style="background:#1a1a10;color:#fcd34d;">` +
      `記号 <span class="gcat-count">(${filteredSymbols.length})</span><span class="arrow">▼</span></div>`
    );
    if (!collapsed) {
      parts.push('<div class="gcat-terms">');
      filteredSymbols.forEach(s => parts.push(_symbolRowHtml(s)));
      parts.push('</div>');
    }
  }

  el.innerHTML = parts.join('');
}

document.getElementById('glossary-list').addEventListener('click', e => {
  const symEl = e.target.closest('[data-view-symbol]');
  if (symEl) { viewSymbol(symEl.dataset.viewSymbol); return; }
  const viewEl = e.target.closest('[data-view]');
  if (viewEl) { viewTerm(viewEl.dataset.view); return; }
  const editEl = e.target.closest('[data-edit]');
  if (editEl) { editTerm(editEl.dataset.edit); return; }
  const catEl = e.target.closest('[data-gcat]');
  if (catEl) {
    const id = catEl.dataset.gcat;
    if (collapsedCats.has(id)) collapsedCats.delete(id); else collapsedCats.add(id);
    localStorage.setItem('collapsedCats', JSON.stringify([...collapsedCats]));
    renderGlossaryList(document.getElementById('glossary-search').value);
  }
});

// ── 用語閲覧（プレビュー）────────────────────────────────────────────
function viewTerm(id, { pushState = true } = {}) {
  const term = glossaryTerms.find(t => t.id === id);
  if (!term) return;
  viewingTermId = id;
  viewingSymbolId = null;
  if (pushState) history.pushState({ termId: id }, '', `#glossary/${id}`);
  currentTermId = null;

  document.getElementById('glossary-form-area').classList.remove('active');
  document.getElementById('editor-panes').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('toc-aside').style.display = 'none';

  const _sbView = document.getElementById('status-bar');
  if (_sbView) { _sbView.textContent = activeGlossaryDir ? `${activeGlossaryDir}/terms/${term.id}.md` : `terms/${term.id}.md`; _sbView.style.display = ''; }
  document.getElementById('toolbar').style.display = 'flex';
  document.querySelector('.mode-tabs').style.display = 'none';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-delete').style.display = 'none';
  document.getElementById('btn-edit-viewing').style.display = '';
  document.getElementById('file-path').textContent = `${term.id}  ${term.name}${term.en ? '（' + term.en + '）' : ''}`;

  const relatedHtml = buildRelatedHtml(term.related);
  const aliases = (term.aliases || []).length > 0 ? term.aliases.join(' / ') : null;
  const linkedBody = autoLinkBodyEditor(term.body || '', term.id);
  const mdBody = md.render(linkedBody);
  document.getElementById('preview-pane').innerHTML = `
    <div class="tv-card">
      <div class="tv-title">${term.name}${term.en ? `（${term.en}）` : ''}</div>
      ${term.en ? `<div class="tv-en">${term.en}</div>` : ''}
      <div class="tv-meta">
        <span class="cat-badge ${term.category}">${GLOSSARY_LABELS[term.category] || term.category}</span>
        ${term.group ? `<span class="tv-group">${_GROUP_CONFIG[term.category]?.labels[term.group] || term.group}</span>` : ''}
        <span>${term.field || ''}</span>
        <span style="margin-left:auto;font-family:monospace">${term.id}</span>
      </div>
      <div class="tv-meta" style="margin-top:4px">
        <span>読み: ${term.reading}</span>
        ${aliases ? `<span>別名: ${aliases}</span>` : ''}
        <span>関連: ${relatedHtml}</span>
      </div>
    </div>
    <div class="tv-body">${mdBody}</div>`;

  document.getElementById('preview-pane').querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('/')) {
      img.src = '/repo' + new URL(src, 'http://x/glossary/terms/').pathname;
    }
  });

  document.getElementById('preview-pane').querySelectorAll('a.rel-link').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      if (a.dataset.relType === 'term') viewTerm(a.dataset.relId, { pushState: true });
      else if (a.dataset.relType === 'article') openArticle(a.dataset.relPath);
    };
  });

  document.querySelector('.tv-body').querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href').slice(1);
    a.onclick = (e) => {
      e.preventDefault();
      if (/^g\d+$/.test(href)) {
        viewTerm(href, { pushState: true });
      } else if (/^wiim_\d+$/.test(href)) {
        const art = articles.find(a => a.id === href);
        if (art) openArticle(art.path);
      }
    };
  });

  linkSymbolsInPreview(document.querySelector('.tv-body'));

  document.getElementById('monaco-container').style.display = 'none';
  document.getElementById('preview-pane').style.display = 'block';
  monacoEditor?.layout();
  renderGlossaryList(document.getElementById('glossary-search').value);
}

// ── 記号閲覧（プレビュー）──────────────────────────────────────────────
function viewSymbol(id) {
  const s = symbolTerms.find(s => s.id === id);
  if (!s) return;
  viewingSymbolId = id;
  viewingTermId = null;
  currentTermId = null;

  document.getElementById('glossary-form-area').classList.remove('active');
  document.getElementById('editor-panes').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('toc-aside').style.display = 'none';

  const _sb = document.getElementById('status-bar');
  if (_sb) { _sb.textContent = `symbols/${s.id}`; _sb.style.display = ''; }
  document.getElementById('toolbar').style.display = 'flex';
  document.querySelector('.mode-tabs').style.display = 'none';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-delete').style.display = 'none';
  document.getElementById('btn-edit-viewing').style.display = 'none';
  document.getElementById('file-path').textContent = `${s.id}  ${s.symbol}  ${s.name}`;

  document.getElementById('preview-pane').innerHTML = `
    <div class="tv-card">
      <div class="tv-title" style="font-size:48px;text-align:center;line-height:1.2;margin-bottom:12px">${_esc(s.symbol)}</div>
      <div class="tv-title" style="font-size:18px">${_esc(s.name)}${s.en ? `（${s.en}）` : ''}</div>
      <div class="tv-meta">
        <span class="cat-badge ${s.category}">${GLOSSARY_LABELS[s.category] || s.category}</span>
        ${s.latex ? `<code style="background:#2d2a18;color:#fcd34d;padding:2px 8px;border-radius:4px;font-size:13px">${_esc(s.latex)}</code>` : ''}
        ${(s.aliases||[]).length ? `<span style="color:var(--text-muted);font-size:12px">別称: ${s.aliases.join(' / ')}</span>` : ''}
        <span style="margin-left:auto;font-family:monospace">${s.id}</span>
      </div>
    </div>
    <div class="tv-body">${md.render(s.body || '')}</div>`;

  document.getElementById('monaco-container').style.display = 'none';
  document.getElementById('preview-pane').style.display = 'block';
  monacoEditor?.layout();
  renderGlossaryList(document.getElementById('glossary-search').value);
}

document.getElementById('btn-edit-viewing').onclick = () => {
  if (viewingTermId) {
    editTerm(viewingTermId);
  } else if (currentPath?.startsWith('notes/')) {
    document.getElementById('btn-edit-viewing').style.display = 'none';
    document.getElementById('btn-save').style.display = '';
    document.getElementById('btn-delete').style.display = '';
    document.querySelector('.mode-tabs').style.display = '';
    document.getElementById('monaco-container').style.display = '';
    document.getElementById('preview-pane').style.display = 'none';
    setViewMode('edit');
    monacoEditor?.layout();
  }
};

// ── 用語編集フォームを開く ───────────────────────────────────────────
function showGlossaryForm() {
  document.getElementById('editor-panes').style.display = 'none';
  document.getElementById('toolbar').style.display = 'none';
  const _sbHide = document.getElementById('status-bar');
  if (_sbHide) _sbHide.style.display = 'none';
  document.getElementById('glossary-form-area').classList.add('active');
}

function editTerm(id) {
  const term = glossaryTerms.find(t => t.id === id);
  if (!term) return;
  currentTermId = id;
  viewingTermId = null;

  document.getElementById('gf-id-label').textContent = `${term.id} / ${term.name}`;
  const _gfsb = document.getElementById('gf-status-bar');
  if (_gfsb) { _gfsb.textContent = activeGlossaryDir ? `${activeGlossaryDir}/terms/${term.id}.md` : `terms/${term.id}.md`; _gfsb.style.display = ''; }
  document.getElementById('gf-name').value = term.name || '';
  document.getElementById('gf-en').value = term.en || '';
  document.getElementById('gf-reading').value = term.reading || '';
  document.getElementById('gf-category').value = term.category || 'astronomy';
  document.getElementById('gf-field').value = term.field || '';
  document.getElementById('gf-related').value = (term.related || []).join(', ');
  document.getElementById('gf-aliases').value = (term.aliases || []).join(', ');
  document.getElementById('gf-body-text').value = term.body || '';
  document.getElementById('btn-delete-term').style.display = '';

  showGlossaryForm();
  renderGlossaryList(document.getElementById('glossary-search').value);
}

const openTerm = editTerm;

function openNewTerm() {
  currentTermId = null;
  viewingTermId = null;
  document.getElementById('gf-id-label').textContent = '新規用語';
  const _gfsbNew = document.getElementById('gf-status-bar');
  if (_gfsbNew) { _gfsbNew.textContent = activeGlossaryDir ? `${activeGlossaryDir}/terms/（保存後に確定）` : '（保存後に確定）'; _gfsbNew.style.display = ''; }
  document.getElementById('gf-name').value = '';
  document.getElementById('gf-en').value = '';
  document.getElementById('gf-reading').value = '';
  document.getElementById('gf-category').value = 'sf-concepts';
  document.getElementById('gf-field').value = '';
  document.getElementById('gf-related').value = '';
  document.getElementById('gf-aliases').value = '';
  document.getElementById('gf-body-text').value = '';
  document.getElementById('btn-delete-term').style.display = 'none';

  showGlossaryForm();
  renderGlossaryList(document.getElementById('glossary-search').value);
  document.getElementById('gf-name').focus();
}

async function saveTerm() {
  const name    = document.getElementById('gf-name').value.trim();
  const reading = document.getElementById('gf-reading').value.trim();
  const body    = document.getElementById('gf-body-text').value.trim();
  if (!name || !reading || !body) { showToast('用語名・よみがな・説明文は必須です', 'err'); return; }

  const enVal = document.getElementById('gf-en').value.trim();
  const relatedRaw = document.getElementById('gf-related').value.trim();
  const aliasesRaw = document.getElementById('gf-aliases').value.trim();
  const payload = {
    name,
    en: enVal || null,
    reading,
    category: document.getElementById('gf-category').value,
    field: document.getElementById('gf-field').value.trim(),
    related: relatedRaw ? relatedRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    aliases: aliasesRaw ? aliasesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    body,
  };

  const url    = currentTermId ? `/api/glossary/terms/${currentTermId}` : '/api/glossary/terms';
  const method = currentTermId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const data = await res.json();
    if (!currentTermId) {
      currentTermId = data.term.id;
      glossaryTerms.push(data.term);
    } else {
      const idx = glossaryTerms.findIndex(t => t.id === currentTermId);
      if (idx !== -1) glossaryTerms[idx] = { ...glossaryTerms[idx], ...payload };
    }
    _termRegexIndex = null;
    showToast('保存しました', 'ok');
    renderGlossaryList(document.getElementById('glossary-search').value);
    document.getElementById('gf-id-label').textContent = `${currentTermId} / ${name}`;
    document.getElementById('btn-delete-term').style.display = '';
    // loadGlossaryTerms() は呼ばない。WS reload-glossary が最終的に同期する。
  } else {
    const e = await res.json();
    showToast(e.error || '保存失敗', 'err');
  }
}

async function deleteTerm() {
  if (!currentTermId) return;
  const term = glossaryTerms.find(t => t.id === currentTermId);
  if (!confirm(`「${term?.name}」を削除しますか？`)) return;

  const res = await fetch(`/api/glossary/terms/${currentTermId}`, { method: 'DELETE' });
  if (res.ok) {
    currentTermId = null;
    viewingTermId = null;
    document.getElementById('glossary-form-area').classList.remove('active');
    document.getElementById('editor-panes').style.display = 'flex';
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    showToast('削除しました', 'ok');
    await loadGlossaryTerms();
  } else {
    showToast('削除失敗', 'err');
  }
}

document.getElementById('btn-save-term').onclick  = saveTerm;
document.getElementById('btn-delete-term').onclick = deleteTerm;
document.getElementById('btn-new-term').onclick    = openNewTerm;
