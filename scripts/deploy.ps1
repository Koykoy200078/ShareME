param (
    [string]$NetworkPath = "\\192.168.2.25\Project\ShareME",
    [switch]$TransferOnly
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectRootFull = (Resolve-Path -LiteralPath $projectRoot).Path.TrimEnd('\\')
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Test-IsAdministrator {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Start-ElevatedDeploy([string]$ScriptPath, [string]$TargetNetworkPath, [bool]$UseTransferOnly) {
    $argumentList = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "`"$ScriptPath`"",
        "-NetworkPath",
        "`"$TargetNetworkPath`""
    )

    if ($UseTransferOnly) {
        $argumentList += "-TransferOnly"
    }

    Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -Verb RunAs | Out-Null
}

function Copy-FileIfChanged([string]$SourcePath, [string]$DestinationPath) {
    if (-not (Test-Path -LiteralPath $SourcePath)) {
        return $false
    }

    $destinationDir = Split-Path -Path $DestinationPath -Parent
    if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    $copyRequired = $true
    if (Test-Path -LiteralPath $DestinationPath) {
        $sourceItem = Get-Item -LiteralPath $SourcePath
        $destinationItem = Get-Item -LiteralPath $DestinationPath
        $copyRequired = ($sourceItem.Length -ne $destinationItem.Length) -or ($sourceItem.LastWriteTimeUtc -ne $destinationItem.LastWriteTimeUtc)
    }

    if ($copyRequired) {
        Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
        return $true
    }

    return $false
}

function Test-GitRepository([string]$RepositoryPath) {
    try {
        & git -C $RepositoryPath rev-parse --is-inside-work-tree *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Get-GitChangedPaths([string]$RepositoryPath, [string]$PathPrefix = "") {
    $results = New-Object System.Collections.Generic.List[string]

    if (-not (Test-GitRepository -RepositoryPath $RepositoryPath)) {
        return $results
    }

    $statusLines = & git -c core.quotepath=false -C $RepositoryPath status --porcelain 2>$null
    foreach ($line in $statusLines) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -lt 4) {
            continue
        }

        $relativePath = $line.Substring(3).Trim()
        if ($relativePath -like "* -> *") {
            $relativePath = ($relativePath -split " -> ")[-1].Trim()
        }

        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            continue
        }

        $normalized = ($relativePath -replace "\\", "/").TrimStart('/')
        if ($PathPrefix.Length -gt 0) {
            $normalized = "$PathPrefix/$normalized"
        }

        $results.Add($normalized)
    }

    return $results
}

function Test-ShouldSkipPath([string]$RelativePath) {
    $path = ($RelativePath -replace "\\", "/").TrimStart('/').ToLowerInvariant()

    if ($path -eq ".git" -or $path.StartsWith(".git/")) { return $true }
    if ($path -eq "uploads" -or $path.StartsWith("uploads/")) { return $true }
    if ($path -eq "scripts/logs" -or $path.StartsWith("scripts/logs/")) { return $true }
    if ($path -eq "node_modules" -or $path.StartsWith("node_modules/")) { return $true }
    if ($path.StartsWith("screens/eventscorer/node_modules/")) { return $true }
    if ($path.StartsWith("screens/sharemeweb/node_modules/")) { return $true }
    if ($path.StartsWith("screens/eventscorer/.turbopack/")) { return $true }
    if ($path.StartsWith("screens/sharemeweb/.turbopack/")) { return $true }
    if ($path.StartsWith("screens/eventscorer/data/")) { return $true }

    return $false
}

function Expand-ToProjectFiles([string]$RelativePath) {
    $results = New-Object System.Collections.Generic.List[string]
    $sourcePath = Join-Path $projectRoot ($RelativePath -replace "/", "\\")

    if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
        return $results
    }

    $files = Get-ChildItem -LiteralPath $sourcePath -File -Recurse -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if (-not $file.FullName.StartsWith($projectRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }

        $relativeFilePath = $file.FullName.Substring($projectRootFull.Length).TrimStart('\\') -replace "\\", "/"
        if (Test-ShouldSkipPath -RelativePath $relativeFilePath) {
            continue
        }

        $results.Add($relativeFilePath)
    }

    return $results
}

if (-not (Test-IsAdministrator)) {
    if (-not $PSCommandPath) {
        Write-Host "ERROR: Could not resolve script path for elevation." -ForegroundColor Red
        exit 1
    }

    Write-Host "[ADMIN] Relaunching deploy script as Administrator..." -ForegroundColor Yellow

    try {
        Start-ElevatedDeploy -ScriptPath $PSCommandPath -TargetNetworkPath $NetworkPath -UseTransferOnly $TransferOnly.IsPresent
        exit 0
    } catch {
        Write-Host "ERROR: Elevation failed or was cancelled." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ShareME Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Source:      $projectRoot"
Write-Host "Destination: $NetworkPath"
Write-Host "Timestamp:   $timestamp"
Write-Host "Mode:        Git changed files + essential checks"
Write-Host "========================================`n" -ForegroundColor Cyan

if ($TransferOnly) {
    Write-Host "[MODE] TransferOnly is now the default behavior." -ForegroundColor DarkGray
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

Write-Host "Discovering changed files from git..." -ForegroundColor Yellow

$changedPathSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$fileSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$nestedRepoRoots = @("screens/eventscorer", "screens/sharemeweb")
$repoSources = @(
    @{ Name = "root"; Path = $projectRoot; Prefix = "" },
    @{ Name = "eventscorer"; Path = (Join-Path $projectRoot "screens\eventscorer"); Prefix = "screens/eventscorer" },
    @{ Name = "sharemeweb"; Path = (Join-Path $projectRoot "screens\sharemeweb"); Prefix = "screens/sharemeweb" }
)

foreach ($repo in $repoSources) {
    if (-not (Test-Path -LiteralPath $repo.Path)) {
        continue
    }

    $repoChangedPaths = Get-GitChangedPaths -RepositoryPath $repo.Path -PathPrefix $repo.Prefix
    if ($repoChangedPaths.Count -gt 0) {
        Write-Host "  [GIT] $($repo.Name): $($repoChangedPaths.Count) changed path(s)"
    }

    foreach ($changedPath in $repoChangedPaths) {
        $normalized = ($changedPath -replace "\\", "/").TrimStart('/')

        # When root repo tracks nested git repos as a single path, do not expand recursively.
        if ($repo.Prefix -eq "" -and $nestedRepoRoots -contains $normalized) {
            continue
        }

        [void]$changedPathSet.Add($normalized)
    }
}

# Always check these key files (fast stat/hash check only), even if git-ignored.
$essentialPaths = @("server.js", "config.json", "package.json", "package-lock.json", ".env")
foreach ($essentialPath in $essentialPaths) {
    [void]$changedPathSet.Add($essentialPath)
}

$excludedCount = 0
$missingSourceCount = 0
$expandedDirectoryCount = 0

foreach ($candidatePath in $changedPathSet) {
    $normalized = ($candidatePath -replace "\\", "/").TrimStart('/')
    if (Test-ShouldSkipPath -RelativePath $normalized) {
        $excludedCount += 1
        continue
    }

    $sourcePath = Join-Path $projectRoot ($normalized -replace "/", "\\")
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        $missingSourceCount += 1
        continue
    }

    if (Test-Path -LiteralPath $sourcePath -PathType Container) {
        $expandedDirectoryCount += 1
        $expandedFiles = Expand-ToProjectFiles -RelativePath $normalized
        foreach ($expandedFile in $expandedFiles) {
            [void]$fileSet.Add($expandedFile)
        }
        continue
    }

    [void]$fileSet.Add($normalized)
}

$copiedCount = 0
$unchangedCount = 0
$failedCount = 0
$sortedFiles = @($fileSet | Sort-Object)

if ($sortedFiles.Count -eq 0) {
    Write-Host "No changed files detected to copy." -ForegroundColor DarkGray
} else {
    Write-Host "Copying $($sortedFiles.Count) file(s) to network..." -ForegroundColor Yellow

    foreach ($relativeFile in $sortedFiles) {
        $sourcePath = Join-Path $projectRoot ($relativeFile -replace "/", "\\")
        $destPath = Join-Path $NetworkPath ($relativeFile -replace "/", "\\")

        try {
            $copied = Copy-FileIfChanged -SourcePath $sourcePath -DestinationPath $destPath
            if ($copied) {
                $copiedCount += 1
                Write-Host "  [FILE] $relativeFile" -ForegroundColor Green
            } else {
                $unchangedCount += 1
            }
        } catch {
            $failedCount += 1
            Write-Host "  [FAIL] $relativeFile - $($_.Exception.Message)" -ForegroundColor Red
        }
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
if ($failedCount -gt 0) {
    Write-Host "  Deployment Complete (with errors)" -ForegroundColor Yellow
} else {
    Write-Host "  Deployment Complete!" -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:"
Write-Host "  Candidate changed paths: $($changedPathSet.Count)"
Write-Host "  Expanded directories:    $expandedDirectoryCount"
Write-Host "  Excluded paths:          $excludedCount"
Write-Host "  Missing sources:         $missingSourceCount"
Write-Host "  Copied files:            $copiedCount"
Write-Host "  Unchanged files:         $unchangedCount"
Write-Host "  Failed files:            $failedCount"
Write-Host "`nManual build steps on the server machine:"
Write-Host "  1. Open PowerShell as Administrator (if needed for permission)."
Write-Host "  2. cd `"$NetworkPath`""
Write-Host "  3. npm install --omit=dev"
Write-Host "  4. cd .\screens\sharemeweb"
Write-Host "  5. npm install --omit=dev"
Write-Host "  6. npm run build"
Write-Host "  7. cd ..\eventscorer"
Write-Host "  8. npm install --omit=dev"
Write-Host "  9. npm run build"
Write-Host "========================================`n" -ForegroundColor Cyan
