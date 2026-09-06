#!/usr/bin/env node
/**
 * MOAI - AIマーケティング司令室 ローカルサーバー
 * 依存パッケージなし（Node標準モジュールのみ）。
 *   起動: node server.js       → http://localhost:4173
 *   ポート変更: MOAI_PORT=5000 node server.js
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const APP_DIR = path.join(ROOT, 'docs');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.MOAI_PORT || 4173);

// 読み書きを許可するコレクション（=data配下のJSONファイル名）
const COLLECTIONS = ['config', 'channels', 'agents', 'tasks', 'inbox', 'messages', 'calendar', 'metrics', 'reports'];
// 配列ではなく単一オブジェクトとして扱うもの
const SINGLETONS = new Set(['config']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function nowIso() {
  // JST表記のISO文字列
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace('Z', '+09:00');
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function readCollection(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return SINGLETONS.has(name) ? {} : { items: [] };
    throw new Error(`${name}.json の読み込みに失敗しました: ${e.message}`);
  }
}

// 一時ファイル経由の原子的書き込み（書き込み中の破損を防ぐ）
async function writeCollection(name, data) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, file);
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 5e6) reject(new Error('リクエストが大きすぎます'));
    });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('JSONの解析に失敗しました')); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  // 先頭の区切り文字を落としてから結合し、最後に docs/ の外に出ていないかを確認する
  const file = path.resolve(APP_DIR, path.normalize(rel).replace(/^[\\/]+/, ''));
  if (file !== APP_DIR && !file.startsWith(APP_DIR + path.sep)) {
    return send(res, 403, { error: 'forbidden' });
  }
  try {
    const data = await fsp.readFile(file);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  } catch {
    send(res, 404, { error: 'not found', path: pathname });
  }
}

async function handleApi(req, res, parts, query) {
  const [, col, id] = parts; // ['api', col, id]

  if (!col || col === 'all') {
    const snapshot = {};
    for (const name of COLLECTIONS) snapshot[name] = await readCollection(name);
    snapshot._serverTime = nowIso();
    return send(res, 200, snapshot);
  }

  if (!COLLECTIONS.includes(col)) return send(res, 404, { error: `不明なコレクション: ${col}` });

  const data = await readCollection(col);

  if (req.method === 'GET') return send(res, 200, data);

  if (SINGLETONS.has(col)) {
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readBody(req);
      const next = req.method === 'PUT' ? body : { ...data, ...body };
      await writeCollection(col, next);
      return send(res, 200, next);
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  const items = Array.isArray(data.items) ? data.items : [];

  if (req.method === 'POST') {
    const body = await readBody(req);
    const item = {
      id: body.id || newId(col.slice(0, 3)),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...body,
    };
    items.unshift(item);
    await writeCollection(col, { ...data, items });
    return send(res, 201, item);
  }

  if (req.method === 'PATCH' && id) {
    const body = await readBody(req);
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return send(res, 404, { error: `見つかりません: ${id}` });
    const history = Array.isArray(items[idx].history) ? items[idx].history.slice() : [];
    if (body.__log) {
      history.push({ at: nowIso(), by: body.__log.by || 'user', action: body.__log.action, note: body.__log.note || '' });
      delete body.__log;
    }
    items[idx] = { ...items[idx], ...body, history, updatedAt: nowIso() };
    await writeCollection(col, { ...data, items });
    return send(res, 200, items[idx]);
  }

  if (req.method === 'DELETE' && id) {
    const next = items.filter((it) => it.id !== id);
    if (next.length === items.length) return send(res, 404, { error: `見つかりません: ${id}` });
    await writeCollection(col, { ...data, items: next });
    return send(res, 200, { ok: true, id });
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    await writeCollection(col, body);
    return send(res, 200, body);
  }

  return send(res, 405, { error: 'method not allowed' });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'api') return await handleApi(req, res, parts, parsed.query);
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    return await serveStatic(res, parsed.pathname);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// 初回起動時、data/ が空ならテンプレート（docs/seed.js）から作る。既存ファイルには触らない。
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let seed;
  try { seed = require('./docs/seed.js'); }
  catch (e) { console.warn(`  テンプレートを読めませんでした: ${e.message}`); return; }
  const created = [];
  for (const name of COLLECTIONS) {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (fs.existsSync(file)) continue;
    const data = seed[name] || (SINGLETONS.has(name) ? {} : { items: [] });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
    created.push(`${name}.json`);
  }
  if (created.length) console.log(`  初期データを作成しました: ${created.join(', ')}`);
}

// すでに起動している場合はエラーで落とさず、その旨を伝えて終了する
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  MOAI はすでに起動しています。`);
    console.log(`  → http://localhost:${PORT} をブラウザで開いてください。\n`);
    console.log(`  （別のポートで起動したい場合: set MOAI_PORT=4174 && node server.js）\n`);
    process.exit(0);
  }
  console.error(`\n  サーバーの起動に失敗しました: ${e.message}\n`);
  process.exit(1);
});

ensureData();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  MOAI（AIマーケティング司令室）起動しました`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  データ保存先: ${DATA_DIR}`);
  console.log(`  停止: Ctrl + C\n`);
});
