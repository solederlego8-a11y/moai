@echo off
chcp 65001
title MOAI - Claude Code ログイン
echo.
echo   MOAI から AI を動かすための「1回だけのログイン」を行います。
echo   ブラウザが開いたら、許可（Authorize）を押してください。
echo.

set "CLAUDE_BIN="

rem 1) PATH に claude があればそれを使う
where claude >NUL 2>&1
if %ERRORLEVEL%==0 set "CLAUDE_BIN=claude"

rem 2) 無ければデスクトップアプリ同梱版を探す（最後に見つかったもの＝新しい版）
if not defined CLAUDE_BIN (
  for /f "delims=" %%d in ('dir /b /o:n "%APPDATA%\Claude\claude-code" 2^>NUL') do (
    if exist "%APPDATA%\Claude\claude-code\%%d\claude.exe" set "CLAUDE_BIN=%APPDATA%\Claude\claude-code\%%d\claude.exe"
  )
)

if not defined CLAUDE_BIN (
  echo   Claude Code が見つかりませんでした。
  echo   https://claude.com/claude-code からインストールしてください。
  echo.
  pause
  exit /b 1
)

echo   使用する実行ファイル: %CLAUDE_BIN%
echo.

rem このウィンドウが Claude Code の中から開かれていても、独立したセッションとして扱わせる
set "CLAUDECODE="
set "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH="
set "CLAUDE_CODE_ENTRYPOINT="
set "CLAUDE_CODE_CHILD_SESSION="
set "CLAUDE_CODE_SESSION_ID="
set "CLAUDE_CODE_HOST_SESSION_ID="
set "CLAUDE_CODE_MESSAGING_SOCKET="
set "AI_AGENT="

"%CLAUDE_BIN%" auth login

echo.
echo   ---- ログイン結果 ----
"%CLAUDE_BIN%" auth status
echo   ----------------------
echo.
echo   loggedIn が true になっていれば成功です。
echo   MOAI の画面に戻って「ログイン状態を確認」を押してください。
echo.
pause
