# WhatIfImpossible — プロジェクト概要

現代科学では実現不可能な思考実験を収集・考察するサイト。
記事はMarkdownで管理し、GitHub経由で公開する。

## ディレクトリ構成

```
WhatIfImpossible/
├── docs/                  ← 記事本体（カテゴリ別フォルダ）
│   ├── README.md          ← 全記事インデックス（GitHub上で自動表示）
│   ├── _template.md       ← 記事ひな形（参照用）
│   ├── cosmology/         ← 宇宙・時空間・相対論・FTL系
│   ├── physics/           ← 素粒子・力・エネルギー系
│   ├── quantum/           ← 量子力学・量子情報系
│   ├── logic/
│   ├── philosophy/
│   └── biology/
└── editor/                ← ローカル編集サーバー（Node.js / port 3030）
```

## 用語集の管理

用語集は `glossary/data/terms.jsonl`（JSONL形式）をソースとし、`glossary/scripts/generate.js` で各 `.md` ファイルを生成する。

### JSONL フォーマット

```json
{"id":"g001","name":"用語名","en":"English Name","reading":"よみがな","category":"astronomy","field":"分野名","related":["wiim_XXX"],"body":"説明文（\n\n で段落区切り）"}
```

- `category`: `astronomy` / `physics` / `quantum` / `particle` / `mathematics` / `speculative` / `philosophy` / `biology` / `sf-concepts` / `wiim-concepts` / `wiim-engineering`
  - `quantum`          — 量子力学・量子場理論・量子統計・量子情報・量子重力など量子系全般
  - `particle`         — 素粒子物理学・核物理学・標準模型・弦理論など
  - `speculative`      — タキオン・ダークマターなど実在仮説はあるが未観測の粒子・物質
  - `sf-concepts`      — ワープ航法・タイムマシンなどSF全般に存在する概念
  - `wiim-concepts`    — WIIMで独自に命名・創作した粒子・素材・概念（コーラ粒子、パラドックス粒子、エネルギー紐など）
  - `wiim-engineering` — WIIM世界観から派生した装置・通信技術・工学システム（カシミールフォージ、ノーファペンなど）
- `related`: 関連記事IDの配列（なければ `[]`）

### body 内のリンクについて

**body 内に `[用語名](gXXX.md)` 形式の手動リンクを書かない。**
ローカルエディタ（port 3030）の用語ビューアは `#gXXX` ハッシュ形式のみを処理するため、`gXXX.md` 形式はリンク切れになる。
エディタの自動リンク機能が本文中の用語名を検出してクリッカブルなスパンに変換するため、手動リンクは不要。
他用語・記事への参照は `related` フィールドで管理する。

### 用語の追加手順

1. `node glossary/scripts/next-id.js` で次の `gXXX`（用語）と `wiim_XXX`（記事）番号を確認
2. 末尾に新しい JSON 行を追記
3. `node glossary/scripts/generate.js` を実行して `.md` ファイルを再生成
4. `/add-glossary-term` スキルはこの手順を自動で行う

### 用語の検索・参照

- **1件取り出し**: `node glossary/scripts/lookup.js <ID|用語名>` — terms.jsonl 全体を読む代わりに使う
- **部分一致検索**: `node glossary/scripts/lookup.js <キーワード>` — 複数ヒット時は一覧表示

### 既存用語の更新手順

`glossary/data/new-term.json` に **`id` フィールド**と更新したいフィールドのみ記載し、`update-term.js` を実行する。
JSON のエンコード・デコードは Node.js が処理するため、日本語・改行・特殊文字の文字化けが起きない。

```json
{ "id": "g114", "body": "更新後の説明文。\n\n段落はここで区切る。" }
```

```bash
node glossary/scripts/update-term.js
```

- 省略したフィールドは変更されない
- `aliases` を追記（上書きでなくマージ）する場合は `"merge": true` を追加
- **用語の body・aliases・field などを更新する際は必ずこのスクリプトを経由すること。**
  直接シェルや文字列操作で JSONL を書き換えると文字化けや JSON 破損のリスクがある

---

## インデックスの更新ルール

新しい記事を追加したときは必ず `docs/README.md` を更新する。

- 該当カテゴリのテーブルに行を追加（ID・タイトル・タグ・日付）
- 末尾の「記事数: N」をインクリメントする
- `/write-article` スキルはこの更新を自動で行う

## 技術ツリーの更新ルール

`docs/notes/tech_tree.md` は技術・概念の依存関係を管理するドキュメント。新しい記事を追加したとき、技術ツリーに追加すべきノードがあれば更新する。

- 既存ブランチに接続できる概念は既存ブランチへ追記する
- 新しい系統（ブランチ）が必要な場合は `##` 見出しで新ブランチを追加する
- ノードには記事ID（`wiim_XXX`）または用語ID（`gXXX`）を記載する
- 記事を複数追加したまとめてツリーを更新してもよい（1記事ごとのコミットは不要）

## 図版の管理

幾何学的構造などの図版は `docs/assets/shapes/` に PNG で保存する。

### 生成スクリプト

```bash
pip install numpy matplotlib   # 初回のみ
python tools/generate_shapes.py
```

`tools/generate_shapes.py` を編集して形状を追加・修正し、再実行すると上書き更新される。

新しい形状を追加する場合は `gen_XXX()` 関数を定義し、末尾の `GENERATORS` リストの適切なカテゴリに追加してから実行する。

### 画像パスの規則

参照元によってパスが異なる：

| 参照元 | パス例 |
|--------|--------|
| `docs/notes/` | `../assets/shapes/gyroid.png` |
| `glossary/terms/` | `../../docs/assets/shapes/gyroid.png` |

### 用語 body への画像追加

`update-term.js` は body を全文置換するため、既存 body への**追記**は Node.js で直接行う：

```js
node -e "
const fs = require('fs');
const lines = fs.readFileSync('glossary/data/terms.jsonl','utf-8').trim().split('\n');
const idx = lines.findIndex(l => JSON.parse(l).id === 'gXXX');
const t = JSON.parse(lines[idx]);
t.body += '\n\n![名前](../../docs/assets/shapes/XXX.png)';
lines[idx] = JSON.stringify(t);
fs.writeFileSync('glossary/data/terms.jsonl', lines.join('\n')+'\n','utf-8');
"
node glossary/scripts/generate.js
```

---

## 記事の frontmatter

```yaml
---
title: （日本語タイトル）
id: wiim_NNN           # 通し番号 wiim_001 〜
category: physics      # フォルダ名と一致させる
tags: []               # 関連キーワード
date: YYYY-MM-DD
---
```

## カテゴリ一覧（拡張可）

| フォルダ名 | 内容 |
|-----------|------|
| `cosmology` | 宇宙・時空間・相対論・FTL系 |
| `physics` | 素粒子・力・エネルギー系（狭義の物理） |
| `quantum` | 量子力学・量子情報・量子統計系 |
| `logic` | 論理・パラドックス系 |
| `philosophy` | 意識・自由意志・存在論 |
| `biology` | 生命・進化系 |

## 記事の構成（セクション順）

1. **概要 (Abstract)** — 何が不可能か、何を問うか
2. **実現不可能性の根拠 (Infeasibility Rationale)** — 物理的・技術的・論理的限界
3. **実験の設定 (Setup)** — 主体・環境・操作の列挙
4. **考察と予測 (Speculation)** — 予測される結果、哲学的な問い
5. **数式による表現 (Mathematical Notation)** — KaTeX使用、任意
6. **図解 (Diagrams)** — Mermaid使用、任意
7. **関連記事 (Related)** — 他記事へのリンク

## 記事と補遺ノートの分岐基準

「もし○○が実現したら何が起きるか」という問いに対して、**物理的・論理的・技術的な不可能性の根拠が論じられるか**で判断する。

- **記事にする**：不可能性の根拠を3観点（物理・技術・論理）から論じられる思考実験
- **補遺ノートにする**：法律・政治・経済・社会的帰結など、不可能性より世界観の整合性が主題のもの

例：「アンキロン暦が精密に機能するか」→ 記事（銀河運動補正の限界が論じられる）
例：「軌道計量汚染条約の内容」→ 補遺ノート（法的設計の話で不可能性の根拠がない）

### 補遺ノートの frontmatter

`docs/notes/` に作成する補遺ノートには必ず以下のフロントマターを付ける。これがないと一覧のタイトルが日本語化されない。

```yaml
---
title: （日本語タイトル）
type: note
date: YYYY-MM-DD
---
```

`related` に関連記事IDを列挙する場合は `related: [wiim_XXX]` を追加する。

---

## 記述スタイル

- 日本語で執筆する
- 断定より「〜と考えられる」「〜が示唆される」などの表現を使う
- 難解な専門用語には簡単な説明を添える
- 数式は極力使わない。使う場合でも1記事に1つまでを目安とし、本当に必要な場合のみ（ホーキング博士が「数式1つで読者が半分になる」と述べたように、読みやすさを最優先する）
- Mermaidで論理フローを視覚化すると読者の理解が深まる
- **「仮想粒子」は量子力学の専門用語**（量子揺らぎで一時的に現れる粒子）のため、タキオンのような架空・仮説の粒子には使わない。代わりに「仮説上の粒子」「思考実験上の粒子」「理論的粒子」を使う
- **カシミール効果の説明**で「仮想粒子の生成・増幅」という表現を使う場合は、「比喩的表現であり、正確には真空の電磁モード密度の変化」と注記する
- **余剰次元にエネルギー・エントロピーを転嫁する設定**では、余剰次元側でどのような代償が生じるかを明示する。「余剰次元に消える」は問題の先送りであり、完全な回避ではないことを記述する
- **アンキロン（wiim_022）の能力範囲**: アンキロンは時空の計量テンソルに錨を打つ粒子であり、**物質を直接捕捉・固定する能力はない**。「アンキロンで粒子を固定する」という記述は誤り。正しくは「アンキロンが計量座標を固定し、その座標を別の概念（コーラ粒子など）が参照する」という間接的な組み合わせとして記述する
- **前提条件が変わると不可能性が消える場合**は論理の流れを一本に通す。例：「常温核融合が前提→高温プラズマ不要→アルファ加熱の概念が不要→中性生成物が飛び出すことが純粋な利点になる」のように、前提変化の連鎖を明示する

## 記事分割のパターン

一つの思考実験が「手段（入り口）」と「帰結（出口）」に分離できる場合は、別記事にすることを検討する。

- **入り口記事**: 「どうすれば実現できるか」を複数の架空概念アプローチで論じる
- **出口記事**: 「実現したとして何が変わるか」を入り口を前提として受け取り、帰結を論じる
- 入り口記事が出口記事の前提となるため、出口記事の概要（Abstract）で入り口記事を明示的に参照する
- 例: wiim_070（核融合生成物の即時中性化＝入り口）→ wiim_071（中性生成物の世界＝出口）
