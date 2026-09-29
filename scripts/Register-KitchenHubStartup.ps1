$ErrorActionPreference = 'Stop'

$launcher = Join-Path $PSScriptRoot 'Start-KitchenHub.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'Kitchen Hub' -Description 'Starts the Kitchen Hub services and Edge kiosk at sign-in.' `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host 'Kitchen Hub will start automatically the next time this account signs in.'
