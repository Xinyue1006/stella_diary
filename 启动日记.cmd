@echo off
chcp 65001 >nul
title 小猪向阳日记
pushd "%~dp0mobile"
call npm start
pause
