param (
    [string]$TaskName = "ShareME Server",
    [string]$UserId = "$env:UserDomain\$env:UserName"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $projectRoot "scripts\start-shareme-prod.ps1"

if (-not (Test-Path $startScript)) {
    throw "Start script not found at $startScript"
}

# Always remove existing task first so we fully replace any previous startup config.
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`"" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$trigger.Delay = "PT30S"
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Highest

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

Write-Host "Scheduled task '$TaskName' registered. ShareME server will start silently at logon."