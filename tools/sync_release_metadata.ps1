param(
    [string]$Root = (Join-Path $PSScriptRoot "..")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$rootPath = [System.IO.Path]::GetFullPath($Root)
$versionPath = Join-Path $rootPath "version.json"

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
    return $text
}

if (-not (Test-Path -LiteralPath $versionPath)) {
    throw "version.json not found: $versionPath"
}

$versionInfo = Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json
$appId = Get-StringValue -Value $versionInfo.appId -Default "livelysam"
$version = Get-StringValue -Value $versionInfo.version
$releaseTag = Get-StringValue -Value $versionInfo.releaseTag
$defaultChannel = Get-StringValue -Value $versionInfo.defaultChannel -Default "stable"
$githubRepo = Get-StringValue -Value $versionInfo.githubRepo
$installerBaseName = Get-StringValue -Value $versionInfo.installerBaseName -Default "LivelySamSetup"

if ([string]::IsNullOrWhiteSpace($version)) {
    throw "version.json must contain a non-empty version."
}
if ([string]::IsNullOrWhiteSpace($releaseTag)) {
    $releaseTag = "v$version"
}
if ([string]::IsNullOrWhiteSpace($githubRepo)) {
    throw "version.json must contain githubRepo."
}

$installerFileName = "$installerBaseName-$version.exe"
$releaseNotesUrl = "https://github.com/$githubRepo/releases/tag/$releaseTag"
$downloadUrl = "https://github.com/$githubRepo/releases/download/$releaseTag/$installerFileName"

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

$jsVersionPath = Join-Path $rootPath "js\version.js"
$jsVersionContent = @"
(function (global) {
  'use strict';

  const versionInfo = Object.freeze({
    appId: '$appId',
    version: '$version',
    releaseTag: '$releaseTag',
    defaultChannel: '$defaultChannel',
    githubRepo: '$githubRepo',
    installerBaseName: '$installerBaseName',
    installerFileName: '$installerFileName'
  });

  global.LivelySamVersion = versionInfo;
  global.LivelySam = global.LivelySam || {};
  global.LivelySam.VERSION_INFO = versionInfo;
  global.LivelySam.VERSION = versionInfo.version;
}(window));
"@
Write-Utf8File -Path $jsVersionPath -Content $jsVersionContent

$issIncludePath = Join-Path $rootPath "release\installer\version.iss.inc"
$issIncludeContent = @"
#define MyAppVersion "$version"
#define MyReleaseTag "$releaseTag"
#define MyAppId "$appId"
#define MyDefaultChannel "$defaultChannel"
#define MyGithubRepo "$githubRepo"
#define MyInstallerBaseName "$installerBaseName"
#define MyInstallerOutputBaseName "$installerBaseName-$version"
"@
Write-Utf8File -Path $issIncludePath -Content $issIncludeContent

function New-ManifestPayload {
    param(
        [string]$Channel,
        [bool]$Prerelease
    )

    return [ordered]@{
        manifestVersion = 1
        appId = $appId
        channel = $Channel
        version = $version
        releaseTag = $releaseTag
        prerelease = $Prerelease
        publishedAt = ""
        releaseNotesUrl = $releaseNotesUrl
        installer = [ordered]@{
            fileName = $installerFileName
            downloadUrl = $downloadUrl
            sha256 = ""
        }
    }
}

$stableManifestPath = Join-Path $rootPath "release\updates\latest-stable.json"
$betaManifestPath = Join-Path $rootPath "release\updates\latest-beta.json"

Write-Utf8File -Path $stableManifestPath -Content ((New-ManifestPayload -Channel "stable" -Prerelease $false) | ConvertTo-Json -Depth 6)
Write-Utf8File -Path $betaManifestPath -Content ((New-ManifestPayload -Channel "beta" -Prerelease $true) | ConvertTo-Json -Depth 6)

[ordered]@{
    ok = $true
    version = $version
    releaseTag = $releaseTag
    installerFileName = $installerFileName
    generated = @(
        (Resolve-Path $jsVersionPath).Path,
        (Resolve-Path $issIncludePath).Path,
        (Resolve-Path $stableManifestPath).Path,
        (Resolve-Path $betaManifestPath).Path
    )
} | ConvertTo-Json -Depth 4
