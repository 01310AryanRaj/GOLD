@echo off
echo Starting Gold Drawdown Analysis Dashboard...
cd /d "%~dp0"
.myvenv\Scripts\python.exe app.py
pause
