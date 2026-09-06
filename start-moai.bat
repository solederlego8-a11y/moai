@echo off
chcp 65001
cd /d "%~dp0"
echo.
echo   MOAI（AIマーケティング司令室）を起動しています...
echo   2秒ほどでブラウザが自動で開きます。
echo   この黒い画面は閉じないでください（閉じるとサイトも止まります）。
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:4173'"
node server.js
pause
