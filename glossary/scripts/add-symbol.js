#!/usr/bin/env node
// add-symbol.js — new-symbol.json の内容を symbols.jsonl に追記して generate-symbols.js を実行する
// 使い方: node glossary/scripts/add-symbol.js
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GLOSSARY_DIR    = path.join(__dirname, '..');
const DATA_FILE       = path.join(GLOSSARY_DIR, 'data', 'symbols.jsonl');
const NEW_SYMBOL_FILE = path.join(GLOSSARY_DIR, 'data', 'new-symbol.json');

if (!fs.existsSync(NEW_SYMBOL_FILE)) {
  console.error('ERROR: glossary/data/new-symbol.json が見つかりません。');
  console.error('       new-symbol.sample.json をコピーして編集してください。');
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(NEW_SYMBOL_FILE, 'utf-8'));

// 必須フィールドチェック
const required = ['symbol', 'name', 'reading', 'category', 'body'];
for (const key of required) {
  if (!input[key] && input[key] !== 0) {
    console.error(`ERROR: "${key}" フィールドが空です。`);
    process.exit(1);
  }
}

// 既存データ読み込み
const lines = fs.existsSync(DATA_FILE)
  ? fs.readFileSync(DATA_FILE, 'utf-8').trimEnd().split('\n').filter(Boolean)
  : [];

const existing = lines.map(l => JSON.parse(l));

// 重複チェック（同じ記号文字）
const dup = existing.find(s => s.symbol === input.symbol);
if (dup) {
  console.error(`ERROR: "${input.symbol}" はすでに登録されています（${dup.id}）。`);
  console.error('       update-symbol.js で更新してください。');
  process.exit(1);
}

// 次の sXXX ID を決定
const maxNum = existing.reduce((max, s) => {
  const n = parseInt(s.id.slice(1));
  return n > max ? n : max;
}, 0);
const nextId = `s${String(maxNum + 1).padStart(3, '0')}`;

const symbol = {
  id: nextId,
  symbol:  input.symbol,
  ...(input.latex   ? { latex: input.latex }     : {}),
  name:    input.name,
  ...(input.en      ? { en: input.en }           : {}),
  reading: input.reading,
  ...(input.aliases && input.aliases.length ? { aliases: input.aliases } : {}),
  category: input.category,
  body:    input.body,
};

fs.appendFileSync(DATA_FILE, JSON.stringify(symbol) + '\n', 'utf-8');
console.log(`✓ 追加: ${symbol.id} ${symbol.symbol} ${symbol.name} [${symbol.category}]`);

// generate-symbols.js を実行（追加した1件のみ）
execSync(
  `node ${path.join(__dirname, 'generate-symbols.js')}`,
  {
    stdio: 'inherit',
    env: { ...process.env, GENERATE_SYMBOL_IDS: nextId },
  }
);

console.log(`✓ ID: ${nextId}`);
