@echo off
chcp 65001 >NUL
title MOAI - Claude Code login
cd /d "%~dp0"
node login.js
pause
