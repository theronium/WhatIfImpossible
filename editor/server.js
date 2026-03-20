import express from 'express';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import simpleGit from 'simple-git';
import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../docs');
const REPO_DIR = path.resolve(__dirname, '..');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const git = simpleGit(REPO_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── WebSocket: ファイル変更でライブリロード ──────────────────────────
const broadcast = (msg) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  });
};

chokidar.watch(DOCS_DIR, { ignoreInitial: true }).on('all', (event, filePath) => {
  broadcast({ type: 'reload', event, file: path.relative(DOCS_DIR, filePath) });
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
      const raw = await fs.readFile(fullPath, 'utf-8');
      const { data } = matter(raw);
      results.push({
        path: relPath,
        title: data.title || entry.name.replace('.md', ''),
        id: data.id || null,
        category: data.category || path.dirname(relPath),
        tags: data.tags || [],
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
    await git.add('docs/.');
    await git.commit(message || 'Update articles');
    await git.push();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 起動 ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3030;
server.listen(PORT, () => {
  console.log(`WhatIfImpossible Editor: http://localhost:${PORT}`);
});
