# termlink-editor 実装 TODO

実装しやすい順（既存機能を壊さない順）に並べてある。
フェーズ完了後にリポジトリ分離（最終ゴール）。

---

## Phase 1 — 用語ファイル単体化（generate.js 拡張）

既存フローへの影響ゼロ。単独で完結。

- [ ] `glossary/terms/gXXX.md` を generate.js で出力
  - frontmatter に id / name / en / reading / category / field / related を含める
  - body は段落ごとに改行
  - related リンクは `[用語名](gXXX.md)` 形式（GitHub 上でクリック可能）
- [ ] generate.js 実行後に `terms/` フォルダが正しく生成されることを確認

---

## Phase 2 — コレクション基盤（サーバー側）

UI より先にデータ構造とAPIを固める。

- [ ] `editor/data/collections.json` の設計・初期ファイル作成
  - `active` キーと `collections` マップ（label / docsPath / glossaryPath）
  - docsPath / glossaryPath が null の場合は `editor/data/[subkey]/docs|glossary/` を使う
- [ ] `editor/data/wiim/config.json` 作成（WhatIfImpossible 用の初期設定）
  - idFormat: `"global-only"` or `"category-prefix"`
  - counters: `{ global: N, byCategory: {}, termCounter: N }`
  - output: `["markdown"]`（将来 html 追加）
- [ ] サーバーの `DOCS_DIR` / `GLOSSARY_DIR` をコレクション設定から動的解決に変更
- [ ] `GET /api/collections` — コレクション一覧と active を返す
- [ ] `POST /api/collections/switch` — active を切り替え、一覧と設定を返す

---

## Phase 3 — コレクション切替 UI

- [ ] ヘッダー左上にコレクション選択セレクトボックスを追加
  - 現在の `WhatIfImpossible Editor` テキストをセレクトに置き換え
  - 選択肢は `label` フィールドから生成
- [ ] 切替時にサイドバー（記事・補遺・用語）をリロード（ページリフレッシュなし）
- [ ] 技術ツリータブをコレクション設定 `showTechTree: true/false` で表示/非表示制御
  - WhatIfImpossible はデフォルト `true`、新規サブコレクションは `false`

---

## Phase 4 — 新規作成フォーム改善

### 記事（思考実験）
- [ ] カテゴリをセレクトボックスに変更（`categories.json` から動的生成）
- [ ] カテゴリ選択後に連番プレビューを表示（保存時に確定）
- [ ] テンプレート選択（`data/[subkey]/templates/` 内の `.md` 一覧）
- [ ] 連番は config.json の counter を increment して保存

### 補遺（notes）
- [ ] 補遺の新規作成ボタンを補遺パネルに追加
- [ ] 連番付きファイル名の自動生成（例: `notes/note_001.md`）
- [ ] テンプレート選択（補遺用）

### 用語
- [ ] 用語新規作成フォームに連番自動付与（`termCounter` を使用）
- [ ] カテゴリセレクトボックス化

---

## Phase 5 — テンプレート管理

- [ ] `editor/data/[subkey]/templates/` フォルダ設計
  - `default.md` — 思考実験デフォルト
  - `novel-chapter.md` — 前書き・本文・後書き・参考リンク
  - `addendum.md` — 補遺デフォルト
- [ ] テンプレート登録・編集 UI（設定画面またはモーダル）
- [ ] `GET /api/templates` / `POST /api/templates/:name` API

---

## Phase 6 — 新規サブコレクション作成 UI

- [ ] 設定画面に「新規コレクション作成」フォームを追加
  - コレクションキー（英数字）・ラベル名・保存先（内部 or 外部パス）
  - カテゴリ引継ぎ or デフォルトのみ を選択
  - ID フォーマット設定（global-only / category-prefix）
- [ ] 作成時に `data/[subkey]/config.json`・`categories.json`・`docs/`・`glossary/data/` を初期化
- [ ] `collections.json` に追加してセレクトボックスに反映

---

## Phase 7 — ナビゲーション・出力設定

- [ ] 前後記事リンクをプレビュー下部に自動表示（連番に基づく最近傍を検索）
  - セレクトボックス形式（全記事番号から選択）も検討
- [ ] config.json の `output` 設定に応じて MD / HTML / both を保存
  - HTML 出力時は用語リンクをエディタと同様に展開して保存

---

## Phase 8 — リポジトリ分離（最終目標）

- [ ] `editor/` を `termlink-editor/` として独立リポジトリ化
- [ ] `WhatIfImpossible/editor/` を削除し、sibling リポジトリから起動する手順を整備
- [ ] README に「別コンテンツリポジトリへの接続方法」を記載

---

## メモ

- 連番ライブラリは不要。config.json の integer counter を increment するだけで十分。
- 用語の JSONL 形式は変えない。`terms/gXXX.md` は generate.js の出力のみ。
- カテゴリ定義は `categories.json`（既存）を流用し、サブコレクションごとにコピー。
