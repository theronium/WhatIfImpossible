/**
 * checker.js — WIIM-Link セマンティック検索
 *
 * サーバー不要。ブラウザ内で完結する。
 * - モデル: Xenova/multilingual-e5-small（HuggingFace Hub CDN、初回~30MB）
 * - データ: vectors.json / terms-dict.json（同フォルダに配置）
 *
 * GitHub Pages / 静的ホスティングでそのまま動作する。
 */

const BASE = import.meta.url.replace(/\/[^/]+$/, "");

let vectorDB  = null;   // [{id, name, source, excerpt, vector}]
let termsDict = null;   // {keyword: id}  降順ソート済み
let _pipe     = null;

// ── 初期化 ───────────────────────────────────────────────────────
export async function init(statusCallback = () => {}) {
  statusCallback("データを読み込み中...");
  const [vRes, tRes] = await Promise.all([
    fetch(`${BASE}/vectors.json`),
    fetch(`${BASE}/terms-dict.json`),
  ]);
  if (!vRes.ok) throw new Error("vectors.json が見つかりません。build_vectors.py を実行してください。");
  [vectorDB, termsDict] = await Promise.all([vRes.json(), tRes.json()]);

  statusCallback("モデルを読み込み中...");
  const { pipeline } = await import(
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js"
  );
  _pipe = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", {
    dtype: "q8",
    progress_callback: (p) => {
      if (p.status === "downloading") {
        const pct = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
        const mb  = (p.loaded / 1024 / 1024).toFixed(1);
        const tot = (p.total  / 1024 / 1024).toFixed(1);
        statusCallback(`モデルDL中… ${pct}% (${mb} / ${tot} MB)`);
      } else if (p.status === "loading") {
        statusCallback(`モデルロード中…`);
      }
    },
  });
  statusCallback(`準備完了 — ${vectorDB.length} エントリ`);
}

// ── キーワードマッチ ──────────────────────────────────────────────
export function matchTerms(text) {
  if (!termsDict) return [];
  const matched = new Map();
  for (const [kw, id] of Object.entries(termsDict)) {
    if (text.includes(kw) && !matched.has(id)) matched.set(id, kw);
  }
  return [...matched.entries()].map(([id, keyword]) => ({ id, keyword }));
}

// ── コサイン類似度 ────────────────────────────────────────────────
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// ── セマンティック検索 ────────────────────────────────────────────
export async function search(queryText, topN = 8) {
  if (!_pipe || !vectorDB) throw new Error("init() を先に呼んでください。");
  const out    = await _pipe(`query: ${queryText}`, { pooling: "mean", normalize: true });
  const qVec   = Array.from(out.data);
  return vectorDB
    .map(e => ({ ...e, score: cosine(qVec, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ── メイン API ────────────────────────────────────────────────────
export async function check(text, topN = 8) {
  const terms   = matchTerms(text);
  const similar = await search(text, topN);
  return { terms, similar };
}
