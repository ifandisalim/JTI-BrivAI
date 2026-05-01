param(
  [ValidateSet("go", "android", "web")]
  [string]$MobileTarget = "go",
  [switch]$SkipSupabaseStart,
  [switch]$SkipFunctionsServe,
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$Name'. Install it and run again."
  }
}

function Read-SupabaseStatusValue([string]$StatusText, [string]$Label) {
  $pattern = "(?im)^\s*$([regex]::Escape($Label))\s*:\s*(.+?)\s*$"
  $match = [regex]::Match($StatusText, $pattern)
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }
  return ""
}

$RepoRoot = $PSScriptRoot
$MobileDir = Join-Path $RepoRoot "apps/mobile"
$LocalDevDir = Join-Path $RepoRoot ".local-dev"
$FunctionsPidFile = Join-Path $LocalDevDir "functions-serve.pid"
$FunctionsEnvFile = Join-Path $RepoRoot "supabase/.env.local"

Require-Command "supabase"
Require-Command "npm"

if (-not $SkipSupabaseStart) {
  Write-Host "Starting local Supabase stack (Docker)..." -ForegroundColor Cyan
  & supabase start
}

Write-Host "Reading local Supabase credentials..." -ForegroundColor Cyan
$statusRaw = (& supabase status 2>&1 | Out-String)

$apiUrl = Read-SupabaseStatusValue -StatusText $statusRaw -Label "API URL"
$anonKey = Read-SupabaseStatusValue -StatusText $statusRaw -Label "anon key"
$serviceRoleKey = Read-SupabaseStatusValue -StatusText $statusRaw -Label "service_role key"

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  $apiUrl = Read-Host "Could not parse API URL from 'supabase status'. Enter local API URL"
}
if ([string]::IsNullOrWhiteSpace($anonKey)) {
  $anonKey = Read-Host "Could not parse anon key from 'supabase status'. Enter anon key"
}
if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  $serviceRoleKey = Read-Host "Could not parse service_role key from 'supabase status'. Enter service_role key"
}

if ([string]::IsNullOrWhiteSpace($apiUrl) -or [string]::IsNullOrWhiteSpace($anonKey) -or [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw "Supabase local credentials are required (API URL, anon key, service role key)."
}

$openAiKey = if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { "" } else { $env:OPENAI_API_KEY.Trim() }
$openAiModel = if ([string]::IsNullOrWhiteSpace($env:OPENAI_SUMMARY_MODEL)) { "gpt-4o-mini" } else { $env:OPENAI_SUMMARY_MODEL.Trim() }

$functionsEnv = @"
SUPABASE_URL=$apiUrl
SUPABASE_ANON_KEY=$anonKey
SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey
OPENAI_API_KEY=$openAiKey
OPENAI_SUMMARY_MODEL=$openAiModel
"@

Set-Content -Path $FunctionsEnvFile -Value $functionsEnv -Encoding UTF8
Write-Host "Wrote function env file: supabase/.env.local" -ForegroundColor Green

if (-not $SkipFunctionsServe) {
  if (-not (Test-Path $LocalDevDir)) {
    New-Item -ItemType Directory -Path $LocalDevDir | Out-Null
  }

  if (Test-Path $FunctionsPidFile) {
    try {
      $existingPid = Get-Content $FunctionsPidFile -ErrorAction Stop
      $existingProc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
      if ($existingProc) {
        Write-Host "Stopping previous functions serve process (PID $existingPid)..." -ForegroundColor Yellow
        Stop-Process -Id $existingPid -Force
      }
    } catch {
      # best-effort cleanup
    }
    Remove-Item $FunctionsPidFile -ErrorAction SilentlyContinue
  }

  Write-Host "Starting 'supabase functions serve' in a new window..." -ForegroundColor Cyan
  $functionsProcess = Start-Process `
    -FilePath "supabase" `
    -ArgumentList "functions serve --env-file `"supabase/.env.local`"" `
    -WorkingDirectory $RepoRoot `
    -PassThru

  Set-Content -Path $FunctionsPidFile -Value $functionsProcess.Id -Encoding ASCII
}

$env:EXPO_PUBLIC_SUPABASE_URL = $apiUrl
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = $anonKey

if (-not (Test-Path $MobileDir)) {
  throw "Mobile directory missing: $MobileDir"
}

if (-not $SkipNpmInstall) {
  $nodeModulesDir = Join-Path $MobileDir "node_modules"
  if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "Installing npm dependencies in apps/mobile..." -ForegroundColor Cyan
    Push-Location $MobileDir
    try {
      & npm install
    } finally {
      Pop-Location
    }
  }
}

Write-Host "Launching mobile app with local Supabase env..." -ForegroundColor Cyan
Write-Host "EXPO_PUBLIC_SUPABASE_URL=$apiUrl" -ForegroundColor DarkGray

Push-Location $MobileDir
try {
  switch ($MobileTarget) {
    "go" { & npm run android:go }
    "android" { & npm run android }
    "web" { & npm run web }
    default { throw "Unsupported MobileTarget '$MobileTarget'." }
  }
} finally {
  Pop-Location
}
