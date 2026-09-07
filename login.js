#!/usr/bin/env node
/**
 * MOAI — Claude Code への「1回だけのログイン」を行うヘルパー。
 * MOAI が起動するAIは、デスクトップアプリとは別に自分でログインしている必要がある。
 *
 *   node login.js          ログインを実行して結果を表示
 *   node login.js --status 状態だけ確認
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// server.js と同じ探し方
function resolveClaudeBin() {
  if (process.env.MOAI_CLAUDE_BIN && fs.existsSync(process.env.MOAI_CLAUDE_BIN)) {
    return process.env.MOAI_CLAUDE_BIN;
  }
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const candidates = [];
  const roots = isWin
    ? [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude-code')]
    : [path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code')];
  for (const root of roots) {
    try {
      fs.readdirSync(root)
        .filter((d) => /^\d+\.\d+\.\d+$/.test(d))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .forEach((v) => candidates.push(path.join(root, v, isWin ? 'claude.exe' : 'claude')));
    } catch { /* 無ければ次 */ }
  }
  candidates.push(
    path.join(home, '.local', 'bin', isWin ? 'claude.exe' : 'claude'),
    path.join(home, '.claude', 'local', isWin ? 'claude.exe' : 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  );
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch { /* 続行 */ }
  }
  return null;
}

// 親が Claude Code の場合、その環境変数を引き継ぐと「認証は親が持っている」と誤認される
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDE_CONFIG_DIR') continue;
    if (/^CLAUDE/i.test(key) || key === 'AI_AGENT') delete env[key];
  }
  return env;
}

function status(bin) {
  const r = spawnSync(bin, ['auth', 'status'], { env: cleanEnv(), encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const m = (r.stdout || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const bin = resolveClaudeBin();
if (!bin) {
  console.log('');
  console.log('  Claude Code が見つかりませんでした。');
  console.log('  https://claude.com/claude-code からインストールしてください。');
  console.log('');
  process.exit(1);
}

const statusOnly = process.argv.includes('--status');

console.log('');
console.log('  使用する実行ファイル:');
console.log('    ' + bin);
console.log('');

if (!statusOnly) {
  const before = status(bin);
  if (before && before.loggedIn) {
    console.log('  すでにログイン済みです（' + (before.authMethod || '不明') + '）。');
    console.log('  MOAI の画面から実行できます。');
    console.log('');
    process.exit(0);
  }

  console.log('  ログインを開始します。ブラウザが開いたら「許可（Authorize）」を押してください。');
  console.log('  ※ このウィンドウは閉じずに、そのままにしておいてください。');
  console.log('');

  spawnSync(bin, ['auth', 'login'], { stdio: 'inherit', env: cleanEnv() });
  console.log('');
}

const after = status(bin);
console.log('  ---- ログイン状態 ----');
if (!after) {
  console.log('  状態を取得できませんでした。');
} else if (after.loggedIn) {
  console.log('  ✔ ログイン済み（' + (after.authMethod || '不明') + '）');
  console.log('  MOAI の画面に戻り、「▶ AIに実行させる」を押してください。');
} else {
  console.log('  ✕ まだログインできていません。');
  console.log('  もう一度このファイルを実行するか、次のコマンドを直接お試しください:');
  console.log('    "' + bin + '" auth login');
}
console.log('  ----------------------');
console.log('');
