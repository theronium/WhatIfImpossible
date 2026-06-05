# エディタ コードレビュー

対象: `editor/server.js` / `editor/public/index.html` / `glossary/scripts/generate.js`  
日付: 2026-06-05

---

## 目次

1. [遅延の原因となる問題（修正前提）](#1-遅延の原因となる問題修正前提)
2. [バグ・正確性の問題](#2-バグ正確性の問題)
3. [設計・保守性の問題](#3-設計保守性の問題)

---

## 1. 遅延の原因となる問題（修正前提）

### 1-1. 初期化の全ステップが直列になっている

**場所:** `index.html:2814–2819`

```js
await loadCollections();
await loadCategories();
await loadGlossaryTerms();
await loadArticles();
```

`loadGlossaryTerms()` と `loadArticles()` は互いに独立しているにも関わらず直列に実行される。  
`loadCollections()` → `loadCategories()` は依存関係があるが、その後の2つは並列にできる。

**修正案:**
```js
await loadCollections();
await loadCategories();
await Promise.all([loadGlossaryTerms(), loadArticles()]);
```

---

### 1-2. `updatePreview()` がデバウンスなしでキー入力ごとに呼ばれる

**場所:** `index.html:823`

```js
monacoEditor.onDidChangeModelContent(() => updatePreview());
```

`updatePreview()` は markdown-it レンダリング → KaTeX → Mermaid → `linkTermsInPreview()` を毎回フル実行する。  
`linkTermsInPreview()` は 500件超の用語に対して各テキストノードへ正規表現を当てる O(N×M) 処理であり、特に重い。  
エディタ分割モード（split）で日本語変換中も毎文字ごとに発火するため、体感遅延が大きい。

**修正案:**  
300〜500ms のデバウンスを挟む。

```js
let _previewTimer = null;
monacoEditor.onDidChangeModelContent(() => {
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(updatePreview, 350);
});
```

---

### 1-3. `linkTermsInPreview()` の正規表現が毎回インスタンス生成・非キャッシュ

**場所:** `index.html:1591–1597`

```js
for (const t of index) {               // 500+ 件
  const escaped = t.name.replace(...);
  if (!new RegExp(escaped).test(html)) continue;  // RegExp を毎回生成
  // ...
  html = html.replace(new RegExp(escaped), ph);   // さらにもう1回生成
}
```

テキストノード数 × 用語数 × 2回の `new RegExp()` が走る。  
用語数が増えるほど指数的に重くなる。

**修正案:**
- 用語一覧が変化したときだけ正規表現配列をキャッシュし、再利用する。
- `glossaryTerms` が変わるタイミング（`loadGlossaryTerms()` 後）だけ再ビルドする。

```js
let _termRegexCache = null;

function buildTermIndex() {
  const index = [];
  for (const t of glossaryTerms) {
    index.push({ name: t.name, id: t.id });
    for (const alias of (t.aliases || [])) index.push({ name: alias, id: t.id });
  }
  index.sort((a, b) => b.name.length - a.name.length);
  return index.map(t => ({
    ...t,
    regex: new RegExp(t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  }));
}

// loadGlossaryTerms() 内で呼ぶ
function loadGlossaryTerms() {
  // ... fetch ...
  glossaryTerms = await res.json();
  _termRegexCache = buildTermIndex();
  renderGlossaryList();
}
```

---

### 1-4. 用語保存後に全件リロードが2回走る（WebSocket + saveTerm の二重発火）

**場所:** `index.html:2068–2078` / `index.html:2796–2800`

用語保存（`saveTerm()`）の成功ハンドラで `loadGlossaryTerms()` を呼ぶ。  
同時にサーバーが `broadcast({ type: 'reload-glossary' })` し、WebSocket ハンドラからも `loadGlossaryTerms()` が呼ばれる。  
結果として `/api/glossary/terms`（全件取得）と `renderGlossaryList()` が **1回の保存につき2回** ずつ実行される。

**修正案 A（最小変更）:** `saveTerm()` 側でのリロードを省き、WSメッセージ側に一本化する。  
**修正案 B（根本対応）:** POSTの返り値に新しい用語オブジェクトが含まれているため（`data.term`）、ローカルの `glossaryTerms` 配列を差分更新してリロードを省く。

```js
// saveTerm() 成功時
if (!currentTermId) {
  glossaryTerms.push(data.term);       // 追加のみ
} else {
  const idx = glossaryTerms.findIndex(t => t.id === currentTermId);
  if (idx !== -1) glossaryTerms[idx] = { ...glossaryTerms[idx], ...payload };
}
_termRegexCache = buildTermIndex();
renderGlossaryList();
// loadGlossaryTerms() は呼ばない
```

WS の `reload-glossary` は他プロセスや CLI での変更に対応するために残すが、`saveTerm()` 自身は差分更新で十分。

---

### 1-5. 記事保存のたびに全記事を再スキャンする

**場所:** `index.html:1308`

```js
if (res.ok) { showToast('保存しました', 'ok'); loadArticles(); }
```

`loadArticles()` は `/api/articles` を呼び、サーバー側で `walkDocs()` により全 `.md` ファイルのフロントマター読み込みが走る。  
記事を保存するたびに全件スキャンが実行されるが、保存したのは1ファイルだけなので不必要。  
（前セッションで `walkDocs()` は並列化済みだが、それでも全件 I/O であることに変わりない）

**修正案:** `saveArticle()` 成功時はローカルの `articles` 配列を差分更新し、フルリロードを省く。

```js
// PUT /api/articles/:path の返り値に更新後のフロントマターを含めるようにする
const idx = articles.findIndex(a => a.path === currentPath);
if (idx !== -1) articles[idx] = { ...articles[idx], ...updatedFm };
renderList(articles);
```

---

### 1-6. `renderGlossaryList()` が毎回フル DOM 再構築する

**場所:** `index.html:1756–1883`

```js
function renderGlossaryList(query = '') {
  const el = document.getElementById('glossary-list');
  el.innerHTML = '';  // 全消去して作り直し
  // ...500件のDOMを構築
```

`editTerm()`, `openNewTerm()`, `viewTerm()`, `switchToPanel()` のすべてで呼ばれる。  
`saveTerm()` からは `loadGlossaryTerms()`（→ `renderGlossaryList()`）+ 直列の `renderGlossaryList()` で合計2回のフル再構築が走る。

**修正案:** `viewingTermId` / `currentTermId` の変化に伴うアクティブ行の更新は、`innerHTML` を再構築せずに CSS クラスの付け替えだけで済む。フルリビルドは「用語データ自体が変わった」ときのみにする。

---

### 1-7. 用語更新（PUT）でもフル生成（約426ファイル）が走る

**場所:** `server.js:558–562`

```js
app.put('/api/glossary/terms/:id', async (req, res) => {
  // ...
  await runGenerate();  // ADD_TERM_ID なしでフル生成
```

今回の修正で POST（新規追加）は最適化されたが、PUT（既存用語の更新）はまだ全件生成。  
`body` の更新は自分自身の `gXXX.md` と、所属カテゴリの `.md` だけ再生成すれば十分なケースが多い。  
（`name`/`aliases` の変更は他用語の autoLink に影響するため全件が必要になるが、`body` や `reading` の変更なら不要）

**修正案:** PUT 時に変更フィールドを受け取り、`name`/`aliases` に変化がない場合は `ADD_TERM_ID` モードと同様のピンポイント再生成にする。  
または、`PERF_TRIGGER=browser` かつ変更フィールドが `body`/`field`/`related` のみなら `ADD_TERM_ID` を渡す。

---

### 1-8. `autoLinkBodyForSave()` がインデックスを毎保存ごとに再構築する

**場所:** `index.html:1328–1335`

```js
function autoLinkBodyForSave(body, termPrefix) {
  const index = [];
  for (const t of glossaryTerms) {
    index.push({ name: t.name, id: t.id });
    for (const alias of (t.aliases || [])) index.push({ name: alias, id: t.id });
  }
  index.sort((a, b) => b.name.length - a.name.length);
```

1-3 で挙げた `_termRegexCache` を共用することで解決できる。

---

## 2. バグ・正確性の問題

### 2-1. `new-cat-id` / `new-cat-label` の ID 重複 ✅ 対応済み

**場所:** `index.html:629, 653`（`stab-categories` と廃止済み `cat-modal` の両方）

`document.getElementById('new-cat-id')` は最初にヒットした要素を返す。  
廃止済みの `cat-modal` が DOM に残っているため、`addCategory()` が正しい入力欄を参照できない可能性がある。

**対応:** 廃止済みの `cat-modal` ブロックを HTML ごと削除した。

---

### 2-2. PUT `/api/glossary/terms/:id` が用語オブジェクトを完全上書きする

**場所:** `server.js:556`

```js
terms[idx] = { id: req.params.id, ...req.body };
```

フォームに表示されていないフィールド（`group` など）が `req.body` に含まれない場合、そのフィールドは消える。  
`update-term.js` は差分更新（省略フィールドは保持）するが、API 経由では保持されない。

**修正案:** スプレッドで既存オブジェクトをベースにする。

```js
terms[idx] = { ...terms[idx], ...req.body, id: req.params.id };
```

---

### 2-3. `generate.js` の `buildArticleFolders()` が同期 I/O でブロックする

**場所:** `glossary/scripts/generate.js:15–28`

```js
function buildArticleFolders() {
  for (const sub of fs.readdirSync(docsDir)) {       // 同期
    if (!fs.statSync(subPath).isDirectory()) continue; // 同期
    for (const file of fs.readdirSync(subPath)) {     // 同期
```

`generate.js` は子プロセスとして spawn されるため Node.js イベントループへの影響は限定的だが、  
spawn 中のターミナルやエディタ応答は blocking I/O の間ストールする。  
`fs.promises` + トップレベル `await` に変換することで非同期化できる。

---

### 2-4. フロントマター解析が簡易実装で edge case に弱い

**場所:** `index.html:831–847`

```js
m[1].split(/\r?\n/).forEach(line => {
  const kv = line.match(/^(\w+):\s*(.+)/);
```

- `title: "コロン: を含むタイトル"` → `:` で分割されて値が壊れる
- `tags: []` → 空配列が文字列 `"[]"` として解釈される
- マルチバイト文字を含む YAML は正確に処理されないケースがある

サーバー側は `gray-matter` を使っているため、ページ内パースは簡易実装との乖離がある。  
プレビュー表示・保存は整合しているが、タグや ID の取り出しで誤判定しうる。

---

## 3. 設計・保守性の問題

### 3-1. 2844行の単一 HTML ファイル ✅ 対応済み

`index.html` に CSS・HTML・JavaScript 全てが含まれている。  
モジュール分割なし・`import` なし・グローバル関数だらけのため、実行順序の追跡が困難。  
バグの影響範囲が広く、関数の依存関係が暗黙的。

**対応:** `style.css` + `js/{state,editor,articles,glossary,sidebar,settings,init}.js` の8ファイルに分割（365行に削減）。

---

### 3-2. `switchToPanel()` がタブ切り替えのたびに `glossaryTerms` を再フェッチする ✅ 対応済み

**場所:** `index.html:2198–2200`

```js
if (isGlossary) {
  loadGlossaryTerms();  // タブを開くたびに全件取得
```

用語集タブを開くたびに `/api/glossary/terms` が呼ばれる。  
WS による `reload-glossary` で最新化されているため、タブ切り替え時のリロードは不要。

**対応:** `switchToPanel()` の `loadGlossaryTerms()` 呼び出しを削除。WS + 起動時初期化に一本化した。

---

### 3-3. `loadTechtree()` が `currentPath` を自動セットしない

**場所:** `index.html:1134–1155`

```js
async function loadTechtree() {
  currentPath = 'notes/tech_tree.md';  // 手動セット
  renderToPane(content, pane).then(() => {
    addSvgZoom(pane);
    renderTechtreeToc(pane);  // appendPrevNext / renderToc は呼ばれない
  });
```

CLAUDE.md に「専用ローダーを追加・修正する場合は `currentPath` を明示的にセットすること」と記載があるが、  
`.md` リンクの相対解決（`openArticle()` 内の `new URL(mdPath, base)`）は `currentPath` が `'notes/tech_tree.md'` で  
セットされているため、tech_tree からのリンクは正常に機能している。ただし `renderToc()` が呼ばれないため  
右ペインの目次が生成されない（意図的かどうか不明）。

---

### 3-4. `collapsedCats` がメモリのみで永続化されない ✅ 対応済み

**場所:** `index.html:675`

カテゴリの折り畳み状態（`collapsedCats`）はページリロードで失われる。  
TOC の折り畳み（`tocCollapsed`）は `localStorage` に保存されているので、同様に永続化できる。

**対応:** 初期化を `new Set(JSON.parse(localStorage.getItem('collapsedCats') || '[]'))` に変更し、トグル時に `localStorage.setItem` で保存するようにした。

---

### 3-5. Git Commit & Push が分離されていない

**場所:** `server.js:698–707`

```js
await git.add(['docs/.', 'glossary/.']);
await git.commit(message || 'Update articles');
await git.push();
```

コミットと Push が1ボタンに結合しており、コミットのみ・プッシュのみの操作ができない。  
コミット失敗（空のステージなど）時でも Push しようとしてエラーになる。

---

## 優先度まとめ

| # | 項目 | 影響度 | 修正コスト |
|---|------|--------|------------|
| 1-2 | updatePreview デバウンスなし | 高（編集体験） | 低 |
| 1-4 | 用語保存後の二重リロード | 高（保存遅延） | 低 |
| 1-1 | 初期化の直列ロード | 中（起動時） | 低 |
| 1-3 | linkTermsInPreview の regex 非キャッシュ | 高（プレビュー遅延） | 中 |
| 1-7 | PUT でのフル生成 | 中（用語編集遅延） | 中 |
| 1-5 | 保存後の全記事リスキャン | 中（保存後） | 中 |
| 1-6 | renderGlossaryList のフル再構築 | 中（用語一覧） | 中 |
| 2-1 | ID重複（cat-modal 廃止漏れ） | 高（バグ） | 低 |
| 2-2 | PUT の完全上書き | 中（データロス） | 低 |
| 2-3 | buildArticleFolders の同期 I/O | 低（spawn中） | 中 |
