$ErrorActionPreference = 'SilentlyContinue'

$dataRoot = Join-Path $env:LOCALAPPDATA 'KitchenHub\data'
$pidRoot = Join-Path $dataRoot 'pids'

$expectedProcesses = @{ edge = 'msedge'; wake = 'kitchen-wake'; server = 'node' }
foreach ($name in @('edge', 'wake', 'server')) {
  $pidFile = Join-Path $pidRoot "$name.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) { continue }
  $processId = [int](Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue)
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq $expectedProcesses[$name]) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
