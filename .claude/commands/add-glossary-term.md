以下の情報をもとに、WhatIfImpossibleの用語集に1項目追加してください。

用語名: $ARGUMENTS

---

## 手順

1. 用語の内容を判断し、カテゴリを選ぶ：
   - `astronomy`     — 天文学・宇宙論・観測
   - `physics`       — 物理学・素粒子・熱力学
   - `speculative`   — 仮説・未観測の粒子・物質（ダークマター・タキオンなど）
   - `philosophy`    — 哲学・存在論・認識論
   - `biology`       — 生物学・進化・生命科学
   - `sf-concepts`   — SF全般に存在する概念・設定（ワープ、タイムマシンなど）
   - `wiim-concepts` — WIIMで独自に命名・創作した粒子・素材・概念（コーラ粒子、パラドックス粒子、ノーファペンなど）

   > **注意**: タキオンのような実在仮説のある粒子は `speculative`、WIIMの思考実験で初めて定義した概念は `wiim-concepts` を使う。既存のSFトロープ（ワープ航法など）は `sf-concepts`。

2. `glossary/data/new-term.json` を以下の形式で書き込む：

```json
{
  "name": "用語名",
  "en": "English Name",
  "reading": "よみがな",
  "category": "カテゴリ",
  "field": "分野名",
  "related": ["wiim_XXX"],
  "body": "説明文（200〜400字）。\n\n段落はここで区切る。"
}
```

   - `en` が不要な場合は `null`
   - `related` が不要な場合は `[]`
   - 本文の改行は `\n`、段落間は `\n\n`
   - 既存の glossary 内の他の用語や docs/ の記事と関連があれば本文中で言及する

3. `node glossary/scripts/add-term.js` を実行する（ID自動採番・重複チェック・generate.js実行まで自動で行われる）。

4. `review-glossary-term` スキルを呼び出し、追加した用語のIDを引数として渡してレビュー・修正を行う。

5. 追加した用語名・ID・カテゴリとレビュー結果（修正した項目、問題なしの項目）を報告する。

6. **git commit は行わない。** ユーザーが明示的に指示した場合のみコミットする。
