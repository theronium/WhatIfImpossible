#!/usr/bin/env python3
"""
build_vectors.py
================
editor/data/dictionaries/*.jsonl と docs/**/*.md を読み込み、
multilingual-e5-small（PyTorch）でベクトル化して
editor/public/checker/ に以下を出力する。

  vectors.json    — 全エントリのベクトルと抜粋
  terms-dict.json — name/aliases → id のマッピング（キーワードマッチ用）

使い方:
  python -m pip install transformers sentencepiece huggingface_hub
  python editor/scripts/build_vectors.py

モデルは HuggingFace Hub から自動ダウンロードされ、システムキャッシュに保存される。
vectors.json と terms-dict.json はコミット対象。再実行すると上書きされる。

NOTE: browser-side ONNX 推論用の model.onnx は別途 download_browser_model.py で取得する。
"""

import json
import re
import sys
from pathlib import Path

# ── パス設定 ──────────────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parents[2]   # WhatIfImpossible/
DICT_DIR    = ROOT / "editor" / "data" / "dictionaries"
DOCS_DIR    = ROOT / "docs"

# 出力先: editor（ローカルエディタ用）と docs/search（GitHub Pages用）の両方
OUT_DIRS = [
    ROOT / "editor" / "public" / "checker",   # ローカルエディタ
    ROOT / "docs" / "search",                  # GitHub Pages
]
for d in OUT_DIRS:
    d.mkdir(parents=True, exist_ok=True)

MODEL_ID = "intfloat/multilingual-e5-small"

# ── モデルのロード ────────────────────────────────────────────────
def load_model():
    try:
        import torch
        from transformers import AutoTokenizer, AutoModel
    except ImportError:
        sys.exit("必要パッケージ: python -m pip install transformers sentencepiece torch")

    print(f"[model] {MODEL_ID} をロード中（初回はDLあり）...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model     = AutoModel.from_pretrained(MODEL_ID)
    model.eval()
    return tokenizer, model


# ── Embedding 生成 ────────────────────────────────────────────────
def embed_batch(texts, tokenizer, model):
    """texts: list[str] → list[list[float]] (384次元, 平均プーリング + L2正規化)"""
    import torch

    enc = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
    with torch.no_grad():
        out = model(**enc)

    # 平均プーリング（attention_mask 考慮）
    hidden = out.last_hidden_state                           # (batch, seq, dim)
    mask   = enc["attention_mask"].unsqueeze(-1).float()    # (batch, seq, 1)
    summed = (hidden * mask).sum(dim=1)                     # (batch, dim)
    counts = mask.sum(dim=1).clamp(min=1e-9)                # (batch, 1)
    emb    = summed / counts                                 # (batch, dim)

    # L2 正規化
    emb = torch.nn.functional.normalize(emb, p=2, dim=1)
    return emb.tolist()


# ── データ収集 ────────────────────────────────────────────────────
def load_dict_entries():
    """dictionaries/*.jsonl から全エントリを返す"""
    entries = []
    for path in sorted(DICT_DIR.glob("*.jsonl")):
        if path.name.startswith("novel-example"):
            continue   # サンプルファイルはスキップ
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    return entries


def load_doc_entries():
    """docs/**/*.md から frontmatter + 本文を返す"""
    entries = []
    fm_re = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

    for path in sorted(DOCS_DIR.rglob("*.md")):
        if path.name in ("README.md", "_template.md", "new.md"):
            continue
        text = path.read_text(encoding="utf-8")
        m    = fm_re.match(text)
        title, doc_id, body = path.stem, path.stem, text

        if m:
            fm   = m.group(1)
            body = text[m.end():]
            for key, val in re.findall(r"^(\w+):\s*(.+)$", fm, re.MULTILINE):
                if key == "title": title  = val.strip()
                if key == "id":    doc_id = val.strip()

        entries.append({
            "id":     doc_id,
            "name":   title,
            "body":   body.strip(),
            "source": "doc",
        })
    return entries


# ── ベクトルDB 生成 ───────────────────────────────────────────────
BATCH_SIZE = 32

def build(tokenizer, model):
    dict_entries = load_dict_entries()
    doc_entries  = load_doc_entries()
    all_entries  = dict_entries + doc_entries
    print(f"[data] 辞書: {len(dict_entries)} 件, 記事: {len(doc_entries)} 件")

    # e5 は "passage: " プレフィックスが必要
    texts = [f"passage: {e['name']}。{e['body'][:400]}" for e in all_entries]

    vectors = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        vecs  = embed_batch(batch, tokenizer, model)
        vectors.extend(vecs)
        print(f"  {min(i + BATCH_SIZE, len(texts))} / {len(texts)}", end="\r")
    print()

    result = []
    for entry, vec in zip(all_entries, vectors):
        result.append({
            "id":      entry["id"],
            "name":    entry["name"],
            "source":  entry.get("source", ""),
            "excerpt": entry["body"][:120].replace("\n", " "),
            "vector":  [round(v, 6) for v in vec],
        })

    content = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    for d in OUT_DIRS:
        p = d / "vectors.json"
        p.write_text(content, encoding="utf-8")
        print(f"[out] {p}  ({p.stat().st_size // 1024} KB)")


# ── 用語辞書（キーワードマッチ用）の生成 ──────────────────────────
def build_terms_dict():
    entries = load_dict_entries()
    mapping = {}

    for e in entries:
        mapping[e["name"]] = e["id"]
        for alias in e.get("aliases", []):
            mapping[alias] = e["id"]

    # 長い名前を優先マッチするため降順ソート
    ordered = dict(sorted(mapping.items(), key=lambda kv: -len(kv[0])))
    content = json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))
    for d in OUT_DIRS:
        p = d / "terms-dict.json"
        p.write_text(content, encoding="utf-8")
    print(f"[out] terms-dict.json  ({len(ordered)} キーワード)")


# ── checker.js を docs/search/ に同期 ────────────────────────────
def sync_checker_js():
    import shutil
    src = ROOT / "editor" / "public" / "checker" / "checker.js"
    dst = ROOT / "docs" / "search" / "checker.js"
    if src.exists():
        shutil.copy2(src, dst)
        print(f"[sync] checker.js → docs/search/")


# ── main ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    tokenizer, model = load_model()
    build(tokenizer, model)
    build_terms_dict()
    sync_checker_js()
    print("[done] ビルド完了")
