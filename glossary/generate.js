#!/usr/bin/env node
// generate.js — data/terms.jsonl から各カテゴリの .md を再生成する
// 使い方: node glossary/generate.js
'use strict';

const fs = require('fs');
const path = require('path');

const GLOSSARY_DIR = __dirname;
const DATA_FILE    = path.join(GLOSSARY_DIR, 'data', 'terms.jsonl');

// 記事 ID → docs サブフォルダのマッピング
const articleFolders = {
  wiim_001: 'cosmology', wiim_002: 'cosmology', wiim_003: 'physics',
  wiim_004: 'cosmology', wiim_005: 'cosmology', wiim_006: 'biology',
  wiim_007: 'quantum',   wiim_008: 'biology',   wiim_009: 'cosmology',
  wiim_010: 'physics',   wiim_011: 'physics',   wiim_012: 'physics',
  wiim_013: 'physics',   wiim_014: 'physics',   wiim_015: 'physics',
};

const categories = [
  { id: 'astronomy',   title: '# 天文学・宇宙論用語',        file: 'astronomy.md' },
  { id: 'physics',     title: '# 物理学・素粒子・熱力学用語', file: 'physics.md' },
  { id: 'speculative', title: '# 仮説・未観測の粒子・物質',   file: 'speculative.md' },
  { id: 'philosophy',  title: '# 哲学・存在論・認識論用語',   file: 'philosophy.md' },
  { id: 'biology',     title: '# 生物学・進化・生命科学用語', file: 'biology.md' },
  { id: 'sf-concepts', title: '# SF固有の概念・設定用語',     file: 'sf-concepts.md' },
];

function buildRelatedStr(related) {
  if (!related || related.length === 0) return '—';
  return related
    .map(id => {
      const folder = articleFolders[id];
      return folder ? `[${id}](../docs/${folder}/${id}.md)` : id;
    })
    .join(', ');
}

function termToMarkdown(term) {
  const heading = term.en
    ? `## ${term.name}（${term.en}）`
    : `## ${term.name}`;

  return [
    '---',
    '',
    heading,
    '',
    `**読み**: ${term.reading}`,
    `**分野**: ${term.field}`,
    `**関連記事**: ${buildRelatedStr(term.related)}`,
    '',
    term.body,
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

let totalCount = 0;

for (const cat of categories) {
  const catTerms = terms
    .filter(t => t.category === cat.id)
    .sort((a, b) => a.reading.localeCompare(b.reading, 'ja'));

  totalCount += catTerms.length;

  const body = catTerms.map(termToMarkdown).join('\n\n');
  const content = cat.title + '\n\n' + body + '\n';

  fs.writeFileSync(path.join(GLOSSARY_DIR, cat.file), content);
  console.log(`  ✓ ${cat.file} (${catTerms.length} 件)`);
}

// README の用語数を更新
const readmePath = path.join(GLOSSARY_DIR, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(/用語数: \*\*\d+\*\*/, `用語数: **${totalCount}**`);
fs.writeFileSync(readmePath, readme);

console.log(`\n✓ 合計 ${totalCount} 件。README.md を更新しました。`);
