param(
  [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'
$vite = Join-Path $projectRoot 'node_modules\.bin\vite.cmd'
$voiceHealthUrl = 'http://127.0.0.1:8787/api/voice/health'

function Test-LocalEndpoint([string]$Url) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-PrivateIPv4([string]$Address) {
  if ($Address -match '^10\.') { return $true }
  if ($Address -match '^192\.168\.') { return $true }
  if ($Address -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { return $true }
  return $false
}

if (-not (Test-Path -LiteralPath $vite)) {
  throw 'KitchenHub dependencies are missing. Run npm install first.'
}

$lanAddresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
  Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
  ForEach-Object { $_.IPAddressToString } |
  Where-Object { Test-PrivateIPv4 $_ } |
  Sort-Object -Unique

$lanAddress = $lanAddresses | Select-Object -First 1
if (-not $lanAddress) {
  throw 'No private IPv4 network address was found. Connect this computer to the same network as the Surface and try again.'
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$voiceProcess = $null
if (-not (Test-LocalEndpoint $voiceHealthUrl)) {
  $voiceProcess = Start-Process -FilePath 'node.exe' -ArgumentList 'server/index.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDirectory 'lan-voice-server.log') `
    -RedirectStandardError (Join-Path $logDirectory 'lan-voice-server-error.log')

  $deadline = (Get-Date).AddSeconds(12)
  while (-not (Test-LocalEndpoint $voiceHealthUrl) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
  }

  if (-not (Test-LocalEndpoint $voiceHealthUrl)) {
    Stop-Process -Id $voiceProcess.Id -Force -ErrorAction SilentlyContinue
    throw "The KitchenHub API did not start. Check logs\lan-voice-server-error.log."
  }
}

$surfaceUrl = "http://${lanAddress}:$Port/"
Write-Host ''
Write-Host 'KitchenHub LAN preview is starting.' -ForegroundColor Green
Write-Host "Open this address on the Surface: $surfaceUrl" -ForegroundColor Cyan
Write-Host 'Keep this terminal open. Saved frontend changes will update on the Surface automatically.'
Write-Host 'Press Ctrl+C here when the design session is finished.'
Write-Host ''

try {
  & $vite --host $lanAddress --port $Port --strictPort
  if ($LASTEXITCODE -ne 0) {
    throw "Vite exited with code $LASTEXITCODE."
  }
} finally {
  if ($voiceProcess -and -not $voiceProcess.HasExited) {
    Stop-Process -Id $voiceProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
