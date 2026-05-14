param(
    [string]$Message = "",
    [switch]$NoCommit,
    [switch]$DryRun
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "chore: sync workspace changes ($timestamp)"
}

$repos = @(
    @{ Name = "ShareME"; Path = $projectRoot },
    @{ Name = "EventScorer"; Path = (Join-Path $projectRoot "screens\eventscorer") }
)

function Invoke-GitChecked([string]$RepoPath, [string[]]$GitArgs) {
    & git -C $RepoPath @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed in $RepoPath"
    }
}

function Is-GitRepo([string]$RepoPath) {
    & git -C $RepoPath rev-parse --is-inside-work-tree *> $null
    return $LASTEXITCODE -eq 0
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Push All Repositories" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Root:      $projectRoot"
Write-Host "Timestamp: $timestamp"
Write-Host "Dry Run:   $($DryRun.IsPresent)"
Write-Host "NoCommit:  $($NoCommit.IsPresent)"
Write-Host "Message:   $Message"
Write-Host "========================================`n" -ForegroundColor Cyan

$summary = New-Object System.Collections.Generic.List[object]
$hadFailures = $false

foreach ($repo in $repos) {
    $name = $repo.Name
    $path = $repo.Path

    Write-Host "[$name] $path" -ForegroundColor Yellow

    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host "  [SKIP] Path not found" -ForegroundColor DarkGray
        $summary.Add([PSCustomObject]@{ Repo = $name; Status = "skipped"; Details = "Path not found" }) | Out-Null
        continue
    }

    if (-not (Is-GitRepo -RepoPath $path)) {
        Write-Host "  [SKIP] Not a git repository" -ForegroundColor DarkGray
        $summary.Add([PSCustomObject]@{ Repo = $name; Status = "skipped"; Details = "Not a git repository" }) | Out-Null
        continue
    }

    try {
        $branch = (& git -C $path rev-parse --abbrev-ref HEAD).Trim()
        $origin = (& git -C $path remote get-url origin 2>$null).Trim()
        $statusLines = @(& git -c core.quotepath=false -C $path status --porcelain)
        $hasWorkingChanges = $statusLines.Count -gt 0

        Write-Host "  Branch: $branch"
        if ($origin) {
            Write-Host "  Origin: $origin"
        }

        $committed = $false

        if ($hasWorkingChanges -and -not $NoCommit) {
            if ($DryRun) {
                Write-Host "  [DRY-RUN] git add -A" -ForegroundColor Cyan
                Write-Host "  [DRY-RUN] git commit -m \"$Message\"" -ForegroundColor Cyan
                $committed = $true
            } else {
                Invoke-GitChecked -RepoPath $path -GitArgs @("add", "-A")
                & git -C $path diff --cached --quiet

                if ($LASTEXITCODE -ne 0) {
                    Invoke-GitChecked -RepoPath $path -GitArgs @("commit", "-m", $Message)
                    $committed = $true
                    Write-Host "  [OK] Committed changes" -ForegroundColor Green
                } else {
                    Write-Host "  [SKIP] Nothing staged to commit" -ForegroundColor DarkGray
                }
            }
        } elseif ($hasWorkingChanges -and $NoCommit) {
            Write-Host "  [INFO] Working changes detected but commit is disabled" -ForegroundColor DarkGray
        } else {
            Write-Host "  [INFO] Working tree clean" -ForegroundColor DarkGray
        }

        if ($DryRun) {
            Write-Host "  [DRY-RUN] git push origin $branch" -ForegroundColor Cyan
            $summary.Add([PSCustomObject]@{ Repo = $name; Status = "dry-run"; Details = "Would push branch $branch" }) | Out-Null
            continue
        }

        $upstream = (& git -C $path rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null).Trim()
        if ($upstream) {
            Invoke-GitChecked -RepoPath $path -GitArgs @("push", "origin", $branch)
        } else {
            Invoke-GitChecked -RepoPath $path -GitArgs @("push", "-u", "origin", $branch)
        }

        $details = if ($committed) { "Committed and pushed $branch" } else { "Pushed $branch" }
        Write-Host "  [OK] $details" -ForegroundColor Green
        $summary.Add([PSCustomObject]@{ Repo = $name; Status = "ok"; Details = $details }) | Out-Null
    } catch {
        $hadFailures = $true
        Write-Host "  [FAIL] $($_.Exception.Message)" -ForegroundColor Red
        $summary.Add([PSCustomObject]@{ Repo = $name; Status = "failed"; Details = $_.Exception.Message }) | Out-Null
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Push Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
foreach ($item in $summary) {
    Write-Host "  [$($item.Status.ToUpper())] $($item.Repo): $($item.Details)"
}
Write-Host "========================================`n" -ForegroundColor Cyan

if ($hadFailures) {
    exit 1
}

exit 0