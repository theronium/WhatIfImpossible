# 用語集の使い方・管理ガイド

## ファイル構成

```
glossary/
├── data/
│   ├── terms.jsonl      ← 全用語のソースデータ（JSONL形式）
│   └── new-term.json    ← 新規用語追加時の一時ファイル
├── scripts/             ← 管理スクリプト
│   ├── generate.js      ← terms.jsonl → .md ファイルを再生成
│   ├── add-term.js      ← 新規用語を1件追加するスクリプト
│   ├── update-term.js   ← 既存用語をフィールド単位で上書き更新するスクリプト
│   ├── lookup.js        ← ID・用語名で1件検索
│   ├── next-id.js       ← 次の gXXX / wiim_XXX 番号を確認
│   └── migrate.js       ← 【一回限り】旧 .md から terms.jsonl を生成
├── terms/               ← 個別用語ファイル（自動生成）
│   └── gXXX.md
├── categories.json      ← カテゴリ定義（名称・色・並び順）
├── astronomy.md         ← 自動生成（編集不要）
├── physics.md           ← 自動生成（編集不要）
├── mathematics.md       ← 自動生成（編集不要）
├── speculative.md       ← 自動生成（編集不要）
├── philosophy.md        ← 自動生成（編集不要）
├── biology.md           ← 自動生成（編集不要）
├── sf-concepts.md       ← 自動生成（編集不要）
└── README.md            ← 自動生成（編集不要）
```

> **注意**: カテゴリ別 `.md` ファイルと `README.md` は `generate.js` が自動生成します。
> 直接編集しても次回 `generate.js` 実行時に上書きされます。

---

## 用語を追加する

### 方法①：Claude Code スキルを使う（推奨）

エディタや Claude Code のチャットで以下のように入力するだけ：

```
量子テレポーテーション /add-glossary-term
```

Claude が内容を調べ、`new-term.json` の作成から `add-term.js` の実行まで自動で行います。

### 方法②：手動で追加する

1. `glossary/data/new-term.json` を以下の形式で作成：

```json
{
  "name": "用語名",
  "en": "English Name",
  "reading": "よみがな",
  "category": "astronomy",
  "field": "分野名",
  "related": ["wiim_XXX"],
  "body": "説明文（200〜400字）。\n\n段落は \\n\\n で区切る。"
}
```

2. スクリプトを実行（ID自動採番・重複チェック・.md 再生成まで自動）：

```bash
node glossary/scripts/add-term.js
```

---

## 既存の用語を編集する

### 方法①：update-term.js を使う（推奨）

`new-term.json` に **`id` フィールド**を加えて更新したいフィールドだけ書き、スクリプトを実行します：

```json
{
  "id": "g114",
  "body": "更新後の説明文。\n\n改行はそのまま書ける。"
}
```

```bash
node glossary/scripts/update-term.js
```

- 指定したフィールドのみ上書き。省略したフィールドは変更されない
- `aliases` に `"merge": true` を追加すると既存エイリアスと結合（上書きでなく追記）
- JSON のエンコード・デコードは Node.js が処理するためシェルの文字化けが起きない

### 方法②：エディタ UI を使う

`http://localhost:3030` のエディタUIから用語を選んで直接編集・保存できます。

### 方法③：terms.jsonl を直接編集する

`glossary/data/terms.jsonl` を直接編集し、`generate.js` を再実行：

```bash
node glossary/scripts/generate.js
```

---

## カテゴリを追加・変更する

`glossary/categories.json` を編集します：

```json
{
  "id": "newcat",
  "label": "新しいカテゴリ",
  "color": "#ffffff",
  "bg": "#111111",
  "sort": 10
}
```

編集後は `generate.js` を実行。エディタUIのカテゴリ管理パネル（⚙ボタン）からも操作できます。

---

## 各スクリプトの役割

| スクリプト | 用途 | 実行頻度 |
|-----------|------|--------|
| `generate.js` | terms.jsonl → 全 .md を再生成。README も更新 | 用語編集のたびに自動実行 |
| `add-term.js` | new-term.json を読んで terms.jsonl に1件追記し、generate.js を呼ぶ | 新規追加時 |
| `update-term.js` | new-term.json（id付き）で既存用語を部分上書きし、generate.js を呼ぶ | 既存用語の更新時 |
| `migrate.js` | 旧 .md ファイルから terms.jsonl を生成（初回移行用） | 基本的に不要 |

---

## 自動リンク機能

`generate.js` は .md 生成時に、各用語の説明文中に登場する他の用語名を自動的にリンク化します。

- 長い用語名を優先してマッチ（部分一致を防ぐ）
- 同じ用語名は最初の1回のみリンク
- 自分自身の用語名はリンクしない
- `node glossary/scripts/generate.js` を再実行するだけで全リンクが更新される

---

## JSONL フォーマット詳細

```json
{"id":"g001","name":"用語名","en":"English Name","reading":"よみがな","category":"astronomy","field":"分野名","related":["wiim_XXX"],"body":"説明文（\\n\\n で段落区切り）"}
```

| フィールド | 内容 |
|-----------|------|
| `id` | 自動採番（g001〜）。手動変更不要 |
| `name` | 日本語用語名 |
| `en` | 英語名（不要なら `null`）|
| `reading` | よみがな（ひらがな）|
| `category` | categories.json の id と一致させる |
| `field` | 分野名（表示用） |
| `related` | 関連記事IDの配列（なければ `[]`）|
| `body` | 説明文。`\n` で改行、`\n\n` で段落区切り |
