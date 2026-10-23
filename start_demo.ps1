# Tatras NestPro One-Click PowerShell Launcher
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       TATRAS NESTPRO: 3D FOAM CUTTING OPTIMIZATION DEMO" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan

$root = $PSScriptRoot

Write-Host "Starting FastAPI Backend (http://127.0.0.1:8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; `$env:PYTHONPATH='backend'; & '$root\.venv\Scripts\python.exe' -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "Starting Vite React Frontend (http://127.0.0.1:5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev -- --host 127.0.0.1 --port 5173"

Write-Host "`nBoth servers launched!" -ForegroundColor Yellow
Write-Host "Opening http://127.0.0.1:5173/ in default browser..." -ForegroundColor White
Start-Sleep -Seconds 3
Start-Process "http://127.0.0.1:5173/"
