@echo off
chcp 65001 >nul
title Sunflower Plush Diary
pushd "%~dp0mobile" || exit /b 1
call npm start
set "diary_exit=%errorlevel%"
popd
echo Press any key to close this window.
pause >nul
exit /b %diary_exit%
