$ErrorActionPreference = "Stop"

# API dependencies (includes the MCP SDK and the TraceRazor package from PyPI).
python -m pip install -r apps/api/requirements-dev.txt

# Prefer a local TraceRazor checkout when one exists: TRACERAZOR_REPO, else a
# TraceRazor/ folder next to this repository. Otherwise the PyPI package above
# is used. Assay also imports from TRACERAZOR_REPO at runtime when set.
$repoRoot = Split-Path -Parent $PSScriptRoot
$traceRazorPath = $env:TRACERAZOR_REPO
if (-not $traceRazorPath) {
  foreach ($name in @("TraceRazor", "tracerazor")) {
    $candidate = Join-Path (Split-Path -Parent $repoRoot) $name
    if (Test-Path (Join-Path $candidate "pyproject.toml")) { $traceRazorPath = $candidate; break }
  }
}
if ($traceRazorPath -and (Test-Path $traceRazorPath)) {
  python -m pip install -e $traceRazorPath
} else {
  Write-Host "No local TraceRazor checkout found; using the PyPI package."
}

npm install

if (-not $env:OPENAI_API_KEY) {
  Write-Warning "OPENAI_API_KEY is not set. Lint works without it, but the guardrail exam needs a model key (set it in the environment or a root .env)."
}
