param([string]$PreviewUrl = 'http://192.168.1.74:5173/')
$ErrorActionPreference = 'Stop'
$uri = [Uri]$PreviewUrl
if ($uri.Scheme -ne 'http' -or $uri.Host -notmatch '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw 'Use a private LAN HTTP preview URL.' }
$origin = $uri.GetLeftPart([UriPartial]::Authority)
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge was not found.' }
$profile = Join-Path $env:LOCALAPPDATA 'Hub\LanVoice'
Write-Host 'Opening the isolated Hub LAN voice-test profile. Allow microphone access when Edge asks.'
Write-Host 'This development-only exception applies to the specified LAN origin. Use only on your trusted home network.'
Start-Process -FilePath $edge -ArgumentList @("--user-data-dir=`"$profile`"", "--unsafely-treat-insecure-origin-as-secure=$origin", '--autoplay-policy=no-user-gesture-required', "--app=$PreviewUrl")