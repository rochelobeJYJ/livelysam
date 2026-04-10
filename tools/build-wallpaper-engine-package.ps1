$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$target = Join-Path $workspace "dist\wallpaper-engine\LivelySam"
$resolvedWorkspace = (Resolve-Path $workspace).Path

if (Test-Path $target) {
  $resolvedTarget = (Resolve-Path $target).Path
  if (-not $resolvedTarget.StartsWith($resolvedWorkspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean target outside workspace: $resolvedTarget"
  }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $workspace "index.html") -Destination $target
Copy-Item -LiteralPath (Join-Path $workspace "README.md") -Destination $target
Copy-Item -LiteralPath (Join-Path $workspace "WALLPAPER_ENGINE_SETUP.md") -Destination $target
Copy-Item -LiteralPath (Join-Path $workspace "css") -Destination $target -Recurse
Copy-Item -LiteralPath (Join-Path $workspace "js") -Destination $target -Recurse

Write-Output "Wallpaper Engine package created at:"
Write-Output $target
