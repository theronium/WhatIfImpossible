#!/usr/bin/env node
// generate-readme.js — docs/README.md, docs/notes/README.md, README.md を自動再生成する
// 使い方: node generate-readme.js
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = __dirname;
const DOCS_DIR  = path.join(ROOT, 'docs');
const NOTES_DIR = path.join(ROOT, 'docs', 'notes');
const TERMS_FILE = path.join(ROOT, 'glossary', 'data', 'terms.jsonl');

// ── 日付フォーマット ──────────────────────────────────────────────────
function fmtDate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── frontmatter パーサー ──────────────────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)/);
    if (!m) continue;
    const [, key, val] = m;
    // 配列: [a, b, c] 形式
    if (val.startsWith('[')) {
      const inner = val.slice(1, val.lastIndexOf(']'));
      result[key] = inner
        ? inner.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    } else {
      result[key] = val.trim();
    }
  }
  return result;
}

// ── カテゴリ定義 ──────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'cosmology', heading: 'Cosmology — 宇宙・時空間系' },
  { id: 'physics',   heading: 'Physics — 素粒子・力・エネルギー系' },
  { id: 'quantum',   heading: 'Quantum — 量子力学・量子情報系' },
  { id: 'logic',     heading: 'Logic — 論理・パラドックス系' },
  { id: 'philosophy',heading: 'Philosophy — 意識・自由意志・存在論' },
  { id: 'biology',   heading: 'Biology — 生命・進化系' },
];

// ── 記事を収集 ────────────────────────────────────────────────────────
function collectArticles() {
  const articles = [];
  for (const cat of CATEGORIES) {
    const dir = path.join(DOCS_DIR, cat.id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md') || f === 'README.md') continue;
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      const fm = parseFrontmatter(content);
      if (!fm.id) continue;
      articles.push({ ...fm, category: cat.id, file: f });
    }
  }
  // id でソート
  articles.sort((a, b) => a.id.localeCompare(b.id));
  return articles;
}

// ── ノートを収集 ──────────────────────────────────────────────────────
function collectNotes() {
  const notes = [];
  if (!fs.existsSync(NOTES_DIR)) return notes;
  for (const f of fs.readdirSync(NOTES_DIR)) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    const fullPath = path.join(NOTES_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (!fm.title) continue;
    const stat = fs.statSync(fullPath);
    notes.push({
      ...fm,
      file: f,
      birthtime: stat.birthtime,
      mtime: stat.mtime,
    });
  }
  // ファイル作成日時（登録順）でソート
  notes.sort((a, b) => a.birthtime - b.birthtime);
  return notes;
}

// ── ノートのサブタイプ判定 ────────────────────────────────────────────
// title が「補遺：」で始まる → 記事補遺
// filename が tech_tree で始まる → 技術ツリー
// それ以外 → 世界観・設定
function noteSubtype(note) {
  if (note.file.startsWith('tech_tree')) return 'tech-tree';
  if (note.title && note.title.startsWith('補遺：')) return 'supplement';
  return 'worldbuilding';
}

// ── 用語数カウント ────────────────────────────────────────────────────
function countTerms() {
  if (!fs.existsSync(TERMS_FILE)) return 0;
  const lines = fs.readFileSync(TERMS_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim().startsWith('{'));
  return lines.length;
}

// ── docs/README.md 生成 ───────────────────────────────────────────────
function generateDocsReadme(articles) {
  const byCategory = {};
  for (const cat of CATEGORIES) byCategory[cat.id] = [];
  for (const a of articles) {
    if (byCategory[a.category]) byCategory[a.category].push(a);
  }

  const lines = [
    '# 記事インデックス',
    '',
    'WhatIfImpossible の全記事一覧です。カテゴリ別に整理されています。',
    '',
    '---',
    '',
  ];

  for (const cat of CATEGORIES) {
    lines.push(`## ${cat.heading}`);
    lines.push('');
    const catArticles = byCategory[cat.id];
    if (catArticles.length === 0) {
      lines.push('（記事準備中）');
    } else {
      lines.push('| ID | タイトル | タグ | 日付 |');
      lines.push('|----|----------|------|------|');
      for (const a of catArticles) {
        const tags = Array.isArray(a.tags) ? a.tags.join(', ') : (a.tags || '');
        lines.push(`| [${a.id}](${a.category}/${a.file}) | ${a.title} | ${tags} | ${a.date} |`);
      }
    }
    lines.push('');
  }

  const noteCount = fs.existsSync(NOTES_DIR)
    ? fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md') && f !== 'README.md').length
    : 0;

  lines.push('---');
  lines.push('');
  lines.push('## 補遺・ノート');
  lines.push('');
  lines.push('**[→ 補遺・ノート一覧](notes/README.md)**');
  lines.push('');
  lines.push(`記事本体に収まらない考察・世界観設定・技術ツリーなどの補遺ノート（現在 ${noteCount} 件）。`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`記事数: **${articles.length}**`);
  lines.push('');

  return lines.join('\n');
}

// ── docs/notes/README.md 生成 ─────────────────────────────────────────
function generateNotesReadme(notes) {
  const supplements  = notes.filter(n => noteSubtype(n) === 'supplement');
  const worldbuilding = notes.filter(n => noteSubtype(n) === 'worldbuilding');
  const techTree     = notes.filter(n => noteSubtype(n) === 'tech-tree');

  const lines = [
    '# 補遺・ノート一覧',
    '',
    '記事本体に収まらない考察・世界観設定・技術ツリーなどをまとめた補遺ノートの一覧です。',
    '',
    '---',
    '',
  ];

  // 記事補遺
  lines.push('## 記事補遺');
  lines.push('');
  lines.push('特定の記事に関連する追加考察・設定メモ。');
  lines.push('');
  if (supplements.length === 0) {
    lines.push('（なし）');
  } else {
    lines.push('| ファイル | タイトル | 関連記事 | 登録 | 更新 |');
    lines.push('|---------|---------|---------|------|------|');
    for (const n of supplements) {
      const related = Array.isArray(n.related) ? n.related.join(', ') : (n.related || '—');
      const title = n.title.replace(/^補遺：/, '');
      lines.push(`| [${n.file}](${n.file}) | ${title} | ${related || '—'} | ${fmtDate(n.birthtime)} | ${fmtDate(n.mtime)} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 世界観・設定
  lines.push('## 世界観・設定');
  lines.push('');
  lines.push('WIIM世界の背景設定・歴史・政治体制などのメモ。');
  lines.push('');
  if (worldbuilding.length === 0) {
    lines.push('（なし）');
  } else {
    lines.push('| ファイル | タイトル | 登録 | 更新 |');
    lines.push('|---------|---------|------|------|');
    for (const n of worldbuilding) {
      lines.push(`| [${n.file}](${n.file}) | ${n.title} | ${fmtDate(n.birthtime)} | ${fmtDate(n.mtime)} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 技術ツリー
  lines.push('## 技術ツリー');
  lines.push('');
  if (techTree.length === 0) {
    lines.push('（なし）');
  } else {
    lines.push('| ファイル | タイトル | 登録 | 更新 |');
    lines.push('|---------|---------|------|------|');
    for (const n of techTree) {
      lines.push(`| [${n.file}](${n.file}) | ${n.title} | ${fmtDate(n.birthtime)} | ${fmtDate(n.mtime)} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ── docs/new.md 生成（日時順新着一覧）────────────────────────────────
function generateChangelog(articles, notes, terms) {
  const SHOW = 50;
  const entries = [];

  // 記事
  for (const a of articles) {
    if (!a.date) continue;
    entries.push({
      date: a.date,
      type: '記事',
      id: a.id,
      title: a.title,
      link: `${a.category}/${a.file}`,
    });
  }

  // 補遺・ノート
  for (const n of notes) {
    entries.push({
      date: fmtDate(n.birthtime),
      type: '補遺',
      id: '—',
      title: n.title,
      link: `notes/${n.file}`,
    });
  }

  // 用語（date フィールドがあるもののみ）
  for (const t of terms) {
    if (!t.date) continue;
    entries.push({
      date: t.date,
      type: '用語',
      id: t.id,
      title: t.en ? `${t.name}（${t.en}）` : t.name,
      link: `../glossary/${t.category}.md#${t.id}`,
    });
  }

  // 日付降順、同日は id 降順
  entries.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });

  const recent = entries.slice(0, SHOW);

  const lines = [
    '# 新着一覧',
    '',
    '記事・用語・補遺を追加日時順に表示します（最新 ' + SHOW + ' 件）。',
    '',
    '| 日付 | 種別 | ID | タイトル / 用語名 |',
    '|------|------|-----|-----------------|',
  ];
  for (const e of recent) {
    lines.push(`| ${e.date} | ${e.type} | ${e.id} | [${e.title}](${e.link}) |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── README.md（ルート）の数値を更新 ──────────────────────────────────
function updateRootReadme(articleCount, termCount) {
  const file = path.join(ROOT, 'README.md');
  let content = fs.readFileSync(file, 'utf-8');
  // 「現在 N 本」を更新
  content = content.replace(/現在 \d+ 本/, `現在 ${articleCount} 本`);
  // 「現在 N 件」を更新
  content = content.replace(/現在 \d+ 件/, `現在 ${termCount} 件`);
  fs.writeFileSync(file, content, 'utf-8');
  console.log(`  README.md: 記事 ${articleCount} 本 / 用語 ${termCount} 件`);
}

// ── メイン ────────────────────────────────────────────────────────────
function main() {
  console.log('generate-readme: 生成開始');

  const articles = collectArticles();
  const notes    = collectNotes();
  const termCount = countTerms();

  // 用語データ（changelog用）
  const terms = fs.existsSync(TERMS_FILE)
    ? fs.readFileSync(TERMS_FILE, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];

  // docs/README.md
  const docsReadme = generateDocsReadme(articles);
  fs.writeFileSync(path.join(DOCS_DIR, 'README.md'), docsReadme, 'utf-8');
  console.log(`  docs/README.md: 記事 ${articles.length} 件`);

  // docs/notes/README.md
  const notesReadme = generateNotesReadme(notes);
  fs.writeFileSync(path.join(NOTES_DIR, 'README.md'), notesReadme, 'utf-8');
  console.log(`  docs/notes/README.md: ノート ${notes.length} 件`);

  // docs/new.md（新着一覧）
  const changelog = generateChangelog(articles, notes, terms);
  fs.writeFileSync(path.join(DOCS_DIR, 'new.md'), changelog, 'utf-8');
  console.log(`  docs/new.md: 新着一覧を生成`);

  // README.md（ルート）
  updateRootReadme(articles.length, termCount);

  console.log('generate-readme: 完了');
}

main();
