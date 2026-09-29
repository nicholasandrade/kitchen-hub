$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $projectRoot '.venv-wake'
$python = Join-Path $venv 'Scripts\python.exe'
$modelsRoot = Join-Path $PSScriptRoot 'models'
$modelName = 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
$modelDir = Join-Path $modelsRoot $modelName
$archive = Join-Path $modelsRoot 'sherpa-kws.tar.bz2'
$modelUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/$modelName.tar.bz2"

if (-not (Test-Path -LiteralPath $python)) {
  py -3.11 -m venv $venv
}

& $python -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')

New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
if (-not (Test-Path -LiteralPath $modelDir)) {
  Invoke-WebRequest -UseBasicParsing -Uri $modelUrl -OutFile $archive
  & $python -c "import tarfile; t=tarfile.open(r'$archive','r:bz2'); t.extractall(r'$modelsRoot'); t.close()"
  Remove-Item -LiteralPath $archive
}

$keywords = Join-Path $modelDir 'kitchen-hub-keywords.txt'
& (Join-Path $venv 'Scripts\sherpa-onnx-cli.exe') text2token `
  --tokens (Join-Path $modelDir 'tokens.txt') `
  --tokens-type bpe `
  --bpe-model (Join-Path $modelDir 'bpe.model') `
  (Join-Path $PSScriptRoot 'keywords_raw.txt') `
  $keywords

Write-Host "Wake listener installed. Run: npm run wake-listener"

