param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedHash,
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$StatePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+(?:\.\d+)?$')][string]$Version
)

$ErrorActionPreference = 'Stop'
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$InstallerPath = [IO.Path]::GetFullPath($InstallerPath)
$StatePath = [IO.Path]::GetFullPath($StatePath)
$launcher = Join-Path $InstallRoot 'launcher\Start-KitchenHub.ps1'
$logPath = Join-Path (Split-Path -Parent $StatePath) "install-$Version.log"

function Save-UpdateState($Value) {
  $Value | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding ascii
}

try {
  if (-not (Test-Path -LiteralPath $launcher) -or -not (Test-Path -LiteralPath (Join-Path $InstallRoot 'app\runtime\node.exe'))) {
    throw 'The installed Hub directory could not be verified.'
  }
  if ((Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) {
    throw 'Installer checksum changed. Nothing was installed. Download the update again.'
  }
  # Let the HTTP response reach the app before the installer closes it.
  Start-Sleep -Seconds 2
  $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$InstallRoot`"", "/LOG=`"$logPath`"")
  $installer = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
  if ($installer.ExitCode -ne 0) { throw "Hub installer failed (exit code $($installer.ExitCode)). See $logPath" }
  $installedVersion = (Get-Content -LiteralPath (Join-Path $InstallRoot 'app\app-config.json') -Raw | ConvertFrom-Json).version
  if ($installedVersion -ne $Version) { throw "The installer did not install Hub $Version. See $logPath" }
  Save-UpdateState @{ phase = 'idle'; version = $Version }
} catch {
  Save-UpdateState @{ phase = 'error'; error = $_.Exception.Message }
} finally {
  if (Test-Path -LiteralPath $launcher) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$launcher`"") -WindowStyle Hidden
  }
}
