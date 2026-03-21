以下の情報をもとに、WhatIfImpossibleの用語集に1項目追加してください。

用語名: $ARGUMENTS

---

## 手順

1. 用語の内容を判断し、最適なファイルを選ぶ：
   - `glossary/astronomy.md` — 天文学・宇宙論・観測
   - `glossary/physics.md` — 物理学・素粒子・熱力学
   - `glossary/philosophy.md` — 哲学・存在論・認識論
   - `glossary/biology.md` — 生物学・進化・生命科学
   - `glossary/sf-concepts.md` — SF固有の概念・設定

2. 対象ファイルを読み込み、末尾に以下のフォーマットで追記する：

```
---

## 用語名（英語名）

**読み**: よみがな
**分野**: 分野名
**関連記事**: wiim_XXX（関連記事があれば。なければ「—」）

説明文（200〜400字程度）。
専門用語には簡単な説明を添える。
既存の glossary 内の他の用語や docs/ の記事と関連があれば言及する。
```

3. `glossary/README.md` の「用語数: N」をインクリメントする。

4. 追記したファイルパスと用語名を報告する。

5. **git commit は行わない。** ユーザーが明示的に指示した場合のみコミットする。
