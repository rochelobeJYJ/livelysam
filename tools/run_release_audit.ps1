param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$results = New-Object System.Collections.Generic.List[object]
$failed = $false

function Add-CheckResult {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Detail,
    [string]$Path = ''
  )

  $script:results.Add([ordered]@{
    name = $Name
    passed = $Passed
    detail = $Detail
    path = $Path
  }) | Out-Null

  if (-not $Passed) {
    $script:failed = $true
  }
}

function Get-FullPath {
  param([string]$RelativePath)
  return Join-Path $root $RelativePath
}

function Assert-FileExists {
  param([string]$RelativePath)

  $fullPath = Get-FullPath $RelativePath
  if (Test-Path -LiteralPath $fullPath) {
    Add-CheckResult -Name "file:$RelativePath" -Passed $true -Detail 'File exists.' -Path $fullPath
  } else {
    Add-CheckResult -Name "file:$RelativePath" -Passed $false -Detail 'Required file is missing.' -Path $fullPath
  }
}

function Read-JsonRelative {
  param([string]$RelativePath)

  $fullPath = Get-FullPath $RelativePath
  return Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-StringValue {
  param(
    [object]$Value,
    [string]$Default = ''
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

function Assert-JsonFile {
  param([string]$RelativePath)

  $fullPath = Get-FullPath $RelativePath
  try {
    Read-JsonRelative -RelativePath $RelativePath | Out-Null
    Add-CheckResult -Name "json:$RelativePath" -Passed $true -Detail 'JSON parsed successfully.' -Path $fullPath
  } catch {
    Add-CheckResult -Name "json:$RelativePath" -Passed $false -Detail $_.Exception.Message -Path $fullPath
  }
}

function Assert-TextContains {
  param(
    [string]$RelativePath,
    [string]$Pattern,
    [string]$Name
  )

  $fullPath = Get-FullPath $RelativePath
  try {
    $content = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8
    $matched = $content.Contains($Pattern)
    if ($matched) {
      Add-CheckResult -Name $Name -Passed $true -Detail 'Pattern found.' -Path $fullPath
    } else {
      Add-CheckResult -Name $Name -Passed $false -Detail "Pattern not found: $Pattern" -Path $fullPath
    }
  } catch {
    Add-CheckResult -Name $Name -Passed $false -Detail $_.Exception.Message -Path $fullPath
  }
}

function Assert-TextOrder {
  param(
    [string]$RelativePath,
    [string]$FirstPattern,
    [string]$SecondPattern,
    [string]$Name
  )

  $fullPath = Get-FullPath $RelativePath
  try {
    $content = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8
    $firstIndex = $content.IndexOf($FirstPattern)
    $secondIndex = $content.IndexOf($SecondPattern)
    if ($firstIndex -lt 0) {
      Add-CheckResult -Name $Name -Passed $false -Detail "Pattern not found: $FirstPattern" -Path $fullPath
    } elseif ($secondIndex -lt 0) {
      Add-CheckResult -Name $Name -Passed $false -Detail "Pattern not found: $SecondPattern" -Path $fullPath
    } elseif ($firstIndex -lt $secondIndex) {
      Add-CheckResult -Name $Name -Passed $true -Detail 'Pattern order is correct.' -Path $fullPath
    } else {
      Add-CheckResult -Name $Name -Passed $false -Detail "Expected '$FirstPattern' before '$SecondPattern'." -Path $fullPath
    }
  } catch {
    Add-CheckResult -Name $Name -Passed $false -Detail $_.Exception.Message -Path $fullPath
  }
}

function Assert-JsonValue {
  param(
    [string]$RelativePath,
    [string]$Name,
    [object]$Actual,
    [object]$Expected
  )

  $fullPath = Get-FullPath $RelativePath
  if ([string]$Actual -eq [string]$Expected) {
    Add-CheckResult -Name $Name -Passed $true -Detail "Value matches: $Expected" -Path $fullPath
  } else {
    Add-CheckResult -Name $Name -Passed $false -Detail "Expected '$Expected' but found '$Actual'" -Path $fullPath
  }
}

function Assert-JsonNotBlank {
  param(
    [string]$RelativePath,
    [string]$Name,
    [object]$Actual
  )

  $fullPath = Get-FullPath $RelativePath
  if ([string]::IsNullOrWhiteSpace([string]$Actual)) {
    Add-CheckResult -Name $Name -Passed $false -Detail 'Value is blank.' -Path $fullPath
  } else {
    Add-CheckResult -Name $Name -Passed $true -Detail "Value present: $Actual" -Path $fullPath
  }
}

function Assert-NodeSyntax {
  param([string]$FilePath)

  $output = & node --check $FilePath 2>&1
  $passed = ($LASTEXITCODE -eq 0)
  if ($passed) {
    Add-CheckResult -Name "js:$([IO.Path]::GetFileName($FilePath))" -Passed $true -Detail 'Syntax OK.' -Path $FilePath
  } else {
    Add-CheckResult -Name "js:$([IO.Path]::GetFileName($FilePath))" -Passed $false -Detail (($output | Out-String).Trim()) -Path $FilePath
  }
}

function Assert-PythonCompile {
  param(
    [string]$PythonExe,
    [string[]]$FilePaths
  )

  if (-not (Test-Path -LiteralPath $PythonExe)) {
    Add-CheckResult -Name 'python:venv' -Passed $false -Detail 'venv Python executable not found.' -Path $PythonExe
    return
  }

  $output = & $PythonExe -m py_compile @FilePaths 2>&1
  $passed = ($LASTEXITCODE -eq 0)
  if ($passed) {
    Add-CheckResult -Name 'python:tools' -Passed $true -Detail 'Python compile OK.' -Path (Join-Path $root 'tools')
  } else {
    Add-CheckResult -Name 'python:tools' -Passed $false -Detail (($output | Out-String).Trim()) -Path (Join-Path $root 'tools')
  }
}

function Invoke-ReleaseMetadataSync {
  $syncScript = Get-FullPath 'tools\sync_release_metadata.ps1'
  $manifestRelativePaths = @(
    'release\updates\latest-stable.json',
    'release\updates\latest-beta.json'
  )
  if (-not (Test-Path -LiteralPath $syncScript)) {
    Add-CheckResult -Name 'release:sync-script' -Passed $false -Detail 'sync_release_metadata.ps1 is missing.' -Path $syncScript
    return
  }

  $manifestSnapshots = @{}
  foreach ($relativePath in $manifestRelativePaths) {
    $fullPath = Get-FullPath $relativePath
    if (Test-Path -LiteralPath $fullPath) {
      $manifestSnapshots[$fullPath] = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8
    } else {
      $manifestSnapshots[$fullPath] = $null
    }
  }

  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Root $root | Out-Null
    Add-CheckResult -Name 'release:sync' -Passed $true -Detail 'Release metadata generated successfully.' -Path $syncScript
  } catch {
    Add-CheckResult -Name 'release:sync' -Passed $false -Detail $_.Exception.Message -Path $syncScript
  } finally {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    foreach ($relativePath in $manifestRelativePaths) {
      $fullPath = Get-FullPath $relativePath
      $original = $manifestSnapshots[$fullPath]
      if ($null -eq $original) {
        if (Test-Path -LiteralPath $fullPath) {
          Remove-Item -LiteralPath $fullPath -Force
        }
      } else {
        [System.IO.File]::WriteAllText($fullPath, $original, $utf8NoBom)
      }
    }
  }
}

function Assert-VersionMetadata {
  $versionPath = 'version.json'
  try {
    $versionInfo = Read-JsonRelative -RelativePath $versionPath
  } catch {
    Add-CheckResult -Name 'version:source' -Passed $false -Detail $_.Exception.Message -Path (Get-FullPath $versionPath)
    return
  }

  $version = Get-StringValue -Value $versionInfo.version
  $releaseTag = Get-StringValue -Value $versionInfo.releaseTag -Default "v$version"
  $repo = Get-StringValue -Value $versionInfo.githubRepo
  $branch = Get-StringValue -Value $versionInfo.githubBranch -Default 'main'
  $manifestBaseUrl = Get-StringValue -Value $versionInfo.updateManifestBaseUrl
  $appId = Get-StringValue -Value $versionInfo.appId -Default 'livelysam'
  $defaultChannel = Get-StringValue -Value $versionInfo.defaultChannel -Default 'stable'
  $installerBaseName = Get-StringValue -Value $versionInfo.installerBaseName -Default 'LivelySamSetup'
  $installerFileName = "$installerBaseName-$version.exe"
  $releaseNotesUrl = "https://github.com/$repo/releases/tag/$releaseTag"
  $downloadUrl = "https://github.com/$repo/releases/download/$releaseTag/$installerFileName"

  Assert-TextContains -RelativePath 'js\app.js' -Pattern 'window.LivelySamVersion || LS.VERSION_INFO' -Name 'version:app-loader'
  Assert-TextContains -RelativePath 'js\version.js' -Pattern "version: '$version'" -Name 'version:js-version'
  Assert-TextContains -RelativePath 'js\version.js' -Pattern "releaseTag: '$releaseTag'" -Name 'version:js-tag'
  Assert-TextContains -RelativePath 'js\version.js' -Pattern "defaultChannel: '$defaultChannel'" -Name 'version:js-channel'
  Assert-TextContains -RelativePath 'js\version.js' -Pattern "githubRepo: '$repo'" -Name 'version:js-repo'
  Assert-TextContains -RelativePath 'js\version.js' -Pattern "installerFileName: '$installerFileName'" -Name 'version:js-installer'
  Assert-JsonValue -RelativePath 'version.json' -Name 'version:source-manifest-base' -Actual $manifestBaseUrl -Expected "https://raw.githubusercontent.com/$repo/$branch/release/updates"
  Assert-TextContains -RelativePath 'index.html' -Pattern 'js/version.js' -Name 'version:index-loader'
  Assert-TextContains -RelativePath 'release\installer\version.iss.inc' -Pattern "#define MyAppVersion ""$version""" -Name 'version:iss-version'
  Assert-TextContains -RelativePath 'release\installer\version.iss.inc' -Pattern "#define MyReleaseTag ""$releaseTag""" -Name 'version:iss-tag'
  Assert-TextContains -RelativePath 'release\installer\version.iss.inc' -Pattern "#define MyInstallerOutputBaseName ""$installerBaseName-$version""" -Name 'version:iss-output'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern '#include "version.iss.inc"' -Name 'installer:include-version'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'OutputBaseFilename={#MyInstallerOutputBaseName}' -Name 'installer:output-name'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'Description: "{cm:CreateDesktopIcon}"' -Name 'installer:desktop-task-label'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'GroupDescription: "{cm:AdditionalIcons}"' -Name 'installer:desktop-task-group'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'Flags: checkedonce' -Name 'installer:desktop-task-default'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'CloseApplications=yes' -Name 'installer:close-apps'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'RestartApplications=no' -Name 'installer:no-restart-apps'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'procedure CurUninstallStepChanged' -Name 'installer:custom-uninstall-close'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'taskkill.exe' -Name 'installer:taskkill'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'Filename: "{app}\dist\launcher\LivelySamLauncher.exe"; WorkingDir: "{app}"; Description:' -Name 'installer:postinstall-launcher-exe'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'Flags: nowait postinstall skipifsilent' -Name 'installer:postinstall-flags'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\dist\launcher\LivelySamLauncher.exe"; WorkingDir: "{app}"' -Name 'installer:start-menu-launcher-exe'
  Assert-TextContains -RelativePath 'release\installer\LivelySam.iss' -Pattern 'Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\dist\launcher\LivelySamLauncher.exe"; WorkingDir: "{app}"' -Name 'installer:desktop-launcher-exe'
  Assert-FileExists -RelativePath ("dist\installer\" + $installerFileName)
  Assert-FileExists -RelativePath 'tools\sign_windows_artifacts.ps1'
  Assert-TextContains -RelativePath 'tools\build_installer.ps1' -Pattern 'sync_release_metadata.ps1' -Name 'installer:build-sync'
  Assert-TextContains -RelativePath 'tools\build_installer.ps1' -Pattern 'Programs\Inno Setup 6\ISCC.exe' -Name 'installer:build-user-scope'
  Assert-TextContains -RelativePath 'tools\build_installer.ps1' -Pattern 'sign_windows_artifacts.ps1' -Name 'installer:build-sign-hook'
  Assert-TextContains -RelativePath 'tools\build_livelysam_launcher_exe.ps1' -Pattern 'sign_windows_artifacts.ps1' -Name 'launcher:build-sign-hook'
  Assert-TextContains -RelativePath 'tools\publish_release_manifest.ps1' -Pattern 'Get-FileHash' -Name 'release-manifest:hash'
  Assert-TextContains -RelativePath 'tools\publish_release_manifest.ps1' -Pattern 'latest-$Channel.json' -Name 'release-manifest:channel-target'
  Assert-TextContains -RelativePath 'tools\livelysam_launcher_gui.py' -Pattern 'def check_for_updates' -Name 'updater:backend-check'
  Assert-TextContains -RelativePath 'tools\livelysam_launcher_gui.py' -Pattern 'def download_and_launch_update' -Name 'updater:backend-install'
  Assert-TextContains -RelativePath 'tools\livelysam_launcher_compact.py' -Pattern 'def on_check_updates' -Name 'updater:launcher-check'
  Assert-TextContains -RelativePath 'tools\livelysam_launcher_compact.py' -Pattern 'def on_toggle_update_channel' -Name 'updater:launcher-channel'
  Assert-TextContains -RelativePath 'tools\livelysam_launcher_compact.py' -Pattern 'self.pill_update' -Name 'updater:launcher-pill'
  try {
    $stable = Read-JsonRelative -RelativePath 'release\updates\latest-stable.json'
    $beta = Read-JsonRelative -RelativePath 'release\updates\latest-beta.json'

    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-appId' -Actual $stable.appId -Expected $appId
    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-channel' -Actual $stable.channel -Expected 'stable'
    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-version' -Actual $stable.version -Expected $version
    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-tag' -Actual $stable.releaseTag -Expected $releaseTag
    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-installer' -Actual $stable.installer.fileName -Expected $installerFileName
    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-url' -Actual $stable.installer.downloadUrl -Expected $downloadUrl
    Assert-JsonValue -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-notes' -Actual $stable.releaseNotesUrl -Expected $releaseNotesUrl
    Assert-JsonNotBlank -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-publishedAt' -Actual $stable.publishedAt
    Assert-JsonNotBlank -RelativePath 'release\updates\latest-stable.json' -Name 'manifest:stable-sha256' -Actual $stable.installer.sha256

    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-appId' -Actual $beta.appId -Expected $appId
    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-channel' -Actual $beta.channel -Expected 'beta'
    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-version' -Actual $beta.version -Expected $version
    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-tag' -Actual $beta.releaseTag -Expected $releaseTag
    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-installer' -Actual $beta.installer.fileName -Expected $installerFileName
    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-url' -Actual $beta.installer.downloadUrl -Expected $downloadUrl
    Assert-JsonValue -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-notes' -Actual $beta.releaseNotesUrl -Expected $releaseNotesUrl
    Assert-JsonNotBlank -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-publishedAt' -Actual $beta.publishedAt
    Assert-JsonNotBlank -RelativePath 'release\updates\latest-beta.json' -Name 'manifest:beta-sha256' -Actual $beta.installer.sha256
  } catch {
    Add-CheckResult -Name 'manifest:parse' -Passed $false -Detail $_.Exception.Message -Path (Get-FullPath 'release\updates')
  }
}

$requiredFiles = @(
  'index.html',
  'README.md',
  'RELEASE_CHECKLIST.md',
  'LivelyInfo.json',
  'LivelyProperties.json',
  'version.json',
  'start_livelysam_launcher.vbs',
  'start_livelysam_launcher.cmd',
  'start_local_wallpaper.cmd',
  'stop_local_wallpaper.cmd',
  'build_livelysam_launcher_exe.cmd',
  'tools\build_installer.ps1',
  'tools\sign_windows_artifacts.ps1',
  'tools\publish_release_manifest.ps1',
  'tools\sync_release_metadata.ps1',
  'tools\livelysam_launcher_gui.py',
  'tools\run_release_audit.ps1',
  'tools\run_review_fix_validation.ps1',
  'tools\run_headless_validation.ps1',
  'js\version.js',
  'release\installer\LivelySam.iss',
  'release\installer\version.iss.inc',
  'release\updates\latest-stable.json',
  'release\updates\latest-beta.json',
  '.github\workflows\release-prep.yml',
  'dist\launcher\LivelySamLauncher.exe',
  'dist\launcher\BrowserPreviewHost.exe',
  'dist\launcher\LocalStorageBridge.exe'
)

foreach ($relativePath in $requiredFiles) {
  Assert-FileExists -RelativePath $relativePath
}

Invoke-ReleaseMetadataSync

Assert-JsonFile -RelativePath 'LivelyInfo.json'
Assert-JsonFile -RelativePath 'LivelyProperties.json'
Assert-JsonFile -RelativePath 'version.json'
Assert-JsonFile -RelativePath 'release\updates\latest-stable.json'
Assert-JsonFile -RelativePath 'release\updates\latest-beta.json'

$jsFiles = Get-ChildItem -Path (Join-Path $root 'js') -Recurse -Filter *.js | Sort-Object FullName
foreach ($file in $jsFiles) {
  Assert-NodeSyntax -FilePath $file.FullName
}

$pythonExe = Join-Path $root 'venv\Scripts\python.exe'
$pythonFiles = Get-ChildItem -Path (Join-Path $root 'tools') -Filter *.py | Sort-Object FullName | Select-Object -ExpandProperty FullName
Assert-PythonCompile -PythonExe $pythonExe -FilePaths $pythonFiles

Assert-TextContains -RelativePath 'README.md' -Pattern 'LivelySamLauncher.exe' -Name 'readme:launcher'
Assert-TextContains -RelativePath 'README.md' -Pattern '%LocalAppData%\LivelySam\user-data\shared-storage.json' -Name 'readme:shared-storage'
Assert-TextContains -RelativePath 'index.html' -Pattern 'id="app-version"' -Name 'version:index-placeholder'
Assert-TextContains -RelativePath '.gitignore' -Pattern 'dist/' -Name 'gitignore:dist'
Assert-TextContains -RelativePath '.gitignore' -Pattern 'runtime/' -Name 'gitignore:runtime'
Assert-TextContains -RelativePath '.gitignore' -Pattern 'venv/' -Name 'gitignore:venv'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'tools\sync_release_metadata.ps1' -Name 'workflow:sync-step'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'contents: write' -Name 'workflow:contents-write'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'name: Publish local update manifests' -Name 'workflow:publish-local-manifests-step'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'tools\publish_release_manifest.ps1' -Name 'workflow:publish-local-manifests-script'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'tools\run_release_audit.ps1' -Name 'workflow:audit-step'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'actions/upload-artifact@v4' -Name 'workflow:artifact-upload'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'name: Resolve release metadata' -Name 'workflow:release-meta-step'
Assert-TextContains -RelativePath '.github\workflows\release-prep.yml' -Pattern 'gh release upload' -Name 'workflow:release-upload'
Assert-TextContains -RelativePath 'RELEASE_CHECKLIST.md' -Pattern 'tools\build_installer.ps1' -Name 'checklist:installer-build'
Assert-TextContains -RelativePath 'RELEASE_CHECKLIST.md' -Pattern '%LocalAppData%\LivelySam\updates' -Name 'checklist:update-check'
Assert-TextContains -RelativePath 'RELEASE_CHECKLIST.md' -Pattern 'tools\sign_windows_artifacts.ps1' -Name 'checklist:signing-script'
Assert-TextContains -RelativePath 'RELEASE_CHECKLIST.md' -Pattern 'WINDOWS_SIGN_PFX_BASE64' -Name 'checklist:signing-secret'

Assert-VersionMetadata

$summary = [ordered]@{
  status = $(if ($failed) { 'failed' } else { 'passed' })
  checkedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  root = $root
  results = $results
}

$summaryJson = $summary | ConvertTo-Json -Depth 6
Write-Output $summaryJson

if ($failed) {
  exit 1
}
