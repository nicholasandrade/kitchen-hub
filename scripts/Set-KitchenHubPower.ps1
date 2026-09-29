#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

Write-Host 'Configuring plugged-in power settings for Kitchen Hub...'

# Keep the display and computer awake while the Surface is connected to power.
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0

# Do nothing when a keyboard cover/lid is closed while connected to power.
powercfg /setacvalueindex scheme_current sub_buttons lidaction 0
powercfg /setactive scheme_current

Write-Host 'Plugged-in mode is now always awake. Battery settings were left unchanged.'
Write-Host 'Restart Windows once before using the tablet as the permanent Hub.'
