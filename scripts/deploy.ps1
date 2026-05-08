param (
    [string]$NetworkPath = "\\192.168.2.25\Project\ShareME",
    [string]$TaskName = "ShareME Server",
    [string]$TaskUser = "$env:UserDomain\$env:UserName",
    [switch]$SkipAutoStartupTask,
    [switch]$SkipProcessStop,
    [switch]$TransferOnly
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Get-NetworkHost([string]$Path) {
    if ($Path -match '^\\\\([^\\]+)\\') {
        return $matches[1]
    }
    return $null
}

function Invoke-Robocopy([string[]]$RobocopyArgs) {
    & robocopy @RobocopyArgs | Out-Null
    # Robocopy uses non-zero success codes. 0-7 are success/warnings.
    return $LASTEXITCODE -le 7
}

function Unschedule-AutoStartupTask([string]$ServerName, [string]$Name) {
    if (-not $ServerName) {
        Write-Host "[TASK] Could not detect target server from network path. Skipping unschedule step." -ForegroundColor Yellow
        return
    }

    Write-Host "[TASK] Unscheduling '$Name' on $ServerName..." -ForegroundColor Yellow
    $null = & schtasks /Delete /S $ServerName /TN $Name /F 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[TASK] Existing startup task removed." -ForegroundColor Green
    } else {
        Write-Host "[TASK] No existing task removed (it may not exist yet)." -ForegroundColor DarkGray
    }
}

function Is-LocalServerTarget([string]$ServerName) {
    if (-not $ServerName) { return $true }

    $normalized = $ServerName.ToLowerInvariant()
    if ($normalized -eq 'localhost' -or $normalized -eq '.' -or $normalized -eq $env:COMPUTERNAME.ToLowerInvariant()) {
        return $true
    }

    try {
        $localIPs = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
            ForEach-Object { $_.IPAddressToString }

        return $localIPs -contains $ServerName
    } catch {
        return $false
    }
}

function Stop-RunningShareMEProcesses([string]$ServerName, [string]$Name) {
    if (-not $ServerName) {
        Write-Host "[TASK] Could not detect target server from network path. Skipping process stop step." -ForegroundColor Yellow
        return $false
    }

    Write-Host "[TASK] Stopping running ShareME processes on $ServerName..." -ForegroundColor Yellow
    $isLocalTarget = Is-LocalServerTarget $ServerName
    $cimSession = $null
    $canVerifyStop = $true

    # If the scheduled task is currently running, request stop first.
    if ($isLocalTarget) {
        $null = & schtasks /End /TN $Name 2>&1
    } else {
        $null = & schtasks /End /S $ServerName /TN $Name 2>&1
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[TASK] Stop signal sent to scheduled task '$Name'." -ForegroundColor Green
    } else {
        Write-Host "[TASK] Scheduled task '$Name' was not running." -ForegroundColor DarkGray
    }

    $stoppedCount = 0

    try {
        if ($isLocalTarget) {
            $sharemeProcesses = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
                Where-Object { ($_.CommandLine -as [string]) -like '*ShareME*' }
        } else {
            $sessionOptions = New-CimSessionOption -Protocol Dcom
            $cimSession = New-CimSession -ComputerName $ServerName -SessionOption $sessionOptions -ErrorAction Stop
            $sharemeProcesses = Get-CimInstance -CimSession $cimSession -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
                Where-Object { ($_.CommandLine -as [string]) -like '*ShareME*' }
        }

        foreach ($proc in ($sharemeProcesses | Sort-Object ProcessId -Unique)) {
            try {
                if ($isLocalTarget) {
                    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
                } else {
                    Invoke-CimMethod -InputObject $proc -MethodName Terminate -ErrorAction Stop | Out-Null
                }
                $stoppedCount++
            } catch {
                Write-Host "[TASK] Failed to stop PID $($proc.ProcessId): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } catch {
        if ($isLocalTarget) {
            Write-Host "[TASK] Could not query local node processes: $($_.Exception.Message)" -ForegroundColor Yellow
        } else {
            Write-Host "[TASK] Could not query remote node processes: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "[TASK] Tip: run deploy directly on the server PC for guaranteed pre-stop behavior." -ForegroundColor Yellow
        }
        $canVerifyStop = $false
    } finally {
        if ($cimSession) {
            Remove-CimSession $cimSession
        }
    }

    if ($stoppedCount -gt 0) {
        Write-Host "[TASK] Stopped $stoppedCount running ShareME node process(es)." -ForegroundColor Green
    } else {
        Write-Host "[TASK] No running ShareME node process found to stop." -ForegroundColor DarkGray
    }

    if (-not $canVerifyStop) {
        return $false
    }

    return $true
}

function Schedule-AutoStartupTask([string]$ServerName, [string]$Name, [string]$UserName, [string]$StartScriptPath) {
    if (-not $ServerName) {
        Write-Host "[TASK] Could not detect target server from network path. Skipping schedule step." -ForegroundColor Yellow
        return $false
    }

    $taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScriptPath`""
    Write-Host "[TASK] Scheduling '$Name' on $ServerName for user '$UserName'..." -ForegroundColor Yellow

    $null = & schtasks /Create /S $ServerName /TN $Name /TR $taskCommand /SC ONLOGON /RU $UserName /RL HIGHEST /F 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[TASK] Startup task registered successfully." -ForegroundColor Green
        return $true
    }

    if ($UserName -ne "SYSTEM") {
        Write-Host "[TASK] User-based registration failed. Retrying with SYSTEM account..." -ForegroundColor Yellow
        $null = & schtasks /Create /S $ServerName /TN $Name /TR $taskCommand /SC ONLOGON /RU SYSTEM /RL HIGHEST /F 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[TASK] Startup task registered successfully (SYSTEM)." -ForegroundColor Green
            return $true
        }
    }

    Write-Host "[TASK] Failed to register startup task automatically." -ForegroundColor Red
    Write-Host "       Run this directly on the server to complete registration:" -ForegroundColor Yellow
    Write-Host "       powershell -ExecutionPolicy Bypass -File `"$NetworkPath\scripts\register-shareme-prod-startup.ps1`" -TaskName `"$Name`" -UserId `"$UserName`"" -ForegroundColor Yellow
    return $false
}

$targetServer = Get-NetworkHost $NetworkPath
$remoteStartScript = Join-Path $NetworkPath "scripts\start-shareme-prod.ps1"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ShareME Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Source:      $projectRoot"
Write-Host "Destination: $NetworkPath"
Write-Host "Timestamp:   $timestamp"
Write-Host "========================================`n" -ForegroundColor Cyan

if ($TransferOnly) {
    $SkipAutoStartupTask = $true
    $SkipProcessStop = $true
    Write-Host "[MODE] TransferOnly enabled: skip task/process operations, transfer data only." -ForegroundColor Yellow
}

if (-not $SkipAutoStartupTask) {
    Unschedule-AutoStartupTask -ServerName $targetServer -Name $TaskName
}

if (-not $SkipProcessStop) {
    if (-not (Stop-RunningShareMEProcesses -ServerName $targetServer -Name $TaskName)) {
        Write-Host "ERROR: Could not stop/verify running ShareME processes before deployment." -ForegroundColor Red
        Write-Host "Run deploy on the server PC (192.168.2.25) with sufficient permissions, then retry." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[TASK] Skipping process stop step (transfer-only mode)." -ForegroundColor DarkGray
}

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
    "config.json",
    "package.json",
    "package-lock.json",
    ".env",
    "scripts",
    "screens"
)

Write-Host "Building ShareME Web..." -ForegroundColor Yellow
Set-Location -Path "$projectRoot\screens\sharemeweb"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: ShareME Web build failed. Deployment aborted." -ForegroundColor Red
    exit 1
}

Write-Host "Building EventScorer..." -ForegroundColor Yellow
Set-Location -Path "$projectRoot\screens\eventscorer"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: EventScorer build failed. Deployment aborted." -ForegroundColor Red
    exit 1
}

Set-Location -Path $projectRoot

Write-Host "Deploying files..." -ForegroundColor Yellow

foreach ($item in $itemsToDeploy) {
    $sourcePath = Join-Path $projectRoot $item
    $destPath = Join-Path $NetworkPath $item

    if (Test-Path $sourcePath) {
        try {
            if (Test-Path $sourcePath -PathType Container) {
                # It's a directory
                $xdArgs = @()
                if ($item -eq "screens") { $xdArgs = @("node_modules", ".turbopack", (Join-Path $sourcePath "eventscorer\data")) }
                if ($item -eq "scripts") { $xdArgs = @("logs") }
                
                Write-Host "  [SYNC] $item..." -ForegroundColor Cyan
                $roboArgs = @($sourcePath, $destPath, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np")
                if ($xdArgs.Count -gt 0) { $roboArgs += "/XD"; $roboArgs += $xdArgs }
                if (-not (Invoke-Robocopy -RobocopyArgs $roboArgs)) {
                    throw "Robocopy failed for $item (exit code $LASTEXITCODE)"
                }
                Write-Host "  [DIR]  $item" -ForegroundColor Green
            } else {
                # It's a file
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

if (-not $SkipAutoStartupTask) {
    Schedule-AutoStartupTask -ServerName $targetServer -Name $TaskName -UserName $TaskUser -StartScriptPath $remoteStartScript | Out-Null
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nNext steps on the server machine:"
Write-Host "  1. cd `"$NetworkPath`""
Write-Host "  2. npm install --omit=dev"
Write-Host "  3. npm run prod:all"
Write-Host "`nOr run the startup script for silent background mode:"
Write-Host "  .\scripts\start-shareme-prod.ps1"
Write-Host "========================================`n" -ForegroundColor Cyan
