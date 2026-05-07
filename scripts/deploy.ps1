param (
    [string]$NetworkPath = "\\192.168.2.25\Project\ShareME",
    [switch]$Force
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ShareME Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Source:      $projectRoot"
Write-Host "Destination: $NetworkPath"
Write-Host "Timestamp:   $timestamp"
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if network path is accessible
if (-not (Test-Path $NetworkPath)) {
    Write-Host "Network path not found. Attempting to create..." -ForegroundColor Yellow
    try {
        New-Item -ItemType Directory -Path $NetworkPath -Force | Out-Null
        Write-Host "Created network directory: $NetworkPath" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Cannot access network path: $NetworkPath" -ForegroundColor Red
        Write-Host "Make sure the network share is accessible and you have write permissions." -ForegroundColor Red
        exit 1
    }
}

# Files and folders to deploy (exclude node_modules, uploads, logs, .git)
$itemsToDeploy = @(
    "server.js",
    "package.json",
    "package-lock.json",
    ".env",
    "scripts",
    "screens"
)

# Optional: backup existing deployment
$backupPath = Join-Path $NetworkPath "_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Write-Host "Deploying files..." -ForegroundColor Yellow

foreach ($item in $itemsToDeploy) {
    $sourcePath = Join-Path $projectRoot $item
    $destPath = Join-Path $NetworkPath $item

    if (Test-Path $sourcePath) {
        try {
            if (Test-Path $sourcePath -PathType Container) {
                # It's a directory
                if (Test-Path $destPath) {
                    Write-Host "  [DELETE] Removing old $item..." -ForegroundColor Yellow
                    Remove-Item -Path $destPath -Recurse -Force
                }
                
                if ($item -eq "screens") {
                    # Use robocopy to avoid copying node_modules and .next over the network (saves massive time)
                    Write-Host "  [COPY]   Syncing $item (excluding node_modules)..." -ForegroundColor Cyan
                    $roboArgs = @($sourcePath, $destPath, "/E", "/XD", "node_modules", ".next", ".turbopack", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np")
                    & robocopy $roboArgs | Out-Null
                } else {
                    Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
                }
                Write-Host "  [DIR]  $item" -ForegroundColor Green
            } else {
                # It's a file
                if (Test-Path $destPath) {
                    Remove-Item -Path $destPath -Force
                }
                Copy-Item -Path $sourcePath -Destination $destPath -Force
                Write-Host "  [FILE] $item" -ForegroundColor Green
            }
        } catch {
            Write-Host "  [FAIL] $item - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  [SKIP] $item (not found)" -ForegroundColor DarkGray
    }
}

# Create uploads directory on network if it doesn't exist
$uploadsDir = Join-Path $NetworkPath "uploads"
if (-not (Test-Path $uploadsDir)) {
    New-Item -ItemType Directory -Path $uploadsDir -Force | Out-Null
    Write-Host "  [DIR]  uploads (created empty)" -ForegroundColor Green
}

# Create logs directory
$logsDir = Join-Path $NetworkPath "scripts\logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Write-Host "  [DIR]  scripts\logs (created empty)" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nNext steps on the server machine:"
Write-Host "  1. cd `"$NetworkPath`""
Write-Host "  2. npm install"
Write-Host "  3. cd screens\sharemeweb && npm install"
Write-Host "  4. cd ..\..\screens\eventscorer && npm install"
Write-Host "  5. cd ..\.."
Write-Host "  6. npm run dev:all"
Write-Host "`nOr run the startup script for silent background mode:"
Write-Host "  .\scripts\start-shareme.ps1"
Write-Host "========================================`n" -ForegroundColor Cyan
