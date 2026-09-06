#!/usr/bin/env node
/**
 * MOAI CLI - Claude Code から data/*.json を安全に読み書きするためのツール。
 * JSONを手で編集すると壊れやすいので、必ずこのCLI経由で更新する。
 *
 *   node cli.js queue                       実行待ちの指示を一覧
 *   node cli.js context                     AIに渡す前提（設定・チャネル・KPI）を出力
 *   node cli.js task-add --title "..." [--channel ch_note] [--agent ag_note]
 *                        [--instruction "..."] [--body-file out.txt] [--status review]
 *   node cli.js task-set <taskId> [--status published] [--body-file out.txt] [--note "..."]
 *   node cli.js inbox-done <inboxId> [--result "..."]
 *   node cli.js msg "本文" [--author 戦略ディレクター]
 *   node cli.js report-add --title "..." --kind 週次 --body-file report.md
 *   node cli.js metric --date 2026-09-06 --instagram 120 --revenueJpy 3000
 *   node cli.js calendar-add --date 2026-09-10 --title "note公開"
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
const nowIso = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');
const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function read(name) {
  const f = path.join(DATA, `${name}.json`);
  if (!fs.existsSync(f)) return name === 'config' ? {} : { items: [] };
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
function write(name, data) {
  const f = path.join(DATA, `${name}.json`);
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, f);
}

// --flag value 形式の引数を辞書にする
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    else out._.push(argv[i]);
  }
  return out;
}

function bodyOf(a) {
  if (a['body-file']) return fs.readFileSync(a['body-file'], 'utf8');
  if (a.body) return String(a.body);
  return '';
}

const [, , cmd, ...rest] = process.argv;
const a = parseArgs(rest);

switch (cmd) {
  case 'queue': {
    const pending = read('inbox').items.filter((i) => i.status === 'pending');
    if (!pending.length) { console.log('（実行待ちの指示はありません）'); break; }
    const agents = read('agents').items, channels = read('channels').items;
    pending.reverse().forEach((q, n) => {
      const ag = agents.find((x) => x.id === q.agentId);
      const ch = channels.find((x) => x.id === q.channelId);
      console.log(`\n[${n + 1}] id=${q.id}`);
      console.log(`  指示: ${q.text}`);
      console.log(`  担当: ${ag ? ag.name + ' → ' + ag.backend.type + ':' + ag.backend.target : 'おまかせ'}`);
      console.log(`  対象: ${ch ? ch.name + (ch.skill ? ' (skill: ' + ch.skill + ')' : '') : '指定なし'}`);
      if (ch && ch.note) console.log(`  前提: ${ch.note}`);
      console.log(`  受付: ${q.createdAt || q.requestedAt}`);
    });
    break;
  }

  case 'context': {
    const c = read('config');
    console.log('## ブランド前提');
    console.log(`ミッション: ${c.brand?.mission || ''}`);
    console.log(`トーン: ${c.brand?.tone || ''}`);
    console.log(`禁止ワード: ${(c.brand?.ngWords || []).join(' / ')}`);
    console.log(`運用ルール:\n- ${(c.brand?.rules || []).join('\n- ')}`);
    console.log(`月間収益目標: ${c.goals?.monthlyRevenueTargetJpy || 0}円`);
    console.log('\n## チャネル');
    read('channels').items.forEach((ch) => {
      console.log(`- ${ch.name} [${ch.id}] ${ch.followers}/${ch.goal} skill=${ch.skill || '-'} 頻度=${ch.cadence || '-'}`);
      if (ch.note) console.log(`    前提: ${ch.note}`);
    });
    const m = read('metrics').items.slice().sort((x, y) => y.date.localeCompare(x.date))[0];
    if (m) console.log(`\n## 直近KPI (${m.date})\n${JSON.stringify(m)}`);
    const rev = read('tasks').items.filter((t) => t.status === 'review');
    console.log(`\n## 承認待ち: ${rev.length}件`);
    break;
  }

  case 'task-add': {
    const d = read('tasks');
    const item = {
      id: newId('tsk'),
      title: a.title || '無題のタスク',
      channelId: a.channel || '',
      agentId: a.agent || '',
      status: a.status || 'review',
      priority: a.priority || 'normal',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      instruction: a.instruction || '',
      output: bodyOf(a),
      meta: a.sources ? { sources: String(a.sources).split(',') } : {},
      history: [{ at: nowIso(), by: 'ai', action: '生成', note: a.note || '' }],
    };
    d.items.unshift(item);
    write('tasks', d);
    console.log(item.id);
    break;
  }

  case 'task-set': {
    const id = a._[0];
    const d = read('tasks');
    const t = d.items.find((x) => x.id === id);
    if (!t) { console.error(`タスクが見つかりません: ${id}`); process.exit(1); }
    if (a.status) t.status = a.status;
    if (a.title) t.title = a.title;
    if (a['body-file'] || a.body) t.output = bodyOf(a);
    t.updatedAt = nowIso();
    t.history = t.history || [];
    t.history.push({ at: nowIso(), by: 'ai', action: a.status || '更新', note: a.note || '' });
    write('tasks', d);
    console.log(`更新しました: ${id} → ${t.status}`);
    break;
  }

  case 'inbox-done': {
    const id = a._[0];
    const d = read('inbox');
    const q = d.items.find((x) => x.id === id);
    if (!q) { console.error(`指示が見つかりません: ${id}`); process.exit(1); }
    q.status = 'done';
    q.doneAt = nowIso();
    if (a.result) q.result = a.result;
    write('inbox', d);
    console.log(`完了にしました: ${id}`);
    break;
  }

  case 'msg': {
    const d = read('messages');
    d.items.unshift({
      id: newId('msg'), role: 'agent', author: a.author || 'MOAI',
      text: a._.join(' '), at: nowIso(),
    });
    write('messages', d);
    console.log('メッセージを追加しました');
    break;
  }

  case 'report-add': {
    const d = read('reports');
    const item = {
      id: newId('rep'), title: a.title || 'レポート', kind: a.kind || 'レポート',
      body: bodyOf(a), createdAt: nowIso(),
    };
    d.items.unshift(item);
    write('reports', d);
    console.log(item.id);
    break;
  }

  case 'metric': {
    const d = read('metrics');
    const date = a.date || nowIso().slice(0, 10);
    let rec = d.items.find((x) => x.date === date);
    if (!rec) { rec = { id: `met_${date}`, date }; d.items.push(rec); }
    // チャネルIDをそのままキーに使える（例: --ch_instagram 132）。旧キーも受け付ける。
    const channelIds = read('channels').items.map((c) => c.id);
    [...channelIds, 'note', 'instagram', 'threads', 'x', 'blogPv', 'revenueJpy'].forEach((k) => {
      if (a[k] !== undefined && a[k] !== true) rec[k] = Number(a[k]);
    });
    d.items.sort((x, y) => x.date.localeCompare(y.date));
    write('metrics', d);
    // 最新日付の記録のときだけチャネルのフォロワー数を同期する（過去日を入れても現在値は壊さない）
    const isLatest = d.items[d.items.length - 1].date === date;
    if (isLatest) {
      const ch = read('channels');
      let touched = false;
      for (const c of ch.items) {
        const v = rec[c.id] !== undefined ? rec[c.id] : rec[c.type];
        if (v !== undefined) { c.followers = v; touched = true; }
      }
      if (touched) write('channels', ch);
    }
    console.log(`${date} の実績を記録しました`);
    break;
  }

  case 'calendar-add': {
    const d = read('calendar');
    d.items.unshift({ id: newId('cal'), date: a.date, title: a.title || '予定', createdAt: nowIso() });
    write('calendar', d);
    console.log('予定を追加しました');
    break;
  }

  default:
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1]);
}
