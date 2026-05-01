$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$FunctionsPidFile = Join-Path $RepoRoot ".local-dev/functions-serve.pid"

if (Test-Path $FunctionsPidFile) {
  try {
    $pidText = Get-Content $FunctionsPidFile -ErrorAction Stop
    $pid = [int]$pidText
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Stopping functions serve process (PID $pid)..." -ForegroundColor Yellow
      Stop-Process -Id $pid -Force
    }
  } catch {
    Write-Host "Could not stop functions serve from PID file. You may close it manually." -ForegroundColor Yellow
  }
  Remove-Item $FunctionsPidFile -ErrorAction SilentlyContinue
}

if (Get-Command supabase -ErrorAction SilentlyContinue) {
  Write-Host "Stopping local Supabase stack..." -ForegroundColor Cyan
  & supabase stop
} else {
  Write-Host "Supabase CLI not found in PATH. Stop containers manually with Docker if needed." -ForegroundColor Yellow
}

Write-Host "Local stack shutdown complete." -ForegroundColor Green
