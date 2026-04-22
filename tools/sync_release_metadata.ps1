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
$proxyBaseUrl = Get-StringValue -Value $versionInfo.proxyBaseUrl

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

function Read-ManifestState {
    param(
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return $null
    }
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

$proxyBaseUrlJs = $proxyBaseUrl.Replace('\', '\\').Replace("'", "\'")
$jsPublicRuntimeConfigPath = Join-Path $rootPath "js\public-runtime-config.js"
$jsPublicRuntimeConfigContent = @"
(function () {
  'use strict';

  window.LivelySamPublicConfig = window.LivelySamPublicConfig || {};
  window.LivelySamPublicConfig.dataServices = window.LivelySamPublicConfig.dataServices || {};

  const configuredProxyBaseUrl = typeof window.LivelySamPublicConfig.dataServices.proxyBaseUrl === 'string'
    ? window.LivelySamPublicConfig.dataServices.proxyBaseUrl.trim()
    : '';
  const defaultProxyBaseUrl = '$proxyBaseUrlJs';

  // NEIS and default weather requests share the same public data proxy URL.
  window.LivelySamPublicConfig.dataServices.proxyBaseUrl = configuredProxyBaseUrl || defaultProxyBaseUrl;
})();
"@
Write-Utf8File -Path $jsPublicRuntimeConfigPath -Content $jsPublicRuntimeConfigContent

$indexHtmlPath = Join-Path $rootPath "index.html"
$indexHtmlContent = Get-Content -LiteralPath $indexHtmlPath -Raw -Encoding UTF8
$assetVersion = $version
$assetRelativePaths = @(
    'js/public-runtime-config.js',
    'js/api/data-service.js',
    'js/api/neis.js',
    'js/api/openweather.js',
    'js/version.js',
    'js/app.js'
)
foreach ($assetRelativePath in $assetRelativePaths) {
    $escapedRelativePath = [Regex]::Escape($assetRelativePath)
    $pattern = "(<script\s+src=""$escapedRelativePath\?v=)[^""]+(""[^>]*></script>)"
    $replacement = '${1}' + $assetVersion + '${2}'
    $indexHtmlContent = [Regex]::Replace($indexHtmlContent, $pattern, $replacement)
}
Write-Utf8File -Path $indexHtmlPath -Content $indexHtmlContent

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
        [bool]$Prerelease,
        [object]$ExistingManifest = $null
    )

    $preservedPublishedAt = ""
    $preservedSha256 = ""

    if (
        $ExistingManifest `
        -and (Get-StringValue -Value $ExistingManifest.version) -eq $version `
        -and (Get-StringValue -Value $ExistingManifest.releaseTag) -eq $releaseTag `
        -and (Get-StringValue -Value $ExistingManifest.installer.fileName) -eq $installerFileName
    ) {
        $preservedPublishedAt = Get-StringValue -Value $ExistingManifest.publishedAt
        $preservedSha256 = Get-StringValue -Value $ExistingManifest.installer.sha256
    }

    return [ordered]@{
        manifestVersion = 1
        appId = $appId
        channel = $Channel
        version = $version
        releaseTag = $releaseTag
        prerelease = $Prerelease
        publishedAt = $preservedPublishedAt
        releaseNotesUrl = $releaseNotesUrl
        installer = [ordered]@{
            fileName = $installerFileName
            downloadUrl = $downloadUrl
            sha256 = $preservedSha256
        }
    }
}

$stableManifestPath = Join-Path $rootPath "release\updates\latest-stable.json"
$betaManifestPath = Join-Path $rootPath "release\updates\latest-beta.json"

$existingStableManifest = Read-ManifestState -Path $stableManifestPath
$existingBetaManifest = Read-ManifestState -Path $betaManifestPath

Write-Utf8File -Path $stableManifestPath -Content ((New-ManifestPayload -Channel "stable" -Prerelease $false -ExistingManifest $existingStableManifest) | ConvertTo-Json -Depth 6)
Write-Utf8File -Path $betaManifestPath -Content ((New-ManifestPayload -Channel "beta" -Prerelease $true -ExistingManifest $existingBetaManifest) | ConvertTo-Json -Depth 6)

[ordered]@{
    ok = $true
    version = $version
    releaseTag = $releaseTag
    installerFileName = $installerFileName
    generated = @(
        (Resolve-Path $jsVersionPath).Path,
        (Resolve-Path $jsPublicRuntimeConfigPath).Path,
        (Resolve-Path $indexHtmlPath).Path,
        (Resolve-Path $issIncludePath).Path,
        (Resolve-Path $stableManifestPath).Path,
        (Resolve-Path $betaManifestPath).Path
    )
} | ConvertTo-Json -Depth 4
