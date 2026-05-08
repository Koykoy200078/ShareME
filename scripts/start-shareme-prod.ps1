param (
    [string]$NodeExecutable = "node",
    [string]$LogDirectory = "$PSScriptRoot\logs"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverFile = Join-Path $projectRoot "scripts\prod-all.js"

if (-not (Test-Path $serverFile)) {
    throw "Cannot find prod-all.js at $serverFile."
}

if (-not (Test-Path $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory | Out-Null
}

$logFile = Join-Path $LogDirectory "shareme-server.log"
$errorLogFile = Join-Path $LogDirectory "shareme-server-error.log"

# Log that the script was triggered
Add-Content -Path $logFile -Value "[$(Get-Date)] PS-STARTUP: Script triggered. Project Root: $projectRoot"

# Find full path to node to be safe in Task Scheduler environment
$nodePath = (Get-Command $NodeExecutable -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { $nodePath = $NodeExecutable }

$env:NODE_OPTIONS = "--max-old-space-size=8192 --max-http-header-size=80000"

Start-Process -FilePath $nodePath `
    -ArgumentList "`"$serverFile`"" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errorLogFile `
    -PassThru | Out-Null
