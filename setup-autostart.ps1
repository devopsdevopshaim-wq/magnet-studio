$vbsPath = Join-Path $PSScriptRoot "run-hidden.vbs"
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "HaimKrispinOS" -Action $action -Trigger $trigger -RunLevel Limited -Force
Write-Host "SUCCESS - the site will now open automatically every time this computer starts." -ForegroundColor Green
