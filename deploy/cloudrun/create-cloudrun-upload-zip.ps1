$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$OutputDir = Join-Path $RepoRoot 'dist\cloudrun'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ZipPath = Join-Path $OutputDir "livelysam-cloudrun-source-$Timestamp.zip"
$StageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "livelysam-cloudrun-source-$Timestamp"
$StageProjectRoot = Join-Path $StageRoot 'LivelySam'

$ExcludedDirNames = @(
  '.git',
  '.claude',
  'node_modules',
  'venv',
  '.venv',
  'dist',
  'runtime',
  '__pycache__'
)

$ExcludedFileNames = @(
  'google-oauth-desktop.json',
  'service-keys.local.json'
)

$ExcludedLeafPatterns = @(
  '*.pyc',
  'firebase-admin*.json',
  'firebase-service-account*.json',
  'serviceAccount*.json',
  '.env',
  '.env.*'
)

$ExcludedRelativePatterns = @(
  'deploy\cloudrun\*.local',
  'deploy\cloudrun\*.local.*',
  'deploy\cloudrun\*.secrets',
  'deploy\cloudrun\*.secrets.*',
  'deploy\cloudrun\runtime-env.txt',
  'deploy\cloudrun\runtime-env.local.txt',
  'deploy\cloudrun\deploy-cloudrun.local.ps1'
)

function Test-IsExcludedFile {
  param(
    [string]$RelativePath,
    [string]$LeafName
  )

  if ($LeafName -in $ExcludedFileNames) {
    return $true
  }

  foreach ($pattern in $ExcludedLeafPatterns) {
    if ($LeafName -like $pattern) {
      return $true
    }
  }

  foreach ($pattern in $ExcludedRelativePatterns) {
    if ($RelativePath -like $pattern) {
      return $true
    }
  }

  return $false
}

if (Test-Path $StageRoot) {
  Remove-Item -LiteralPath $StageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $StageProjectRoot -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$copiedCount = 0

Get-ChildItem -LiteralPath $RepoRoot -File -Recurse -Force | ForEach-Object {
  $relativePath = $_.FullName.Substring($RepoRoot.Length).TrimStart('\', '/')
  $normalizedRelativePath = $relativePath.Replace('/', '\')
  $segments = $normalizedRelativePath -split '\\'

  if (($segments | Where-Object { $_ -in $ExcludedDirNames }).Count -gt 0) {
    return
  }

  if (Test-IsExcludedFile -RelativePath $normalizedRelativePath -LeafName $_.Name) {
    return
  }

  $destinationPath = Join-Path $StageProjectRoot $normalizedRelativePath
  $destinationDir = Split-Path -Path $destinationPath -Parent
  if (-not (Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
  }

  Copy-Item -LiteralPath $_.FullName -Destination $destinationPath -Force
  $copiedCount++
}

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

Compress-Archive -Path (Join-Path $StageProjectRoot '*') -DestinationPath $ZipPath -Force
Remove-Item -LiteralPath $StageRoot -Recurse -Force

Write-Host ''
Write-Host 'Cloud Run 업로드용 zip을 만들었습니다.' -ForegroundColor Green
Write-Host "파일: $ZipPath" -ForegroundColor Yellow
Write-Host "포함 파일 수: $copiedCount" -ForegroundColor Yellow
Write-Host ''
Write-Host '다음 단계:' -ForegroundColor Cyan
Write-Host '1. Cloud Shell 창에서 Upload 기능으로 이 zip 파일을 올립니다.'
Write-Host '2. Cloud Shell에서 unzip 후 gcloud builds submit 을 진행합니다.'
