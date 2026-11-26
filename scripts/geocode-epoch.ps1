$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$rawCsv = Join-Path $PSScriptRoot "..\data-sources\raw\epoch-ai-datacenters.csv"
$outJson = Join-Path $PSScriptRoot "..\data-sources\raw\epoch-coords.json"

$rows = Import-Csv $rawCsv | Where-Object { $_.Country -match "United States" }
$coords = @{}

if (Test-Path $outJson) {
    $existing = Get-Content $outJson -Raw | ConvertFrom-Json
    foreach ($p in $existing.PSObject.Properties) {
        $coords[$p.Name] = $p.Value
    }
}

# Known fallback coordinates for Epoch AI sites with blank or ambiguous rural addresses
$manualFallbacks = @{
    "Google Mesa" = @{ lat = 33.3372; lng = -111.6164; city = "Mesa"; state = "AZ" }
    "Google Kansas City East" = @{ lat = 39.2465; lng = -94.4628; city = "Kansas City"; state = "MO" }
    "AWS New Albany" = @{ lat = 40.0958; lng = -82.7712; city = "New Albany"; state = "OH" }
    "Stream Phoenix" = @{ lat = 33.4215; lng = -112.3578; city = "Goodyear"; state = "AZ" }
    "Anthropic Barber Lake" = @{ lat = 32.3982; lng = -100.8587; city = "Colorado City"; state = "TX" }
    "OpenAI Stargate Michigan" = @{ lat = 42.1667; lng = -83.7816; city = "Saline"; state = "MI" }
    "OpenAI Stargate Milam" = @{ lat = 30.7850; lng = -96.9765; city = "Milam County"; state = "TX" }
    "OpenAI Stargate New Mexico" = @{ lat = 31.8390; lng = -106.6470; city = "Santa Teresa"; state = "NM" }
    "OpenAI Stargate Wisconsin" = @{ lat = 43.3878; lng = -87.8756; city = "Port Washington"; state = "WI" }
    "Meta Hyperion" = @{ lat = 32.4782; lng = -91.7554; city = "Holly Ridge"; state = "LA" }
    "Amazon Madison Mega Site" = @{ lat = 32.5670; lng = -90.0680; city = "Canton"; state = "MS" }
    "Google Storey County" = @{ lat = 39.5562; lng = -119.4765; city = "McCarran"; state = "NV" }
    "OpenAI Stargate Shackelford" = @{ lat = 32.7250; lng = -99.3000; city = "Albany"; state = "TX" }
    "CoreWeave Lancaster Greenfield site" = @{ lat = 40.0485; lng = -76.2455; city = "Lancaster"; state = "PA" }
}

$geocoded = 0
$failed = 0

foreach ($r in $rows) {
    $name = $r.Name.Trim()
    if ($coords.ContainsKey($name)) { continue }

    if ($manualFallbacks.ContainsKey($name)) {
        $coords[$name] = $manualFallbacks[$name]
        $geocoded++
        continue
    }

    $addr = ($r.Address -replace '\s+', ' ').Trim()
    if ([string]::IsNullOrWhiteSpace($addr)) {
        $failed++
        continue
    }

    # Try U.S. Census Geocoder first (fast, free, official)
    $found = $false
    try {
        $enc = [Uri]::EscapeDataString($addr)
        $url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=$enc&benchmark=Public_AR_Current&format=json"
        $resp = Invoke-RestMethod -Uri $url -TimeoutSec 15
        if ($resp.result.addressMatches.Count -gt 0) {
            $m = $resp.result.addressMatches[0]
            $coords[$name] = @{
                lat = [double]$m.coordinates.y
                lng = [double]$m.coordinates.x
                city = $m.addressComponents.city
                state = $m.addressComponents.state
            }
            $found = $true
            $geocoded++
        }
    } catch {}

    # Fallback to Nominatim if Census missed a rural/new road
    if (-not $found) {
        try {
            Start-Sleep -Milliseconds 1100
            $enc = [Uri]::EscapeDataString($addr)
            $nomUrl = "https://nominatim.openstreetmap.org/search?q=$enc&format=json&limit=1&countrycodes=us&addressdetails=1"
            $nom = Invoke-RestMethod -Uri $nomUrl -Headers @{ "User-Agent" = "US-DataCenter-Atlas/1.0 (local research build)" } -TimeoutSec 15
            if ($nom.Count -gt 0) {
                $item = $nom[0]
                $cityVal = if ($item.address.city) { $item.address.city } elseif ($item.address.town) { $item.address.town } elseif ($item.address.village) { $item.address.village } else { "" }
                $stateVal = if ($item.address.'ISO3166-2-lvl4') { ($item.address.'ISO3166-2-lvl4' -replace '^US-', '') } else { "" }
                $coords[$name] = @{
                    lat = [double]$item.lat
                    lng = [double]$item.lon
                    city = $cityVal
                    state = $stateVal
                }
                $found = $true
                $geocoded++
            }
        } catch {}
    }

    if (-not $found) {
        Write-Warning "Could not geocode: $name ($addr)"
        $failed++
    }
}

$coords | ConvertTo-Json -Depth 4 | Set-Content -Path $outJson -Encoding UTF8
Write-Host "Geocoded/cached: $($coords.Count) total ($geocoded new, $failed unresolved)."
