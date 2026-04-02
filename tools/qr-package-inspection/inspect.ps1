<#
PowerShell inspection script for ZXing.Net.MAUI package API discovery.
Run this from repository root with PowerShell (pwsh or Windows PowerShell).
Generates outputs in tools/qr-package-inspection/output/
#>

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$outputDir = Join-Path $scriptRoot "output"
if (-Not (Test-Path $outputDir)) { New-Item -Path $outputDir -ItemType Directory | Out-Null }

Write-Host "Output directory: $outputDir"

# 1) dotnet restore and capture output
Write-Host "Running: dotnet restore"
dotnet restore > (Join-Path $outputDir "build_restore_output.txt") 2>&1

# 2) transitive package list
Write-Host "Listing packages (transitive)"
dotnet list package --include-transitive > (Join-Path $outputDir "transitive.txt") 2>&1

# 3) determine global packages folder
Write-Host "Determining global-packages location"
$gpLine = & dotnet nuget locals global-packages --list 2>&1
$global = $null
if ($gpLine -is [array]) { $gpLine = $gpLine -join "`n" }
if ($gpLine -match 'global-packages\s*:\s*(.+)') { $global = $Matches[1].Trim() }
if (-not $global) {
    $global = Join-Path $env:USERPROFILE ".nuget\packages"
}
Write-Host "Global-packages folder: $global"

# 4) find ZXing package folder(s)
$pkgId = 'zxing.net.maui'
$zxingRoot = Join-Path $global $pkgId
if (-Not (Test-Path $zxingRoot)) {
    Write-Host "Package folder not found at $zxingRoot. Searching for package directories..."
    $found = Get-ChildItem -Path $global -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*zxing*" }
    if ($found) {
        $zxingRoot = $found[0].FullName
        Write-Host "Found candidate folder: $zxingRoot"
    }
}

if (-Not (Test-Path $zxingRoot)) {
    Write-Host "ZXing package folder not found under global-packages. Exiting."
    "ZXing package folder not found under $global" | Out-File (Join-Path $outputDir "zxing_files.txt")
    exit 0
}

# list files
Get-ChildItem -Path $zxingRoot -Recurse | Select-Object FullName | Out-File (Join-Path $outputDir "zxing_files.txt") -Encoding utf8

# choose latest version folder
$versions = Get-ChildItem -Path $zxingRoot -Directory | Sort-Object Name -Descending
if ($versions.Count -gt 0) { $versionDir = $versions[0].FullName } else { $versionDir = $zxingRoot }
Write-Host "Examining version folder: $versionDir"

# 5) find DLL(s) under lib or runtimes
$dlls = Get-ChildItem -Path $versionDir -Recurse -Filter "*.dll" -ErrorAction SilentlyContinue | Select-Object FullName
if ($dlls.Count -eq 0) {
    Write-Host "No DLLs found under package folder. Searching parent..."
    $dlls = Get-ChildItem -Path $global -Recurse -Filter "ZXing*.dll" -ErrorAction SilentlyContinue | Select-Object FullName
}

if ($dlls.Count -eq 0) {
    "No DLLs found for ZXing package in $versionDir" | Out-File (Join-Path $outputDir "zxing_files.txt") -Append
    exit 0
}

# Prefer DLL in lib folder for net6/net7/netstandard
$dllPath = $null
foreach ($d in $dlls) {
    if ($d.FullName -match "\\lib\\") { $dllPath = $d.FullName; break }
}
if (-not $dllPath) { $dllPath = $dlls[0].FullName }

Write-Host "Using DLL: $dllPath"

# 6) dump exported types and candidate types
try {
    $asm = [Reflection.Assembly]::LoadFrom($dllPath)
    $asm.FullName | Out-File (Join-Path $outputDir "zxing_assembly_fullname.txt") -Encoding utf8

    $asm.ExportedTypes | ForEach-Object { $_.FullName } | Out-File (Join-Path $outputDir "zxing_types.txt") -Encoding utf8

    # Candidate types (Barcode/Camera/Reader/Scanner)
    $asm.ExportedTypes | Where-Object { $_.FullName -match 'Barcode|Camera|Reader|Scanner|BarcodeReader' } | ForEach-Object { $_.FullName } | Out-File (Join-Path $outputDir "zxing_candidate_types.txt") -Encoding utf8

    # Extension methods
    $exts = @()
    $asm.GetTypes() | ForEach-Object {
        try {
            $_.GetMethods([Reflection.BindingFlags] 'Public,Static') | Where-Object { $_.IsDefined([System.Runtime.CompilerServices.ExtensionAttribute], $false) } | ForEach-Object {
                $exts += "{0} | {1} | {2}" -f $_.Name, $_.DeclaringType.FullName, ($_.GetParameters() | ForEach-Object { $_.ParameterType.FullName }) -join ';'
            }
        } catch {}
    }
    $exts | Out-File (Join-Path $outputDir "zxing_extension_methods.txt") -Encoding utf8

    # For each candidate type, dump events/properties
    $candidateTypes = $asm.ExportedTypes | Where-Object { $_.FullName -match 'Barcode|Camera|Reader|Scanner|BarcodeReader' }
    if ($candidateTypes.Count -eq 0) { "No candidate control types found" | Out-File (Join-Path $outputDir "zxing_candidate_types.txt") -Append }
    $first = $null
    foreach ($t in $candidateTypes) {
        $t.FullName | Out-File (Join-Path $outputDir "type_summary.txt") -Append -Encoding utf8
        $t.GetEvents() | ForEach-Object { "EVENT: $($_.Name) : $($_.EventHandlerType.FullName)" } | Out-File (Join-Path $outputDir "type_events.txt") -Append -Encoding utf8
        $t.GetProperties() | ForEach-Object { "PROP: $($_.Name) : $($_.PropertyType.FullName)" } | Out-File (Join-Path $outputDir "type_props.txt") -Append -Encoding utf8
        if (-not $first) { $first = $t }
    }

    # If we found any event args types referenced, try to dump properties of one likely event args type
    # Search for types that contain 'EventArgs' or 'BarcodeResult' etc
    $likely = $asm.ExportedTypes | Where-Object { $_.FullName -match 'EventArgs|BarcodeResult|Detection' }
    if ($likely.Count -gt 0) {
        $likely[0].FullName | Out-File (Join-Path $outputDir "likely_event_type.txt") -Encoding utf8
        $likely[0].GetProperties() | ForEach-Object { "{0} : {1}" -f $_.Name, $_.PropertyType.FullName } | Out-File (Join-Path $outputDir "event_type_props.txt") -Encoding utf8
    }
} catch {
    $_ | Out-String | Out-File (Join-Path $outputDir "zxing_inspect_error.txt") -Encoding utf8
}

# 7) nuspec
$nuspec = Get-ChildItem -Path $versionDir -Filter "*.nuspec" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nuspec) { Get-Content $nuspec.FullName | Out-File (Join-Path $outputDir "zxing_nuspec.txt") -Encoding utf8 }

# 8) build outputs
Write-Host "Running: dotnet build (general)"
dotnet build > (Join-Path $outputDir "build_output.txt") 2>&1

Write-Host "Running: dotnet build for Android"
# Android build may be slow; capture output
dotnet build -f:net10.0-android -c Debug > (Join-Path $outputDir "build_android_output.txt") 2>&1

Write-Host "Inspection complete. Outputs in: $outputDir"

# List outputs
Get-ChildItem -Path $outputDir | ForEach-Object { Write-Host $_.FullName }
