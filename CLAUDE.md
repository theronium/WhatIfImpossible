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
{"id":"g001","name":"用語名","en":"English Name","reading":"よみがな","category":"astronomy","group":"グループ名","field":"分野名","related":["wiim_XXX"],"body":"説明文（\n\n で段落区切り）"}
```

- `group`: カテゴリ内のサブ分類を示す任意フィールド。**用語追加時は原則として設定する**（省略時は「その他」として末尾に表示）。エディタの用語一覧でグループヘッダー付きの小分け表示になる。
  対応カテゴリと有効なグループ値は以下の通り（未設定の用語は「その他」として末尾に表示）。

  **wiim-concepts / wiim-engineering**:
  - `particles` — 粒子（コーラ粒子・アンキロン・パラドックス粒子など）
  - `fungi-bio` — 菌類・生命（コズミックマイス・マイセリアンなど）
  - `qualia` — 意識・クオリア（クオリア波動関数・ヌルクオリアなど）
  - `metric` — 時空計量（クロノスフィア・トポロフィ・計量暦システムなど）
  - `casimir` — カシミール・真空エネルギー（カシミールフォージ・逆カシミール装置など）
  - `communication` — 通信（ノーファペン・パラドックス粒子通信など）
  - `concept` — 理論・概念（カオスの悪魔・エキゾチック物理学など）

  **physics**:
  - `thermodynamics` — 熱力学・統計力学
  - `relativity` — 相対論・時空
  - `electromagnetism` — 電磁気学
  - `optics` — 光学
  - `mechanics` — 古典力学・流体
  - `bh-info` — ブラックホール・情報物理
  - `acoustics` — 音響・波動
  - `condensed-matter` — 磁性・物性
  - `geometry` — 幾何・構造
  - `information` — 情報・計算

  **astronomy**:
  - `black-holes` — ブラックホール・相対論天体
  - `cosmology` — 宇宙論・宇宙構造
  - `observation` — 天文観測・測定
  - `stellar` — 恒星・星雲・小天体
  - `orbital` — 軌道力学・宇宙工学

  **quantum**:
  - `foundations` — 量子力学の基礎・解釈
  - `quantum-info` — 量子情報・通信
  - `quantum-gravity` — 量子重力・ホログラフィー
  - `quantum-matter` — 量子物性・超低温

  **mathematics**:
  - `logic-foundations` — 論理・基礎論
  - `topology` — 位相・幾何
  - `algebra-number` — 代数・数論
  - `analysis-probability` — 解析・確率

  **philosophy**:
  - `consciousness` — 意識・心の哲学
  - `metaphysics` — 形而上学・存在論
  - `epistemology` — 認識論・科学哲学

  **particle**:
  - `standard-model` — 標準模型・素粒子
  - `beyond-sm` — 統一理論・超弦
  - `nuclear` — 核物理・核融合

  **biology**:
  - `evolution` — 進化・遺伝学
  - `ecology-microbio` — 生態・微生物・菌類

  **sf-concepts**:
  - `megastructures` — 巨大構造物・宇宙探査
  - `paradox-civilization` — パラドックス・文明
  - `mythology-legend` — 神話・伝説・古代技術

  **speculative**:
  - `dark-cosmos` — ダーク宇宙論
  - `exotic-matter` — エキゾチック物質・仮説粒子

  新カテゴリへグループ機能を追加する場合は `editor/public/js/glossary.js` の `_GROUP_CONFIG` に定義を追記する。

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

---

## エディタのリンク処理（SPA仕様）

ローカルエディタ（port 3030）はSPAであり、Markdownレンダリング後のリンクを以下の3系統で処理する。
リンクを書く際はこの仕様を理解した上で形式を選ぶこと。

### 系統①：`#path/to/file.md` 形式（廃止済み）

`href` が `#` で始まり、`/` と `.md` を含む場合に `openArticle(path)` へ変換していた旧形式。
**現在は使用しない。** 生MDビューア（VS Code / GitHub）では機能しないため、系統②に統一している。

### 系統②：相対パス `.md` 形式（標準）

```
[テキスト](相対パス.md)          → openArticle(currentPath基準で解決)
[テキスト](../glossary/terms/gXXX.md) → viewTerm(gXXX)（glossary/ を含む場合）
```

- **記事間リンク・技術ツリーリンクはこの形式で書く**
- `currentPath`（現在開いているファイルのパス）を基準に URL 解決する
- エディタでも生MDビューアでも動作する唯一の形式

**注意**: エディタの専用ローダー（`loadTechtree()` など）は `openArticle()` を経由しないため、
`currentPath` が自動設定されない。専用ローダーを追加・修正する場合は `currentPath` を明示的にセットすること。

### 系統③：`#heading` 形式（ページ内アンカー）

`/` を含まない `#` リンクはブラウザ標準動作に委ねる。
エディタのプレビュー pane は見出しに `id` を付与していないため、現状はスクロールしない。

### 用語の自動リンク（エディタ専用）

エディタは `linkTermsInPreview()` により、レンダリング後の本文中に出現する用語名を自動検出してクリッカブルなスパンに変換する。
これはDOM操作であり、Markdownソースには記録されない。用語参照はソースに手動リンクを書かず `related` フィールドで管理する。

---

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

## 記号集の管理

記号集は `glossary/data/symbols.jsonl`（JSONL形式）をソースとし、`glossary/scripts/generate-symbols.js` で各 `.md` ファイルを生成する。
用語集（terms.jsonl）とは別ファイルで管理する（スキーマが異なる・性質が違う・量が増大するため）。

### JSONL フォーマット

```json
{"id":"s001","symbol":"ℏ","latex":"\\hbar","name":"ディラック定数","en":"reduced Planck constant","reading":"えいちばー","aliases":["エイチバー","h-bar","hbar"],"category":"quantum","body":"説明文（\\n\\n で段落区切り）"}
```

| フィールド | 内容 |
|-----------|------|
| `id` | 自動採番（s001〜）。手動変更不要 |
| `symbol` | 記号文字（1〜数文字。ユニコード可） |
| `latex` | LaTeXコマンド（例: `\\hbar`）。不要なら省略可 |
| `name` | 日本語名 |
| `en` | 英語名（不要なら省略可） |
| `reading` | よみがな（ひらがな） |
| `aliases` | 別称・読み方の配列（例: `["round d","curly d"]`）。なければ省略可 |
| `category` | 下記の有効値から選択 |
| `body` | 説明文。`\n\n` で段落区切り。**ダブルクォートは必ず `\"` にエスケープする** |

- `group` フィールドは不要（記号はカテゴリ単位でフラットに管理）
- `related` フィールドは不要（記事との関連付けは行わない）

### 有効なカテゴリ値

`physics` / `quantum` / `mathematics` / `astronomy` / `particle` / `speculative` / `wiim-concepts`

### 記号の追加手順

1. `glossary/data/new-symbol.json` を以下の形式で作成（`new-symbol.sample.json` を参考に）：

```json
{
  "symbol": "∮",
  "latex": "\\oint",
  "name": "周回積分",
  "en": "contour integral",
  "reading": "しゅうかいせきぶん",
  "aliases": ["線積分", "ループ積分"],
  "category": "mathematics",
  "body": "閉じた経路に沿った線積分を表す記号。"
}
```

2. スクリプトを実行（ID自動採番・重複チェック・.md 生成まで自動）：

```bash
node glossary/scripts/add-symbol.js
```

### 全件再生成

```bash
node glossary/scripts/generate-symbols.js
```

### 注意事項

- **body 内のダブルクォートは `\"` にエスケープすること。**
  エスケープ漏れがあると `readSymbols()` が全件読み込みに失敗し、エディタ上でリンクが一切表示されなくなる（エラーは無音で飲み込まれる）。
- `new-symbol.json` は `.gitignore` 済みでコミットされない。
- 生成先: `glossary/symbols/sXXX.md`（自動生成のため直接編集不要）

---

## インデックスの更新ルール

新しい記事を追加したときは必ず `docs/README.md` を更新する。

- 該当カテゴリのテーブルに行を追加（ID・タイトル・タグ・日付）
- 末尾の「記事数: N」をインクリメントする
- `/write-article` スキルはこの更新を自動で行う

## 技術ツリーの更新ルール

技術ツリーはファイルが大きくなったため、インデックスとブランチファイルに分割して管理している。

- **インデックス**: `docs/notes/tech_tree.md` — ブランチ一覧テーブルと全体依存関係（Mermaid概略）のみ
- **ブランチファイル**: `docs/notes/tech_tree_<name>.md` — 各系統の詳細Mermaidと実現限界テーブル

新しい記事を追加したとき、技術ツリーに追加すべきノードがあれば以下のルールに従って更新する。

- **既存ブランチへの追加**: 対応する `docs/notes/tech_tree_<name>.md` を直接編集する
- **新ブランチの作成**:
  1. `docs/notes/tech_tree_<name>.md` を新規作成する
  2. frontmatter に `title`・`type: note`・`date`・`related` を記述する
  3. 先頭行に `← [技術ツリー一覧](tech_tree.md)` を追加する
  4. インデックス `docs/notes/tech_tree.md` のブランチ一覧テーブルに行を追加する（リンクは `tech_tree_<name>.md` 形式）
- ノードには記事ID（`wiim_XXX`）または用語ID（`gXXX`）を記載する
- 記事を複数追加したあとまとめてツリーを更新してもよい（1記事ごとのコミットは不要）

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

---

## スクリプトのパフォーマンス監視

用語集スクリプト（generate.js・add-term.js・update-term.js・scan-related.js）は実行時間をフェーズ別に `glossary/data/perf.db`（SQLite、ローカル専用・git除外）に記録する。

### 計測フェーズ

| スクリプト | フェーズ |
|-----------|---------|
| `generate.js` (全件モード) | `render-categories` / `update-readme` / `render-terms` |
| `generate.js` (選択モード) | `patch-categories` / `patch-terms` |
| `add-term.js` | `append-jsonl` / `generate` |
| `update-term.js` | `patch-jsonl` / `generate` |
| `scan-related.js` | `load-index` / `collect-sources` / `update-terms` / `update-articles` / `selective-generate` |

### レポートコマンド

```bash
node glossary/scripts/perf-report.js              # 直近 20 件
node glossary/scripts/perf-report.js slow         # 最も遅い 10 件
node glossary/scripts/perf-report.js summary      # スクリプト別集計（平均・最小・最大）
node glossary/scripts/perf-report.js --run <ID>   # 特定実行のフェーズ内訳（バーグラフ付き）
node glossary/scripts/perf-report.js help         # ヘルプ
```

### AI分析

`/perf-review` スキルでレポートを取得し、ボトルネックの特定・改善提案を AI が行う。
統計的検証・傾向分析はスクリプト単体では難しいためスキルを使う。

### meta フィールドの主なキー

| キー | 意味 |
|------|------|
| `trigger` | 呼び出し元（`cli` / `add-term.js` / `update-term.js` / `scan-related.js` / `browser`） |
| `mode` | 実行モード（`full` / `selective` / `staged` / `all` / `dry-run`） |
| `terms` | 処理時点の用語総数 |
| `termCount` | 出力した用語数 |
| `count` | フェーズで処理したアイテム数 |

### 注意

- `perf.db` はローカル専用。git にコミットしない（`.gitignore` 済み）
- Node.js 22 以上が必要（`node:sqlite` 組み込みモジュール使用）
- スクリプトの計測失敗は無視されるため、`perf.db` が壊れても他スクリプトは正常動作する
