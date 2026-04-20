param(
    [Parameter(Mandatory = $true)]
    [string[]]$Files,

    [string]$Description = "LivelySam",
    [string]$SignToolPath = "",
    [string]$PfxPath = "",
    [string]$PfxPassword = "",
    [string]$TimestampUrl = "",
    [switch]$RequireSigning
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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

function Resolve-SignToolPath {
    param([string]$ConfiguredPath)

    $resolved = Get-StringValue -Value $ConfiguredPath -Default (Get-StringValue -Value $env:LIVELYSAM_SIGNTOOL_PATH)
    if ($resolved -and (Test-Path -LiteralPath $resolved)) {
        return $resolved
    }

    $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
        return $command.Source
    }

    $kitRoots = @(
        (Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"),
        (Join-Path $env:ProgramFiles "Windows Kits\10\bin")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($kitRoot in $kitRoots) {
        $candidate = Get-ChildItem -LiteralPath $kitRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
            Sort-Object -Property FullName -Descending |
            Select-Object -First 1
        if ($candidate -and (Test-Path -LiteralPath $candidate.FullName)) {
            return $candidate.FullName
        }
    }

    return ""
}

$resolvedFiles = @($Files | Where-Object { $_ } | ForEach-Object { [System.IO.Path]::GetFullPath($_) })
if ($resolvedFiles.Count -eq 0) {
    throw "No files were provided for code signing."
}

foreach ($file in $resolvedFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Signing target not found: $file"
    }
}

$resolvedPfxPath = Get-StringValue -Value $PfxPath -Default (Get-StringValue -Value $env:LIVELYSAM_SIGN_CERT_FILE)
$resolvedPfxPassword = Get-StringValue -Value $PfxPassword -Default (Get-StringValue -Value $env:LIVELYSAM_SIGN_CERT_PASSWORD)
$resolvedTimestampUrl = Get-StringValue -Value $TimestampUrl -Default (Get-StringValue -Value $env:LIVELYSAM_SIGN_TIMESTAMP_URL -Default "http://timestamp.digicert.com")
$resolvedSignToolPath = Resolve-SignToolPath -ConfiguredPath $SignToolPath
$signingRequired = $RequireSigning.IsPresent -or (Get-StringValue -Value $env:LIVELYSAM_REQUIRE_SIGNING) -in @("1", "true", "yes", "on")

if ([string]::IsNullOrWhiteSpace($resolvedPfxPath)) {
    if ($signingRequired) {
        throw "Code signing is required, but no PFX path was provided."
    }

    [ordered]@{
        ok = $true
        signed = $false
        skipped = $true
        reason = "No PFX path configured."
        files = $resolvedFiles
    } | ConvertTo-Json -Depth 4
    exit 0
}

if (-not (Test-Path -LiteralPath $resolvedPfxPath)) {
    throw "Configured PFX file was not found: $resolvedPfxPath"
}

if ([string]::IsNullOrWhiteSpace($resolvedSignToolPath) -or -not (Test-Path -LiteralPath $resolvedSignToolPath)) {
    throw "signtool.exe was not found. Set LIVELYSAM_SIGNTOOL_PATH or install Windows SDK signing tools."
}

foreach ($file in $resolvedFiles) {
    $args = @(
        "sign",
        "/fd", "SHA256",
        "/tr", $resolvedTimestampUrl,
        "/td", "SHA256",
        "/f", $resolvedPfxPath,
        "/d", $Description
    )

    if (-not [string]::IsNullOrWhiteSpace($resolvedPfxPassword)) {
        $args += @("/p", $resolvedPfxPassword)
    }

    $args += $file
    $signOutput = & $resolvedSignToolPath @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        $detail = (($signOutput | Out-String).Trim())
        if ([string]::IsNullOrWhiteSpace($detail)) {
            $detail = "signtool sign produced no output."
        }
        throw "signtool sign failed for $file`n$detail"
    }

    $verifyOutput = & $resolvedSignToolPath verify /pa $file 2>&1
    if ($LASTEXITCODE -ne 0) {
        $detail = (($verifyOutput | Out-String).Trim())
        if ([string]::IsNullOrWhiteSpace($detail)) {
            $detail = "signtool verify produced no output."
        }
        throw "signtool verify failed for $file`n$detail"
    }
}

[ordered]@{
    ok = $true
    signed = $true
    skipped = $false
    signToolPath = $resolvedSignToolPath
    files = $resolvedFiles
} | ConvertTo-Json -Depth 4
