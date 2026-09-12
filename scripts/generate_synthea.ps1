# generate_synthea.ps1
# Generates 500 synthetic patients with chronic conditions using Synthea
#
# Prerequisites:
#   - Java 11+ installed and on PATH
#   - Git installed
#
# Usage:
#   .\scripts\generate_synthea.ps1
#   .\scripts\generate_synthea.ps1 -PatientCount 100  # fewer for testing

param(
    [int]$PatientCount = 500,
    [string]$State = "Massachusetts",
    [string]$OutputDir = "data\synthea_output"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  The Vanishing Dose — Synthea Data Generator" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check Java
try {
    $javaVersion = java -version 2>&1 | Select-Object -First 1
    Write-Host "`n  Java found: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "`n  ERROR: Java not found. Install Java 11+ from https://adoptium.net/" -ForegroundColor Red
    exit 1
}

# Clone Synthea if not present
$syntheaDir = Join-Path $ProjectRoot "synthea"
if (-not (Test-Path $syntheaDir)) {
    Write-Host "`n  Cloning Synthea..." -ForegroundColor Yellow
    git clone https://github.com/synthetichealth/synthea.git $syntheaDir
} else {
    Write-Host "`n  Synthea already cloned at $syntheaDir" -ForegroundColor Green
}

# Configure Synthea for FHIR export
$propsFile = Join-Path $syntheaDir "src\main\resources\synthea.properties"
Write-Host "`n  Configuring Synthea for FHIR export..."

$propsContent = Get-Content $propsFile -Raw
$propsContent = $propsContent -replace 'exporter.fhir.export\s*=\s*false', 'exporter.fhir.export = true'
$propsContent = $propsContent -replace 'generate.only_alive_patients\s*=\s*false', 'generate.only_alive_patients = true'
Set-Content $propsFile $propsContent -Encoding UTF8

# Run Synthea
$outputPath = Join-Path $ProjectRoot $OutputDir
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

Write-Host "`n  Generating $PatientCount patients in $State..." -ForegroundColor Yellow
Write-Host "  This may take 5-15 minutes depending on patient count.`n" -ForegroundColor Yellow

Push-Location $syntheaDir
try {
    & .\run_synthea.bat `
        -p $PatientCount `
        "$State" `
        --exporter.baseDirectory "$outputPath"
} finally {
    Pop-Location
}

# Count output files
$fhirDir = Join-Path $outputPath "fhir"
if (Test-Path $fhirDir) {
    $fileCount = (Get-ChildItem $fhirDir -Filter "*.json").Count
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host "  Done! Generated $fileCount patient bundles." -ForegroundColor Green
    Write-Host "  Output: $fhirDir" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan
} else {
    Write-Host "`n  WARNING: FHIR output directory not found at $fhirDir" -ForegroundColor Red
    Write-Host "  Check Synthea logs above for errors." -ForegroundColor Red
}
