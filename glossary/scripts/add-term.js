#!/usr/bin/env node
// add-term.js — new-term.json の内容を terms.jsonl に追記して generate.js を実行する
// 使い方: node glossary/scripts/add-term.js
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GLOSSARY_DIR = path.join(__dirname, '..');
const DATA_FILE    = path.join(GLOSSARY_DIR, 'data', 'terms.jsonl');
const NEW_TERM_FILE = path.join(GLOSSARY_DIR, 'data', 'new-term.json');

// new-term.json を読み込む
if (!fs.existsSync(NEW_TERM_FILE)) {
  console.error('ERROR: glossary/data/new-term.json が見つかりません。');
  process.exit(1);
}

const newTerm = JSON.parse(fs.readFileSync(NEW_TERM_FILE, 'utf-8'));

// 必須フィールドチェック
const required = ['name', 'en', 'reading', 'category', 'field', 'body'];
for (const key of required) {
  if (!newTerm[key]) {
    console.error(`ERROR: "${key}" フィールドが空です。`);
    process.exit(1);
  }
}

// 次の ID を自動決定
const lines = fs.readFileSync(DATA_FILE, 'utf-8').trimEnd().split('\n').filter(Boolean);
const lastId = JSON.parse(lines[lines.length - 1]).id;
const nextNum = parseInt(lastId.slice(1)) + 1;
const nextId = `g${String(nextNum).padStart(3, '0')}`;

// 重複チェック
const duplicate = lines.find(l => JSON.parse(l).name === newTerm.name);
if (duplicate) {
  console.error(`ERROR: "${newTerm.name}" はすでに登録されています（${JSON.parse(duplicate).id}）。`);
  process.exit(1);
}

const today = new Date();
const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

const term = {
  id: nextId,
  name: newTerm.name,
  en: newTerm.en || null,
  reading: newTerm.reading,
  category: newTerm.category,
  field: newTerm.field,
  date: dateStr,
  related: newTerm.related || [],
  ...(newTerm.aliases && newTerm.aliases.length ? { aliases: newTerm.aliases } : {}),
  body: newTerm.body,
};

fs.appendFileSync(DATA_FILE, JSON.stringify(term) + '\n', 'utf-8');
console.log(`✓ 追加: ${term.id} ${term.name} [${term.category}]`);

// generate.js を実行
execSync(`node ${path.join(__dirname, 'generate.js')}`, { stdio: 'inherit' });
