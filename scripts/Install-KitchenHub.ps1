$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

foreach ($command in @('node', 'npm', 'py')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $command. Follow SURFACE_SETUP.md before running this script."
  }
}

npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }

npm run wake-setup
if ($LASTEXITCODE -ne 0) { throw 'Wake listener setup failed.' }

npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }

if (-not (Test-Path -LiteralPath '.env')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
  Write-Host 'Created .env. Add your OpenAI API key before starting Kitchen Hub.'
}

Write-Host 'Kitchen Hub installation is complete.'
