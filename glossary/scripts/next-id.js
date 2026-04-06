#!/usr/bin/env node
// next-id.js — 次の gXXX（用語）と wiim_XXX（記事）の番号を出力する
'use strict';

const fs = require('fs');
const path = require('path');

// 次の gXXX
const DATA_FILE = path.join(__dirname, '..', 'data', 'terms.jsonl');
const terms = fs.readFileSync(DATA_FILE, 'utf8')
  .trim().split('\n').filter(Boolean)
  .map(l => JSON.parse(l));

const maxG = terms.reduce((max, t) => {
  const n = parseInt(t.id.slice(1));
  return n > max ? n : max;
}, 0);
const nextG = `g${String(maxG + 1).padStart(3, '0')}`;

// 次の wiim_XXX
const DOCS_DIR = path.join(__dirname, '..', '..', 'docs');
let maxW = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { walk(path.join(dir, entry.name)); continue; }
    const m = entry.name.match(/^wiim_(\d+)\.md$/);
    if (m) { const n = parseInt(m[1]); if (n > maxW) maxW = n; }
  }
}
walk(DOCS_DIR);
const nextW = `wiim_${String(maxW + 1).padStart(3, '0')}`;

console.log(`次の用語ID : ${nextG}`);
console.log(`次の記事ID : ${nextW}`);
