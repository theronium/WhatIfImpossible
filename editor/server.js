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
const DOCS_DIR = path.resolve(__dirname, '../docs');
const GLOSSARY_DIR = path.resolve(__dirname, '../glossary');
const REPO_DIR = path.resolve(__dirname, '..');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const git = simpleGit(REPO_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// ELK layout ライブラリを node_modules から配信
app.use('/elk', express.static(path.join(__dirname, 'node_modules/@mermaid-js/layout-elk/dist')));

// ── WebSocket: ファイル変更でライブリロード ──────────────────────────
const broadcast = (msg) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  });
};

chokidar.watch(DOCS_DIR, { ignoreInitial: true }).on('all', (event, filePath) => {
  broadcast({ type: 'reload', event, file: path.relative(DOCS_DIR, filePath) });
});
chokidar.watch(GLOSSARY_DIR, { ignoreInitial: true }).on('all', () => {
  broadcast({ type: 'reload-glossary' });
});

// ── API: 記事一覧 ────────────────────────────────────────────────────
app.get('/api/articles', async (req, res) => {
  try {
    const articles = await walkDocs(DOCS_DIR);
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
  const fullPath = path.join(DOCS_DIR, relPath);
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
  const fullPath = path.join(DOCS_DIR, relPath);
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
  const fullPath = path.join(DOCS_DIR, relPath);
  try {
    await fs.access(fullPath);
    return res.status(409).json({ error: 'Already exists' });
  } catch { /* ok */ }

  const template = await fs.readFile(path.join(DOCS_DIR, '_template.md'), 'utf-8');
  const { content } = matter(template);
  const fm = matter.stringify(content, frontmatter);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, fm, 'utf-8');
  res.json({ ok: true, path: relPath });
});

// ── API: 記事削除 ────────────────────────────────────────────────────
app.delete('/api/articles/*', async (req, res) => {
  const fullPath = path.join(DOCS_DIR, req.params[0]);
  try {
    await fs.unlink(fullPath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 用語集ヘルパー ────────────────────────────────────────────────────
const TERMS_FILE     = path.join(GLOSSARY_DIR, 'data', 'terms.jsonl');
const CATEGORIES_FILE = path.join(GLOSSARY_DIR, 'categories.json');
const GENERATE_SCRIPT = path.join(GLOSSARY_DIR, 'generate.js');

async function readTerms() {
  const raw = await fs.readFile(TERMS_FILE, 'utf-8');
  return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

async function writeTerms(terms) {
  const jsonl = terms.map(t => JSON.stringify(t)).join('\n') + '\n';
  await fs.writeFile(TERMS_FILE, jsonl, 'utf-8');
}

function runGenerate() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [GENERATE_SCRIPT]);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`generate.js exited with code ${code}`))
    );
  });
}

// ── API: 用語集 CRUD ─────────────────────────────────────────────────
// ※ /api/glossary/terms は /api/glossary/* より先に登録する

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
  const raw = await fs.readFile(CATEGORIES_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function writeCategories(cats) {
  await fs.writeFile(CATEGORIES_FILE, JSON.stringify(cats, null, 2) + '\n', 'utf-8');
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

// ── API: Git ステータス ──────────────────────────────────────────────
app.get('/api/git/status', async (req, res) => {
  try {
    const status = await git.status();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Git commit & push ───────────────────────────────────────────
app.post('/api/git/push', async (req, res) => {
  const { message } = req.body;
  try {
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WhatIfImpossible Editor: http://localhost:${PORT}`);
  console.log(`LAN access: http://<this-machine-ip>:${PORT}`);
});
