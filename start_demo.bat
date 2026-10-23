@echo off
title Tatras NestPro - Foam Nesting & Cutting Optimization
echo ======================================================================
echo           TATRAS NESTPRO: 3D FOAM CUTTING OPTIMIZATION DEMO
echo ======================================================================
echo Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Tatras NestPro Backend" cmd /k "cd /d %~dp0 && .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Vite React Frontend on http://127.0.0.1:5173 ...
start "Tatras NestPro Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 127.0.0.1 --port 5173"

echo.
echo Both servers launching!
echo Once started, open http://127.0.0.1:5173/ in your browser.
echo ======================================================================
timeout /t 5
start http://127.0.0.1:5173/
