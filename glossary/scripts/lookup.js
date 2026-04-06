#!/usr/bin/env node
// lookup.js — 用語IDまたは用語名で1エントリを検索して出力する
// 使い方:
//   node glossary/scripts/lookup.js g056
//   node glossary/scripts/lookup.js ダークマター
//   node glossary/scripts/lookup.js dark      ← 部分一致（name/en/aliases）
'use strict';

const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
  console.error('使い方: node glossary/scripts/lookup.js <ID|用語名|部分一致>');
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, '..', 'data', 'terms.jsonl');
const terms = fs.readFileSync(DATA_FILE, 'utf8')
  .trim().split('\n').filter(Boolean)
  .map(l => JSON.parse(l));

const q = query.toLowerCase();

// 優先順位: ID完全一致 → name完全一致 → alias完全一致 → 部分一致
const exact = terms.find(t =>
  t.id === query ||
  t.name === query ||
  (t.aliases || []).includes(query)
);

const partial = exact ? null : terms.filter(t =>
  t.id.toLowerCase().includes(q) ||
  t.name.toLowerCase().includes(q) ||
  (t.en || '').toLowerCase().includes(q) ||
  (t.aliases || []).some(a => a.toLowerCase().includes(q))
);

if (exact) {
  console.log(JSON.stringify(exact, null, 2));
} else if (partial && partial.length > 0) {
  if (partial.length === 1) {
    console.log(JSON.stringify(partial[0], null, 2));
  } else {
    console.log(`${partial.length} 件ヒット:`);
    for (const t of partial) {
      console.log(`  ${t.id}  ${t.name}${t.en ? `（${t.en}）` : ''}  [${t.category}]`);
    }
  }
} else {
  console.log(`"${query}" に一致する用語が見つかりませんでした。`);
}
