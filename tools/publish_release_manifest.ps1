param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("stable", "beta")]
    [string]$Channel,

    [string]$Root = (Join-Path $PSScriptRoot ".."),
    [string]$InstallerPath = "",
    [string]$Version = "",
    [string]$ReleaseTag = "",
    [string]$PublishedAt = "",
    [string]$DownloadUrl = "",
    [string]$ReleaseNotesUrl = "",
    [string]$Sha256 = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$rootPath = [System.IO.Path]::GetFullPath($Root)
$versionPath = Join-Path $rootPath "version.json"
$manifestPath = Join-Path $rootPath "release\updates\latest-$Channel.json"

function Get-StringValue {
    param(
        [object]$Value,
        [string]$Default = ""
    )

    if ($null -eq $Value) {
        return $Default
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $Default
    }
    return $text.Trim()
}

function Write-Utf8File {
    param(
        [string]$Path,
        [string]$Content
    )

    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $versionPath)) {
    throw "version.json not found: $versionPath"
}

$versionInfo = Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json
$githubRepo = Get-StringValue -Value $versionInfo.githubRepo
$installerBaseName = Get-StringValue -Value $versionInfo.installerBaseName -Default "LivelySamSetup"
$resolvedVersion = Get-StringValue -Value $Version -Default (Get-StringValue -Value $versionInfo.version)
$resolvedReleaseTag = Get-StringValue -Value $ReleaseTag -Default (Get-StringValue -Value $versionInfo.releaseTag -Default ("v" + $resolvedVersion))
$resolvedPublishedAt = Get-StringValue -Value $PublishedAt -Default ([DateTime]::UtcNow.ToString("o"))

if ([string]::IsNullOrWhiteSpace($githubRepo)) {
    throw "version.json must contain githubRepo."
}
if ([string]::IsNullOrWhiteSpace($resolvedVersion)) {
    throw "version.json must contain version."
}

$resolvedInstallerPath = Get-StringValue -Value $InstallerPath
if ([string]::IsNullOrWhiteSpace($resolvedInstallerPath)) {
    $resolvedInstallerPath = Join-Path $rootPath ("dist\installer\" + $installerBaseName + "-" + $resolvedVersion + ".exe")
}

$installerFileName = [System.IO.Path]::GetFileName($resolvedInstallerPath)
if ([string]::IsNullOrWhiteSpace($installerFileName)) {
    $installerFileName = "$installerBaseName-$resolvedVersion.exe"
}

$resolvedDownloadUrl = Get-StringValue -Value $DownloadUrl -Default ("https://github.com/$githubRepo/releases/download/$resolvedReleaseTag/$installerFileName")
$resolvedReleaseNotesUrl = Get-StringValue -Value $ReleaseNotesUrl -Default ("https://github.com/$githubRepo/releases/tag/$resolvedReleaseTag")
$resolvedSha256 = Get-StringValue -Value $Sha256
$installerExists = Test-Path -LiteralPath $resolvedInstallerPath

if ([string]::IsNullOrWhiteSpace($resolvedSha256) -and $installerExists) {
    $resolvedSha256 = (Get-FileHash -LiteralPath $resolvedInstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
if (-not $installerExists -and [string]::IsNullOrWhiteSpace($resolvedSha256)) {
    throw "Installer not found: $resolvedInstallerPath. Build the installer first or pass -Sha256 explicitly."
}

$payload = [ordered]@{
    manifestVersion = 1
    appId = Get-StringValue -Value $versionInfo.appId -Default "livelysam"
    channel = $Channel
    version = $resolvedVersion
    releaseTag = $resolvedReleaseTag
    prerelease = ($Channel -eq "beta")
    publishedAt = $resolvedPublishedAt
    releaseNotesUrl = $resolvedReleaseNotesUrl
    installer = [ordered]@{
        fileName = $installerFileName
        downloadUrl = $resolvedDownloadUrl
        sha256 = $resolvedSha256
    }
}

Write-Utf8File -Path $manifestPath -Content ($payload | ConvertTo-Json -Depth 6)

[ordered]@{
    ok = $true
    channel = $Channel
    manifestPath = $manifestPath
    version = $resolvedVersion
    releaseTag = $resolvedReleaseTag
    installerFileName = $installerFileName
    installerPath = $resolvedInstallerPath
    sha256 = $resolvedSha256
} | ConvertTo-Json -Depth 4
