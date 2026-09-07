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
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = __dirname;
const APP_DIR = path.join(ROOT, 'docs');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.MOAI_PORT || 4173);

// 実行APIは「AIを起動する」ため、他サイトから叩かれないようトークンで守る。
// トークンは index.html に差し込まれるので、同一オリジンの画面だけが読める。
const RUN_TOKEN = crypto.randomBytes(24).toString('hex');

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
    // index.html だけは実行用トークンを差し込んで返す（同一オリジンの画面しか読めない）
    if (path.extname(file) === '.html') {
      const html = (await fsp.readFile(file, 'utf8')).replace('__MOAI_TOKEN__', RUN_TOKEN);
      return send(res, 200, html, { 'Content-Type': MIME['.html'] });
    }
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

/* =========================================================
   実行エンジン — Claude Code CLI を呼び出してキューを処理する
   ========================================================= */

// Claude Code の実行ファイルを探す。見つからなければ null。
function resolveClaudeBin() {
  if (process.env.MOAI_CLAUDE_BIN && fs.existsSync(process.env.MOAI_CLAUDE_BIN)) {
    return process.env.MOAI_CLAUDE_BIN;
  }
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const candidates = [];

  // デスクトップアプリ同梱版（バージョンつきフォルダなので新しい順に見る）
  const bundledRoots = isWin
    ? [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude-code')]
    : [path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code')];
  for (const root of bundledRoots) {
    try {
      const versions = fs.readdirSync(root)
        .filter((d) => /^\d+\.\d+\.\d+$/.test(d))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of versions) candidates.push(path.join(root, v, isWin ? 'claude.exe' : 'claude'));
    } catch { /* 無ければ次を見る */ }
  }

  // 単体インストール版
  candidates.push(
    path.join(home, '.local', 'bin', isWin ? 'claude.exe' : 'claude'),
    path.join(home, '.claude', 'local', isWin ? 'claude.exe' : 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  );
  if (isWin) {
    candidates.push(path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'));
  }

  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch { /* 続行 */ }
  }
  return null;
}

// 権限プリセット。既定は「node コマンドだけ許可」で、余計なことをさせない。
const PERMISSION_PRESETS = {
  safe: {
    label: 'おまかせ（推奨）',
    args: ['--permission-mode', 'acceptEdits', '--allowed-tools',
      'Bash(node *)', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task', 'Agent', 'Skill'],
  },
  full: {
    label: 'すべて許可（ブラウザ投稿まで任せる）',
    args: ['--permission-mode', 'bypassPermissions'],
  },
};

const run = {
  status: 'idle',      // idle | running | done | error | stopped
  startedAt: null,
  endedAt: null,
  prompt: '',
  preset: 'safe',
  log: [],             // 画面に出す進行状況
  result: '',
  error: null,
  child: null,
};

function pushLog(kind, text) {
  if (!text) return;
  run.log.push({ at: nowIso(), kind, text: String(text).slice(0, 4000) });
  if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
}

// stream-json の1行を、人が読める進行状況に変える
function digestStreamLine(line) {
  let ev;
  try { ev = JSON.parse(line); } catch { return; }
  if (ev.type === 'system' && ev.subtype === 'init') {
    pushLog('info', `AIを起動しました（model: ${ev.model || '既定'}）`);
    return;
  }
  if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text.trim()) pushLog('say', c.text.trim());
      if (c.type === 'tool_use') {
        const name = c.name || 'tool';
        let detail = '';
        if (c.input) {
          if (c.input.command) detail = String(c.input.command).slice(0, 160);
          else if (c.input.description) detail = String(c.input.description).slice(0, 160);
          else if (c.input.query) detail = String(c.input.query).slice(0, 160);
          else if (c.input.subagent_type) detail = String(c.input.subagent_type);
          else if (c.input.skill) detail = String(c.input.skill);
        }
        pushLog('tool', detail ? `${name}: ${detail}` : name);
      }
    }
    return;
  }
  if (ev.type === 'result') {
    if (ev.is_error) {
      run.error = ev.result || 'AIの実行がエラーで終了しました';
      pushLog('error', run.error);
    } else if (ev.result) {
      run.result = ev.result;
      pushLog('done', ev.result);
    }
  }
}

/* このサーバー自体が Claude Code から起動されている場合、セッション固有の環境変数を
   子プロセスが引き継ぐと「認証は親が持っている」と誤認して未ログイン扱いになる。
   CLAUDE_CONFIG_DIR 以外の CLAUDE* を落として、独立したセッションとして起動する。 */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDE_CONFIG_DIR') continue;
    if (/^CLAUDE/i.test(key) || key === 'AI_AGENT') delete env[key];
  }
  return env;
}

/* ログイン状態の確認。毎回起動すると重いので30秒キャッシュする。 */
const auth = { checkedAt: 0, loggedIn: null, method: '' };
function checkAuth(force) {
  if (!force && Date.now() - auth.checkedAt < 30000) return auth;
  const bin = resolveClaudeBin();
  auth.checkedAt = Date.now();
  if (!bin) { auth.loggedIn = null; auth.method = ''; return auth; }
  try {
    const r = require('child_process').spawnSync(bin, ['auth', 'status'], {
      env: cleanEnv(), encoding: 'utf8', windowsHide: true, timeout: 20000,
    });
    const m = (r.stdout || '').match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      auth.loggedIn = !!j.loggedIn;
      auth.method = j.authMethod || '';
    } else {
      auth.loggedIn = null;
    }
  } catch { auth.loggedIn = null; }
  return auth;
}

/* =========================================================
   ログイン — 画面から完結させる
   claude auth login は「ブラウザで許可 → 表示されたコードを貼り戻す」方式なので、
   URLを画面に出し、コードを受け取って子プロセスの標準入力へ渡す。
   ========================================================= */
const login = { phase: 'idle', url: '', message: '', child: null, buf: '', timer: null };

function loginSnapshot() {
  return { phase: login.phase, url: login.url, message: login.message };
}

function endLogin(phase, message) {
  login.phase = phase;
  login.message = message || '';
  if (login.timer) { clearTimeout(login.timer); login.timer = null; }
  if (login.child) { try { login.child.kill(); } catch { /* 済み */ } login.child = null; }
}

function startLogin() {
  const bin = resolveClaudeBin();
  if (!bin) throw new Error('Claude Code が見つかりませんでした。');
  if (login.phase === 'waiting_code') return loginSnapshot();

  endLogin('idle', '');
  login.url = '';
  login.buf = '';
  login.phase = 'starting';

  const child = spawn(bin, ['auth', 'login'], {
    cwd: ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: cleanEnv(),
  });
  login.child = child;

  const onData = (chunk) => {
    login.buf += chunk.toString('utf8');
    const m = login.buf.match(/https:\/\/claude\.(?:com|ai)\/[^\s"']*oauth[^\s"']*/);
    if (m && !login.url) {
      login.url = m[0];
      login.phase = 'waiting_code';
    }
    if (/invalid|failed|error/i.test(login.buf) && login.phase !== 'done') {
      // 失敗の文言が出たら、そのまま画面に出す
      const line = login.buf.split('\n').reverse().find((l) => /invalid|failed|error/i.test(l));
      if (line) login.message = line.trim().slice(0, 200);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (e) => endLogin('error', `起動に失敗しました: ${e.message}`));
  child.on('close', () => {
    login.child = null;
    const st = checkAuth(true);
    if (st.loggedIn) endLogin('done', 'ログインできました');
    else if (login.phase !== 'error') endLogin('error', login.message || 'ログインが完了しませんでした。もう一度お試しください。');
  });

  // 10分放置したら片づける
  login.timer = setTimeout(() => {
    if (login.phase === 'waiting_code') endLogin('error', '時間切れです。もう一度やり直してください。');
  }, 10 * 60 * 1000);

  return loginSnapshot();
}

function submitLoginCode(code) {
  if (!login.child || login.phase !== 'waiting_code') {
    throw new Error('ログインが開始されていません。もう一度「ログインを開始」を押してください。');
  }
  const clean = String(code).trim();
  if (!clean) throw new Error('コードが空です');
  login.phase = 'verifying';
  login.child.stdin.write(clean + '\n');
  return loginSnapshot();
}

function startRun({ prompt, preset }) {
  const bin = resolveClaudeBin();
  if (!bin) {
    throw new Error('Claude Code が見つかりませんでした。インストール済みなら、環境変数 MOAI_CLAUDE_BIN に実行ファイルのパスを設定してください。');
  }
  const p = PERMISSION_PRESETS[preset] ? preset : 'safe';

  run.status = 'running';
  run.startedAt = nowIso();
  run.endedAt = null;
  run.prompt = prompt;
  run.preset = p;
  run.log = [];
  run.result = '';
  run.error = null;

  pushLog('info', `指示を実行します: ${prompt}`);

  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...PERMISSION_PRESETS[p].args];
  const child = spawn(bin, args, {
    cwd: ROOT,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv(),
  });
  run.child = child;

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) if (line.trim()) digestStreamLine(line.trim());
  });
  child.stderr.on('data', (chunk) => {
    const t = chunk.toString('utf8').trim();
    if (t) pushLog('error', t);
  });
  child.on('error', (e) => {
    run.status = 'error';
    run.error = e.message;
    run.endedAt = nowIso();
    pushLog('error', `起動に失敗しました: ${e.message}`);
  });
  child.on('close', (code) => {
    run.child = null;
    run.endedAt = nowIso();
    if (run.status === 'stopped') { pushLog('info', '中断しました'); return; }
    if (code === 0 && !run.error) {
      run.status = 'done';
      pushLog('info', '実行が完了しました。承認キューを確認してください。');
    } else {
      run.status = 'error';
      if (!run.error) run.error = `AIが異常終了しました（終了コード ${code}）`;
      pushLog('error', run.error);
    }
  });
}

function runSnapshot() {
  return {
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    prompt: run.prompt,
    preset: run.preset,
    log: run.log,
    result: run.result,
    error: run.error,
    available: !!resolveClaudeBin(),
    bin: resolveClaudeBin() || '',
    loggedIn: auth.loggedIn,
    authMethod: auth.method,
    loginHelper: path.join(ROOT, process.platform === 'win32' ? 'login-claude.bat' : 'login-claude.sh'),
    login: loginSnapshot(),
    needsLogin: auth.loggedIn === false || !!(run.error && /not logged in|\/login/i.test(run.error)),
    presets: Object.entries(PERMISSION_PRESETS).map(([k, v]) => ({ key: k, label: v.label })),
  };
}

async function handleRun(req, res, parts) {
  // 実行系はトークン必須。他サイトからのリクエストは通さない。
  if (req.method !== 'GET' && req.headers['x-moai-token'] !== RUN_TOKEN) {
    return send(res, 403, { error: '不正なリクエストです（トークンが一致しません）' });
  }
  if (req.method === 'GET') {
    checkAuth(parts[2] === 'auth'); // /api/run/auth は必ず取り直す
    return send(res, 200, runSnapshot());
  }

  if (parts[2] === 'login') {
    try {
      if (parts[3] === 'code') {
        const body = await readBody(req);
        submitLoginCode(body.code);
      } else {
        startLogin();
      }
      return send(res, 200, runSnapshot());
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  if (parts[2] === 'stop') {
    if (run.child) {
      run.status = 'stopped';
      run.child.kill();
      return send(res, 200, { ok: true });
    }
    return send(res, 200, { ok: true, note: '実行中の処理はありません' });
  }

  if (run.status === 'running') {
    return send(res, 409, { error: 'すでに実行中です。終わるまでお待ちください。' });
  }

  const body = await readBody(req);
  const prompt = (body.prompt || '/moai').toString().slice(0, 2000);
  try {
    startRun({ prompt, preset: body.preset });
    return send(res, 202, runSnapshot());
  } catch (e) {
    run.status = 'error';
    run.error = e.message;
    return send(res, 500, { error: e.message });
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'api' && parts[1] === 'run') return await handleRun(req, res, parts);
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
