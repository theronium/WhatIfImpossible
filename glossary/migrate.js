#!/usr/bin/env node
// migrate.js — 既存の .md ファイルを解析して data/terms.jsonl を生成する（一回限りの移行用）
'use strict';

const fs = require('fs');
const path = require('path');

const GLOSSARY_DIR = __dirname;

const categories = [
  { id: 'astronomy',   file: 'astronomy.md' },
  { id: 'physics',     file: 'physics.md' },
  { id: 'philosophy',  file: 'philosophy.md' },
  { id: 'biology',     file: 'biology.md' },
  { id: 'sf-concepts', file: 'sf-concepts.md' },
];

function parseMarkdownFile(filePath, categoryId) {
  const content = fs.readFileSync(filePath, 'utf8');
  const terms = [];

  // --- で区切られたセクションに分割
  const sections = content.split(/\n---\n/);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    const lines = section.split('\n');

    // ## 用語名（英語名）
    const headingLine = lines.find(l => l.startsWith('## '));
    if (!headingLine) continue;

    const headingMatch = headingLine.match(/^## (.+?)(?:（(.+?)）)?$/);
    if (!headingMatch) continue;

    const name = headingMatch[1].trim();
    const en   = headingMatch[2] ? headingMatch[2].trim() : null;

    // **読み**: ...
    const readingLine = lines.find(l => l.startsWith('**読み**:'));
    const reading = readingLine ? readingLine.replace(/^\*\*読み\*\*:\s*/, '').trim() : '';

    // **分野**: ...
    const fieldLine = lines.find(l => l.startsWith('**分野**:'));
    const field = fieldLine ? fieldLine.replace(/^\*\*分野\*\*:\s*/, '').trim() : '';

    // **関連記事**: ...
    const relatedLine = lines.find(l => l.startsWith('**関連記事**:'));
    const related = [];
    if (relatedLine && !relatedLine.includes('—')) {
      for (const m of relatedLine.matchAll(/\[(wiim_\d+)\]/g)) {
        related.push(m[1]);
      }
    }

    // 本文: **関連記事** 行（常に最後のメタデータ行）の後から
    const metaEndIdx = lines.findIndex(l => l.startsWith('**関連記事**:'));
    let bodyLines = [];
    if (metaEndIdx >= 0) {
      let bodyStart = metaEndIdx + 1;
      while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++;
      bodyLines = lines.slice(bodyStart);
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
        bodyLines.pop();
      }
    }

    const body = bodyLines.join('\n');
    terms.push({ name, en, reading, category: categoryId, field, related, body });
  }

  return terms;
}

let allTerms = [];
for (const cat of categories) {
  const filePath = path.join(GLOSSARY_DIR, cat.file);
  const terms = parseMarkdownFile(filePath, cat.id);
  allTerms = allTerms.concat(terms);
  console.log(`  ${cat.file}: ${terms.length} 件`);
}

// ID を付与
allTerms = allTerms.map((t, i) => ({
  id: `g${String(i + 1).padStart(3, '0')}`,
  ...t,
}));

// JSONL 書き出し
const dataDir = path.join(GLOSSARY_DIR, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const jsonl = allTerms.map(t => JSON.stringify(t)).join('\n') + '\n';
fs.writeFileSync(path.join(dataDir, 'terms.jsonl'), jsonl);

console.log(`\n✓ ${allTerms.length} 件を data/terms.jsonl に書き出しました`);
