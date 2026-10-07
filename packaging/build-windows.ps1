param(
  [string]$AppVersion = '',
  [string]$NodeVersion = '22.23.3',
  [string]$OutputDirectory = '',
  [string]$GoogleClientId = $env:GOOGLE_CLIENT_ID,
  [string]$GoogleClientSecret = $env:GOOGLE_CLIENT_SECRET
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildRoot = Join-Path $repoRoot 'build\windows'
$stageRoot = Join-Path $buildRoot 'stage'
$cacheRoot = Join-Path $buildRoot 'cache'
$pyInstallerRoot = Join-Path $buildRoot 'pyinstaller'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoRoot 'artifacts' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)

if (-not $AppVersion) {
  $AppVersion = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
}
if ($AppVersion -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') {
  throw "AppVersion must contain three or four numeric components. Received: $AppVersion"
}

function Reset-RepoDirectory([string]$Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  $repoPrefix = $repoRoot.TrimEnd('\') + '\'
  if (-not $fullPath.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clear a directory outside the repository: $fullPath"
  }
  if (Test-Path -LiteralPath $fullPath) { Remove-Item -LiteralPath $fullPath -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE." }
}

Set-Location $repoRoot
Reset-RepoDirectory $stageRoot
Reset-RepoDirectory $pyInstallerRoot
New-Item -ItemType Directory -Force -Path $cacheRoot, $OutputDirectory | Out-Null

Invoke-Checked 'npm.cmd' @('ci')
Invoke-Checked 'npm.cmd' @('run', 'build')

$venv = Join-Path $repoRoot '.venv-wake'
$python = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
  $pyLauncher = Get-Command 'py.exe' -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    Invoke-Checked $pyLauncher.Source @('-3.11', '-m', 'venv', $venv)
  } else {
    $pythonLauncher = Get-Command 'python.exe' -ErrorAction SilentlyContinue
    if (-not $pythonLauncher) { throw 'Python 3.11 is required to build the wake listener.' }
    Invoke-Checked $pythonLauncher.Source @('-m', 'venv', $venv)
  }
}
Invoke-Checked $python @('-m', 'pip', 'install', '--disable-pip-version-check', '-r', (Join-Path $repoRoot 'wake\requirements.txt'), '-r', (Join-Path $repoRoot 'wake\requirements-build.txt'))
Invoke-Checked 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repoRoot 'wake\setup.ps1'))

$pyDist = Join-Path $pyInstallerRoot 'dist'
$pyWork = Join-Path $pyInstallerRoot 'work'
Invoke-Checked $python @(
  '-m', 'PyInstaller', '--noconfirm', '--clean',
  '--distpath', $pyDist,
  '--workpath', $pyWork,
  (Join-Path $repoRoot 'wake\kitchen-wake.spec')
)

$nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
$nodeArchive = Join-Path $cacheRoot $nodeArchiveName
$nodeChecksums = Join-Path $cacheRoot "node-v$NodeVersion-SHASUMS256.txt"
if (-not (Test-Path -LiteralPath $nodeArchive)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/$nodeArchiveName" -OutFile $nodeArchive
}
if (-not (Test-Path -LiteralPath $nodeChecksums)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile $nodeChecksums
}
$checksumLine = Get-Content -LiteralPath $nodeChecksums | Where-Object { $_ -match "\s+$([regex]::Escape($nodeArchiveName))$" } | Select-Object -First 1
if (-not $checksumLine) { throw "The official Node checksum file does not contain $nodeArchiveName." }
$expectedHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $nodeArchive -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'The downloaded Node runtime failed SHA-256 verification.' }

$nodeExtract = Join-Path $cacheRoot "node-v$NodeVersion"
Reset-RepoDirectory $nodeExtract
Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtract -Force
$nodeSource = Join-Path $nodeExtract "node-v$NodeVersion-win-x64"

$appStage = Join-Path $stageRoot 'app'
$wakeStage = Join-Path $stageRoot 'wake'
New-Item -ItemType Directory -Force -Path (Join-Path $appStage 'runtime'), (Join-Path $appStage 'server'), $wakeStage | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'dist') -Destination (Join-Path $appStage 'dist') -Recurse
Get-ChildItem -Path (Join-Path $repoRoot 'server\*.mjs') | Where-Object { $_.Name -notlike '*.test.mjs' } | Copy-Item -Destination (Join-Path $appStage 'server')
Copy-Item -LiteralPath (Join-Path $repoRoot '.env.example') -Destination (Join-Path $appStage '.env.example')
@{ googleClientId = $GoogleClientId; googleClientSecret = $GoogleClientSecret } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $appStage 'app-config.json') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $nodeSource 'node.exe') -Destination (Join-Path $appStage 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $nodeSource 'LICENSE') -Destination (Join-Path $appStage 'runtime\NODE-LICENSE.txt')

Copy-Item -LiteralPath (Join-Path $pyDist 'kitchen-wake') -Destination (Join-Path $wakeStage 'kitchen-wake') -Recurse
$modelName = 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
$modelSource = Join-Path $repoRoot "wake\models\$modelName"
if (-not (Test-Path -LiteralPath $modelSource)) { throw "Wake model was not prepared at $modelSource." }
$modelStage = Join-Path $wakeStage "models\$modelName"
New-Item -ItemType Directory -Force -Path $modelStage | Out-Null
foreach ($modelFile in @(
  'bpe.model',
  'tokens.txt',
  'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  'README.md'
)) {
  Copy-Item -LiteralPath (Join-Path $modelSource $modelFile) -Destination (Join-Path $modelStage $modelFile)
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'packaging\launcher') -Destination (Join-Path $stageRoot 'launcher') -Recurse
Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\Set-KitchenHubPower.ps1') -Destination (Join-Path $stageRoot 'launcher\Set-KitchenHubPower.ps1')

$isccCandidates = @(
  $env:INNO_SETUP_COMPILER,
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$iscc = $isccCandidates | Select-Object -First 1
if (-not $iscc) {
  throw 'Inno Setup 6 was not found. Install it or set INNO_SETUP_COMPILER to ISCC.exe.'
}

Invoke-Checked $iscc @(
  "/DAppVersion=$AppVersion",
  "/DSourceRoot=$stageRoot",
  "/DOutputDir=$OutputDirectory",
  (Join-Path $repoRoot 'packaging\KitchenHub.iss')
)

$installer = Join-Path $OutputDirectory "KitchenHub-Setup-$AppVersion.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw "Installer was not created at $installer." }
Write-Host "Kitchen Hub installer created: $installer"
