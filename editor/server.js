import express from 'express';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import simpleGit from 'simple-git';
import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import MarkdownIt from 'markdown-it';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTIONS_FILE = path.join(__dirname, 'data', 'collections.json');
const mdRenderer = new MarkdownIt({ html: true, linkify: true });

// ── コレクション状態 ─────────────────────────────────────────────────
const col = {
  active: null,
  collections: {},
  docsDir: null,
  glossaryDir: null,
  repoDir: null,
  docWatcher: null,
  glossaryWatcher: null,
};

function resolvePath(p, key) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  return path.resolve(__dirname, 'data', key, p.replace(/^\.\.\/\.\.\//, ''))
    // collections.json の相対パスは editor/ 起点
    || path.resolve(__dirname, p);
}

function resolveCollectionPaths(key) {
  const c = col.collections[key];
  if (!c) throw new Error(`Collection "${key}" not found`);
  const resolve = p => p
    ? (path.isAbsolute(p) ? p : path.resolve(__dirname, p))
    : null;
  return {
    docsDir:     resolve(c.docsPath)     ?? path.join(__dirname, 'data', key, 'docs'),
    glossaryDir: resolve(c.glossaryPath) ?? path.join(__dirname, 'data', key, 'glossary'),
  };
}

function startWatchers() {
  if (col.docWatcher)      col.docWatcher.close();
  if (col.glossaryWatcher) col.glossaryWatcher.close();

  col.docWatcher = chokidar.watch(col.docsDir, { ignoreInitial: true })
    .on('all', (event, filePath) => {
      broadcast({ type: 'reload', event, file: path.relative(col.docsDir, filePath) });
    });
  col.glossaryWatcher = chokidar.watch(col.glossaryDir, { ignoreInitial: true })
    .on('all', () => broadcast({ type: 'reload-glossary' }));
}

async function activateCollection(key) {
  const { docsDir, glossaryDir } = resolveCollectionPaths(key);
  col.active      = key;
  col.docsDir     = docsDir;
  col.glossaryDir = glossaryDir;
  col.repoDir     = path.dirname(docsDir);
  startWatchers();
}

async function loadCollections() {
  const raw = await fs.readFile(COLLECTIONS_FILE, 'utf-8');
  const data = JSON.parse(raw);
  col.collections = data.collections;
  await activateCollection(data.active);
}

async function saveActiveKey(key) {
  const raw = await fs.readFile(COLLECTIONS_FILE, 'utf-8');
  const data = JSON.parse(raw);
  data.active = key;
  await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function loadCollectionConfig(key) {
  const configPath = path.join(__dirname, 'data', key, 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Express / WebSocket ──────────────────────────────────────────────
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/elk', express.static(path.join(__dirname, 'node_modules/@mermaid-js/layout-elk/dist')));

const broadcast = (msg) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  });
};

// デフォルトカテゴリ（新規コレクション用）
const DEFAULT_CATEGORIES = [
  { id: 'general', label: '一般',     color: '#60a5fa', bg: '#1a2440', sort: 1 },
];

// ── API: コレクション ────────────────────────────────────────────────
app.get('/api/collections', async (req, res) => {
  try {
    const raw = await fs.readFile(COLLECTIONS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const config = await loadCollectionConfig(data.active);
    res.json({ active: data.active, collections: data.collections, config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/collections', async (req, res) => {
  const { key, label, storage, path: extPath, cats, idFormat } = req.body;
  if (!/^[a-z0-9_-]+$/.test(key)) return res.status(400).json({ error: 'キーは英小文字・数字・ハイフン・アンダースコアのみ使用できます' });

  const data = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
  if (data.collections[key]) return res.status(409).json({ error: `"${key}" は既に存在します` });

  const internalBase  = path.join(__dirname, 'data', key);
  const isExternal    = storage === 'external' && extPath;
  const resolvedDocs  = isExternal ? path.join(extPath, 'docs')     : path.join(internalBase, 'docs');
  const resolvedGloss = isExternal ? path.join(extPath, 'glossary') : path.join(internalBase, 'glossary');

  try {
    // ディレクトリ構造を作成
    await fs.mkdir(resolvedDocs,                          { recursive: true });
    await fs.mkdir(path.join(resolvedGloss, 'data'),      { recursive: true });
    await fs.mkdir(internalBase,                          { recursive: true });

    // config.json
    const config = {
      idFormat: idFormat || 'global-only',
      counters: { global: 0, byCategory: {}, termCounter: 0 },
      output: ['markdown'],
      showTechTree: false,
    };
    await fs.writeFile(path.join(internalBase, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');

    // categories.json
    const inheritCategories = cats === 'inherit';
    const catData = inheritCategories
      ? JSON.parse(await fs.readFile(path.join(col.glossaryDir, 'categories.json'), 'utf-8'))
      : DEFAULT_CATEGORIES;
    await fs.writeFile(path.join(resolvedGloss, 'categories.json'), JSON.stringify(catData, null, 2) + '\n', 'utf-8');

    // 空の terms.jsonl
    await fs.writeFile(path.join(resolvedGloss, 'data', 'terms.jsonl'), '', 'utf-8');

    // collections.json に登録
    data.collections[key] = {
      label,
      docsPath:     isExternal ? path.join(extPath, 'docs')     : null,
      glossaryPath: isExternal ? path.join(extPath, 'glossary') : null,
    };
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    col.collections = data.collections;

    res.json({ ok: true, key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/collections/switch', async (req, res) => {
  const { key } = req.body;
  try {
    if (!col.collections[key]) return res.status(404).json({ error: `Collection "${key}" not found` });
    await activateCollection(key);
    await saveActiveKey(key);
    const config = await loadCollectionConfig(key);
    broadcast({ type: 'collection-switched', key });
    res.json({ ok: true, active: key, config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── コレクション設定ヘルパー ─────────────────────────────────────────
async function readCollectionConfig() {
  const p = path.join(__dirname, 'data', col.active, 'config.json');
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return null; }
}

async function incrementConfigCounter(key) {
  const p = path.join(__dirname, 'data', col.active, 'config.json');
  try {
    const config = JSON.parse(await fs.readFile(p, 'utf-8'));
    config.counters[key] = (config.counters[key] || 0) + 1;
    await fs.writeFile(p, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch { /* config なしのコレクションでは無視 */ }
}

// ── API: コレクション設定の更新 ───────────────────────────────────────
app.patch('/api/collection/config', async (req, res) => {
  const p = path.join(__dirname, 'data', col.active, 'config.json');
  try {
    const config = JSON.parse(await fs.readFile(p, 'utf-8'));
    Object.assign(config, req.body);
    await fs.writeFile(p, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    res.json({ ok: true, config });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: リンク情報（自動リンク用パス） ──────────────────────────────
app.get('/api/collection/link-info', async (req, res) => {
  try {
    // docsDir から見た glossary/terms の相対パス
    const termsDir = path.join(col.glossaryDir, 'terms');
    const termLinkBase = path.relative(col.docsDir, termsDir).replace(/\\/g, '/');
    res.json({ termLinkBase });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: 次の ID を返す ──────────────────────────────────────────────
app.get('/api/collection/next-id', async (req, res) => {
  try {
    const config = await readCollectionConfig();
    if (!config) return res.json({ articleId: null, termId: null });
    const g = config.counters.global || 0;
    const t = config.counters.termCounter || 0;
    res.json({
      articleId: `wiim_${String(g + 1).padStart(3, '0')}`,
      termId:    `g${String(t + 1).padStart(3, '0')}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: テンプレート ────────────────────────────────────────────────
const getTemplatesDir = () => path.join(__dirname, 'data', col.active, 'templates');

app.get('/api/templates', async (req, res) => {
  try {
    const files = await fs.readdir(getTemplatesDir());
    const list = files
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f.replace('.md', ''), file: f }));
    res.json(list);
  } catch {
    res.json([]);
  }
});

app.get('/api/templates/:name', async (req, res) => {
  const file = path.join(getTemplatesDir(), `${req.params.name}.md`);
  try {
    const content = await fs.readFile(file, 'utf-8');
    res.json({ name: req.params.name, content });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

app.put('/api/templates/:name', async (req, res) => {
  const { content } = req.body;
  const dir = getTemplatesDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${req.params.name}.md`), content, 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/templates/:name', async (req, res) => {
  try {
    await fs.unlink(path.join(getTemplatesDir(), `${req.params.name}.md`));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: 記事一覧 ────────────────────────────────────────────────────
app.get('/api/articles', async (req, res) => {
  try {
    const articles = await walkDocs(col.docsDir);
    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function walkDocs(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const children = await walkDocs(path.join(dir, entry.name), relPath);
      results.push(...children);
    } else if (entry.name.endsWith('.md')) {
      const fullPath = path.join(dir, entry.name);
      const [raw, stat] = await Promise.all([
        fs.readFile(fullPath, 'utf-8'),
        fs.stat(fullPath),
      ]);
      const { data } = matter(raw);
      results.push({
        path: relPath,
        title: data.title || entry.name.replace('.md', ''),
        id: data.id || null,
        category: data.category || (path.dirname(relPath) === '.' ? 'index' : path.dirname(relPath)),
        tags: data.tags || [],
        date: data.date ? (data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date).slice(0, 10)) : null,
        birthtime: stat.birthtime.getTime(),
        mtime: stat.mtime.getTime(),
      });
    }
  }
  return results;
}

// ── API: 記事取得 ────────────────────────────────────────────────────
app.get('/api/articles/*', async (req, res) => {
  const relPath = req.params[0];
  const fullPath = path.join(col.docsDir, relPath);
  try {
    const raw = await fs.readFile(fullPath, 'utf-8');
    const { data, content } = matter(raw);
    res.json({ frontmatter: data, content, raw });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── API: 記事保存 ────────────────────────────────────────────────────
app.put('/api/articles/*', async (req, res) => {
  const relPath = req.params[0];
  const fullPath = path.join(col.docsDir, relPath);
  const { raw } = req.body;
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, raw, 'utf-8');

    // HTML 出力（config.output に "html" が含まれる場合）
    const config = await readCollectionConfig();
    if (config?.output?.includes('html')) {
      const { data: fm, content } = matter(raw);
      const bodyHtml = mdRenderer.render(content);
      const title = fm.title || relPath;
      const html = buildHtmlPage(title, bodyHtml);
      const htmlPath = fullPath.replace(/\.md$/, '.html');
      await fs.writeFile(htmlPath, html, 'utf-8');
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function buildHtmlPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; line-height: 1.75; color: #222; }
  h1 { font-size: 26px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 32px; }
  h3 { font-size: 16px; margin-top: 20px; }
  code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
  pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
  blockquote { border-left: 3px solid #999; padding-left: 14px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 12px; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ── API: 記事新規作成 ────────────────────────────────────────────────
app.post('/api/articles', async (req, res) => {
  const { relPath, frontmatter } = req.body;
  const fullPath = path.join(col.docsDir, relPath);
  try {
    await fs.access(fullPath);
    return res.status(409).json({ error: 'Already exists' });
  } catch { /* ok */ }

  // テンプレート解決: リクエスト指定 → collection templates/ → docs/_template.md → 空
  let body = '';
  const tplName = req.body.template;
  if (tplName) {
    try {
      body = await fs.readFile(path.join(getTemplatesDir(), tplName.endsWith('.md') ? tplName : `${tplName}.md`), 'utf-8');
    } catch { /* 指定テンプレートなければ次へ */ }
  }
  if (!body) {
    try {
      const fallback = await fs.readFile(path.join(col.docsDir, '_template.md'), 'utf-8');
      body = matter(fallback).content;
    } catch { /* docs/_template.md なし */ }
  }
  const fm = matter.stringify(body, frontmatter);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, fm, 'utf-8');
  // notes/ 配下でなければ記事カウンターを increment
  if (!relPath.startsWith('notes/')) {
    await incrementConfigCounter('global');
  }
  res.json({ ok: true, path: relPath });
});

// ── API: 記事削除 ────────────────────────────────────────────────────
app.delete('/api/articles/*', async (req, res) => {
  const fullPath = path.join(col.docsDir, req.params[0]);
  try {
    await fs.unlink(fullPath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 用語集ヘルパー ────────────────────────────────────────────────────
const getTermsFile     = () => path.join(col.glossaryDir, 'data', 'terms.jsonl');
const getCategoriesFile = () => path.join(col.glossaryDir, 'categories.json');
const getGenerateScript = () => path.join(col.glossaryDir, 'scripts', 'generate.js');

async function readTerms() {
  const raw = await fs.readFile(getTermsFile(), 'utf-8');
  return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

async function writeTerms(terms) {
  const jsonl = terms.map(t => JSON.stringify(t)).join('\n') + '\n';
  await fs.writeFile(getTermsFile(), jsonl, 'utf-8');
}

function runGenerate() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [getGenerateScript()]);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`generate.js exited with code ${code}`))
    );
  });
}

// ── API: 用語集 CRUD ─────────────────────────────────────────────────
app.get('/api/glossary/terms', async (req, res) => {
  try { res.json(await readTerms()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/glossary/terms', async (req, res) => {
  try {
    const terms = await readTerms();
    const lastNum = terms.length > 0
      ? parseInt(terms[terms.length - 1].id.slice(1))
      : 0;
    const newTerm = { id: `g${String(lastNum + 1).padStart(3, '0')}`, ...req.body };
    terms.push(newTerm);
    await writeTerms(terms);
    await runGenerate();
    await incrementConfigCounter('termCounter');
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true, term: newTerm });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/glossary/terms/:id', async (req, res) => {
  try {
    const terms = await readTerms();
    const idx = terms.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    terms[idx] = { id: req.params.id, ...req.body };
    await writeTerms(terms);
    await runGenerate();
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/glossary/terms/:id', async (req, res) => {
  try {
    let terms = await readTerms();
    terms = terms.filter(t => t.id !== req.params.id);
    await writeTerms(terms);
    await runGenerate();
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: カテゴリ管理 ────────────────────────────────────────────────
async function readCategories() {
  const raw = await fs.readFile(getCategoriesFile(), 'utf-8');
  return JSON.parse(raw);
}

async function writeCategories(cats) {
  await fs.writeFile(getCategoriesFile(), JSON.stringify(cats, null, 2) + '\n', 'utf-8');
}

app.get('/api/glossary/categories', async (req, res) => {
  try { res.json(await readCategories()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/glossary/categories', async (req, res) => {
  try {
    const cats = await readCategories();
    if (cats.find(c => c.id === req.body.id))
      return res.status(409).json({ error: 'ID already exists' });
    const maxSort = cats.reduce((m, c) => Math.max(m, c.sort), 0);
    cats.push({ ...req.body, sort: req.body.sort ?? maxSort + 1 });
    cats.sort((a, b) => a.sort - b.sort);
    await writeCategories(cats);
    await runGenerate();
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/glossary/categories/:id', async (req, res) => {
  try {
    const cats = await readCategories();
    const idx = cats.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    cats[idx] = { id: req.params.id, ...req.body };
    cats.sort((a, b) => a.sort - b.sort);
    await writeCategories(cats);
    await runGenerate();
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/glossary/categories/:id', async (req, res) => {
  try {
    let cats = await readCategories();
    cats = cats.filter(c => c.id !== req.params.id);
    await writeCategories(cats);
    await runGenerate();
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: 記事カテゴリ ────────────────────────────────────────────────
const getArticleCategoriesFile = () =>
  path.join(__dirname, 'data', col.active, 'article-categories.json');

async function readArticleCategories() {
  try {
    return JSON.parse(await fs.readFile(getArticleCategoriesFile(), 'utf-8'));
  } catch {
    return [];
  }
}

app.get('/api/article-categories', async (req, res) => {
  res.json(await readArticleCategories());
});

app.put('/api/article-categories/:id', async (req, res) => {
  try {
    const cats = await readArticleCategories();
    const idx = cats.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    cats[idx] = { id: req.params.id, ...req.body };
    cats.sort((a, b) => a.sort - b.sort);
    await fs.writeFile(getArticleCategoriesFile(), JSON.stringify(cats, null, 2) + '\n', 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: Git ─────────────────────────────────────────────────────────
app.get('/api/git/status', async (req, res) => {
  try {
    const git = simpleGit(col.repoDir);
    res.json(await git.status());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/git/push', async (req, res) => {
  const { message } = req.body;
  try {
    const git = simpleGit(col.repoDir);
    await git.add(['docs/.', 'glossary/.']);
    await git.commit(message || 'Update articles');
    await git.push();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 起動 ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3030;

loadCollections().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`termlink-editor: http://localhost:${PORT}`);
    console.log(`Active collection: ${col.active} (${col.docsDir})`);
  });
}).catch(e => {
  console.error('Failed to load collections:', e.message);
  process.exit(1);
});
