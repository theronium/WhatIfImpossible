#!/usr/bin/env node
// perf-report.js — perf.db の実行ログをクエリして表示する
// 使い方:
//   node glossary/scripts/perf-report.js              # 直近 20 件（デフォルト）
//   node glossary/scripts/perf-report.js slow         # 最も遅い 10 件
//   node glossary/scripts/perf-report.js summary      # スクリプト別集計
//   node glossary/scripts/perf-report.js --run <ID>   # フェーズ内訳
//   node glossary/scripts/perf-report.js help         # このヘルプ
'use strict';

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'perf.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('perf.db が見つかりません。');
  console.error('計測対象スクリプトを一度実行してから再試行してください。');
  process.exit(1);
}

// ExperimentalWarning を抑制
const orig = process.emit.bind(process);
process.emit = function (name, warning) {
  if (name === 'warning' && warning &&
      warning.name === 'ExperimentalWarning' &&
      typeof warning.message === 'string' &&
      warning.message.includes('SQLite')) return false;
  return orig.apply(this, arguments);
};
const { DatabaseSync } = require('node:sqlite');
process.emit = orig;

const db = new DatabaseSync(DB_PATH);
const args = process.argv.slice(2);
const cmd  = args[0] || 'recent';

// ── フォーマットヘルパー ─────────────────────────────────────────────

function fmtMs(ms) {
  if (ms == null) return '     -';
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s `.padStart(7);
  if (ms >= 1000)  return `${(ms / 1000).toFixed(2)}s`.padStart(7);
  return `${ms}ms`.padStart(7);
}

function fmtDate(iso) {
  if (!iso) return '-';
  return iso.replace('T', ' ').replace(/\.\d+Z$/, '');
}

function fmtMeta(metaStr) {
  try {
    const m = JSON.parse(metaStr || '{}');
    const entries = Object.entries(m).filter(([, v]) => v !== undefined && v !== '');
    return entries.map(([k, v]) => `${k}=${v}`).join(' ');
  } catch {
    return metaStr || '';
  }
}

const LINE = '─'.repeat(88);

// ── recent ────────────────────────────────────────────────────────────

if (cmd === 'recent') {
  const rows = db.prepare(
    'SELECT id, script, started_at, duration_ms, status, meta FROM runs ORDER BY id DESC LIMIT 20'
  ).all();

  console.log('\n直近の実行（最大 20 件）');
  console.log(LINE);
  console.log(`${'ID'.padStart(5)}  ${'スクリプト'.padEnd(18)} ${'日時'.padEnd(22)} ${'時間'.padStart(7)}  状態   meta`);
  console.log(LINE);
  for (const r of rows) {
    console.log(
      `${String(r.id).padStart(5)}  ${r.script.padEnd(18)} ${fmtDate(r.started_at).padEnd(22)} ` +
      `${fmtMs(r.duration_ms)}  ${(r.status || 'ok').padEnd(6)} ${fmtMeta(r.meta)}`
    );
  }
  if (!rows.length) console.log('  (記録なし)');
  console.log();

// ── slow ─────────────────────────────────────────────────────────────

} else if (cmd === 'slow') {
  const rows = db.prepare(
    "SELECT id, script, started_at, duration_ms, status, meta FROM runs " +
    "WHERE status = 'ok' AND duration_ms IS NOT NULL " +
    "ORDER BY duration_ms DESC LIMIT 10"
  ).all();

  console.log('\n最も遅い実行（上位 10 件）');
  console.log(LINE);
  console.log(`${'ID'.padStart(5)}  ${'スクリプト'.padEnd(18)} ${'日時'.padEnd(22)} ${'時間'.padStart(7)}  meta`);
  console.log(LINE);
  for (const r of rows) {
    console.log(
      `${String(r.id).padStart(5)}  ${r.script.padEnd(18)} ${fmtDate(r.started_at).padEnd(22)} ` +
      `${fmtMs(r.duration_ms)}  ${fmtMeta(r.meta)}`
    );
  }
  if (!rows.length) console.log('  (記録なし)');
  console.log();

// ── summary ────────────────────────────────────────────────────────────

} else if (cmd === 'summary') {
  const rows = db.prepare(`
    SELECT
      script,
      COUNT(*)                                              AS cnt,
      CAST(ROUND(AVG(duration_ms)) AS INTEGER)              AS avg_ms,
      MIN(duration_ms)                                      AS min_ms,
      MAX(duration_ms)                                      AS max_ms,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)    AS errors
    FROM runs
    GROUP BY script
    ORDER BY avg_ms DESC
  `).all();

  const phaseRows = db.prepare(`
    SELECT p.phase, CAST(ROUND(AVG(p.duration_ms)) AS INTEGER) AS avg_ms, COUNT(*) AS cnt
    FROM phases p
    JOIN runs r ON r.id = p.run_id
    GROUP BY r.script, p.phase
    ORDER BY r.script, avg_ms DESC
  `).all();

  console.log('\nスクリプト別統計');
  console.log('─'.repeat(70));
  console.log(
    `${'スクリプト'.padEnd(22)} ${'件数'.padStart(5)} ${'平均'.padStart(7)} ${'最小'.padStart(7)} ${'最大'.padStart(7)} ${'エラー'.padStart(6)}`
  );
  console.log('─'.repeat(70));
  for (const r of rows) {
    console.log(
      `${r.script.padEnd(22)} ${String(r.cnt).padStart(5)} ` +
      `${fmtMs(r.avg_ms)} ${fmtMs(r.min_ms)} ${fmtMs(r.max_ms)} ${String(r.errors).padStart(6)}`
    );
  }
  if (!rows.length) console.log('  (記録なし)');

  if (phaseRows.length) {
    console.log('\nフェーズ別平均（スクリプトをまたいで集計）');
    console.log('─'.repeat(50));
    console.log(`${'フェーズ'.padEnd(28)} ${'平均'.padStart(7)} ${'件数'.padStart(5)}`);
    console.log('─'.repeat(50));
    for (const p of phaseRows) {
      console.log(`${p.phase.padEnd(28)} ${fmtMs(p.avg_ms)} ${String(p.cnt).padStart(5)}`);
    }
  }
  console.log();

// ── --run <ID> ─────────────────────────────────────────────────────────

} else if (cmd === '--run') {
  const runId = parseInt(args[1], 10);
  if (!runId || isNaN(runId)) {
    console.error('使い方: --run <ID>');
    process.exit(1);
  }

  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!run) {
    console.error(`Run #${runId} が見つかりません。`);
    process.exit(1);
  }

  const phases = db.prepare(
    'SELECT phase, duration_ms, meta FROM phases WHERE run_id = ? ORDER BY id'
  ).all(runId);

  console.log(`\nRun #${run.id}: ${run.script}  ${fmtMs(run.duration_ms).trim()}  [${run.status || 'ok'}]`);
  console.log(`  開始: ${fmtDate(run.started_at)}  終了: ${fmtDate(run.ended_at)}`);
  const metaStr = fmtMeta(run.meta);
  if (metaStr) console.log(`  meta: ${metaStr}`);

  if (phases.length) {
    console.log('\n  フェーズ内訳:');
    const maxLen = Math.max(...phases.map(p => p.phase.length), 12);
    const total  = run.duration_ms || 1;
    for (const p of phases) {
      const pct = Math.round((p.duration_ms ?? 0) / total * 100);
      const bar = '█'.repeat(Math.max(1, Math.round(pct / 5)));
      const pm  = fmtMeta(p.meta);
      console.log(
        `    ${p.phase.padEnd(maxLen)}  ${fmtMs(p.duration_ms).trim().padStart(7)}  ` +
        `${String(pct).padStart(3)}%  ${bar}${pm ? '  ' + pm : ''}`
      );
    }
  } else {
    console.log('  (フェーズ記録なし)');
  }
  console.log();

// ── help ──────────────────────────────────────────────────────────────

} else if (cmd === 'help' || cmd === '--help') {
  console.log(`
使い方: node glossary/scripts/perf-report.js [コマンド]

コマンド:
  recent            直近 20 件の実行一覧（デフォルト）
  slow              最も遅い 10 件
  summary           スクリプト別集計（件数・平均・最小・最大・エラー数）
  --run <ID>        特定の実行のフェーズ内訳をバーグラフ付きで表示
  help              このヘルプ

DB: ${DB_PATH}
`);

} else {
  console.error(`不明なコマンド: ${cmd}  (help で使い方を確認)`);
  process.exit(1);
}
