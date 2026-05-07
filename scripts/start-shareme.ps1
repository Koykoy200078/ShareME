param (
    [string]$NodeExecutable = "node",
    [string]$LogDirectory = "$PSScriptRoot\logs"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverFile = Join-Path $projectRoot "scripts\dev-all.js"

if (-not (Test-Path $serverFile)) {
    throw "Cannot find dev-all.js at $serverFile."
}

if (-not (Test-Path $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory | Out-Null
}

$logFile = Join-Path $LogDirectory "shareme-server.log"
$errorLogFile = Join-Path $LogDirectory "shareme-server-error.log"
$env:NODE_OPTIONS = "--max-old-space-size=8192 --max-http-header-size=80000"

Start-Process -FilePath $NodeExecutable `
    -ArgumentList "`"$serverFile`"" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errorLogFile `
    -PassThru | Out-Null
