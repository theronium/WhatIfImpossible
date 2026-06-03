#!/usr/bin/env node
// perf-log.js — スクリプト実行の時間計測を SQLite に記録する
// 使い方: const perf = require('./perf-log');
//         const run = perf.start('generate.js', { mode: 'full' });
//         const p = run.phase('render-terms');
//         p.end({ count: 405 });
//         run.end('ok', { termCount: 405 });
'use strict';

const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'perf.db');

// node:sqlite の ExperimentalWarning を抑制して require する
function loadSqlite() {
  const orig = process.emit.bind(process);
  process.emit = function (name, warning) {
    if (name === 'warning' && warning &&
        warning.name === 'ExperimentalWarning' &&
        typeof warning.message === 'string' &&
        warning.message.includes('SQLite')) {
      return false;
    }
    return orig.apply(this, arguments);
  };
  try {
    return require('node:sqlite');
  } finally {
    process.emit = orig;
  }
}

let _db = null;

function getDb() {
  if (_db) return _db;
  try {
    const { DatabaseSync } = loadSqlite();
    _db = new DatabaseSync(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        script      TEXT    NOT NULL,
        started_at  TEXT    NOT NULL,
        ended_at    TEXT,
        duration_ms INTEGER,
        status      TEXT    DEFAULT 'ok',
        meta        TEXT    DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS phases (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id      INTEGER NOT NULL REFERENCES runs(id),
        phase       TEXT    NOT NULL,
        started_at  TEXT    NOT NULL,
        duration_ms INTEGER,
        meta        TEXT    DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_runs_script  ON runs(script);
      CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
      CREATE INDEX IF NOT EXISTS idx_phases_run   ON phases(run_id);
    `);
    return _db;
  } catch {
    return null;
  }
}

function isonow() {
  return new Date().toISOString();
}

/**
 * スクリプト実行の計測を開始する。
 * @param {string} script - スクリプト名（例: 'generate.js'）
 * @param {object} meta   - 付加情報（例: { mode: 'full', trigger: 'add-term' }）
 * @returns {{ phase(name): PhaseHandle, end(status, meta): number }} run ハンドル
 */
function start(script, meta = {}) {
  const wallStart = Date.now();
  let runId = null;

  const db = getDb();
  if (db) {
    try {
      const r = db.prepare('INSERT INTO runs (script, started_at, meta) VALUES (?, ?, ?)')
                  .run(script, isonow(), JSON.stringify(meta));
      runId = Number(r.lastInsertRowid);
    } catch { /* 計測失敗はサイレントに無視 */ }
  }

  return {
    id: runId,

    /**
     * フェーズ計測を開始する。
     * @param {string} name - フェーズ名（例: 'render-terms'）
     * @returns {{ end(meta?): number }} フェーズハンドル
     */
    phase(name) {
      const phaseStart = Date.now();
      let phaseId = null;

      if (db && runId !== null) {
        try {
          const r = db.prepare('INSERT INTO phases (run_id, phase, started_at, meta) VALUES (?, ?, ?, ?)')
                      .run(runId, name, isonow(), '{}');
          phaseId = Number(r.lastInsertRowid);
        } catch {}
      }

      return {
        end(endMeta = {}) {
          const ms = Date.now() - phaseStart;
          if (db && phaseId !== null) {
            try {
              db.prepare('UPDATE phases SET duration_ms = ?, meta = ? WHERE id = ?')
                .run(ms, JSON.stringify(endMeta), phaseId);
            } catch {}
          }
          return ms;
        }
      };
    },

    /**
     * 実行を終了し、経過時間（ms）を返す。
     * @param {string} status   - 'ok' | 'error' | 'skipped'
     * @param {object} endMeta  - 付加情報（meta にマージ）
     * @returns {number} 経過時間（ms）
     */
    end(status = 'ok', endMeta = {}) {
      const ms = Date.now() - wallStart;
      if (db && runId !== null) {
        try {
          db.prepare('UPDATE runs SET ended_at = ?, duration_ms = ?, status = ?, meta = ? WHERE id = ?')
            .run(isonow(), ms, status, JSON.stringify({ ...meta, ...endMeta }), runId);
        } catch {}
      }
      return ms;
    }
  };
}

module.exports = { start };
