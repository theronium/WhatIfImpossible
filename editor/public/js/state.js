// ── State ────────────────────────────────────────────────────────────
let monacoEditor = null;
let _monacoResolve;
const monacoReady = new Promise(r => { _monacoResolve = r; });
let currentPath = null;
let articles = [];
let viewMode = 'edit';
let sidebarMode = 'articles'; // 'articles' | 'glossary' | 'notes' | 'archive' | 'techtree' | 'search'

// ── 記事以外のセクション（docs/ 直下のフォルダ単位） ─────────────────
// ここに無いフォルダの .md はすべて「記事」として扱う。
// server.js の NON_ARTICLE_DIRS と揃えること。
const SECTIONS = {
  notes:   { dir: 'notes/',   label: '補遺',   readme: '📋 補遺一覧（README）',   empty: '補遺なし' },
  archive: { dir: 'archive/', label: '資料室', readme: '🗄 資料室目録（README）', empty: '資料なし' },
};

// 資料室の doc_type（作中資料の種類）
const ARCHIVE_DOC_TYPES = {
  treaty:     '条約・協定',
  report:     '報告書',
  news:       '報道',
  transcript: '記録・議事録',
  record:     '公文書・台帳',
  other:      'その他',
};

function sectionOf(relPath) {
  if (!relPath) return null;
  for (const [key, s] of Object.entries(SECTIONS)) {
    if (relPath.startsWith(s.dir)) return key;
  }
  return null;
}

function isArticlePath(relPath) {
  return !sectionOf(relPath);
}
let glossaryTerms = [];
let currentTermId = null;   // null = 新規
let viewingTermId = null;   // 閲覧中の用語ID
let viewingSymbolId = null; // 閲覧中の記号ID
let collapsedCats = new Set(JSON.parse(localStorage.getItem('collapsedCats') || '[]'));

let GLOSSARY_CATS = [];
let GLOSSARY_LABELS = {};
let ARTICLE_CATS = [];
let activeCollection = null;
let collectionConfig = null;
let activeDocsDir    = '';
let activeGlossaryDir = '';

const FALLBACK_CATS = [
  { id: 'astronomy',   label: '天文学・宇宙論',     color: '#60a5fa', bg: '#1a2440', sort: 1 },
  { id: 'physics',     label: '物理学',             color: '#c084fc', bg: '#1f1a2e', sort: 2 },
  { id: 'mathematics', label: '数学・論理・幾何学', color: '#34d399', bg: '#181f1a', sort: 3 },
  { id: 'speculative', label: '仮説・未観測の粒子', color: '#fb923c', bg: '#1f1a18', sort: 4 },
  { id: 'philosophy',  label: '哲学・存在論',       color: '#f0abfc', bg: '#251525', sort: 5 },
  { id: 'biology',     label: '生物学・進化',       color: '#86efac', bg: '#1a2818', sort: 6 },
  { id: 'sf-concepts', label: 'SF概念',             color: '#fbbf24', bg: '#1a1f2e', sort: 7 },
];

let _toastTimer = null;
let _termRegexIndex = null;
let _symbolRegexIndex = null;
let _reloadGlossaryTimer = null;

let symbolTerms = [];

function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.textContent = msg;
  el.className = `show ${type}`;
  _toastTimer = setTimeout(() => { el.className = ''; }, 2500);
}

// ── 用語正規表現インデックス（全関数共用キャッシュ） ────────────────────
function buildTermRegexIndex() {
  const index = [];
  for (const t of glossaryTerms) {
    const esc = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    index.push({ name: t.name, id: t.id, regex: new RegExp(esc) });
    for (const alias of (t.aliases || [])) {
      const ae = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      index.push({ name: alias, id: t.id, regex: new RegExp(ae) });
    }
  }
  return index.sort((a, b) => b.name.length - a.name.length);
}

function getTermRegexIndex() {
  if (!_termRegexIndex) _termRegexIndex = buildTermRegexIndex();
  return _termRegexIndex;
}

// 52個の個別正規表現ではなく、単一の結合正規表現で1パス処理する
function buildSymbolData() {
  const sorted = [...symbolTerms].sort((a, b) => b.symbol.length - a.symbol.length);
  const alts = sorted.map(s => s.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    regex: new RegExp(alts.join('|'), 'g'),
    map: Object.fromEntries(sorted.map(s => [s.symbol, s.id])),
  };
}

function getSymbolData() {
  if (!_symbolRegexIndex) _symbolRegexIndex = buildSymbolData();
  return _symbolRegexIndex;
}
