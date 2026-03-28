#!/usr/bin/env node
// scan-related.js — 記事・補遺内の参照を収集し、用語 related と記事 関連記事 を更新する
// 使い方:
//   node scan-related.js             ← 実際に更新
//   node scan-related.js --dry-run   ← 変更内容の確認のみ（ファイルを書き換えない）
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = __dirname;
const DOCS_DIR   = path.join(ROOT, 'docs');
const NOTES_DIR  = path.join(ROOT, 'docs', 'notes');
const TERMS_FILE = path.join(ROOT, 'glossary', 'data', 'terms.jsonl');

const DRY_RUN = process.argv.includes('--dry-run');

const ARTICLE_CATS = ['cosmology', 'physics', 'quantum', 'logic', 'philosophy', 'biology'];

// ── frontmatter パーサー ──────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)/);
    if (!m) continue;
    const [, key, val] = m;
    result[key] = val.startsWith('[')
      ? (val.slice(1, val.lastIndexOf(']')) || '').split(',').map(s => s.trim()).filter(Boolean)
      : val.trim();
  }
  return result;
}

// ── Step 1: インデックス構築 ───────────────────────────────────────────

function buildArticleIndex() {
  // { 'wiim_054': { title, file, category } }
  const index = {};
  for (const cat of ARTICLE_CATS) {
    const dir = path.join(DOCS_DIR, cat);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const file = path.join(dir, f);
      const fm = parseFrontmatter(fs.readFileSync(file, 'utf-8'));
      if (!fm.id || !fm.id.startsWith('wiim_')) continue;
      index[fm.id] = { title: fm.title || f, file, category: cat };
    }
  }
  return index;
}

function buildTermIndex() {
  // { 'g019': { ...term } }
  const index = {};
  if (!fs.existsSync(TERMS_FILE)) return index;
  for (const line of fs.readFileSync(TERMS_FILE, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try { const t = JSON.parse(line); if (t.id) index[t.id] = t; } catch {}
  }
  return index;
}

// ── Step 2: 参照 ID 抽出 ──────────────────────────────────────────────

function extractRefs(content) {
  const wiimIds = [...new Set((content.match(/wiim_\d{3,}/g) || []))];
  // gXXX: 3桁以上の数字（誤マッチを減らすため直後が英字でないこと）
  const gIds    = [...new Set((content.match(/\bg(\d{3,})\b/g) || []))];
  return { wiimIds, gIds };
}

function collectSources(articleIndex) {
  const sources = [];

  // 記事
  for (const [id, info] of Object.entries(articleIndex)) {
    const content = fs.readFileSync(info.file, 'utf-8');
    const { wiimIds, gIds } = extractRefs(content);
    sources.push({
      id,
      title: info.title,
      file:  info.file,
      category: info.category,
      wiimRefs: wiimIds.filter(x => x !== id), // 自己参照除外
      gRefs: gIds,
      type: 'article',
    });
  }

  // 補遺ノート（gXXX 参照のみ収集。wiim_ID を持たないため用語 related は対象外）
  if (fs.existsSync(NOTES_DIR)) {
    for (const f of fs.readdirSync(NOTES_DIR)) {
      if (!f.endsWith('.md') || f === 'README.md' || f === 'tech_tree.md') continue;
      const file = path.join(NOTES_DIR, f);
      const content = fs.readFileSync(file, 'utf-8');
      const fm = parseFrontmatter(content);
      const { wiimIds, gIds } = extractRefs(content);
      sources.push({
        id:    f.replace('.md', ''),
        title: fm.title || f,
        file,
        category: 'notes',
        wiimRefs: wiimIds,
        gRefs: gIds,
        type: 'note',
      });
    }
  }
  return sources;
}

// ── Step 3A: 用語 related 更新 ────────────────────────────────────────
// 記事が gXXX に言及 → その用語の related に wiim_ID を追加

function updateTermsRelated(sources, termIndex) {
  // toAdd: { gId: Set<wiim_id> }
  const toAdd = {};
  for (const src of sources) {
    if (src.type !== 'article') continue; // 補遺は wiim_ID を持たないのでスキップ
    for (const gId of src.gRefs) {
      if (!termIndex[gId]) continue;
      (toAdd[gId] = toAdd[gId] || new Set()).add(src.id);
    }
  }

  let changed = false;
  const lines = fs.readFileSync(TERMS_FILE, 'utf-8').split('\n');

  const newLines = lines.map(line => {
    if (!line.trim().startsWith('{')) return line;
    let t;
    try { t = JSON.parse(line); } catch { return line; }
    if (!t.id || !toAdd[t.id]) return line;

    const existing = new Set(t.related || []);
    const added = [];
    for (const id of toAdd[t.id]) {
      if (!existing.has(id)) { existing.add(id); added.push(id); }
    }
    if (!added.length) return line;

    t.related = [...existing].sort();
    changed = true;
    console.log(`  [用語] ${t.id} ${t.name} ← ${added.join(', ')}`);
    return JSON.stringify(t);
  });

  if (!changed) {
    console.log('  [用語] 更新なし');
    return false;
  }
  if (!DRY_RUN) fs.writeFileSync(TERMS_FILE, newLines.join('\n'), 'utf-8');
  return true;
}

// ── Step 3B: 記事 関連記事 セクション更新 ────────────────────────────
// A が B に言及 → B の 関連記事 セクションに A へのバックリンクを追加

function relPath(fromFile, toFile) {
  return path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/');
}

function appendToRelatedSection(content, entry) {
  // ## 関連記事 セクションの末尾（次の ## or EOF）に追記
  const headerRe = /^## 関連記事[ \t]*\r?\n/m;
  const hMatch = headerRe.exec(content);
  if (!hMatch) return null; // セクションなし

  const afterHeader = hMatch.index + hMatch[0].length;
  const rest = content.slice(afterHeader);

  // 次のセクション見出し（## で始まる行）を探す
  const nextSecRe = /^## /m;
  const nMatch = nextSecRe.exec(rest);
  const sectionEnd = nMatch ? afterHeader + nMatch.index : content.length;

  const before = content.slice(0, sectionEnd).trimEnd();
  const after  = content.slice(sectionEnd);
  return before + '\n' + entry + '\n' + (after ? '\n' + after : '\n');
}

function updateArticleRelated(sources, articleIndex) {
  // backlinks: { target_wiim_id: [{ id, title, file }] }
  const backlinks = {};
  for (const src of sources) {
    for (const targetId of src.wiimRefs) {
      if (!articleIndex[targetId]) continue; // 存在しない記事（プレースホルダ）はスキップ
      (backlinks[targetId] = backlinks[targetId] || []).push(
        { id: src.id, title: src.title, file: src.file, type: src.type }
      );
    }
  }

  let changed = false;
  for (const [targetId, srcs] of Object.entries(backlinks)) {
    const info = articleIndex[targetId];
    let content = fs.readFileSync(info.file, 'utf-8');
    let fileChanged = false;

    for (const src of srcs) {
      // 既にターゲット記事内に src.id の記載があればスキップ
      if (content.includes(src.id)) continue;

      const link  = relPath(info.file, src.file);
      // 補遺の場合はタイトル冒頭の「補遺：」を省いてシンプルに
      const label = src.type === 'note'
        ? src.title.replace(/^補遺[：:]\s*/, '補遺: ')
        : src.title;
      const entry = `- [${src.id}](${link}) — ${label}`;

      const updated = appendToRelatedSection(content, entry);
      if (!updated) continue; // 関連記事セクションなし

      console.log(`  [記事] ${targetId} ← ${src.id}`);
      content = updated;
      fileChanged = true;
      changed = true;
    }

    if (fileChanged && !DRY_RUN) fs.writeFileSync(info.file, content, 'utf-8');
  }

  if (!changed) console.log('  [記事] 更新なし');
  return changed;
}

// ── メイン ────────────────────────────────────────────────────────────

function main() {
  console.log(`scan-related: 開始${DRY_RUN ? ' [dry-run]' : ''}`);

  const articleIndex = buildArticleIndex();
  const termIndex    = buildTermIndex();
  const sources      = collectSources(articleIndex);

  console.log(`  記事 ${Object.keys(articleIndex).length} 件 / 用語 ${Object.keys(termIndex).length} 件`);

  const termsUpdated    = updateTermsRelated(sources, termIndex);
  const articlesUpdated = updateArticleRelated(sources, articleIndex);

  if (!DRY_RUN && termsUpdated) {
    // 用語 .md ファイルを再生成
    require('./glossary/generate.js');
  }

  if (!DRY_RUN && (termsUpdated || articlesUpdated)) {
    require('./generate-readme.js');
  }

  console.log('scan-related: 完了');
}

main();
