$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$rawDir = Join-Path $PSScriptRoot "..\data-sources\raw"
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null

Write-Host "1. Fetching U.S. facilities from PeeringDB public API..."
$peeringUrl = "https://www.peeringdb.com/api/fac?country=US&depth=0"
$peeringOut = Join-Path $rawDir "peeringdb-us.json"
try {
    Invoke-WebRequest -Uri $peeringUrl -OutFile $peeringOut -UseBasicParsing -Headers @{ "User-Agent" = "US-DataCenter-Atlas/1.0" } -TimeoutSec 60
    $pdb = Get-Content $peeringOut -Raw | ConvertFrom-Json
    Write-Host "   Fetched $($pdb.data.Count) PeeringDB U.S. facilities."
} catch {
    Write-Warning "PeeringDB fetch failed: $($_.Exception.Message)"
}

Write-Host "2. Fetching AI Data Centers CSV from Epoch AI..."
$epochUrl = "https://epoch.ai/data/data_centers/data_centers.csv"
$epochOut = Join-Path $rawDir "epoch-ai-datacenters.csv"
try {
    Invoke-WebRequest -Uri $epochUrl -OutFile $epochOut -UseBasicParsing -Headers @{ "User-Agent" = "US-DataCenter-Atlas/1.0" } -TimeoutSec 60
    $epochRows = Import-Csv $epochOut
    Write-Host "   Fetched $($epochRows.Count) Epoch AI rows."
} catch {
    Write-Warning "Epoch AI fetch failed: $($_.Exception.Message)"
}
