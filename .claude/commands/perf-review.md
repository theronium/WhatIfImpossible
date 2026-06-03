スクリプトのパフォーマンスログ（glossary/data/perf.db）を分析し、ボトルネックと改善提案を報告してください。

引数: $ARGUMENTS（省略可。"recent" / "slow" / "summary" / "--run <ID>" を指定するとその視点を優先する）

---

## 手順

1. **データ取得**（以下を並行実行）
   - `node glossary/scripts/perf-report.js summary` — スクリプト別集計
   - `node glossary/scripts/perf-report.js slow` — 最も遅い実行
   - `node glossary/scripts/perf-report.js recent` — 直近の実行傾向
   - 引数に `--run <ID>` が指定されている場合は `node glossary/scripts/perf-report.js --run <ID>` も実行

2. **分析視点**
   - 最もコストの高いフェーズはどれか（バーグラフの割合と絶対時間）
   - 用語数の増加に対して時間がどのように変化しているか（`terms` metaフィールドを参照）
   - `trigger` フィールドから呼び出し経路を把握し、連鎖コストを評価する
   - エラーや `skipped` の割合に異常がないか
   - 同一スクリプトの最小・最大の乖離が大きい場合、その原因を推定する

3. **報告形式**
   - 現状のボトルネック（上位2〜3件）を具体的な数値とともに示す
   - 改善の優先度を「高・中・低」で分類して提示する
   - 改善策の実装難易度（スクリプトの変更規模）も添える
   - データ不足（実行回数が少ない）の場合はその旨を明記する

4. **改善実装**（引数に `--fix` が含まれる場合のみ）
   - ユーザーの同意を得てから実装する
   - 計測ロジック（perf-log.js）自体は変更しない
