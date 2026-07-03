param(
  [ValidateSet("api", "web", "all")]
  [string]$Target = "all",

  [switch]$Prod,
  [switch]$DryRun,
  [switch]$KeepStage
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$branch = (& git -C $repoRoot branch --show-current).Trim()
$commitSha = (& git -C $repoRoot rev-parse HEAD).Trim()
$commitShort = (& git -C $repoRoot rev-parse --short HEAD).Trim()
$timestamp = Get-Date -Format "yyyyMMddHHmmss"

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

function New-ApiStage {
  $script:stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "assay-api-vercel-$timestamp"
  New-Item -ItemType Directory -Force -Path $script:stageRoot | Out-Null

  Copy-StageItem "apps/api/.vercel" ".vercel"
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

  Copy-StageItem "apps/web/.vercel" ".vercel"
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
    "tsconfig.json"
  ) | ForEach-Object {
    Copy-StageItem "apps/web/$_"
  }

  Remove-StagePath "apps/web/src/e2e"
  Remove-StagePath "apps/web/src/test"
  Remove-StageMatches "apps/web/src" @("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")

  return $script:stageRoot
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
  if ($DryRun) {
    $args += "--dry"
  }

  Write-Host "Deploy target: $Name"
  Write-Host "Commit: $commitShort ($branch)"
  Write-Host "Stage: $StagePath"

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

$targets = if ($Target -eq "all") { @("api", "web") } else { @($Target) }

foreach ($item in $targets) {
  $stage = $null
  try {
    $stage = if ($item -eq "api") { New-ApiStage } else { New-WebStage }
    Invoke-VercelDeploy -Name $item -StagePath $stage
  } finally {
    if ($stage -and !$KeepStage) {
      Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
