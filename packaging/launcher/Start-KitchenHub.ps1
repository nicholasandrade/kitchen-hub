param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'

$installRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $env:LOCALAPPDATA 'KitchenHub\data'
$logRoot = Join-Path $dataRoot 'logs'
$pidRoot = Join-Path $dataRoot 'pids'
$edgeProfile = Join-Path $dataRoot 'edge-profile'
$serverHealthUrl = 'http://127.0.0.1:8787/api/voice/health'
$wakeHealthUrl = 'http://127.0.0.1:8788/health'
$hubUrl = 'http://127.0.0.1:8787/'

New-Item -ItemType Directory -Force -Path $dataRoot, $logRoot, $pidRoot, $edgeProfile | Out-Null

$env:KITCHEN_HUB_DATA_DIR = $dataRoot
$env:KITCHEN_HUB_MODEL_DIR = Join-Path $installRoot 'wake\models\sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
$env:KITCHEN_HUB_WAKE_URL = 'http://127.0.0.1:8787/api/wake'

function Test-LocalEndpoint([string]$Url) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Wait-ForEndpoint([string]$Url, [string]$Name, [int]$Seconds = 30) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalEndpoint $Url) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$Name did not become ready. Open $logRoot to see the service logs."
}

function Start-LocalService([string]$Name, [string]$FilePath, [string[]]$Arguments, [string]$HealthUrl) {
  if (Test-LocalEndpoint $HealthUrl) { return }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdout = Join-Path $logRoot "$Name-$stamp.log"
  $stderr = Join-Path $logRoot "$Name-$stamp-error.log"
  $startParameters = @{
    FilePath = $FilePath
    WorkingDirectory = $installRoot
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $stdout
    RedirectStandardError = $stderr
    PassThru = $true
  }
  if ($Arguments.Count -gt 0) { $startParameters.ArgumentList = $Arguments }
  $process = Start-Process @startParameters
  Set-Content -LiteralPath (Join-Path $pidRoot "$Name.pid") -Value $process.Id -Encoding ascii
}

function Find-Edge {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  throw 'Microsoft Edge is required but was not found.'
}

try {
  $node = Join-Path $installRoot 'app\runtime\node.exe'
  $server = Join-Path $installRoot 'app\server\index.mjs'
  $wake = Join-Path $installRoot 'wake\kitchen-wake\kitchen-wake.exe'

  Start-LocalService 'server' $node @("`"$server`"") $serverHealthUrl
  Wait-ForEndpoint $serverHealthUrl 'The Kitchen Hub server'

  Start-LocalService 'wake' $wake @() $wakeHealthUrl
  Wait-ForEndpoint $wakeHealthUrl 'The Kitchen Hub wake listener'

  if (-not $NoBrowser) {
    $edge = Find-Edge
    $edgeArguments = @(
      "`"--user-data-dir=$edgeProfile`"",
      '--no-first-run',
      '--kiosk',
      '--edge-kiosk-type=fullscreen',
      $hubUrl
    )
    $edgeProcess = Start-Process -FilePath $edge -ArgumentList $edgeArguments -PassThru
    Set-Content -LiteralPath (Join-Path $pidRoot 'edge.pid') -Value $edgeProcess.Id -Encoding ascii
  }
} catch {
  if ($env:KITCHEN_HUB_NONINTERACTIVE -eq '1') { throw }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Kitchen Hub could not start', 'OK', 'Error') | Out-Null
  exit 1
}
