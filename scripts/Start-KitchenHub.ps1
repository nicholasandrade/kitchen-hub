$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'
$voiceHealthUrl = 'http://127.0.0.1:8787/api/voice/health'
$hubUrl = 'http://127.0.0.1:8787/'

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Test-LocalEndpoint([string]$Url) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-LocalEndpoint $voiceHealthUrl)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $projectRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'voice-server.log') `
    -RedirectStandardError (Join-Path $logDirectory 'voice-server-error.log')
}

if (-not (Test-LocalEndpoint 'http://127.0.0.1:8788/health')) {
  $wakePython = Join-Path $projectRoot '.venv-wake\Scripts\python.exe'
  Start-Process -FilePath $wakePython -ArgumentList 'wake\listener.py' -WorkingDirectory $projectRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'wake-listener.log') `
    -RedirectStandardError (Join-Path $logDirectory 'wake-listener-error.log')
}

for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  if (Test-LocalEndpoint $voiceHealthUrl) { break }
  Start-Sleep -Milliseconds 500
}

$edgeCandidates = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge is required for Kitchen Hub kiosk mode.' }

Start-Process -FilePath $edge -ArgumentList @('--kiosk', $hubUrl, '--edge-kiosk-type=fullscreen', '--no-first-run')
