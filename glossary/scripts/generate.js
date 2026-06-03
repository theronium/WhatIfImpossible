#!/usr/bin/env node
// generate.js — data/terms.jsonl から各カテゴリの .md を再生成する
// 使い方: node glossary/scripts/generate.js
'use strict';

const fs   = require('fs');
const path = require('path');
const perf = require('./perf-log');

const GLOSSARY_DIR    = process.env.GLOSSARY_DIR || path.join(__dirname, '..');
const DATA_FILE       = path.join(GLOSSARY_DIR, 'data', 'terms.jsonl');
const CATEGORIES_FILE = path.join(GLOSSARY_DIR, 'categories.json');

// docs/ を動的スキャンして 記事 ID → サブフォルダ のマップを構築
function buildArticleFolders() {
  const docsDir = path.join(GLOSSARY_DIR, '..', 'docs');
  const map = {};
  if (!fs.existsSync(docsDir)) return map;
  for (const sub of fs.readdirSync(docsDir)) {
    const subPath = path.join(docsDir, sub);
    if (!fs.statSync(subPath).isDirectory()) continue;
    for (const file of fs.readdirSync(subPath)) {
      const m = file.match(/^(wiim_\d+)\.md$/);
      if (m) map[m[1]] = sub;
    }
  }
  return map;
}

const articleFolders = buildArticleFolders();

const rawCats = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
const categories = rawCats
  .sort((a, b) => a.sort - b.sort)
  .map(c => ({
    id: c.id,
    title: `# ${c.label}用語`,
    file: `${c.id}.md`,
  }));

// 用語名の自動リンク化
// - 長い名前を優先してマッチ（部分一致を防ぐ）
// - 同一用語は最初の1回のみリンク
// - 自分自身はスキップ
// - 既存マークダウンリンク内を二重リンクしない
function buildTermIndex(terms) {
  const index = [];
  for (const t of terms) {
    index.push({ name: t.name, id: t.id, category: t.category });
    for (const alias of (t.aliases || []))
      index.push({ name: alias, id: t.id, category: t.category });
  }
  return index.sort((a, b) => b.name.length - a.name.length);
}

function autoLinkBody(body, selfId, termIndex) {
  // \x00N\x00 プレースホルダで置換済み箇所を保護
  const placeholders = [];
  let result = body;
  const linked = new Set();

  // 既存マークダウンリンクを保護（二重リンク防止）
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, match => {
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(match);
    return ph;
  });

  // wiim_XXX を記事リンクに変換
  result = result.replace(/\bwiim_\d+\b/g, id => {
    const folder = articleFolders[id];
    if (!folder) return id;
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${id}](../docs/${folder}/${id}.md)`);
    return ph;
  });

  // 用語名を用語集リンクに変換
  for (const { name, id, category } of termIndex) {
    if (id === selfId) continue;
    if (linked.has(id)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped);
    if (!regex.test(result)) continue;

    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${name}](${category}.md)`);
    result = result.replace(regex, ph);
    linked.add(id);
  }

  // プレースホルダを実際のリンクに戻す
  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`\x00${i}\x00`, placeholders[i]);
  }
  return result;
}

function buildRelatedStr(related, termMap) {
  if (!related || related.length === 0) return '—';
  return related
    .map(id => {
      // wiim_XXX → docs リンク
      const folder = articleFolders[id];
      if (folder) return `[${id}](../docs/${folder}/${id}.md)`;
      // gXXX → 用語集リンク
      if (termMap && termMap[id]) {
        const { name, category } = termMap[id];
        return `[${name}](${category}.md#${id})`;
      }
      return id;
    })
    .join(', ');
}

// ── 個別 terms/gXXX.md 用ヘルパー ────────────────────────────────────

// related リンクを同フォルダ内 gXXX.md 形式で生成
function buildRelatedStrForIndividual(related, termMap) {
  if (!related || related.length === 0) return '—';
  return related
    .map(id => {
      const folder = articleFolders[id];
      if (folder) return `[${id}](../../docs/${folder}/${id}.md)`;
      if (termMap && termMap[id]) {
        const { name } = termMap[id];
        return `[${name}](${id}.md)`;
      }
      return id;
    })
    .join(', ');
}

// 自動リンク（terms/ フォルダ内の相対パス版）
function autoLinkBodyForIndividual(body, selfId, termIndex) {
  const placeholders = [];
  let result = body;
  const linked = new Set();

  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, match => {
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(match);
    return ph;
  });

  // wiim_XXX → ../../docs/
  result = result.replace(/\bwiim_\d+\b/g, id => {
    const folder = articleFolders[id];
    if (!folder) return id;
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${id}](../../docs/${folder}/${id}.md)`);
    return ph;
  });

  // 用語名 → gXXX.md（同フォルダ）
  for (const { name, id } of termIndex) {
    if (id === selfId) continue;
    if (linked.has(id)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped);
    if (!regex.test(result)) continue;
    const ph = `\x00${placeholders.length}\x00`;
    placeholders.push(`[${name}](${id}.md)`);
    result = result.replace(regex, ph);
    linked.add(id);
  }

  for (let i = 0; i < placeholders.length; i++) {
    result = result.replace(`\x00${i}\x00`, placeholders[i]);
  }
  return result;
}

// 個別 terms/gXXX.md のファイル内容を生成
function termToIndividualMarkdown(term, termIndex, termMap) {
  const catLabel = (rawCats.find(c => c.id === term.category) || {}).label || term.category;

  const frontmatter = [
    '---',
    `id: ${term.id}`,
    `name: "${term.name}"`,
    term.en ? `en: "${term.en}"` : `en: null`,
    `reading: "${term.reading}"`,
    `category: ${term.category}`,
    `field: "${term.field}"`,
    `related: [${(term.related || []).map(r => `"${r}"`).join(', ')}]`,
    '---',
  ].join('\n');

  const heading = term.en ? `# ${term.name}（${term.en}）` : `# ${term.name}`;
  const enLine  = term.en ? `**${term.en}**  ` : '';
  const metaLine   = `${enLine}${catLabel} / ${term.field} / ${term.id}`;
  const readingLine = `読み: ${term.reading}　関連: ${buildRelatedStrForIndividual(term.related, termMap)}`;
  const aliasLine  = (term.aliases && term.aliases.length)
    ? `\n**別名**: ${term.aliases.join(' / ')}\n`
    : '';

  const linkedBody = autoLinkBodyForIndividual(term.body, term.id, termIndex);

  return [frontmatter, '', heading, '', metaLine, readingLine, aliasLine, linkedBody].join('\n');
}

function termToMarkdown(term, termIndex, termMap) {
  const heading = term.en
    ? `## ${term.name}（${term.en}）`
    : `## ${term.name}`;

  const linkedBody = termIndex ? autoLinkBody(term.body, term.id, termIndex) : term.body;

  const aliasLine = (term.aliases && term.aliases.length)
    ? `**別名**: ${term.aliases.join(' / ')}`
    : null;

  return [
    '---',
    '',
    `<a id="${term.id}"></a>`,
    heading,
    '',
    `**読み**: ${term.reading}`,
    ...(aliasLine ? [aliasLine] : []),
    `**分野**: ${term.field}`,
    `**関連記事**: ${buildRelatedStr(term.related, termMap)}`,
    '',
    linkedBody,
  ].join('\n');
}

// GENERATE_IDS が指定されている場合は選択的再生成モード
// （scan-related.js から関連付け更新後に呼ばれる際に使用）
const ONLY_IDS = process.env.GENERATE_IDS
  ? new Set(process.env.GENERATE_IDS.split(','))
  : null;

// JSONL 読み込み
if (!fs.existsSync(DATA_FILE)) {
  console.error('data/terms.jsonl が見つかりません。先に migrate.js を実行してください。');
  process.exit(1);
}

const terms = fs.readFileSync(DATA_FILE, 'utf8')
  .trim().split('\n').filter(Boolean)
  .map(l => JSON.parse(l));

const termIndex = buildTermIndex(terms);

// gXXX → { name, category } のマップ（関連記事リンク用）
const termMap = {};
for (const t of terms) termMap[t.id] = { name: t.name, category: t.category };

let totalCount = 0;

// ── パフォーマンス計測 ───────────────────────────────────────────────
const _run = perf.start('generate.js', {
  trigger: process.env.PERF_TRIGGER || 'cli',
  mode:    ONLY_IDS ? 'selective' : 'full',
  terms:   terms.length,
});

// ── 個別用語ファイル terms/gXXX.md ──────────────────────────────────
const TERMS_DIR = path.join(GLOSSARY_DIR, 'terms');
if (!fs.existsSync(TERMS_DIR)) fs.mkdirSync(TERMS_DIR);

if (ONLY_IDS) {
  // ── 選択モード: related 行のみ外科的置換（autoLink・全件書き出し不要）──

  const _pCat = _run.phase('patch-categories');
  // カテゴリファイル: 変更用語の **関連記事**: 行だけ置換
  let patchedCatCount = 0;
  for (const cat of categories) {
    const changedInCat = terms.filter(t => ONLY_IDS.has(t.id) && t.category === cat.id);
    if (!changedInCat.length) continue;
    const catFile = path.join(GLOSSARY_DIR, cat.file);
    let content = fs.readFileSync(catFile, 'utf-8');
    for (const term of changedInCat) {
      const newRelStr = buildRelatedStr(term.related, termMap);
      content = content.replace(
        new RegExp(`(<a id="${term.id}"></a>[\\s\\S]*?\\*\\*関連記事\\*\\*: )[^\\n]*`),
        `$1${newRelStr}`
      );
    }
    fs.writeFileSync(catFile, content, 'utf-8');
    console.log(`  ✓ ${cat.file} (${changedInCat.length} 件を更新)`);
    patchedCatCount += changedInCat.length;
  }
  _pCat.end({ count: patchedCatCount });

  const _pTerms = _run.phase('patch-terms');
  // 個別ファイル: frontmatter related + 読み行の「関連:」部分だけ置換
  const termsToUpdate = terms.filter(t => ONLY_IDS.has(t.id));
  for (const term of termsToUpdate) {
    const termFile = path.join(TERMS_DIR, `${term.id}.md`);
    if (!fs.existsSync(termFile)) {
      // 新規用語（通常はここには来ないが念のためフル生成）
      fs.writeFileSync(termFile, termToIndividualMarkdown(term, termIndex, termMap) + '\n');
    } else {
      let content = fs.readFileSync(termFile, 'utf-8');
      const relArr = (term.related || []).map(r => `"${r}"`).join(', ');
      content = content.replace(/^related: \[.*\]$/m, `related: [${relArr}]`);
      const newRelStr = buildRelatedStrForIndividual(term.related, termMap);
      content = content.replace(/　関連: [^\n]+/, `　関連: ${newRelStr}`);
      fs.writeFileSync(termFile, content, 'utf-8');
    }
  }
  _pTerms.end({ count: termsToUpdate.length });
  console.log(`✓ terms/ の ${termsToUpdate.length} 件を更新しました。`);
  _run.end('ok', { updated: termsToUpdate.length });

} else {
  // ── 全件モード: 全カテゴリファイル＋全個別ファイルを再生成 ──────────

  const _pCats = _run.phase('render-categories');
  for (const cat of categories) {
    const catTerms = terms
      .filter(t => t.category === cat.id)
      .sort((a, b) => a.reading.localeCompare(b.reading, 'ja'));

    totalCount += catTerms.length;

    const body = catTerms.map(t => termToMarkdown(t, termIndex, termMap)).join('\n\n');
    const content = cat.title + '\n\n' + body + '\n';
    fs.writeFileSync(path.join(GLOSSARY_DIR, cat.file), content);
    console.log(`  ✓ ${cat.file} (${catTerms.length} 件)`);
  }
  _pCats.end({ catCount: categories.length, termCount: totalCount });

  const _pReadme = _run.phase('update-readme');
  // README 更新
  const readmePath = path.join(GLOSSARY_DIR, 'README.md');
  let readme = '';
  try { readme = fs.readFileSync(readmePath, 'utf8'); } catch {}
  if (readme) {
    const fileListRows = categories
      .map(c => `| [${c.file}](${c.file}) | ${rawCats.find(r => r.id === c.id).label}用語 |`)
      .join('\n');
    const fileListSection = `## ファイル一覧\n\n| ファイル | 内容 |\n|---------|------|\n${fileListRows}\n`;
    readme = readme.replace(/## ファイル一覧[\s\S]*?(?=\n---|\n## )/, fileListSection);
    readme = readme.replace(/用語数: \*\*\d+\*\*/, `用語数: **${totalCount}**`);
    const RECENT_COUNT = 10;
    const recentLines = [...terms]
      .slice(-RECENT_COUNT)
      .reverse()
      .map(t => `| ${t.id} | [${t.name}](${t.category}.md) | ${t.en || '—'} | ${t.category} |`)
      .join('\n');
    const recentSection =
      `## 最近追加した用語\n\n` +
      `| ID | 用語 | English | カテゴリ |\n` +
      `|----|------|---------|----------|\n` +
      recentLines + '\n';
    if (readme.includes('## 最近追加した用語')) {
      readme = readme.replace(/## 最近追加した用語[\s\S]*?(?=\n## |\n---|\s*$)/, recentSection);
    } else {
      readme = readme.trimEnd() + '\n\n---\n\n' + recentSection;
    }
    fs.writeFileSync(readmePath, readme);
  }
  _pReadme.end();

  const _pTermFiles = _run.phase('render-terms');
  for (const term of terms) {
    fs.writeFileSync(
      path.join(TERMS_DIR, `${term.id}.md`),
      termToIndividualMarkdown(term, termIndex, termMap) + '\n'
    );
  }
  _pTermFiles.end({ count: terms.length });

  console.log(`✓ terms/ に ${terms.length} 件の個別ファイルを生成しました。`);
  console.log(`✓ 合計 ${totalCount} 件。README.md を更新しました。`);
  _run.end('ok', { termCount: terms.length, totalCount });
}
