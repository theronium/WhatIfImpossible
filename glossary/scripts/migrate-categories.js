#!/usr/bin/env node
// カテゴリ一括移行スクリプト
// 使い方: node glossary/scripts/migrate-categories.js

const fs = require('fs');
const path = require('path');

const JSONL_PATH = path.join(__dirname, '../data/terms.jsonl');

const QUANTUM = new Set([
  'g009','g012','g014','g060','g061','g062','g064','g092','g097','g098',
  'g145','g146','g149','g150','g151','g157','g162','g164','g171','g173',
  'g196','g197','g198','g199','g202','g248','g252','g253','g256','g278',
  'g280','g281',
]);

const PARTICLE = new Set([
  'g011','g065','g070','g074','g093','g114','g147','g156','g217','g220',
  'g254','g255','g258','g271','g272','g273','g274','g275','g282',
]);

const lines = fs.readFileSync(JSONL_PATH, 'utf8').split('\n');
const counts = { quantum: 0, particle: 0, skip: 0 };

const updated = lines.map(line => {
  if (!line.trim()) return line;
  let term;
  try { term = JSON.parse(line); } catch { return line; }

  if (QUANTUM.has(term.id)) {
    counts.quantum++;
    console.log(`quantum  : ${term.id} ${term.name}`);
    return JSON.stringify({ ...term, category: 'quantum' });
  }
  if (PARTICLE.has(term.id)) {
    counts.particle++;
    console.log(`particle : ${term.id} ${term.name}`);
    return JSON.stringify({ ...term, category: 'particle' });
  }
  counts.skip++;
  return line;
});

fs.writeFileSync(JSONL_PATH, updated.join('\n'), 'utf8');
console.log(`\n完了: quantum=${counts.quantum}, particle=${counts.particle}, 変更なし=${counts.skip}`);
