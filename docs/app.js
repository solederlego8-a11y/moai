/* =========================================================
   MOAI - AIマーケティング司令室
   フロントエンド（フレームワーク不使用）
   ========================================================= */

const S = { data: null, sig: '', page: 'dashboard', loading: true, calMonth: null, pendingRender: false, mode: 'local' };

/* ---------- ユーティリティ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nfmt = (n) => (Number(n) || 0).toLocaleString('ja-JP');
const items = (col) => (S.data && S.data[col] && Array.isArray(S.data[col].items)) ? S.data[col].items : [];
const cfg = () => (S.data && S.data.config) || {};

function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 16);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* モードによって案内文を変える */
const queuedHint = () => (S.mode === 'server'
  ? 'Claude Code で /moai を実行してください'
  : '「指示する」画面からコピーして、お使いのAIに貼り付けてください');
const queuedMsg = () => 'キューに積みました。' + queuedHint();

/* =========================================================
   データ層 — 2つのモードを同じ呼び出し方で扱う
     server : ローカル版。moai/data/*.json に保存。Claude Code から読み書きできる
     local  : ブラウザ版。このブラウザの localStorage に保存。サーバー不要
   ========================================================= */
const COLLECTIONS = ['config', 'channels', 'agents', 'tasks', 'inbox', 'messages', 'calendar', 'metrics', 'reports'];
const SINGLETONS = new Set(['config']);
const LS_KEY = 'moai.v1.';

const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

/* --- localStorage 版 --- */
function lsRead(col) {
  try {
    const raw = localStorage.getItem(LS_KEY + col);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 読めないときは初期値に戻す */ }
  const seed = (window.MOAI_SEED || {})[col];
  return seed ? JSON.parse(JSON.stringify(seed)) : (SINGLETONS.has(col) ? {} : { items: [] });
}
function lsWrite(col, data) {
  try {
    localStorage.setItem(LS_KEY + col, JSON.stringify(data));
  } catch (e) {
    throw new Error('ブラウザの保存領域がいっぱいです。設定画面からデータを書き出して整理してください。');
  }
}

async function localApi(method, path, body) {
  const [, col, id] = path.split('/');
  if (!col || col === 'all') {
    const snap = {};
    COLLECTIONS.forEach((c) => (snap[c] = lsRead(c)));
    return snap;
  }
  if (!COLLECTIONS.includes(col)) throw new Error(`不明なコレクション: ${col}`);
  const data = lsRead(col);
  if (method === 'GET') return data;

  if (SINGLETONS.has(col)) {
    const next = method === 'PUT' ? body : { ...data, ...body };
    lsWrite(col, next);
    return next;
  }

  const list = Array.isArray(data.items) ? data.items : [];
  if (method === 'POST') {
    const item = { id: body.id || newId(col.slice(0, 3)), createdAt: nowIso(), updatedAt: nowIso(), ...body };
    list.unshift(item);
    lsWrite(col, { ...data, items: list });
    return item;
  }
  if (method === 'PATCH' && id) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`見つかりません: ${id}`);
    const patch = { ...body };
    const history = Array.isArray(list[i].history) ? list[i].history.slice() : [];
    if (patch.__log) {
      history.push({ at: nowIso(), by: patch.__log.by || 'user', action: patch.__log.action, note: patch.__log.note || '' });
      delete patch.__log;
    }
    list[i] = { ...list[i], ...patch, history, updatedAt: nowIso() };
    lsWrite(col, { ...data, items: list });
    return list[i];
  }
  if (method === 'DELETE' && id) {
    lsWrite(col, { ...data, items: list.filter((x) => x.id !== id) });
    return { ok: true, id };
  }
  if (method === 'PUT') { lsWrite(col, body); return body; }
  throw new Error('この操作には対応していません');
}

/* --- サーバー版 --- */
async function serverApi(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `通信エラー (${res.status})`);
  return json;
}

/* --- 共通の入口。呼び出し側はモードを意識しなくてよい --- */
async function api(method, path, body) {
  return S.mode === 'server' ? serverApi(method, path, body) : localApi(method, path, body);
}

/* サーバーが居るかどうかを一度だけ判定する */
async function detectMode() {
  if (new URLSearchParams(location.search).get('standalone') === '1') return 'local';
  if (location.protocol === 'file:') return 'local';
  // ローカル版は必ず localhost で動く。それ以外は探しに行かない（無駄な404を出さない）
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return 'local';
  try {
    const res = await fetch('/api/all', { method: 'GET' });
    if (res.ok) { await res.json(); return 'server'; }
  } catch (e) { /* サーバーが居ない = ブラウザ版 */ }
  return 'local';
}
/* 入力中に再描画すると打鍵内容が消えるので、フォーカス中は描画を保留する */
function isEditing() {
  const el = document.activeElement;
  return !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

async function refresh(silent = false) {
  try {
    const next = await api('GET', '/all');
    delete next._serverTime;
    const sig = JSON.stringify(next);
    const changed = sig !== S.sig;
    S.data = next;
    S.sig = sig;
    S.loading = false;
    if (!silent || (changed && !isEditing() && !document.querySelector('.modal-bg'))) render();
    else if (changed) S.pendingRender = true;
    renderFoot();
  } catch (e) {
    $('#sync-state').textContent = '接続エラー';
    if (!silent) toast(e.message, true);
  }
}

function renderFoot() {
  $('#sync-state').innerHTML = S.mode === 'server'
    ? `<span class="pill approved">ローカル版</span><div style="margin-top:4px">保存先 <span class="mono">moai/data</span></div>`
    : `<span class="pill">ブラウザ版</span><div style="margin-top:4px">このブラウザに保存中</div>`;
}

/* 変更したら即座に再読込・再描画する（自分の操作なので入力保留はしない） */
async function mutate(fn, okMsg) {
  try {
    await fn();
    S.pendingRender = false;
    await refresh(false);
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- 指示をClaude Codeのキューへ積む ---------- */
async function enqueue({ text, agentId = '', channelId = '', title = '' }) {
  await api('POST', '/inbox', {
    text, agentId, channelId, title,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  });
}

/* ---------- モーダル ---------- */
function modal(title, innerHtml, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg" id="mbg"><div class="modal">
    <div class="row" style="margin-bottom:12px"><h2 style="margin:0;font-size:17px">${esc(title)}</h2>
    <div class="spacer" style="flex:1"></div><button class="btn sm" id="mclose">閉じる</button></div>
    ${innerHtml}</div></div>`;
  const close = () => (root.innerHTML = '');
  $('#mclose').onclick = close;
  $('#mbg').onclick = (e) => { if (e.target.id === 'mbg') close(); };
  if (onMount) onMount(close);
}

/* =========================================================
   ナビゲーション
   ========================================================= */
const PAGES = [
  { id: 'dashboard', icon: '📊', label: 'ダッシュボード' },
  { id: 'agents', icon: '🤖', label: 'AIチーム' },
  { id: 'review', icon: '✅', label: '承認キュー', badge: () => items('tasks').filter((t) => t.status === 'review').length },
  { id: 'tasks', icon: '🗂️', label: 'タスク' },
  { id: 'chat', icon: '💬', label: '指示する', badge: () => items('inbox').filter((i) => i.status === 'pending').length },
  { sep: true },
  { id: 'channels', icon: '📡', label: 'チャネル' },
  { id: 'calendar', icon: '🗓️', label: 'カレンダー' },
  { id: 'reports', icon: '📈', label: 'レポート' },
  { id: 'settings', icon: '⚙️', label: '設定' },
];

function renderNav() {
  $('#nav').innerHTML = PAGES.map((p) => {
    if (p.sep) return '<div class="nav-sep"></div>';
    const n = p.badge ? p.badge() : 0;
    return `<button class="nav-btn ${S.page === p.id ? 'active' : ''}" data-page="${p.id}">
      <span>${p.icon}</span><span>${p.label}</span>${n > 0 ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('');
  $('#nav').querySelectorAll('[data-page]').forEach((b) => {
    b.onclick = () => { S.page = b.dataset.page; location.hash = b.dataset.page; render(); };
  });
}

/* =========================================================
   スパークライン（1系列＝凡例不要・二軸なし）
   ========================================================= */
function sparkline(series, label, unit = '') {
  const pts = series.filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) {
    return `<div class="small muted" style="padding:14px 0">${esc(label)}：データが2日分たまると推移が表示されます（現在 ${pts.length} 件）</div>`;
  }
  const W = 260, H = 62, PAD = 6;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const flat = max === min; // 横ばいの系列は軸に張り付かせず中央に描く
  const span = max - min || 1;
  const x = (i) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const y = (v) => (flat ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const dots = pts.map((p, i) => `<circle class="sp-dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="8"
      fill="transparent" data-t="${esc(p.d)}：${nfmt(p.v)}${esc(unit)}"></circle>`).join('');
  return `<div class="spark" style="position:relative">
    <div class="row" style="justify-content:space-between">
      <span class="kpi-label">${esc(label)}</span>
      <span class="small" style="font-weight:700">${nfmt(last.v)}${esc(unit)}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(label)}の推移">
      <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--border)" stroke-width="1"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3.5" fill="var(--accent)"/>
      ${dots}
    </svg></div>`;
}

function bindSparkTooltips(root) {
  root.querySelectorAll('.sp-dot').forEach((c) => {
    c.addEventListener('mouseenter', (e) => {
      const tip = document.createElement('div');
      tip.className = 'toast';
      tip.id = 'spark-tip';
      tip.style.cssText = 'position:fixed;padding:5px 9px;font-size:12px;pointer-events:none';
      tip.textContent = c.dataset.t;
      document.body.appendChild(tip);
      const r = e.target.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 170, r.left) + 'px';
      tip.style.top = (r.top - 34) + 'px';
    });
    c.addEventListener('mouseleave', () => { const t = document.getElementById('spark-tip'); if (t) t.remove(); });
  });
}

/* =========================================================
   ページ：ダッシュボード
   ========================================================= */
function pageDashboard() {
  const ch = items('channels');
  const tasks = items('tasks');
  const mets = items('metrics').slice().sort((a, b) => a.date.localeCompare(b.date));
  const totalFollowers = ch.reduce((s, c) => s + (Number(c.followers) || 0), 0);
  const reviewCount = tasks.filter((t) => t.status === 'review').length;
  const pending = items('inbox').filter((i) => i.status === 'pending').length;
  const latest = mets[mets.length - 1] || {};
  const target = (cfg().goals && cfg().goals.monthlyRevenueTargetJpy) || 0;
  const rev = Number(latest.revenueJpy) || 0;

  const kpis = [
    { l: '総フォロワー', v: nfmt(totalFollowers), f: `${ch.length}チャネル合計` },
    { l: '承認待ち', v: nfmt(reviewCount), f: reviewCount ? '確認してください' : '滞留なし' },
    { l: '実行待ち指示', v: nfmt(pending), f: pending ? 'Claude Codeで /moai' : 'キューは空' },
    { l: '今月の収益', v: '¥' + nfmt(rev), f: target ? `目標 ¥${nfmt(target)}（達成率 ${Math.round((rev / target) * 100)}%）` : '目標未設定' },
  ];

  // 推移グラフは登録済みチャネルから自動生成する（1グラフ＝1系列。異なる単位を1枚に混ぜない）
  const sparks = ch.slice(0, 6).map((c) => {
    const series = mets.map((m) => ({ d: m.date, v: metricValue(m, c) }));
    return `<div class="card">${sparkline(series, c.name)}</div>`;
  }).join('') + `<div class="card">${sparkline(mets.map((m) => ({ d: m.date, v: m.revenueJpy })), '収益', '円')}</div>`;

  const chCards = ch.map((c) => {
    const pct = c.goal ? Math.min(100, Math.round((c.followers / c.goal) * 100)) : 0;
    return `<div class="card ch-card">
      <div class="ch-top">
        <div class="ch-icon">${channelIcon(c.type)}</div>
        <div style="min-width:0">
          <div class="ch-name">${esc(c.name)}</div>
          <div class="small muted">${esc(c.cadence || '')}</div>
        </div>
      </div>
      ${c.goal ? `<div><div class="row small muted" style="justify-content:space-between">
          <span>${nfmt(c.followers)} / ${nfmt(c.goal)}</span><span>${pct}%</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>` : ''}
      <div class="row">
        <span class="pill">${esc(c.monetization || '—')}</span>
        <div style="flex:1"></div>
        <button class="btn sm" data-brief="${esc(c.id)}">依頼する</button>
      </div>
    </div>`;
  }).join('');

  const recent = tasks.slice(0, 6).map((t) => `<tr>
      <td><b>${esc(t.title)}</b><div class="small muted">${esc(channelName(t.channelId))}</div></td>
      <td><span class="pill ${esc(t.status)}">${statusLabel(t.status)}</span></td>
      <td class="small muted">${fmtDate(t.updatedAt || t.createdAt)}</td>
    </tr>`).join('');

  return `
  <div class="page-head">
    <div><h1>ダッシュボード</h1><p>${esc((cfg().brand && cfg().brand.mission) || '')}</p></div>
    <div class="spacer"></div>
    <button class="btn primary" id="quick-instruct">＋ AIに指示する</button>
  </div>

  <div class="grid kpi" style="margin-bottom:16px">
    ${kpis.map((k) => `<div class="card"><div class="kpi-label">${esc(k.l)}</div>
      <div class="kpi-value">${k.v}</div><div class="kpi-foot">${esc(k.f)}</div></div>`).join('')}
  </div>

  <h2 style="font-size:15px;margin:22px 0 10px">チャネル別フォロワー推移</h2>
  <div class="grid cols3" style="margin-bottom:8px">${sparks}</div>

  <h2 style="font-size:15px;margin:22px 0 10px">運用チャネル</h2>
  <div class="grid cols3" style="margin-bottom:8px">${chCards}</div>

  <h2 style="font-size:15px;margin:22px 0 10px">最近の動き</h2>
  <div class="card scroll-x">
    ${tasks.length ? `<table><thead><tr><th>タスク</th><th>状態</th><th>更新</th></tr></thead><tbody>${recent}</tbody></table>`
      : '<div class="empty">まだタスクがありません</div>'}
  </div>`;
}

/* 実績値はチャネルIDで記録する。古い記録は種別キー（note/x など）で入っているので拾い直す。 */
function metricValue(m, ch) {
  if (m[ch.id] !== undefined) return m[ch.id];
  if (m[ch.type] !== undefined) return m[ch.type];
  if (ch.type === 'blog' && m.blogPv !== undefined) return m.blogPv;
  return undefined;
}

function channelIcon(type) {
  return ({ note: '📰', instagram: '📷', threads: '🧵', x: '𝕏', blog: '🌐', rakuten: '🛍️',
    youtube: '▶️', tiktok: '🎵', newsletter: '✉️', podcast: '🎙️' })[type] || '📡';
}
function channelName(id) {
  const c = items('channels').find((c) => c.id === id);
  return c ? c.name : '（チャネル未指定）';
}
function agentName(id) {
  const a = items('agents').find((a) => a.id === id);
  return a ? `${a.avatar} ${a.name}` : '（担当未指定）';
}
function statusLabel(s) {
  return ({ queued: '待機', running: '実行中', review: '承認待ち', approved: '承認済み', published: '公開済み', rejected: '却下' })[s] || s;
}

/* =========================================================
   ページ：AIチーム
   ========================================================= */
function pageAgents() {
  const cards = items('agents').map((a) => `<div class="card agent-card">
    <div class="agent-top">
      <div class="agent-av">${esc(a.avatar)}</div>
      <div><div style="font-weight:700">${esc(a.name)}</div>
        <div class="small muted">${esc(a.role)}</div></div>
    </div>
    <div class="small">${esc(a.desc)}</div>
    <div class="row small muted">
      ${(a.outputs || []).map((o) => `<span class="pill">${esc(o)}</span>`).join('')}
    </div>
    <div class="divider" style="margin:6px 0"></div>
    <div class="row">
      <span class="small mono muted">${a.backend.type === 'agent' ? 'subagent' : 'skill'}: ${esc(a.backend.target)}</span>
      <div style="flex:1"></div>
      <button class="btn sm primary" data-brief-agent="${esc(a.id)}">依頼する</button>
    </div>
  </div>`).join('');

  return `<div class="page-head">
      <div><h1>AIチーム</h1><p>各エージェントは Claude Code のサブエージェント／スキルに対応しています</p></div>
    </div>
    <div class="grid cols3">${cards}</div>`;
}

/* =========================================================
   ページ：承認キュー
   ========================================================= */
function pageReview() {
  const list = items('tasks').filter((t) => t.status === 'review');
  if (!list.length) {
    return `<div class="page-head"><div><h1>承認キュー</h1><p>AIの生成物をここで確認して、公開するかどうかを決めます</p></div></div>
      <div class="empty">承認待ちはありません。AIが生成を終えるとここに並びます。</div>`;
  }
  const html = list.map((t) => `<div class="review-item">
    <div class="row" style="margin-bottom:8px">
      <b style="font-size:15px">${esc(t.title)}</b>
      <span class="pill review">承認待ち</span>
      <div style="flex:1"></div>
      <span class="small muted">${esc(channelName(t.channelId))} ／ ${esc(agentName(t.agentId))}</span>
    </div>
    ${t.instruction ? `<div class="small muted" style="margin-bottom:8px">指示：${esc(t.instruction)}</div>` : ''}
    <div class="review-body">${esc(t.output || '（生成結果が未入力です）')}</div>
    <div class="row" style="margin-top:10px">
      <button class="btn ok" data-approve="${esc(t.id)}">承認する</button>
      <button class="btn" data-redo="${esc(t.id)}">差し戻す（修正指示）</button>
      <button class="btn danger" data-reject="${esc(t.id)}">却下</button>
      <div style="flex:1"></div>
      <button class="btn sm" data-copy="${esc(t.id)}">本文をコピー</button>
    </div>
  </div>`).join('');
  return `<div class="page-head"><div><h1>承認キュー</h1><p>${list.length}件が確認待ちです</p></div></div>${html}`;
}

/* =========================================================
   ページ：タスク（カンバン）
   ========================================================= */
const COLS = ['queued', 'running', 'review', 'approved', 'published'];
function pageTasks() {
  const all = items('tasks');
  const cols = COLS.map((st) => {
    const list = all.filter((t) => t.status === st);
    return `<div class="kanban-col">
      <h3>${statusLabel(st)}<b>${list.length}</b></h3>
      ${list.map((t) => `<div class="task-card" data-task="${esc(t.id)}">
        <div class="t">${esc(t.title)}</div>
        <div class="m">${esc(channelName(t.channelId))}</div>
        <div class="m">${esc(agentName(t.agentId))}</div>
      </div>`).join('') || '<div class="small muted" style="padding:6px">なし</div>'}
    </div>`;
  }).join('');
  const rejected = all.filter((t) => t.status === 'rejected');
  return `<div class="page-head">
      <div><h1>タスク</h1><p>AIが実行する仕事の全体像。カードを押すと詳細と履歴が見られます</p></div>
      <div class="spacer"></div>
      <button class="btn primary" id="new-task">＋ タスクを追加</button>
    </div>
    <div class="scroll-x"><div class="kanban">${cols}</div></div>
    ${rejected.length ? `<h2 style="font-size:14px;margin:22px 0 8px" class="muted">却下（${rejected.length}）</h2>
      <div class="card">${rejected.map((t) => `<div class="row" style="padding:4px 0">
        <span>${esc(t.title)}</span><div style="flex:1"></div>
        <button class="btn sm" data-restore="${esc(t.id)}">戻す</button></div>`).join('')}</div>` : ''}`;
}

function openTask(id) {
  const t = items('tasks').find((x) => x.id === id);
  if (!t) return;
  const hist = (t.history || []).map((h) => `<tr><td class="small muted">${fmtDate(h.at)}</td>
    <td class="small">${esc(h.by)}</td><td class="small">${esc(h.action)} ${esc(h.note || '')}</td></tr>`).join('');
  modal(t.title, `
    <div class="row" style="margin-bottom:10px">
      <span class="pill ${esc(t.status)}">${statusLabel(t.status)}</span>
      <span class="small muted">${esc(channelName(t.channelId))} ／ ${esc(agentName(t.agentId))}</span>
    </div>
    <label class="field"><span>指示</span><textarea id="t-inst">${esc(t.instruction || '')}</textarea></label>
    <label class="field"><span>生成結果 / 本文</span><textarea id="t-out" style="min-height:190px">${esc(t.output || '')}</textarea></label>
    <label class="field"><span>状態</span><select id="t-status">
      ${[...COLS, 'rejected'].map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
    </select></label>
    <div class="row"><button class="btn primary" id="t-save">保存</button>
      <button class="btn danger" id="t-del">削除</button></div>
    ${hist ? `<div class="divider"></div><h3 style="font-size:13px" class="muted">履歴</h3>
      <table><tbody>${hist}</tbody></table>` : ''}
  `, (close) => {
    $('#t-save').onclick = () => mutate(async () => {
      await api('PATCH', `/tasks/${id}`, {
        instruction: $('#t-inst').value, output: $('#t-out').value, status: $('#t-status').value,
        __log: { by: 'user', action: '編集', note: '' },
      });
      close();
    }, '保存しました');
    $('#t-del').onclick = () => {
      if (!confirm('このタスクを削除しますか？')) return;
      mutate(async () => { await api('DELETE', `/tasks/${id}`); close(); }, '削除しました');
    };
  });
}

/* =========================================================
   ページ：指示する（チャット）
   ========================================================= */
function pageChat() {
  const msgs = items('messages').slice().reverse();
  const log = msgs.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : ''}">
      <div class="av">${m.role === 'user' ? '🧑' : '🗿'}</div>
      <div><div class="who">${esc(m.author || (m.role === 'user' ? 'あなた' : 'MOAI'))} ・ ${fmtDate(m.at || m.createdAt)}</div>
      <div class="bubble">${esc(m.text)}</div></div></div>`).join('');

  const queue = items('inbox').filter((i) => i.status === 'pending');
  const queueHtml = queue.length ? queue.map((q) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div class="small"><b>${esc(q.title || q.text.slice(0, 40))}</b></div>
        <div class="small muted">${esc(agentName(q.agentId))} ／ ${esc(channelName(q.channelId))}</div>
      </div>
      <button class="btn sm" data-unqueue="${esc(q.id)}">取消</button>
    </div>`).join('') : '<div class="small muted" style="padding:8px 0">実行待ちの指示はありません</div>';

  return `<div class="page-head">
      <div><h1>指示する</h1><p>日本語で書くだけ。指示は実行キューに積まれ、Claude Code で <span class="mono">/moai</span> と打つと順に実行されます</p></div>
    </div>
    <div class="grid cols2">
      <div class="card">
        <div class="chat-log" id="chatlog">${log || '<div class="empty">まだ会話がありません</div>'}</div>
        <div class="divider"></div>
        <label class="field"><span>担当エージェント（任意）</span>
          <select id="c-agent"><option value="">おまかせ（戦略ディレクターが割り振る）</option>
          ${items('agents').map((a) => `<option value="${esc(a.id)}">${esc(a.avatar)} ${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>対象チャネル（任意）</span>
          <select id="c-channel"><option value="">指定なし</option>
          ${items('channels').map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>指示内容</span>
          <textarea id="c-text" placeholder="例）来週のブログ記事のテーマを、検索需要のあるキーワードから3案出して。競合の強さも添えて"></textarea></label>
        <div class="row"><button class="btn primary" id="c-send">キューに積む</button>
          <span class="small muted">Ctrl + Enter でも送信</span></div>
      </div>
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="row" style="margin-bottom:6px"><b>実行待ちキュー</b>
            <div style="flex:1"></div><span class="pill">${queue.length}件</span></div>
          ${queueHtml}
          <div class="divider"></div>
          ${S.mode === 'server'
            ? `<div class="small muted">Claude Code のターミナルで次を実行すると、上のキューが順に処理されます。</div>
               <div class="mono" style="margin-top:6px;padding:8px;background:var(--panel-2);border:1px solid var(--border);border-radius:8px">/moai</div>`
            : `<div class="small muted">いまは<b>ブラウザ版</b>です。指示は保存されますが、AIが自動で実行するにはローカル版（無料）が必要です。</div>
               <div class="small muted" style="margin-top:6px">ブラウザ版のままでも、指示をコピーして ChatGPT / Claude に貼り付け、結果を承認キューに書き戻す使い方ができます。</div>
               <div class="row" style="margin-top:8px"><button class="btn sm" id="copy-queue">キューをまとめてコピー</button>
                 <a class="btn sm" href="https://github.com/solederlego8-a11y/moai#readme" target="_blank" rel="noopener">ローカル版の入れ方</a></div>`}
        </div>
        <div class="card">
          <b>指示の書き方のコツ</b>
          <ul class="small muted" style="padding-left:18px;margin:8px 0 0;line-height:1.9">
            <li>「何を・どのチャネルに・いつまでに」を1文で書く</li>
            <li>数字（本数・文字数・価格）を入れると精度が上がる</li>
            <li>過去の結果を踏まえたい時は「先週のレポートを見てから」と添える</li>
          </ul>
        </div>
      </div>
    </div>`;
}

/* =========================================================
   ページ：チャネル
   ========================================================= */
function pageChannels() {
  const rows = items('channels').map((c) => `<tr>
    <td><b>${esc(c.name)}</b><div class="small muted">${esc(c.url)}</div></td>
    <td class="small">${esc(c.cadence || '—')}</td>
    <td class="small">${nfmt(c.followers)}${c.goal ? ` / ${nfmt(c.goal)}` : ''}</td>
    <td class="small mono">${esc((c.skill) || '—')}</td>
    <td><button class="btn sm" data-edit-ch="${esc(c.id)}">編集</button></td>
  </tr>`).join('');
  return `<div class="page-head">
      <div><h1>チャネル</h1><p>運用するメディアと、対応するClaude Codeスキルの対応表</p></div>
      <div class="spacer"></div><button class="btn primary" id="new-ch">＋ チャネル追加</button>
    </div>
    <div class="card scroll-x"><table>
      <thead><tr><th>チャネル</th><th>頻度</th><th>フォロワー</th><th>スキル</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <h2 style="font-size:15px;margin:22px 0 10px">実績を記録する</h2>
    <div class="card">
      <div class="grid cols3">
        <label class="field"><span>日付</span><input type="date" id="m-date" value="${todayJst()}"></label>
        ${items('channels').map((c) => `<label class="field"><span>${esc(c.name)}</span>
          <input type="number" id="m-${esc(c.id)}" placeholder="${c.type === 'blog' ? 'PV数' : 'フォロワー数'}"></label>`).join('')}
        <label class="field"><span>収益（円）</span><input type="number" id="m-revenueJpy"></label>
      </div>
      <button class="btn primary" id="m-save">この日の実績を保存</button>
      <div class="small muted" style="margin-top:6px">保存するとダッシュボードの推移グラフに反映されます。</div>
    </div>`;
}

/* =========================================================
   ページ：カレンダー
   ========================================================= */
function pageCalendar() {
  const base = S.calMonth ? new Date(S.calMonth + '-01') : new Date(todayJst().slice(0, 7) + '-01');
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const evs = items('calendar');
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayEvs = evs.filter((e) => e.date === iso);
    cells.push(`<div class="day ${d.getMonth() !== m ? 'other' : ''} ${iso === todayJst() ? 'today' : ''}" data-day="${iso}">
      <div class="n">${d.getDate()}</div>
      ${dayEvs.map((e) => `<div class="ev" title="${esc(e.title)}">${esc(e.title)}</div>`).join('')}
    </div>`);
  }
  const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
  return `<div class="page-head">
      <div><h1>コンテンツカレンダー</h1><p>日付をクリックすると予定を追加できます</p></div>
      <div class="spacer"></div>
      <div class="row">
        <button class="btn sm" id="cal-prev">←</button>
        <b>${y}年${m + 1}月</b>
        <button class="btn sm" id="cal-next">→</button>
        <button class="btn sm" id="cal-today" data-m="${monthStr}">今月</button>
      </div>
    </div>
    <div class="card">
      <div class="cal" style="margin-bottom:6px">${['日', '月', '火', '水', '木', '金', '土'].map((d) => `<div class="dow">${d}</div>`).join('')}</div>
      <div class="cal">${cells.join('')}</div>
    </div>`;
}

/* =========================================================
   ページ：レポート
   ========================================================= */
function pageReports() {
  const list = items('reports');
  const html = list.length ? list.map((r) => `<div class="card" style="margin-bottom:12px">
      <div class="row"><b>${esc(r.title)}</b><div style="flex:1"></div>
        <span class="pill">${esc(r.kind || 'レポート')}</span>
        <span class="small muted">${fmtDate(r.createdAt)}</span></div>
      <div class="divider"></div>
      <div class="review-body">${esc(r.body || '')}</div>
    </div>`).join('') : '<div class="empty">レポートはまだありません。AIチームに「週次レポートを作って」と指示してください。</div>';

  return `<div class="page-head">
      <div><h1>レポート</h1><p>週次パフォーマンス・競合分析・SEO/GEOレポートの保管場所</p></div>
      <div class="spacer"></div>
      <button class="btn primary" id="req-report">週次レポートを依頼</button>
    </div>${html}`;
}

/* =========================================================
   ページ：設定
   ========================================================= */
function pageSettings() {
  const c = cfg();
  const b = c.brand || {};
  return `<div class="page-head"><div><h1>設定</h1><p>ブランドの前提。ここに書いた内容はAIへの指示に毎回引き継がれます</p></div></div>
    <div class="card" style="max-width:760px">
      <label class="field"><span>ミッション（何のために運用するか）</span><textarea id="s-mission">${esc(b.mission || '')}</textarea></label>
      <label class="field"><span>トーン＆マナー</span><input type="text" id="s-tone" value="${esc(b.tone || '')}"></label>
      <label class="field"><span>禁止ワード（カンマ区切り）</span><input type="text" id="s-ng" value="${esc((b.ngWords || []).join(', '))}"></label>
      <label class="field"><span>運用ルール（1行1つ）</span><textarea id="s-rules" style="min-height:130px">${esc((b.rules || []).join('\n'))}</textarea></label>
      <label class="field"><span>月間収益目標（円）</span><input type="number" id="s-target" value="${(c.goals && c.goals.monthlyRevenueTargetJpy) || 0}"></label>
      <button class="btn primary" id="s-save">保存</button>
    </div>
    <div class="card" style="max-width:760px;margin-top:14px">
      <b>データの保存場所</b>
      ${S.mode === 'server'
        ? `<p class="small muted">いまは<b>ローカル版</b>です。すべてのデータは <span class="mono">moai/data/*.json</span> に保存されます。
           Claude Code から直接読み書きできるので、AIの実行結果がそのままこの画面に反映されます。</p>`
        : `<p class="small muted">いまは<b>ブラウザ版</b>です。データはこのブラウザの中だけに保存され、外部には一切送信されません。
           そのかわり、<b>ブラウザの履歴やサイトデータを消すと一緒に消えます</b>。大事なデータは下から書き出して保管してください。
           別のパソコンやシークレットウィンドウでは、別のデータになります。</p>`}
      <div class="row" style="margin-top:10px">
        <button class="btn" id="d-export">データを書き出す（JSON）</button>
        <button class="btn" id="d-import">読み込む</button>
        <input type="file" id="d-file" accept="application/json,.json" style="display:none">
        <div style="flex:1"></div>
        <button class="btn danger" id="d-samples">サンプルデータを消す</button>
      </div>
      <div class="small muted" style="margin-top:8px">書き出したファイルは、ブラウザ版とローカル版のどちらにも読み込めます。引っ越しやバックアップに使えます。</div>
    </div>

    <div class="card" style="max-width:760px;margin-top:14px">
      <b>MOAI について</b>
      <p class="small muted">MOAI は、有料のAIマーケティング運用ツールと同じ考え方を、誰でも無料で使えるようにしたオープンソースのツールです。
      サーバー代も、月額料金も、アカウント登録も要りません。ソースコードは自由に改造して構いません（MITライセンス）。</p>
      <div class="row"><a class="btn sm" href="https://github.com/solederlego8-a11y/moai" target="_blank" rel="noopener">GitHub でソースを見る</a></div>
    </div>`;
}

/* =========================================================
   レンダリング & イベント配線
   ========================================================= */
function render() {
  renderNav();
  const main = $('#main');
  if (S.loading) { main.innerHTML = '<div class="empty">読み込み中…</div>'; return; }
  const pages = {
    dashboard: pageDashboard, agents: pageAgents, review: pageReview, tasks: pageTasks,
    chat: pageChat, channels: pageChannels, calendar: pageCalendar, reports: pageReports, settings: pageSettings,
  };
  main.innerHTML = (pages[S.page] || pageDashboard)();
  wire(main);
  bindSparkTooltips(main);
}

function briefModal({ agentId = '', channelId = '' }) {
  modal('AIに依頼する', `
    <label class="field"><span>担当</span><select id="b-agent"><option value="">おまかせ</option>
      ${items('agents').map((a) => `<option value="${esc(a.id)}" ${a.id === agentId ? 'selected' : ''}>${esc(a.avatar)} ${esc(a.name)}</option>`).join('')}</select></label>
    <label class="field"><span>チャネル</span><select id="b-channel"><option value="">指定なし</option>
      ${items('channels').map((c) => `<option value="${esc(c.id)}" ${c.id === channelId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>依頼内容</span><textarea id="b-text" placeholder="例）今週の投稿ネタを5案、根拠URL付きで出して"></textarea></label>
    <button class="btn primary" id="b-send">キューに積む</button>`, (close) => {
    $('#b-send').onclick = () => {
      const text = $('#b-text').value.trim();
      if (!text) return toast('依頼内容を入力してください', true);
      mutate(async () => {
        await enqueue({ text, agentId: $('#b-agent').value, channelId: $('#b-channel').value, title: text.slice(0, 40) });
        await api('POST', '/messages', { role: 'user', author: 'あなた', text, at: new Date().toISOString() });
        close();
      }, queuedMsg());
    };
  });
}

function wire(root) {
  root.querySelectorAll('[data-brief]').forEach((b) => b.onclick = () => briefModal({ channelId: b.dataset.brief }));
  root.querySelectorAll('[data-brief-agent]').forEach((b) => b.onclick = () => briefModal({ agentId: b.dataset.briefAgent }));
  const qi = $('#quick-instruct', root); if (qi) qi.onclick = () => briefModal({});

  root.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => mutate(async () => {
    await api('PATCH', `/tasks/${b.dataset.approve}`, { status: 'approved', __log: { by: 'user', action: '承認' } });
  }, '承認しました。公開待ちに移動します'));

  root.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => mutate(async () => {
    await api('PATCH', `/tasks/${b.dataset.reject}`, { status: 'rejected', __log: { by: 'user', action: '却下' } });
  }, '却下しました'));

  root.querySelectorAll('[data-restore]').forEach((b) => b.onclick = () => mutate(async () => {
    await api('PATCH', `/tasks/${b.dataset.restore}`, { status: 'queued', __log: { by: 'user', action: '復帰' } });
  }, '待機に戻しました'));

  root.querySelectorAll('[data-redo]').forEach((b) => b.onclick = () => {
    const id = b.dataset.redo;
    modal('差し戻し：修正指示', `<label class="field"><span>どこを直してほしいですか</span>
      <textarea id="r-fb" placeholder="例）冒頭のフックが弱い。数字を入れて書き直して"></textarea></label>
      <button class="btn primary" id="r-send">差し戻す</button>`, (close) => {
      $('#r-send').onclick = () => {
        const fb = $('#r-fb').value.trim();
        if (!fb) return toast('修正指示を入力してください', true);
        mutate(async () => {
          await api('PATCH', `/tasks/${id}`, { status: 'queued', feedback: fb, __log: { by: 'user', action: '差し戻し', note: fb } });
          await enqueue({ text: `タスク ${id} を修正して再提出：${fb}`, title: '差し戻し対応' });
          close();
        }, '差し戻しました');
      };
    });
  });

  root.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => {
    const t = items('tasks').find((x) => x.id === b.dataset.copy);
    try { await navigator.clipboard.writeText(t.output || ''); toast('本文をコピーしました'); }
    catch { toast('コピーできませんでした', true); }
  });

  root.querySelectorAll('[data-task]').forEach((b) => b.onclick = () => openTask(b.dataset.task));
  root.querySelectorAll('[data-unqueue]').forEach((b) => b.onclick = () => mutate(async () => {
    await api('DELETE', `/inbox/${b.dataset.unqueue}`);
  }, '指示を取り消しました'));

  const cs = $('#c-send', root);
  if (cs) {
    const send = () => {
      const text = $('#c-text').value.trim();
      if (!text) return toast('指示を入力してください', true);
      mutate(async () => {
        await api('POST', '/messages', { role: 'user', author: 'あなた', text, at: new Date().toISOString() });
        await enqueue({ text, agentId: $('#c-agent').value, channelId: $('#c-channel').value, title: text.slice(0, 40) });
      }, queuedMsg());
    };
    cs.onclick = send;
    $('#c-text', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  }

  const nt = $('#new-task', root);
  if (nt) nt.onclick = () => modal('タスクを追加', `
    <label class="field"><span>タイトル</span><input type="text" id="n-title"></label>
    <label class="field"><span>チャネル</span><select id="n-ch"><option value="">指定なし</option>
      ${items('channels').map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>担当</span><select id="n-ag"><option value="">おまかせ</option>
      ${items('agents').map((a) => `<option value="${esc(a.id)}">${esc(a.avatar)} ${esc(a.name)}</option>`).join('')}</select></label>
    <label class="field"><span>指示</span><textarea id="n-inst"></textarea></label>
    <button class="btn primary" id="n-save">追加</button>`, (close) => {
    $('#n-save').onclick = () => {
      const title = $('#n-title').value.trim();
      if (!title) return toast('タイトルを入力してください', true);
      mutate(async () => {
        await api('POST', '/tasks', {
          title, channelId: $('#n-ch').value, agentId: $('#n-ag').value,
          instruction: $('#n-inst').value, status: 'queued', output: '',
          history: [{ at: new Date().toISOString(), by: 'user', action: '作成' }],
        });
        close();
      }, 'タスクを追加しました');
    };
  });

  root.querySelectorAll('[data-edit-ch]').forEach((b) => b.onclick = () => {
    const c = items('channels').find((x) => x.id === b.dataset.editCh);
    modal(`チャネル編集：${c.name}`, `
      <label class="field"><span>名前</span><input type="text" id="e-name" value="${esc(c.name)}"></label>
      <label class="field"><span>URL</span><input type="text" id="e-url" value="${esc(c.url || '')}"></label>
      <label class="field"><span>投稿頻度</span><input type="text" id="e-cadence" value="${esc(c.cadence || '')}"></label>
      <label class="field"><span>フォロワー</span><input type="number" id="e-followers" value="${Number(c.followers) || 0}"></label>
      <label class="field"><span>目標</span><input type="number" id="e-goal" value="${Number(c.goal) || 0}"></label>
      <label class="field"><span>担当スキル</span><input type="text" id="e-skill" value="${esc(c.skill || '')}"></label>
      <label class="field"><span>メモ（AIへの前提）</span><textarea id="e-note">${esc(c.note || '')}</textarea></label>
      <div class="row"><button class="btn primary" id="e-save">保存</button>
        <button class="btn danger" id="e-del">削除</button></div>`, (close) => {
      $('#e-save').onclick = () => mutate(async () => {
        await api('PATCH', `/channels/${c.id}`, {
          name: $('#e-name').value, url: $('#e-url').value, cadence: $('#e-cadence').value,
          followers: Number($('#e-followers').value), goal: Number($('#e-goal').value),
          skill: $('#e-skill').value, note: $('#e-note').value,
        });
        close();
      }, '保存しました');
      $('#e-del').onclick = () => {
        if (!confirm('このチャネルを削除しますか？')) return;
        mutate(async () => { await api('DELETE', `/channels/${c.id}`); close(); }, '削除しました');
      };
    });
  });

  const nc = $('#new-ch', root);
  if (nc) nc.onclick = () => modal('チャネル追加', `
    <label class="field"><span>名前</span><input type="text" id="a-name"></label>
    <label class="field"><span>種別</span><select id="a-type">
      ${['note', 'instagram', 'threads', 'x', 'blog', 'rakuten', 'other'].map((t) => `<option>${t}</option>`).join('')}</select></label>
    <label class="field"><span>URL</span><input type="text" id="a-url"></label>
    <button class="btn primary" id="a-save">追加</button>`, (close) => {
    $('#a-save').onclick = () => {
      const name = $('#a-name').value.trim();
      if (!name) return toast('名前を入力してください', true);
      mutate(async () => {
        await api('POST', '/channels', { name, type: $('#a-type').value, url: $('#a-url').value, status: 'active', followers: 0, goal: 0 });
        close();
      }, '追加しました');
    };
  });

  const ms = $('#m-save', root);
  if (ms) ms.onclick = () => mutate(async () => {
    const rec = { date: $('#m-date').value };
    if (!rec.date) throw new Error('日付を入れてください');
    const keys = [...items('channels').map((c) => c.id), 'revenueJpy'];
    keys.forEach((k) => {
      const el = $(`#m-${k}`);
      if (el && el.value !== '') rec[k] = Number(el.value);
    });
    if (Object.keys(rec).length === 1) throw new Error('数値を1つ以上入れてください');
    const existing = items('metrics').find((x) => x.date === rec.date);
    if (existing) await api('PATCH', `/metrics/${existing.id || existing.date}`, rec);
    else await api('POST', '/metrics', { id: `met_${rec.date}`, ...rec });
    // 最新日付のときだけチャネル側の数値を同期する（過去日を入れても現在値は壊さない）
    const latestDate = items('metrics').reduce((m, x) => (x.date > m ? x.date : m), rec.date);
    if (rec.date >= latestDate) {
      for (const c of items('channels')) {
        if (rec[c.id] !== undefined) await api('PATCH', `/channels/${c.id}`, { followers: rec[c.id] });
      }
    }
  }, '実績を記録しました');

  const sv = $('#s-save', root);
  if (sv) sv.onclick = () => mutate(async () => {
    const c = cfg();
    await api('PATCH', '/config', {
      brand: {
        ...(c.brand || {}),
        mission: $('#s-mission').value,
        tone: $('#s-tone').value,
        ngWords: $('#s-ng').value.split(',').map((s) => s.trim()).filter(Boolean),
        rules: $('#s-rules').value.split('\n').map((s) => s.trim()).filter(Boolean),
      },
      goals: { ...(c.goals || {}), monthlyRevenueTargetJpy: Number($('#s-target').value) },
    });
  }, '設定を保存しました');

  const dx = $('#d-export', root);
  if (dx) {
    dx.onclick = () => {
      const snapshot = {};
      COLLECTIONS.forEach((c) => (snapshot[c] = S.data[c]));
      snapshot._exportedAt = nowIso();
      snapshot._app = 'MOAI';
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `moai-backup-${todayJst()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('書き出しました');
    };
    $('#d-import', root).onclick = () => $('#d-file', root).click();
    $('#d-file', root).onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); }
        catch { return toast('JSONとして読み込めませんでした', true); }
        if (!parsed || typeof parsed !== 'object' || !parsed.channels) {
          return toast('MOAIの書き出しファイルではないようです', true);
        }
        if (!confirm('いまのデータを、読み込んだ内容で置き換えます。よろしいですか？')) return;
        mutate(async () => {
          for (const c of COLLECTIONS) {
            if (parsed[c]) await api('PUT', `/${c}`, parsed[c]);
          }
        }, '読み込みました');
      };
      reader.readAsText(file);
      e.target.value = '';
    };
    $('#d-samples', root).onclick = () => {
      if (!confirm('サンプルのチャネル・タスク・メッセージを削除します。よろしいですか？')) return;
      mutate(async () => {
        for (const c of ['channels', 'tasks', 'messages']) {
          const kept = items(c).filter((it) => !it.isSample && it.id !== 'msg_welcome');
          await api('PUT', `/${c}`, { ...S.data[c], items: kept });
        }
      }, 'サンプルを削除しました');
    };
  }

  const cq = $('#copy-queue', root);
  if (cq) cq.onclick = async () => {
    const q = items('inbox').filter((i) => i.status === 'pending');
    if (!q.length) return toast('実行待ちの指示がありません', true);
    const c = cfg();
    const text = [
      'あなたはマーケティング運用の担当者です。以下の前提を守って、指示にひとつずつ答えてください。',
      '',
      `【トーン】${(c.brand && c.brand.tone) || ''}`,
      `【禁止】${((c.brand && c.brand.ngWords) || []).join(' / ')}`,
      `【ルール】\n- ${((c.brand && c.brand.rules) || []).join('\n- ')}`,
      '',
      '【指示】',
      ...q.map((x, i) => `${i + 1}. ${x.text}（担当: ${agentName(x.agentId)} / 対象: ${channelName(x.channelId)}）`),
    ].join('\n');
    try { await navigator.clipboard.writeText(text); toast('コピーしました。AIに貼り付けてください'); }
    catch { toast('コピーできませんでした', true); }
  };

  const rr = $('#req-report', root);
  if (rr) rr.onclick = () => mutate(async () => {
    await enqueue({ text: '全チャネルの今週の実績を分析し、来週の優先施策を3つに絞った週次レポートを作成して reports に保存して', agentId: 'ag_growth', title: '週次レポート作成' });
  }, '週次レポートを依頼しました。' + queuedHint());

  const prev = $('#cal-prev', root);
  if (prev) {
    const shift = (delta) => {
      const base = S.calMonth ? new Date(S.calMonth + '-01') : new Date(todayJst().slice(0, 7) + '-01');
      base.setMonth(base.getMonth() + delta);
      S.calMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
      render();
    };
    prev.onclick = () => shift(-1);
    $('#cal-next', root).onclick = () => shift(1);
    $('#cal-today', root).onclick = () => { S.calMonth = null; render(); };
    root.querySelectorAll('[data-day]').forEach((d) => d.onclick = () => {
      const iso = d.dataset.day;
      const dayEvs = items('calendar').filter((e) => e.date === iso);
      modal(`${iso} の予定`, `
        ${dayEvs.map((e) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--border)">
          <span>${esc(e.title)}</span><div style="flex:1"></div>
          <button class="btn sm" data-del-ev="${esc(e.id)}">削除</button></div>`).join('')}
        <label class="field" style="margin-top:12px"><span>予定を追加</span>
          <input type="text" id="ev-title" placeholder="例）note有料記事を公開"></label>
        <button class="btn primary" id="ev-add">追加</button>`, (close) => {
        $('#ev-add').onclick = () => {
          const title = $('#ev-title').value.trim();
          if (!title) return toast('予定名を入力してください', true);
          mutate(async () => { await api('POST', '/calendar', { date: iso, title }); close(); }, '予定を追加しました');
        };
        document.querySelectorAll('[data-del-ev]').forEach((b) => b.onclick = () =>
          mutate(async () => { await api('DELETE', `/calendar/${b.dataset.delEv}`); close(); }, '削除しました'));
      });
    });
  }
}

/* ---------- 起動 ---------- */
(async function init() {
  S.mode = await detectMode();
  const hash = location.hash.replace('#', '');
  if (hash) S.page = hash;
  // ブラウザの戻る／進む・URL直打ちに追従する
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '') || 'dashboard';
    if (h !== S.page) { S.page = h; render(); }
  });
  render();
  refresh();
  if (S.mode === 'server') {
    // Claude Code がファイルを書き換えた結果を自動で拾う（入力中・モーダル表示中は描画を保留）
    setInterval(() => refresh(true), 5000);
  } else {
    // ブラウザ版は別タブでの変更だけ拾えばよい
    window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(LS_KEY)) refresh(true); });
  }
  // 入力を終えたタイミングで保留していた更新を反映する
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (S.pendingRender && !isEditing() && !document.querySelector('.modal-bg')) {
        S.pendingRender = false;
        render();
      }
    }, 150);
  });
})();
