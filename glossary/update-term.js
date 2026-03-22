#!/usr/bin/env node
// update-term.js — new-term.json の内容で既存の用語を上書き更新して generate.js を実行する
// 使い方: node glossary/update-term.js
// new-term.json に "id" フィールド（例: "g114"）を指定すると既存用語を更新する。
// 指定したフィールドのみ上書き。id・reading・name 以外はすべて省略可能。
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GLOSSARY_DIR  = __dirname;
const DATA_FILE     = path.join(GLOSSARY_DIR, 'data', 'terms.jsonl');
const NEW_TERM_FILE = path.join(GLOSSARY_DIR, 'data', 'new-term.json');

// new-term.json を読み込む
if (!fs.existsSync(NEW_TERM_FILE)) {
  console.error('ERROR: glossary/data/new-term.json が見つかりません。');
  process.exit(1);
}

const patch = JSON.parse(fs.readFileSync(NEW_TERM_FILE, 'utf-8'));

if (!patch.id) {
  console.error('ERROR: "id" フィールドが必要です（例: "g114"）。');
  process.exit(1);
}

const lines = fs.readFileSync(DATA_FILE, 'utf-8').trimEnd().split('\n').filter(Boolean);
const idx = lines.findIndex(l => JSON.parse(l).id === patch.id);

if (idx === -1) {
  console.error(`ERROR: "${patch.id}" が見つかりません。`);
  process.exit(1);
}

const existing = JSON.parse(lines[idx]);

// patch の各フィールドで上書き（id は変更不可）
const { id: _id, ...fields } = patch;

// aliases は既存との結合オプション（patch に merge: true があれば追記）
if (fields.aliases && patch.merge) {
  fields.aliases = [...new Set([...(existing.aliases || []), ...fields.aliases])];
}

const updated = { ...existing, ...fields };

lines[idx] = JSON.stringify(updated);
fs.writeFileSync(DATA_FILE, lines.join('\n') + '\n', 'utf-8');
console.log(`✓ 更新: ${updated.id} ${updated.name} [${updated.category}]`);

// 変更フィールドを表示
const changedKeys = Object.keys(fields);
console.log(`  更新フィールド: ${changedKeys.join(', ')}`);

// generate.js を実行
execSync(`node ${path.join(GLOSSARY_DIR, 'generate.js')}`, { stdio: 'inherit' });
