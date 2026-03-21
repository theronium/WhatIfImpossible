以下の情報をもとに、WhatIfImpossibleの用語集に1項目追加してください。

用語名: $ARGUMENTS

---

## 手順

1. `glossary/data/terms.jsonl` を読み込み、末尾の ID（`g___`）を確認して次の ID を決定する。

2. 用語の内容を判断し、カテゴリを選ぶ：
   - `astronomy`   — 天文学・宇宙論・観測
   - `physics`     — 物理学・素粒子・熱力学
   - `philosophy`  — 哲学・存在論・認識論
   - `biology`     — 生物学・進化・生命科学
   - `sf-concepts` — SF固有の概念・設定

3. `glossary/data/terms.jsonl` の末尾に以下の形式で1行追加する：

```json
{"id":"g047","name":"用語名","en":"English Name","reading":"よみがな","category":"カテゴリ","field":"分野名","related":["wiim_XXX"],"body":"説明文（200〜400字）。\n\n段落はここで区切る。"}
```

   - `en` が不要な場合は `null`
   - `related` が不要な場合は `[]`
   - 本文の改行は `\n`、段落間は `\n\n`
   - 既存の glossary 内の他の用語や docs/ の記事と関連があれば本文中で言及する

4. `node glossary/generate.js` を実行して各 `.md` ファイルを再生成する（50音順ソート・用語数更新が自動で行われる）。

5. 追加した用語名・ID・カテゴリを報告する。

6. **git commit は行わない。** ユーザーが明示的に指示した場合のみコミットする。
