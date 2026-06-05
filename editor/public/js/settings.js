// ── Settings modal ────────────────────────────────────────────────────
document.getElementById('btn-settings').onclick = () => openSettingsModal();

async function openSettingsModal(tab = 'categories') {
  await loadTplList();
  await renderColList();
  switchSettingsTab(tab);
  document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.stab === tab)
  );
  document.getElementById('stab-templates').style.display   = tab === 'templates'   ? 'flex' : 'none';
  document.getElementById('stab-collections').style.display = tab === 'collections' ? 'flex' : 'none';
  document.getElementById('stab-categories').style.display  = tab === 'categories'  ? 'flex' : 'none';
  if (tab === 'categories') renderCategoryTab();
}

function toggleNcPath() {
  const external = document.querySelector('input[name="nc-storage"]:checked')?.value === 'external';
  document.getElementById('nc-path').style.display = external ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  const det = document.querySelector('details:has(#nc-key)');
  if (det) det.addEventListener('toggle', () => {
    const arrow   = document.getElementById('nc-arrow');
    const group   = document.getElementById('col-settings-group');
    const result  = document.getElementById('nc-result');
    if (arrow) arrow.style.transform = det.open ? 'rotate(90deg)' : '';
    if (group)  group.style.display  = det.open ? 'none' : 'flex';
    if (!det.open && result) result.style.display = 'none';
  });
});

async function renderColList() {
  const res = await fetch('/api/collections').catch(() => null);
  if (!res || !res.ok) return;
  const data = await res.json();
  const el = document.getElementById('col-list');
  el.innerHTML = Object.entries(data.collections).map(([key, col]) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface2);border-radius:5px;font-size:13px;">
      <span style="font-family:monospace;color:var(--accent);min-width:80px;">${key}</span>
      <span style="flex:1;">${col.label}</span>
      ${key === data.active ? '<span style="font-size:11px;color:var(--success);font-weight:600;">● アクティブ</span>' : ''}
    </div>
  `).join('');

  const gitRadio = document.querySelector(`input[name="col-git"][value="${data.config?.git !== false ? 'on' : 'off'}"]`);
  if (gitRadio) gitRadio.checked = true;

  const alRadio = document.querySelector(`input[name="auto-link"][value="${data.config?.autoLink ? 'on' : 'off'}"]`);
  if (alRadio) alRadio.checked = true;

  const output = data.config?.output || ['markdown'];
  const fmt = output.includes('html') && output.includes('markdown') ? 'both'
    : output.includes('html') ? 'html' : 'markdown';
  const radio = document.querySelector(`input[name="output-format"][value="${fmt}"]`);
  if (radio) radio.checked = true;
  updateOutputHint(fmt);

  const prefixInput = document.getElementById('col-id-prefix');
  if (prefixInput) prefixInput.value = data.config?.idPrefix || '';
  const idFmtRadio = document.querySelector(`input[name="col-idformat"][value="${data.config?.idFormat || 'global-only'}"]`);
  if (idFmtRadio) idFmtRadio.checked = true;
}

async function setGitEnabled(value) {
  if (!value) {
    const ok = confirm(
      'Git 連携を無効にすると、内部ストレージのフォルダが .gitignore に追記されます。\n' +
      '再度有効にする場合は .gitignore を手動で編集する必要があります。\n\n' +
      '無効にしますか？'
    );
    if (!ok) {
      const radio = document.querySelector('input[name="col-git"][value="on"]');
      if (radio) radio.checked = true;
      return;
    }
  }
  const res = await fetch('/api/collection/config', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ git: value }),
  });
  if (res.ok) {
    const { config, gitignoreAdded } = await res.json();
    collectionConfig = config;
    applyCollectionConfig(config);
    const msg = value ? 'Git 連携: 有効' : ('Git 連携: 無効' + (gitignoreAdded ? '（.gitignore に追記しました）' : ''));
    showToast(msg, 'ok');
  } else { showToast('更新失敗', 'err'); }
}

async function setAutoLink(value) {
  const res = await fetch('/api/collection/config', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoLink: value }),
  });
  if (res.ok) {
    const { config } = await res.json();
    collectionConfig = config;
    showToast(`用語自動リンク: ${value ? '有効' : '無効'}`, 'ok');
  } else { showToast('更新失敗', 'err'); }
}

async function setOutputFormat(value) {
  const outputArr = value === 'both' ? ['markdown', 'html']
    : value === 'html' ? ['html'] : ['markdown'];
  const res = await fetch('/api/collection/config', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ output: outputArr }),
  });
  if (res.ok) {
    const { config } = await res.json();
    collectionConfig = config;
    updateOutputHint(value);
    showToast('出力形式を更新しました', 'ok');
  } else {
    showToast('更新失敗', 'err');
  }
}

async function setIdFormat(value) {
  const res = await fetch('/api/collection/config', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idFormat: value }),
  });
  if (res.ok) {
    const { config } = await res.json();
    collectionConfig = config;
    showToast('ID形式を更新しました', 'ok');
  } else { showToast('更新失敗', 'err'); }
}

let _idPrefixTimer = null;
function scheduleIdPrefixSave() {
  clearTimeout(_idPrefixTimer);
  _idPrefixTimer = setTimeout(saveIdPrefix, 800);
}

async function saveIdPrefix() {
  const val = document.getElementById('col-id-prefix')?.value.trim();
  if (!val) return;
  const res = await fetch('/api/collection/config', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idPrefix: val }),
  });
  if (res.ok) {
    const { config } = await res.json();
    collectionConfig = config;
    showToast('プレフィックスを更新しました', 'ok');
  } else { showToast('更新失敗', 'err'); }
}

function updateOutputHint(fmt) {
  const hints = {
    markdown: 'MD のみ保存（デフォルト）',
    html:     'HTML のみ保存 — .md ファイルは上書き保存しません',
    both:     '保存時に .md と .html を両方生成します',
  };
  const el = document.getElementById('output-format-hint');
  if (el) el.textContent = hints[fmt] || '';
}

async function createCollection() {
  const key      = document.getElementById('nc-key').value.trim();
  const label    = document.getElementById('nc-label').value.trim();
  const idPrefix = document.getElementById('nc-prefix').value.trim();
  const storage  = document.querySelector('input[name="nc-storage"]:checked')?.value || 'internal';
  const path     = document.getElementById('nc-path').value.trim();
  const cats     = document.querySelector('input[name="nc-cats"]:checked')?.value || 'default';
  const idFormat = document.querySelector('input[name="nc-idformat"]:checked')?.value || 'global-only';
  if (!key || !label) { showToast('キーと表示名は必須です', 'err'); return; }

  const res = await fetch('/api/collections', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, label, idPrefix, storage, path, cats, idFormat }),
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error || '作成失敗', 'err'); return; }

  document.getElementById('nc-key').value    = '';
  document.getElementById('nc-label').value  = '';
  document.getElementById('nc-prefix').value = '';
  await loadCollections();
  await renderColList();

  const resultEl    = document.getElementById('nc-result');
  const titleEl     = document.getElementById('nc-result-title');
  const gitignoreEl = document.getElementById('nc-result-gitignore');
  const switchBtn   = document.getElementById('nc-switch-btn');
  if (resultEl) {
    titleEl.textContent = `"${label}" を作成しました`;
    gitignoreEl.style.display = data.gitignoreAdded ? '' : 'none';
    switchBtn.onclick = async () => {
      await switchCollection(data.key);
      switchSettingsTab('collections');
      resultEl.style.display = 'none';
    };
    resultEl.style.display = '';
  }
}

async function loadTplList() {
  const list = await fetch('/api/templates').then(r => r.json()).catch(() => []);
  const sel = document.getElementById('tpl-select');
  sel.innerHTML = list.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
  if (list.length) await loadTplContent(list[0].name);
  else { document.getElementById('tpl-name').value = ''; document.getElementById('tpl-content').value = ''; }
  sel.onchange = () => loadTplContent(sel.value);
}

async function loadTplContent(name) {
  const data = await fetch(`/api/templates/${name}`).then(r => r.json()).catch(() => null);
  if (!data) return;
  document.getElementById('tpl-name').value    = data.name;
  document.getElementById('tpl-content').value = data.content;
}

function newTemplate() {
  document.getElementById('tpl-select').value   = '';
  document.getElementById('tpl-name').value     = '';
  document.getElementById('tpl-content').value  = '';
  document.getElementById('tpl-name').focus();
}

async function saveTemplate() {
  const name    = document.getElementById('tpl-name').value.trim();
  const content = document.getElementById('tpl-content').value;
  if (!name) { showToast('テンプレート名は必須です', 'err'); return; }
  const res = await fetch(`/api/templates/${name}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (res.ok) { showToast('保存しました', 'ok'); await loadTplList(); }
  else showToast('保存失敗', 'err');
}

async function deleteTemplate() {
  const name = document.getElementById('tpl-select').value;
  if (!name) return;
  if (!confirm(`"${name}" を削除しますか？`)) return;
  const res = await fetch(`/api/templates/${name}`, { method: 'DELETE' });
  if (res.ok) { showToast('削除しました', 'ok'); await loadTplList(); }
  else showToast('削除失敗', 'err');
}

// ── Category tab（settings-modal 内）────────────────────────────────
function openCatModal() { openSettingsModal('categories'); }

async function renderCategoryTab() {
  renderArtCatList();
  renderTermCatList();
}

function renderArtCatList() {
  const list = document.getElementById('art-cat-list');
  if (!list) return;
  const COL = 'grid-template-columns:90px 1fr 48px 48px 32px';
  const header = `<div style="display:grid;${COL};gap:6px;align-items:center;margin-bottom:2px;">
    <span style="font-size:10px;color:var(--text-muted);letter-spacing:.05em;">ID</span>
    <span style="font-size:10px;color:var(--text-muted);">ラベル</span>
    <span style="font-size:10px;color:var(--text-muted);text-align:center;">文字色</span>
    <span style="font-size:10px;color:var(--text-muted);text-align:center;">背景色</span>
    <span></span>
  </div>`;
  const rows = ARTICLE_CATS.map(c => `
    <div style="display:grid;${COL};gap:6px;align-items:center;">
      <span style="font-size:11px;font-family:monospace;color:var(--accent);padding:3px 0;">${c.id}</span>
      <input value="${c.label}" onchange="updateArtCat('${c.id}','label',this.value)"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;outline:none;">
      <input type="color" value="${c.color}" title="文字色" onchange="updateArtCat('${c.id}','color',this.value)"
        style="width:100%;height:26px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
      <input type="color" value="${c.bg}" title="背景色" onchange="updateArtCat('${c.id}','bg',this.value)"
        style="width:100%;height:26px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
      <button onclick="deleteArtCat('${c.id}')"
        style="background:#3a1a1a;border:1px solid #6b2a2a;border-radius:4px;color:#f87171;font-size:13px;padding:2px 6px;cursor:pointer;line-height:1;">×</button>
    </div>
  `).join('');
  const addRow = `<div style="display:grid;${COL};gap:6px;align-items:center;margin-top:4px;">
    <input id="new-art-cat-id"    placeholder="id（英数字）"
      style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:4px 8px;color:var(--text);font-size:12px;outline:none;">
    <input id="new-art-cat-label" placeholder="ラベル"
      style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:4px 8px;color:var(--text);font-size:12px;outline:none;">
    <input id="new-art-cat-color" type="color" value="#60a5fa" title="文字色"
      style="width:100%;height:28px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
    <input id="new-art-cat-bg"    type="color" value="#1a2440" title="背景色"
      style="width:100%;height:28px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
    <button onclick="addArtCat()"
      style="background:#1a3a1a;border:1px solid #2d5a2d;border-radius:4px;color:#86efac;font-size:12px;padding:4px 6px;cursor:pointer;white-space:nowrap;">＋</button>
  </div>`;
  list.innerHTML = (ARTICLE_CATS.length ? header + rows : '') + addRow;
}

async function addArtCat() {
  const id    = document.getElementById('new-art-cat-id')?.value.trim();
  const label = document.getElementById('new-art-cat-label')?.value.trim();
  const color = document.getElementById('new-art-cat-color')?.value || '#60a5fa';
  const bg    = document.getElementById('new-art-cat-bg')?.value    || '#1a2440';
  if (!id || !label) { showToast('IDとラベルは必須です', 'err'); return; }
  const res = await fetch('/api/article-categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, label, color, bg }),
  });
  if (!res.ok) {
    let msg = '追加失敗';
    try { const e = await res.json(); msg = e.error || msg; } catch {}
    showToast(msg, 'err'); return;
  }
  const cats = await fetch('/api/article-categories').then(r => r.json()).catch(() => ARTICLE_CATS);
  ARTICLE_CATS = cats;
  injectCatStyles();
  renderArtCatList();
  populateModalCategorySelect();
}

async function deleteArtCat(id) {
  if (!confirm(`記事カテゴリ "${id}" を削除しますか？`)) return;
  await fetch(`/api/article-categories/${id}`, { method: 'DELETE' });
  ARTICLE_CATS = ARTICLE_CATS.filter(c => c.id !== id);
  injectCatStyles();
  renderArtCatList();
  populateModalCategorySelect();
}

async function updateArtCat(id, field, value) {
  const cat = ARTICLE_CATS.find(c => c.id === id);
  if (!cat) return;
  cat[field] = value;
  await fetch(`/api/article-categories/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cat),
  });
  injectCatStyles();
}

function renderTermCatList() {
  const list = document.getElementById('term-cat-list');
  if (!list) return;
  const header = `<div style="display:grid;grid-template-columns:1fr 1fr 48px 48px 52px 32px;gap:6px;align-items:center;margin-bottom:2px;">
    <span style="font-size:10px;color:var(--text-muted);letter-spacing:.05em;">ID</span>
    <span style="font-size:10px;color:var(--text-muted);">ラベル</span>
    <span style="font-size:10px;color:var(--text-muted);text-align:center;">文字色</span>
    <span style="font-size:10px;color:var(--text-muted);text-align:center;">背景色</span>
    <span style="font-size:10px;color:var(--text-muted);text-align:center;">順序</span>
    <span></span>
  </div>`;
  list.innerHTML = header + GLOSSARY_CATS.map(c => `
    <div style="display:grid;grid-template-columns:1fr 1fr 48px 48px 52px 32px;gap:6px;align-items:center;">
      <span style="font-size:11px;font-family:monospace;color:var(--text-muted);">${c.id}</span>
      <input value="${c.label}" onchange="updateCat('${c.id}','label',this.value)"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;outline:none;">
      <input type="color" value="${c.color}" title="文字色" onchange="updateCat('${c.id}','color',this.value)"
        style="width:100%;height:26px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
      <input type="color" value="${c.bg}" title="背景色" onchange="updateCat('${c.id}','bg',this.value)"
        style="width:100%;height:26px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
      <input type="number" value="${c.sort}" min="1" title="表示順序" onchange="updateCat('${c.id}','sort',+this.value)"
        class="no-spin" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;width:100%;outline:none;">
      <button onclick="deleteCat('${c.id}')"
        style="background:#2a1212;border:1px solid #5a2020;border-radius:4px;color:var(--danger);font-size:11px;padding:3px 5px;cursor:pointer;">✕</button>
    </div>
  `).join('');
}

async function updateCat(id, field, value) {
  const cat = GLOSSARY_CATS.find(c => c.id === id);
  if (!cat) return;
  cat[field] = value;
  await fetch(`/api/glossary/categories/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cat)
  });
  await loadCategories();
  renderTermCatList();
}

async function deleteCat(id) {
  if (!confirm(`カテゴリ "${id}" を削除しますか？\n（このカテゴリの用語は残ります）`)) return;
  await fetch(`/api/glossary/categories/${id}`, { method: 'DELETE' });
  await loadCategories();
  renderTermCatList();
}

async function addCategory() {
  const id    = document.getElementById('new-cat-id').value.trim();
  const label = document.getElementById('new-cat-label').value.trim();
  const color = document.getElementById('new-cat-color').value;
  const bg    = document.getElementById('new-cat-bg').value;
  if (!id || !label) return alert('IDとラベルは必須です');
  const res = await fetch('/api/glossary/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, label, color, bg })
  });
  if (!res.ok) { const e = await res.json(); return alert(e.error); }
  document.getElementById('new-cat-id').value = '';
  document.getElementById('new-cat-label').value = '';
  await loadCategories();
  renderTermCatList();
  requestAnimationFrame(() => {
    const list = document.getElementById('term-cat-list');
    list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

async function generateGlossary(btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '生成中…';
  try {
    await fetch('/api/glossary/generate', { method: 'POST' });
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}
