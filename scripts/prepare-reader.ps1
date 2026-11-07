$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $projectRoot 'tools'
$dependencies = Get-Content -LiteralPath (Join-Path $toolsDir 'DEPENDENCIES.json') -Raw | ConvertFrom-Json
foreach ($name in @('python', 'arkparser')) {
    $spec = $dependencies.$name
    $archive = Join-Path $toolsDir "$name.zip"
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $spec.archive -OutFile $archive }
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $spec.sha256) { throw "$name archive hash does not match DEPENDENCIES.json" }
    $target = if ($name -eq 'python') { Join-Path $toolsDir 'python' } else { Join-Path $toolsDir 'vendor' }
    Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
}
$sourceRoot = Join-Path (Join-Path $toolsDir 'vendor') "arkparser-$($dependencies.arkparser.commit)"
$packageRoot = Join-Path (Join-Path $toolsDir 'python') 'arkparser'
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
Copy-Item -Path (Join-Path $sourceRoot 'arkparser\*') -Destination $packageRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'LICENSE') -Destination (Join-Path $toolsDir 'arkparser-LICENSE') -Force
Write-Output 'Bundled reader is ready.'
