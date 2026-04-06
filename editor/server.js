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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTIONS_FILE = path.join(__dirname, 'data', 'collections.json');

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
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: 記事新規作成 ────────────────────────────────────────────────
app.post('/api/articles', async (req, res) => {
  const { relPath, frontmatter } = req.body;
  const fullPath = path.join(col.docsDir, relPath);
  try {
    await fs.access(fullPath);
    return res.status(409).json({ error: 'Already exists' });
  } catch { /* ok */ }

  const template = await fs.readFile(path.join(col.docsDir, '_template.md'), 'utf-8');
  const { content } = matter(template);
  const fm = matter.stringify(content, frontmatter);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, fm, 'utf-8');
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
