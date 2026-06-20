#!/usr/bin/env node
// generate-symbols.js — data/symbols.jsonl から glossary/symbols/sXXX.md を生成する
// 使い方: node glossary/scripts/generate-symbols.js
'use strict';

const fs   = require('fs');
const path = require('path');

const GLOSSARY_DIR  = process.env.GLOSSARY_DIR || path.join(__dirname, '..');
const DATA_FILE     = path.join(GLOSSARY_DIR, 'data', 'symbols.jsonl');
const OUT_DIR       = path.join(GLOSSARY_DIR, 'symbols');

if (!fs.existsSync(DATA_FILE)) {
  console.error('data/symbols.jsonl が見つかりません。');
  process.exit(1);
}

const symbols = fs.readFileSync(DATA_FILE, 'utf8')
  .trim().split('\n').filter(Boolean)
  .map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.error(`Line ${i + 1} JSON エラー:`, e.message); process.exit(1); }
  });

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ONLY_IDS が指定されている場合は選択的再生成
const ONLY_IDS = process.env.GENERATE_SYMBOL_IDS
  ? new Set(process.env.GENERATE_SYMBOL_IDS.split(','))
  : null;

const CATS_FILE = path.join(GLOSSARY_DIR, 'categories.json');
const catLabels = {};
if (fs.existsSync(CATS_FILE)) {
  JSON.parse(fs.readFileSync(CATS_FILE, 'utf8')).forEach(c => { catLabels[c.id] = c.label; });
}

function symbolToMarkdown(s) {
  const catLabel = catLabels[s.category] || s.category;
  const aliasLine = (s.aliases && s.aliases.length)
    ? `別称: ${s.aliases.join(' / ')}　`
    : '';
  const heading = s.en ? `# ${s.symbol} — ${s.name}（${s.en}）` : `# ${s.symbol} — ${s.name}`;

  const frontmatter = [
    '---',
    `id: ${s.id}`,
    `symbol: "${s.symbol}"`,
    s.latex  ? `latex: "${s.latex}"`  : `latex: null`,
    `name: "${s.name}"`,
    s.en     ? `en: "${s.en}"`        : `en: null`,
    `reading: "${s.reading}"`,
    `category: ${s.category}`,
    '---',
  ].join('\n');

  const latexBadge = s.latex ? `\`${s.latex}\`　` : '';
  const metaLine = `${latexBadge}${catLabel} / ${s.id}`;
  const readingLine = `読み: ${s.reading}　${aliasLine}`;

  return [frontmatter, '', heading, '', metaLine, readingLine, '', s.body].join('\n');
}

let count = 0;
for (const s of symbols) {
  if (ONLY_IDS && !ONLY_IDS.has(s.id)) continue;
  const outPath = path.join(OUT_DIR, `${s.id}.md`);
  fs.writeFileSync(outPath, symbolToMarkdown(s) + '\n', 'utf-8');
  count++;
}

console.log(`✓ ${count} 件の記号ファイルを生成しました → glossary/symbols/`);
