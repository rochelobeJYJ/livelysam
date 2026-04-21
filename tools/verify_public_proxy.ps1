param(
    [string]$Root = (Join-Path $PSScriptRoot ".."),
    [string]$SchoolName = "",
    [double]$WeatherLat = 37.5665,
    [double]$WeatherLon = 126.9780,
    [switch]$SkipSchoolSearch,
    [switch]$SkipWeatherBundle
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$rootPath = [System.IO.Path]::GetFullPath($Root)
$pythonCandidates = @(
    (Join-Path $rootPath "venv\Scripts\python.exe"),
    "python"
)
$pythonPath = $pythonCandidates | Where-Object {
    if ($_ -eq "python") {
        return $true
    }
    Test-Path -LiteralPath $_
} | Select-Object -First 1

if (-not $pythonPath) {
    throw "Python runtime was not found."
}

$scriptPath = Join-Path $rootPath "tools\verify_public_proxy.py"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "verify_public_proxy.py not found: $scriptPath"
}

$args = @(
    $scriptPath,
    "--root", $rootPath,
    "--weather-lat", ([string]$WeatherLat),
    "--weather-lon", ([string]$WeatherLon)
)
if (-not [string]::IsNullOrWhiteSpace($SchoolName)) {
    $args += @("--school-name", $SchoolName)
}
if ($SkipSchoolSearch) {
    $args += "--skip-school-search"
}
if ($SkipWeatherBundle) {
    $args += "--skip-weather-bundle"
}

& $pythonPath @args
exit $LASTEXITCODE
