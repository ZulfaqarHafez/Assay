param(
  [ValidateSet("api", "web", "all")]
  [string]$Target = "all",

  [switch]$Prod,
  [switch]$DryRun,
  [switch]$KeepStage,
  [switch]$Force,
  [switch]$AffectedOnly,
  [string]$Base = "",
  [string]$Head = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$branch = (& git -C $repoRoot branch --show-current).Trim()
$headRef = if ([string]::IsNullOrWhiteSpace($Head)) { "HEAD" } else { $Head }
$commitSha = (& git -C $repoRoot rev-parse $headRef).Trim()
$commitShort = (& git -C $repoRoot rev-parse --short $commitSha).Trim()
$timestamp = Get-Date -Format "yyyyMMddHHmmss"

$targetPaths = @{
  api = @("apps/api/")
  web = @("apps/web/", "package.json", "package-lock.json")
}

function Add-VercelTokenArg {
  param([string[]]$Args)

  if (![string]::IsNullOrWhiteSpace($env:VERCEL_TOKEN)) {
    return $Args + @("--token", $env:VERCEL_TOKEN)
  }
  return $Args
}

function Copy-StageItem {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRelativePath,

    [string]$DestinationRelativePath = $SourceRelativePath
  )

  $source = Join-Path $repoRoot $SourceRelativePath
  if (!(Test-Path -LiteralPath $source)) {
    throw "Missing deploy input: $SourceRelativePath"
  }

  $destination = Join-Path $script:stageRoot $DestinationRelativePath
  $parent = Split-Path -Parent $destination
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

function Remove-StagePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $path = Join-Path $script:stageRoot $RelativePath
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
}

function Remove-StageMatches {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootRelativePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Include
  )

  $root = Join-Path $script:stageRoot $RootRelativePath
  if (!(Test-Path -LiteralPath $root)) {
    return
  }

  $matches = foreach ($entry in Get-ChildItem -LiteralPath $root -Recurse -Force) {
    foreach ($pattern in $Include) {
      if ($entry.Name -like $pattern) {
        $entry
        break
      }
    }
  }

  $matches | Sort-Object FullName -Descending | Remove-Item -Recurse -Force
}

function Get-EnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $item = Get-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
  if ($item -and ![string]::IsNullOrWhiteSpace($item.Value)) {
    return $item.Value
  }
  return ""
}

function Get-ProjectLink {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web")]
    [string]$Name
  )

  $projectPath = Get-TargetProjectPath -Name $Name
  $localProject = Join-Path $projectPath ".vercel/project.json"
  if (Test-Path -LiteralPath $localProject) {
    return Get-Content -Raw -LiteralPath $localProject | ConvertFrom-Json
  }

  $suffix = $Name.ToUpperInvariant()
  $projectId = Get-EnvValue "VERCEL_PROJECT_ID_$suffix"
  if ([string]::IsNullOrWhiteSpace($projectId)) {
    $projectId = Get-EnvValue "VERCEL_${suffix}_PROJECT_ID"
  }
  if ([string]::IsNullOrWhiteSpace($projectId) -and $Name -eq $Target) {
    $projectId = Get-EnvValue "VERCEL_PROJECT_ID"
  }
  $orgId = Get-EnvValue "VERCEL_ORG_ID"

  if ([string]::IsNullOrWhiteSpace($projectId) -or [string]::IsNullOrWhiteSpace($orgId)) {
    throw "Missing Vercel project link for $Name. Run 'npx vercel link' in apps/$Name or set VERCEL_ORG_ID and VERCEL_PROJECT_ID_$suffix."
  }

  [pscustomobject]@{
    projectId = $projectId
    orgId = $orgId
    projectName = if ($Name -eq "api") { "assay-api" } else { "assay" }
  }
}

function Write-ProjectLinkToStage {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web")]
    [string]$Name
  )

  $link = Get-ProjectLink -Name $Name
  $vercelDir = Join-Path $script:stageRoot ".vercel"
  New-Item -ItemType Directory -Force -Path $vercelDir | Out-Null
  $json = $link | ConvertTo-Json -Compress
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText((Join-Path $vercelDir "project.json"), $json, $encoding)
}

function Get-ChangedPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseRef,
    [Parameter(Mandatory = $true)]
    [string]$HeadRef
  )

  $output = (& git -C $repoRoot diff --name-only $BaseRef $HeadRef --) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw "git diff failed while detecting affected deploy targets"
  }
  return $output -split "`r?`n" | Where-Object { $_ } | ForEach-Object { $_.Replace("\", "/") }
}

function Test-PathAffectsTarget {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web")]
    [string]$Name
  )

  foreach ($affectedPath in $targetPaths[$Name]) {
    if ($affectedPath.EndsWith("/") -and $Path.StartsWith($affectedPath)) {
      return $true
    }
    if ($Path -eq $affectedPath) {
      return $true
    }
  }
  return $false
}

function Get-AffectedTargets {
  param([string[]]$Targets)

  if (!$AffectedOnly) {
    return $Targets
  }

  $baseRef = $Base
  if ([string]::IsNullOrWhiteSpace($baseRef)) {
    $baseRef = Get-EnvValue "VERCEL_GIT_PREVIOUS_SHA"
  }
  if ([string]::IsNullOrWhiteSpace($baseRef)) {
    $baseRef = "$commitSha^"
  }
  $head = $commitSha

  try {
    $changed = @(Get-ChangedPaths -BaseRef $baseRef -HeadRef $head)
  } catch {
    Write-Warning "$($_.Exception.Message); deploying requested targets."
    return $Targets
  }

  $affected = @()
  foreach ($item in $Targets) {
    $targetChanges = @($changed | Where-Object { Test-PathAffectsTarget -Path $_ -Name $item })
    if ($targetChanges.Count -gt 0) {
      $affected += $item
    }
  }

  if ($affected.Count -eq 0) {
    Write-Host "No deployable target changed between $baseRef and $head."
  } else {
    Write-Host "Affected deploy targets: $($affected -join ', ')"
  }
  return $affected
}

function New-ApiStage {
  $script:stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "assay-api-vercel-$timestamp"
  New-Item -ItemType Directory -Force -Path $script:stageRoot | Out-Null

  Write-ProjectLinkToStage -Name "api"
  Copy-StageItem "apps/api/.vercelignore"
  Copy-StageItem "apps/api/api"
  Copy-StageItem "apps/api/assay_api"
  Copy-StageItem "apps/api/pyproject.toml"
  Copy-StageItem "apps/api/requirements.txt"
  Copy-StageItem "apps/api/vercel.json"

  Remove-StageMatches "apps/api" @("__pycache__", "*.pyc", "*.pyo")

  return $script:stageRoot
}

function New-WebStage {
  $script:stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "assay-web-vercel-$timestamp"
  New-Item -ItemType Directory -Force -Path $script:stageRoot | Out-Null

  Write-ProjectLinkToStage -Name "web"
  Copy-StageItem "package.json"
  Copy-StageItem "package-lock.json"
  Copy-StageItem "apps/web/public"
  Copy-StageItem "apps/web/src"

  @(
    "eslint.config.mjs",
    "next-env.d.ts",
    "next.config.ts",
    "package.json",
    "postcss.config.mjs",
    "tailwind.config.ts",
    "tsconfig.json",
    "vercel.json"
  ) | ForEach-Object {
    Copy-StageItem "apps/web/$_"
  }

  Remove-StagePath "apps/web/src/e2e"
  Remove-StagePath "apps/web/src/test"
  Remove-StageMatches "apps/web/src" @("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")

  return $script:stageRoot
}

function Get-TargetProjectPath {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web")]
    [string]$Name
  )

  if ($Name -eq "api") {
    return (Join-Path $repoRoot "apps/api")
  }
  return (Join-Path $repoRoot "apps/web")
}

function Get-ExistingDeploymentForCommit {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web")]
    [string]$Name
  )

  $projectPath = Get-TargetProjectPath -Name $Name
  $args = @(
    "vercel",
    "ls",
    "--cwd",
    $projectPath,
    "--status",
    "READY",
    "--format",
    "json",
    "--yes"
  )

  if ($Prod) {
    $args += @("--environment", "production")
  }
  $args = Add-VercelTokenArg -Args $args

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $raw = (& npx @args 2>$null) -join "`n"
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    Write-Warning "Could not check existing Vercel deployments for ${Name}; vercel ls exited with $exitCode."
    return $null
  }

  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  $jsonLineIndex = -1
  $lines = @($raw -split "`r?`n")
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].TrimStart()
    if ($line.StartsWith("{") -or $line.StartsWith("[")) {
      $jsonLineIndex = $i
      break
    }
  }

  if ($jsonLineIndex -lt 0) {
    return $null
  }

  $json = ($lines[$jsonLineIndex..($lines.Count - 1)] -join "`n")

  try {
    $result = $json | ConvertFrom-Json
  } catch {
    Write-Warning "Could not parse Vercel deployment list for ${Name}; continuing with deploy."
    return $null
  }

  $deployments = if ($result -is [array]) {
    @($result)
  } elseif ($result.PSObject.Properties.Name -contains "deployments") {
    @($result.deployments)
  } else {
    @()
  }

  foreach ($deployment in $deployments) {
    $sha = [string]$deployment.meta.githubCommitSha
    if ($sha -eq $commitSha -or $sha -eq $commitShort) {
      return $deployment
    }
  }

  return $null
}

function Use-ExistingDeployment {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("api", "web")]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    $Deployment
  )

  $url = [string]$Deployment.url
  if ([string]::IsNullOrWhiteSpace($url)) {
    return $false
  }

  Write-Host "Deploy target: $Name"
  Write-Host "Commit: $commitShort ($branch)"
  Write-Host "Found existing READY deployment for this commit: https://$url"

  if ($DryRun) {
    Write-Host "Dry run: would reuse existing deployment instead of uploading a new one."
    return $true
  }

  if ($Prod) {
    $projectPath = Get-TargetProjectPath -Name $Name
    Write-Host "Promoting existing deployment to production aliases."
    $args = @("vercel", "promote", $url, "--cwd", $projectPath, "--yes")
    $args = Add-VercelTokenArg -Args $args
    & npx @args
    if ($LASTEXITCODE -ne 0) {
      throw "Vercel promote failed for $Name with exit code $LASTEXITCODE"
    }
  }

  return $true
}

function Invoke-VercelDeploy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$StagePath
  )

  $args = @(
    "vercel",
    "deploy",
    ".",
    "--yes",
    "--meta",
    "githubCommitSha=$commitSha",
    "--meta",
    "githubCommitRef=$branch"
  )

  if ($Prod) {
    $args += "--prod"
  }
  $args = Add-VercelTokenArg -Args $args

  Write-Host "Deploy target: $Name"
  Write-Host "Commit: $commitShort ($branch)"
  Write-Host "Stage: $StagePath"

  if ($DryRun) {
    Write-Host "Dry run: would run Vercel deploy for $Name."
    return
  }

  Push-Location $StagePath
  try {
    & npx @args
    if ($LASTEXITCODE -ne 0) {
      throw "Vercel deploy failed for $Name with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$requestedTargets = if ($Target -eq "all") { @("api", "web") } else { @($Target) }
$targets = @(Get-AffectedTargets -Targets $requestedTargets)

foreach ($item in $targets) {
  $stage = $null
  try {
    if (!$Force) {
      $existing = Get-ExistingDeploymentForCommit -Name $item
      if ($existing -and (Use-ExistingDeployment -Name $item -Deployment $existing)) {
        continue
      }
    }

    $stage = if ($item -eq "api") { New-ApiStage } else { New-WebStage }
    Invoke-VercelDeploy -Name $item -StagePath $stage
  } finally {
    if ($stage -and !$KeepStage) {
      Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
