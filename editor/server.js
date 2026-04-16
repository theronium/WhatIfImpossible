import express from 'express';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import simpleGit from 'simple-git';
import matter from 'gray-matter';
import fs from 'fs/promises';
import { existsSync } from 'fs';
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

// 新規 WS 接続時、モデルがすでに ready なら即通知
wss.on('connection', (ws) => {
  if (_checkerReady) {
    ws.send(JSON.stringify({ type: 'checker-progress', status: 'ready' }));
  }
});

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
    res.json({ active: data.active, collections: data.collections, config,
               docsDir: col.docsDir, glossaryDir: col.glossaryDir });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/collections', async (req, res) => {
  const { key, label, storage, path: extPath, cats, idFormat, idPrefix } = req.body;
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
      idFormat:  idFormat  || 'global-only',
      idPrefix:  idPrefix  || key,
      counters: { global: 0, byCategory: {}, termCounter: 0 },
      output: ['markdown'],
      showTechTree: false,
      autoLink: false,
      git: false,
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

    // 内部ストレージかつ git=false の場合、リポジトリの .gitignore に追記
    let gitignoreAdded = false;
    if (!isExternal) {
      try {
        const git = simpleGit(__dirname);
        const root = (await git.revparse(['--show-toplevel'])).trim();
        const relPath = path.relative(root, internalBase).replace(/\\/g, '/') + '/';
        const gitignorePath = path.join(root, '.gitignore');
        let content = '';
        try { content = await fs.readFile(gitignorePath, 'utf-8'); } catch {}
        const lines = content.split('\n').map(l => l.trim());
        if (!lines.includes(relPath)) {
          const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
          await fs.appendFile(gitignorePath, `${sep}# コレクション: ${label} (git=無効)\n${relPath}\n`, 'utf-8');
          gitignoreAdded = true;
        }
      } catch { /* git 管理外の環境では無視 */ }
    }

    res.json({ ok: true, key, gitignoreAdded });
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
    res.json({ ok: true, active: key, config, docsDir: col.docsDir, glossaryDir: col.glossaryDir });
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

    // git=false に変更 かつ 内部ストレージの場合、.gitignore に追記
    let gitignoreAdded = false;
    if (req.body.git === false) {
      const colData = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
      const colEntry = colData.collections[col.active];
      const isExternal = colEntry?.docsPath || colEntry?.glossaryPath;
      if (!isExternal) {
        try {
          const git = simpleGit(__dirname);
          const root = (await git.revparse(['--show-toplevel'])).trim();
          const internalBase = path.join(__dirname, 'data', col.active);
          const relPath = path.relative(root, internalBase).replace(/\\/g, '/') + '/';
          const gitignorePath = path.join(root, '.gitignore');
          let content = '';
          try { content = await fs.readFile(gitignorePath, 'utf-8'); } catch {}
          const lines = content.split('\n').map(l => l.trim());
          if (!lines.includes(relPath)) {
            const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
            const label = colEntry?.label || col.active;
            await fs.appendFile(gitignorePath, `${sep}# コレクション: ${label} (git=無効)\n${relPath}\n`, 'utf-8');
            gitignoreAdded = true;
          }
        } catch { /* git 管理外の環境では無視 */ }
      }
    }

    res.json({ ok: true, config, gitignoreAdded });
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
    const g      = config.counters.global || 0;
    const t      = config.counters.termCounter || 0;
    const prefix = config.idPrefix || 'article';
    res.json({
      articleId: `${prefix}_${String(g + 1).padStart(3, '0')}`,
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

const COMMON_GENERATE = path.join(__dirname, '..', 'glossary', 'scripts', 'generate.js');

function runGenerate() {
  return new Promise((resolve, reject) => {
    const colScript = getGenerateScript();
    const useCommon = !existsSync(colScript);
    const scriptPath = useCommon ? COMMON_GENERATE : colScript;
    const env = useCommon
      ? { ...process.env, GLOSSARY_DIR: col.glossaryDir }
      : process.env;
    const child = spawn('node', [scriptPath], { env });
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
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/glossary/categories/:id', async (req, res) => {
  try {
    let cats = await readCategories();
    cats = cats.filter(c => c.id !== req.params.id);
    await writeCategories(cats);
    broadcast({ type: 'reload-glossary' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/glossary/generate', async (req, res) => {
  try {
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

app.post('/api/article-categories', async (req, res) => {
  try {
    const cats = await readArticleCategories();
    if (cats.find(c => c.id === req.body.id))
      return res.status(409).json({ error: 'ID already exists' });
    const maxSort = cats.reduce((m, c) => Math.max(m, c.sort || 0), 0);
    cats.push({ ...req.body, sort: req.body.sort ?? maxSort + 1 });
    cats.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    await fs.writeFile(getArticleCategoriesFile(), JSON.stringify(cats, null, 2) + '\n', 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/article-categories/:id', async (req, res) => {
  try {
    const cats = await readArticleCategories();
    const next = cats.filter(c => c.id !== req.params.id);
    if (next.length === cats.length) return res.status(404).json({ error: 'Not found' });
    await fs.writeFile(getArticleCategoriesFile(), JSON.stringify(next, null, 2) + '\n', 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// ── API: チェッカー Embedding ─────────────────────────────────────────
// @huggingface/transformers を遅延ロードし、初回リクエスト時にモデルをDL・キャッシュする。
// モデル: Xenova/multilingual-e5-small（量子化済み、~30MB、日英対応）
let _embedPipeline = null;
let _checkerReady   = false;   // true になったら新規 WS 接続に即 ready を送る

async function getEmbedPipeline() {
  if (_embedPipeline) return _embedPipeline;
  let pipeline;
  try {
    ({ pipeline } = await import('@huggingface/transformers'));
  } catch {
    throw new Error(
      '@huggingface/transformers が見つかりません。\n' +
      '  cd editor && npm install @huggingface/transformers\n' +
      'を実行してください。'
    );
  }
  console.log('[checker] Embedding モデルをロード中（初回のみ時間がかかります）...');
  _embedPipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
    dtype: 'q8',   // INT8量子化（~30MB）。v3では quantized:true でなく dtype を使う
    progress_callback: (p) => {
      // ファイルのダウンロード進捗を WebSocket でブラウザに流す
      if (p.status === 'downloading') {
        const pct = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
        const mb  = (p.loaded / 1024 / 1024).toFixed(1);
        const tot = (p.total  / 1024 / 1024).toFixed(1);
        broadcast({ type: 'checker-progress', status: 'downloading', file: p.name, pct, mb, tot });
      } else if (p.status === 'loading') {
        broadcast({ type: 'checker-progress', status: 'loading', file: p.name });
      } else if (p.status === 'ready') {
        broadcast({ type: 'checker-progress', status: 'ready' });
      }
    },
  });
  console.log('[checker] モデルロード完了');
  return _embedPipeline;
}

app.post('/api/checker/embed', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text フィールドが必要です' });
  }
  try {
    const pipe = await getEmbedPipeline();
    const result = await pipe(text, { pooling: 'mean', normalize: true });
    res.json({ vector: Array.from(result.data) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: セマンティック検索 ───────────────────────────────────────────
// vectors.json をサーバー側でキャッシュし、クエリを embed して類似検索する。
// ブラウザに 1.5MB の vectors.json を送らずに済む。
let _vectorDB    = null;   // [{id, name, source, excerpt, vector}]
let _termsDict   = null;   // {keyword: id}
let _fullTextMap = null;   // {id: bodyText}  全文検索用（遅延ロード）

async function loadVectorDB() {
  if (_vectorDB) return;
  const vPath = path.join(__dirname, 'public', 'checker', 'vectors.json');
  const tPath = path.join(__dirname, 'public', 'checker', 'terms-dict.json');
  try {
    _vectorDB  = JSON.parse(await fs.readFile(vPath, 'utf-8'));
    _termsDict = JSON.parse(await fs.readFile(tPath, 'utf-8'));
  } catch {
    throw new Error('vectors.json が見つかりません。build_vectors.py を実行してください。');
  }
}

// 記事・用語の本文を全文インデックスとしてメモリにロード
// _fullTextMap: { id: { name, body, source } }
async function loadFullTextMap() {
  if (_fullTextMap) return;
  _fullTextMap = {};

  // 1. ドキュメント（docs/**/*.md）
  if (col.docsDir) {
    const walk = async (dir) => {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(full); }
        else if (e.name.endsWith('.md') && !['README.md', '_template.md', 'new.md'].includes(e.name)) {
          try {
            const text = await fs.readFile(full, 'utf-8');
            const m = text.match(/^---\s*\n(.*?)\n---\s*\n/s);
            let docId = path.basename(e.name, '.md'), title = docId;
            if (m) {
              const idM = m[1].match(/^id:\s*(.+)$/m); if (idM) docId = idM[1].trim();
              const tM  = m[1].match(/^title:\s*(.+)$/m); if (tM) title = tM[1].trim();
            }
            _fullTextMap[docId] = { name: title, body: text, source: 'doc' };
          } catch { /* skip */ }
        }
      }
    };
    await walk(col.docsDir);
  }

  // 2. ライブ用語集（col.glossaryDir/data/terms.jsonl）— 最新のソース
  const loadJsonl = async (filePath, source) => {
    try {
      const lines = (await fs.readFile(filePath, 'utf-8')).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.id) _fullTextMap[e.id] = {
            name:    e.name,
            aliases: e.aliases || [],
            body:    e.body || '',
            source:  source,
          };
        } catch { /* skip */ }
      }
    } catch { /* ファイルなければスキップ */ }
  };

  if (col.glossaryDir) {
    await loadJsonl(path.join(col.glossaryDir, 'data', 'terms.jsonl'), 'term');
  }


  // 3. editor/data/dictionaries/*.jsonl（カスタム辞書、live glossary で未カバーの場合）
  const dictDir = path.join(__dirname, 'data', 'dictionaries');
  try {
    const files = await fs.readdir(dictDir);
    for (const f of files.filter(f => f.endsWith('.jsonl') && !f.startsWith('novel-example'))) {
      await loadJsonl(path.join(dictDir, f), 'term');
    }
  } catch { /* dictionaries フォルダがなければスキップ */ }

  console.log(`[checker] 全文インデックス: ${Object.keys(_fullTextMap).length} 件`);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// テキストマッチスコア: 名前完全一致 > 名前/別名部分一致 > excerpt > 本文中一致
function calcTextScore(entry, ft, query) {
  const q    = query.toLowerCase();
  const name = entry.name.toLowerCase();
  if (name === q) return 0.98;
  if (name.includes(q)) return 0.92;
  // 別名一致（ft.aliases がある場合）
  if (ft?.aliases?.some(a => a.toLowerCase().includes(q))) return 0.92;
  // 別名が entry.name と同じフィールドにある場合（vectorDB エントリ用フォールバック）
  const excerpt = (entry.excerpt || '').toLowerCase();
  if (excerpt.includes(q)) return 0.80;
  const body = typeof ft === 'string' ? ft : ft?.body;
  if (body && body.toLowerCase().includes(q)) return 0.75;
  return 0;
}

// 検索モデルの準備状態を返す（ポーリング用）
app.get('/api/checker/ready', (_req, res) => {
  res.json({ ready: _checkerReady, entries: _vectorDB ? _vectorDB.length : 0 });
});

app.post('/api/search', async (req, res) => {
  const { query, topN = 8 } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query フィールドが必要です' });
  }
  try {
    await loadVectorDB();
    await loadFullTextMap();
    const pipe = await getEmbedPipeline();

    // キーワードマッチ（termsDict 完全一致）
    const matched = new Map();
    for (const [kw, id] of Object.entries(_termsDict)) {
      if (query.includes(kw) && !matched.has(id)) matched.set(id, kw);
    }
    const terms = [...matched.entries()].map(([id, keyword]) => ({ id, keyword }));

    // セマンティック類似検索
    const result = await pipe(`query: ${query}`, { pooling: 'mean', normalize: true });
    const qVec   = Array.from(result.data);

    // セマンティック検索（vectorDB エントリ、テキストスコアで補正）
    const vectorIds = new Set(_vectorDB.map(e => e.id));
    const scored = _vectorDB.map(e => {
      const semantic = cosine(qVec, e.vector);
      const ft       = _fullTextMap?.[e.id];
      const text     = calcTextScore(e, ft, query);
      const score    = text > 0 ? Math.max(text, semantic * 0.9) : semantic;
      return { id: e.id, name: e.name, source: e.source, excerpt: e.excerpt, score };
    });

    // vectorDB に存在しないエントリをテキストマッチで補完
    for (const [id, ft] of Object.entries(_fullTextMap ?? {})) {
      if (vectorIds.has(id)) continue;
      const text = calcTextScore({ name: ft.name, excerpt: '' }, ft, query);
      if (text > 0) {
        scored.push({
          id, name: ft.name, source: ft.source,
          excerpt: (ft.body || '').slice(0, 120).replace(/\n/g, ' '),
          score: text,
        });
      }
    }

    const similar = scored.sort((a, b) => b.score - a.score).slice(0, topN);
    res.json({ terms, similar });
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

    // 検索モデルをバックグラウンドでプリロード（起動をブロックしない）
    Promise.all([
      getEmbedPipeline(),
      loadVectorDB(),
    ]).then(() => {
      _checkerReady = true;
      broadcast({ type: 'checker-progress', status: 'ready' });
    }).catch(e => {
      console.error('[checker] プリロード失敗:', e.message);
    });
  });
}).catch(e => {
  console.error('Failed to load collections:', e.message);
  process.exit(1);
});
