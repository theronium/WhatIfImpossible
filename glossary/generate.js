#!/usr/bin/env node
// generate.js — data/terms.jsonl から各カテゴリの .md を再生成する
// 使い方: node glossary/generate.js
'use strict';

const fs = require('fs');
const path = require('path');

const GLOSSARY_DIR = __dirname;
const DATA_FILE    = path.join(GLOSSARY_DIR, 'data', 'terms.jsonl');
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

// README の用語数・最近追加を更新
const readmePath = path.join(GLOSSARY_DIR, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

// ファイル一覧テーブルを更新
const fileListRows = categories
  .map(c => `| [${c.file}](${c.file}) | ${rawCats.find(r => r.id === c.id).label}用語 |`)
  .join('\n');
const fileListSection = `## ファイル一覧\n\n| ファイル | 内容 |\n|---------|------|\n${fileListRows}\n`;
readme = readme.replace(/## ファイル一覧[\s\S]*?(?=\n---|\n## )/, fileListSection);

// 用語数
readme = readme.replace(/用語数: \*\*\d+\*\*/, `用語数: **${totalCount}**`);

// 最近追加した用語（ID順で直近10件）
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

// セクションを置換（なければ末尾に追加）
if (readme.includes('## 最近追加した用語')) {
  readme = readme.replace(/## 最近追加した用語[\s\S]*?(?=\n## |\n---|\s*$)/, recentSection);
} else {
  readme = readme.trimEnd() + '\n\n---\n\n' + recentSection;
}

fs.writeFileSync(readmePath, readme);

console.log(`\n✓ 合計 ${totalCount} 件。README.md を更新しました。`);
