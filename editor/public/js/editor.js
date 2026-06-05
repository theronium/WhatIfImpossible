// ── Monaco ───────────────────────────────────────────────────────────
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
require(['vs/editor/editor.main'], () => {
  monaco.editor.defineTheme('wii-dark', {
    base: 'vs-dark', inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0f1117',
      'editor.lineHighlightBackground': '#1a1d27',
      'editorLineNumber.foreground': '#3d4260',
    }
  });
  monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
    language: 'markdown',
    theme: 'wii-dark',
    fontSize: 14,
    lineHeight: 22,
    wordWrap: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
  });
  let _previewTimer = null;
  monacoEditor.onDidChangeModelContent(() => {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(updatePreview, 350);
  });
  window.addEventListener('resize', () => monacoEditor.layout());
  _monacoResolve();
});

// ── Markdown renderer ────────────────────────────────────────────────
const md = window.markdownit({ html: true, linkify: true, typographer: true });

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { fm: {}, body: raw };
  const body = raw.slice(m[0].length).trimStart();
  const fm = {};
  m[1].split(/\r?\n/).forEach(line => {
    const kv = line.match(/^(\w+):\s*(.+)/);
    if (!kv) return;
    const [, k, v] = kv;
    if (v.startsWith('[')) {
      fm[k] = v.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    } else {
      fm[k] = v.replace(/^['"]|['"]$/g, '');
    }
  });
  return { fm, body };
}

function buildFmCard(fm) {
  if (!fm.title) return '';
  const tags = (fm.tags || []).map(t => `<span class="fm-tag">${t}</span>`).join('');
  return `<div class="fm-card">
    <div class="fm-title">${fm.title}</div>
    <div class="fm-meta">
      ${fm.id ? `<span class="fm-id">${fm.id}</span>` : ''}
      ${fm.category ? `<span class="fm-category">${fm.category}</span>` : ''}
      ${fm.date ? `<span class="fm-date">${fm.date}</span>` : ''}
    </div>
    ${tags ? `<div class="fm-tags">${tags}</div>` : ''}
  </div>`;
}

function renderToPane(body, pane, fm = null) {
  // Mermaid: コードブロックをプレースホルダーに変換
  let mermaidBlocks = [];
  const rendered = md.render(body.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, code) => {
    const i = mermaidBlocks.length;
    mermaidBlocks.push(code.trim());
    return `<div class="mermaid-placeholder" data-idx="${i}"></div>`;
  }));
  pane.innerHTML = (fm ? buildFmCard(fm) : '') + rendered;

  // 相対パスの <img src> をエディタプレビュー用に /repo/docs/... へ書き換え
  if (typeof currentPath === 'string') {
    const dir = 'http://x/docs/' + currentPath.replace(/[^/]+$/, '');
    pane.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('/')) {
        img.src = '/repo' + new URL(src, dir).pathname;
      }
    });
  }

  // 見出しにアンカーIDを付与（TOC用）
  pane.querySelectorAll('h1,h2,h3,h4').forEach((el, i) => {
    const slug = el.textContent.trim().replace(/[^\p{L}\p{N}ぁ-ん一-龯ァ-ヶー]+/gu, '-').replace(/^-|-$/g, '') || `heading-${i}`;
    el.id = slug;
  });

  // Mermaid レンダリング
  pane.querySelectorAll('.mermaid-placeholder').forEach(el => {
    const code = mermaidBlocks[el.dataset.idx];
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code;
    el.replaceWith(div);
  });
  const mermaidNodes = pane.querySelectorAll('.mermaid');
  let mermaidPromise = Promise.resolve();
  if (mermaidNodes.length) {
    mermaidPromise = new Promise(resolve => {
      requestAnimationFrame(() => mermaid.run({ nodes: mermaidNodes }).then(resolve).catch(resolve));
    });
  }

  // KaTeX
  renderMathInElement(pane, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
    ],
    throwOnError: false,
  });

  // 用語リンク化
  linkTermsInPreview(pane);

  // .md リンクをインターセプトして記事間・補遺間ナビゲーションに変換
  pane.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http')) return;

    // #notes/path.md や #docs/path.md 形式のハッシュリンクをインターセプト
    if (href.startsWith('#')) {
      const hashPath = href.slice(1);
      if (hashPath.includes('/') && hashPath.endsWith('.md')) {
        a.addEventListener('click', e => {
          e.preventDefault();
          openArticle(hashPath);
        });
      }
      return;
    }

    const mdMatch = href.match(/^(.*\.md)(#(.*))?$/);
    if (!mdMatch) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      const mdPath = mdMatch[1];
      const anchor = mdMatch[3] || '';
      // glossary リンク（../glossary/xxx.md#gXXX または ../glossary/terms/gXXX.md）→ viewTerm
      const filenameId = mdPath.match(/\/(g\d+)\.md$/)?.[1];
      if (mdPath.includes('glossary/') && (/^g\d+$/.test(anchor) || filenameId)) {
        viewTerm(anchor || filenameId);
        return;
      }
      const base = currentPath ? `http://x/${currentPath}` : 'http://x/';
      const resolved = new URL(mdPath, base).pathname.replace(/^\//, '');
      openArticle(resolved);
    });
  });

  return mermaidPromise;
}

function addSvgZoom(pane) {
  pane.querySelectorAll('.mermaid').forEach(mermaidDiv => {
    const svg = mermaidDiv.querySelector('svg');
    if (!svg) return;
    mermaidDiv.style.overflow = 'hidden';
    mermaidDiv.style.cursor = 'grab';
    mermaidDiv.style.position = 'relative';
    mermaidDiv.style.height = '420px';
    mermaidDiv.style.border = '1px solid var(--border)';
    mermaidDiv.style.borderRadius = '8px';
    mermaidDiv.style.marginBottom = '20px';
    mermaidDiv.style.background = 'var(--surface)';
    svg.style.transformOrigin = '0 0';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    const hint = document.createElement('div');
    hint.textContent = 'ホイール：ズーム　ドラッグ：移動　ダブルクリック：リセット';
    hint.style.cssText = 'position:absolute;bottom:6px;right:8px;font-size:10px;color:var(--text-muted);pointer-events:none;z-index:10;';
    mermaidDiv.appendChild(hint);
    const fsBtn = document.createElement('button');
    fsBtn.textContent = '⛶ 全画面';
    fsBtn.className = 'btn-fullscreen';
    fsBtn.addEventListener('click', e => { e.stopPropagation(); openMermaidFullscreen(svg); });
    mermaidDiv.appendChild(fsBtn);
    let scale = 1, tx = 0, ty = 0, dragging = false, sx, sy;
    const apply = () => { svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    mermaidDiv.addEventListener('wheel', e => {
      e.preventDefault();
      scale = Math.max(0.1, Math.min(6, scale * (e.deltaY > 0 ? 0.85 : 1.15)));
      apply();
    }, { passive: false });
    mermaidDiv.addEventListener('mousedown', e => {
      dragging = true; sx = e.clientX - tx; sy = e.clientY - ty;
      mermaidDiv.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => { if (dragging) { tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
    window.addEventListener('mouseup', () => { dragging = false; mermaidDiv.style.cursor = 'grab'; });
    mermaidDiv.addEventListener('dblclick', () => { scale = 1; tx = 0; ty = 0; apply(); });
  });
}

// ── Mermaid fullscreen ────────────────────────────────────────────────
(function() {
  const fsOverlay  = () => document.getElementById('mermaid-fullscreen');
  const fsViewport = () => document.getElementById('mermaid-fs-viewport');
  const fsSvgWrap  = () => document.getElementById('mermaid-fs-svg-wrap');

  let fsScale = 1, fsTx = 0, fsTy = 0, fsDragging = false, fsSx, fsSy;
  const fsApply = () => {
    fsSvgWrap().style.transform = `translate(${fsTx}px,${fsTy}px) scale(${fsScale})`;
  };
  const fsFitToViewport = () => {
    const vp = fsViewport();
    const svg = fsSvgWrap().querySelector('svg');
    if (!svg) return;
    const vpW = vp.clientWidth, vpH = vp.clientHeight;
    const rect = svg.getBoundingClientRect();
    const svgW = rect.width  || parseFloat(svg.getAttribute('width'))  || 800;
    const svgH = rect.height || parseFloat(svg.getAttribute('height')) || 600;
    const padding = 40;
    fsScale = Math.min((vpW - padding) / svgW, (vpH - padding) / svgH);
    fsTx = (vpW - svgW * fsScale) / 2;
    fsTy = (vpH - svgH * fsScale) / 2;
    fsApply();
  };
  const fsReset = fsFitToViewport;

  window.openMermaidFullscreen = function(origSvg) {
    const wrap = fsSvgWrap();
    wrap.innerHTML = '';
    const clone = origSvg.cloneNode(true);
    clone.removeAttribute('style');
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    const vb = origSvg.viewBox?.baseVal;
    if (vb && vb.width > 0) {
      clone.setAttribute('width',  vb.width);
      clone.setAttribute('height', vb.height);
    }
    wrap.appendChild(clone);
    fsScale = 1; fsTx = 0; fsTy = 0; fsApply();
    fsOverlay().classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(fsFitToViewport));
  };

  document.addEventListener('DOMContentLoaded', () => {
    const vp = fsViewport();

    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prevScale = fsScale;
      fsScale = Math.max(0.05, Math.min(10, fsScale * (e.deltaY > 0 ? 0.85 : 1.15)));
      fsTx = mx - (mx - fsTx) * (fsScale / prevScale);
      fsTy = my - (my - fsTy) * (fsScale / prevScale);
      fsApply();
    }, { passive: false });

    vp.addEventListener('mousedown', e => {
      fsDragging = true; fsSx = e.clientX - fsTx; fsSy = e.clientY - fsTy;
      vp.classList.add('dragging');
    });
    window.addEventListener('mousemove', e => {
      if (!fsDragging) return;
      fsTx = e.clientX - fsSx; fsTy = e.clientY - fsSy; fsApply();
    });
    window.addEventListener('mouseup', () => { fsDragging = false; vp.classList.remove('dragging'); });

    vp.addEventListener('dblclick', fsReset);

    document.getElementById('fs-zoom-in').onclick  = () => { fsScale = Math.min(10, fsScale * 1.25); fsApply(); };
    document.getElementById('fs-zoom-out').onclick = () => { fsScale = Math.max(0.05, fsScale * 0.8); fsApply(); };
    document.getElementById('fs-reset').onclick    = fsReset;
    document.getElementById('fs-close').onclick    = () => fsOverlay().classList.remove('open');

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') fsOverlay().classList.remove('open');
    });
  });
})();

function updatePreview() {
  if (viewMode === 'edit') return;
  const raw = monacoEditor?.getValue() ?? '';
  const pane = document.getElementById('preview-pane');
  const { fm, body } = parseFrontmatter(raw);
  renderToPane(body, pane, fm).then(() => {
    addSvgZoom(pane);
    if (currentPath && !currentPath.startsWith('notes/')) appendPrevNext(pane, currentPath);
    renderToc();
    renderTechtreeToc(pane);
  });
}

// ── View mode ─────────────────────────────────────────────────────────
function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  const mc = document.getElementById('monaco-container');
  const pp = document.getElementById('preview-pane');
  if (viewMode === 'edit') { mc.style.display = 'block'; pp.style.display = 'none'; }
  else if (viewMode === 'preview') { mc.style.display = 'none'; pp.style.display = 'block'; }
  else { mc.style.display = 'block'; pp.style.display = 'block'; }
  monacoEditor?.layout();
  updatePreview();
}

document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.onclick = () => setViewMode(tab.dataset.mode);
});

// ── TOC ──────────────────────────────────────────────────────────────
function renderToc() {
  const list = document.getElementById('toc-list');
  const pane = document.getElementById('preview-pane');
  const aside = document.getElementById('toc-aside');
  const headings = pane.querySelectorAll('h2, h3');
  if (!headings.length) {
    aside.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  const collapsed = localStorage.getItem('tocCollapsed') === '1';
  aside.style.display = '';
  aside.classList.toggle('collapsed', collapsed);
  document.getElementById('toc-toggle-icon').textContent = collapsed ? '‹' : '›';
  let n2 = 0, n3 = 0;
  list.innerHTML = '';
  headings.forEach(h => {
    const isH2 = h.tagName === 'H2';
    if (isH2) { n2++; n3 = 0; }
    else n3++;
    const num  = isH2 ? `${n2}.` : `${n2}.${n3}`;
    const text = h.textContent.replace(/^\d+\.\s*/, '').trim();
    const item = document.createElement('div');
    item.className = `toc-item ${isH2 ? 'h2' : 'h3'}`;
    item.innerHTML = `<span class="toc-num">${num}</span><span>${text}</span>`;
    item.onclick = () => {
      const hRect    = h.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      pane.scrollTop += hRect.top - paneRect.top - 8;
    };
    list.appendChild(item);
  });
}

function toggleTocAside() {
  const aside = document.getElementById('toc-aside');
  const collapsed = aside.classList.toggle('collapsed');
  document.getElementById('toc-toggle-icon').textContent = collapsed ? '‹' : '›';
  localStorage.setItem('tocCollapsed', collapsed ? '1' : '0');
}
