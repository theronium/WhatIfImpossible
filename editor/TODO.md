# termlink-editor 実装 TODO

実装しやすい順（既存機能を壊さない順）に並べてある。
フェーズ完了後にリポジトリ分離（最終ゴール）。

---

## Phase 1 — 用語ファイル単体化（generate.js 拡張）✅

- [x] `glossary/terms/gXXX.md` を generate.js で出力
  - frontmatter に id / name / en / reading / category / field / related を含める
  - body は段落ごとに改行
  - related リンクは `[用語名](gXXX.md)` 形式（GitHub 上でクリック可能）
- [x] generate.js 実行後に `terms/` フォルダが正しく生成されることを確認

---

## Phase 2 — コレクション基盤（サーバー側）✅

- [x] `editor/data/collections.json` の設計・初期ファイル作成
- [x] `editor/data/wiim/config.json` 作成
- [x] サーバーの `DOCS_DIR` / `GLOSSARY_DIR` をコレクション設定から動的解決に変更
- [x] `GET /api/collections`
- [x] `POST /api/collections/switch`

---

## Phase 3 — コレクション切替 UI ✅

- [x] ヘッダー左上にコレクション選択セレクトボックスを追加
- [x] 切替時にサイドバー（記事・補遺・用語）をリロード
- [x] 技術ツリータブをコレクション設定 `showTechTree` で表示/非表示制御

---

## Phase 4 — 新規作成フォーム改善 ✅

- [x] カテゴリをセレクトボックスに変更（動的生成）
- [x] 連番は config.json の counter を increment して保存
- [x] テンプレート選択（`data/[subkey]/templates/` 内の `.md` 一覧）
- [x] 補遺の新規作成ボタンを補遺パネルに追加
- [x] 用語新規作成フォームに連番自動付与

---

## Phase 5 — テンプレート管理 ✅

- [x] `editor/data/[subkey]/templates/` フォルダ設計
  - `default.md` / `novel-chapter.md` / `addendum.md` を初期作成
- [x] テンプレート登録・編集 UI（settings-modal のテンプレートタブ）
- [x] `GET/PUT/DELETE /api/templates/:name` API

---

## Phase 6 — 新規サブコレクション作成 UI ✅

- [x] settings-modal にタブを追加（テンプレート / コレクション）
- [x] 登録済みコレクション一覧表示・出力形式設定
- [x] 「新規コレクション作成」フォーム
- [x] `POST /api/collections` でディレクトリ構造を初期化
- [x] `collections.json` に追加してセレクトボックスに反映

---

## Phase 7 — ナビゲーション・出力設定 ✅

- [x] 前後記事リンクをプレビュー下部に自動表示（連番に基づく隣接記事を検索）
- [x] config.json の `output` 設定に応じて MD / HTML / both を保存
- [x] `PATCH /api/collection/config` エンドポイント
- [x] settings-modal（コレクションタブ）に出力形式ラジオを追加

---

## Phase 8 — UI 整理・カテゴリ管理統合

### 8-1. 新規記事ボタンをサイドバーに移動

- [ ] ヘッダーの「＋ 新規記事」ボタンを削除
- [ ] 記事パネルのサイドバーヘッダー（`articles-search-bar`）に「＋ 新規」ボタンを追加
  - 補遺・用語の既存パターンに合わせる

### 8-2. カテゴリ管理を settings-modal に統合

- [ ] settings-modal に3つ目のタブ「カテゴリ」を追加
- [ ] 用語集サイドバーの ⚙ ボタン（`openCatModal`）を削除し、cat-modal を廃止
- [ ] カテゴリタブの構成
  - **記事カテゴリ** セクション：色・ラベルのみ編集可（フォルダ名は変更不可）
  - **用語カテゴリ** セクション：フル CRUD（既存の cat-modal と同等機能）

### 8-3. 記事カテゴリ定義ファイルの新設

- [ ] `editor/data/[subkey]/article-categories.json` を新設
  - 形式は `categories.json` と同じ（`id / label / color / bg / sort`）
  - id はフォルダ名と一致させる（変更不可）
  - wiim の初期値は既存の CSS 定義から生成
- [ ] `GET /api/article-categories` と `PUT /api/article-categories/:id` を追加
- [ ] サイドバーの記事カテゴリ色・ラベルを CSS 直書きから動的適用に変更
  - 未定義のカテゴリはフォールバック色で表示

### 設計方針メモ

- 記事カテゴリ（フォルダ紐付き）と用語カテゴリ（タグ的自由分類）は**別データで管理**
- 両方とも同じ `{ id, label, color, bg, sort }` 形式を使い、仕組みは共通
- サブコレクション（小説等）では両者の性質が全く異なるため統合しない

---

## Phase 9 — リポジトリ分離（最終目標）

- [ ] `editor/` を `termlink-editor/` として独立リポジトリ化
- [ ] `WhatIfImpossible/editor/` を削除し、sibling リポジトリから起動する手順を整備
- [ ] README に「別コンテンツリポジトリへの接続方法」を記載

---

## メモ

- 連番ライブラリは不要。config.json の integer counter を increment するだけで十分。
- 用語の JSONL 形式は変えない。`terms/gXXX.md` は generate.js の出力のみ。
- カテゴリ定義は `categories.json`（既存）を流用し、サブコレクションごとにコピー。
