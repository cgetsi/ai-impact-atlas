$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$rawDir = Join-Path $root "data-sources\raw"
$outDir = Join-Path $root "data"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$flagshipPath = Join-Path $root "data-sources\flagship-facilities.json"
$industriesPath = Join-Path $root "data-sources\industry-benchmarks.json"
$peeringPath = Join-Path $rawDir "peeringdb-us.json"
$epochCsvPath = Join-Path $rawDir "epoch-ai-datacenters.csv"
$epochCoordsPath = Join-Path $rawDir "epoch-coords.json"

function Is-ValidUSCoord([double]$lat, [double]$lng) {
    if ($lat -eq 0 -and $lng -eq 0) { return $false }
    # Continental US, Alaska, Hawaii, Puerto Rico
    $inContUS = ($lat -ge 24.3 -and $lat -le 49.5 -and $lng -ge -125.0 -and $lng -le -66.8)
    $inAK = ($lat -ge 51.0 -and $lat -le 71.5 -and $lng -ge -179.5 -and $lng -le -129.0)
    $inHI = ($lat -ge 18.8 -and $lat -le 22.4 -and $lng -ge -160.5 -and $lng -le -154.5)
    $inPR = ($lat -ge 17.8 -and $lat -le 18.6 -and $lng -ge -67.4 -and $lng -le -65.2)
    return ($inContUS -or $inAK -or $inHI -or $inPR)
}

function Clean-EpochTag([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return "" }
    $cleaned = ($s -replace '\s*#(confident|likely|speculative|unconfirmed)\b', '' -replace '\s+', ' ').Trim()
    $cleaned = $cleaned -replace '\bSpaceXAI\b', 'xAI (SpaceX)'
    return $cleaned
}

function Parse-MarkdownSources([string]$md, [string]$calcSheet) {
    $list = @()
    if (-not [string]::IsNullOrWhiteSpace($md)) {
        $matches = [regex]::Matches($md, '\[([^\]]+)\]\((https?://[^)\s]+)\)')
        foreach ($m in $matches) {
            $lbl = $m.Groups[1].Value.Trim()
            $u = $m.Groups[2].Value.Trim()
            if ($lbl -and $u) {
                $list += @{ label = $lbl; url = $u }
            }
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($calcSheet) -and $calcSheet -match '^https?://') {
        $list += @{ label = "Epoch AI — Public Calculations Sheet"; url = $calcSheet.Trim() }
    }
    $list += @{ label = "Epoch AI — AI Data Centers Database"; url = "https://epoch.ai/data/ai-data-centers" }
    return $list
}

function Get-StateFromZip([string]$zip) {
    if ([string]::IsNullOrWhiteSpace($zip)) { return "" }
    $m = [regex]::Match($zip, '\b(\d{3})\d{2}\b')
    if (-not $m.Success) { return "" }
    $p = [int]$m.Groups[1].Value
    if ($p -ge 6 -and $p -le 9) { return "PR" }
    if ($p -ge 10 -and $p -le 27) { return "MA" }
    if ($p -ge 28 -and $p -le 29) { return "RI" }
    if ($p -ge 30 -and $p -le 38) { return "NH" }
    if ($p -ge 39 -and $p -le 49) { return "ME" }
    if ($p -ge 50 -and $p -le 59) { return "VT" }
    if ($p -ge 60 -and $p -le 69) { return "CT" }
    if ($p -ge 70 -and $p -le 89) { return "NJ" }
    if ($p -ge 100 -and $p -le 149) { return "NY" }
    if ($p -ge 150 -and $p -le 196) { return "PA" }
    if ($p -ge 197 -and $p -le 199) { return "DE" }
    if ($p -eq 200 -or ($p -ge 202 -and $p -le 205)) { return "DC" }
    if ($p -eq 201 -or ($p -ge 220 -and $p -le 246)) { return "VA" }
    if ($p -ge 206 -and $p -le 219) { return "MD" }
    if ($p -ge 247 -and $p -le 268) { return "WV" }
    if ($p -ge 270 -and $p -le 289) { return "NC" }
    if ($p -ge 290 -and $p -le 299) { return "SC" }
    if ($p -ge 300 -and $p -le 319) { return "GA" }
    if ($p -ge 320 -and $p -le 349) { return "FL" }
    if ($p -ge 350 -and $p -le 369) { return "AL" }
    if ($p -ge 370 -and $p -le 385) { return "TN" }
    if ($p -ge 386 -and $p -le 397) { return "MS" }
    if ($p -ge 400 -and $p -le 427) { return "KY" }
    if ($p -ge 430 -and $p -le 459) { return "OH" }
    if ($p -ge 460 -and $p -le 479) { return "IN" }
    if ($p -ge 480 -and $p -le 499) { return "MI" }
    if ($p -ge 500 -and $p -le 528) { return "IA" }
    if ($p -ge 530 -and $p -le 549) { return "WI" }
    if ($p -ge 550 -and $p -le 567) { return "MN" }
    if ($p -ge 570 -and $p -le 577) { return "SD" }
    if ($p -ge 580 -and $p -le 588) { return "ND" }
    if ($p -ge 590 -and $p -le 599) { return "MT" }
    if ($p -ge 600 -and $p -le 629) { return "IL" }
    if ($p -ge 630 -and $p -le 658) { return "MO" }
    if ($p -ge 660 -and $p -le 679) { return "KS" }
    if ($p -ge 680 -and $p -le 693) { return "NE" }
    if ($p -ge 700 -and $p -le 714) { return "LA" }
    if ($p -ge 716 -and $p -le 729) { return "AR" }
    if ($p -ge 730 -and $p -le 749) { return "OK" }
    if ($p -ge 750 -and $p -le 799) { return "TX" }
    if ($p -ge 800 -and $p -le 816) { return "CO" }
    if ($p -ge 820 -and $p -le 831) { return "WY" }
    if ($p -ge 832 -and $p -le 838) { return "ID" }
    if ($p -ge 840 -and $p -le 847) { return "UT" }
    if ($p -ge 850 -and $p -le 865) { return "AZ" }
    if ($p -ge 870 -and $p -le 884) { return "NM" }
    if ($p -ge 889 -and $p -le 898) { return "NV" }
    if ($p -ge 900 -and $p -le 961) { return "CA" }
    if ($p -ge 967 -and $p -le 968) { return "HI" }
    if ($p -ge 970 -and $p -le 979) { return "OR" }
    if ($p -ge 980 -and $p -le 994) { return "WA" }
    if ($p -ge 995 -and $p -le 999) { return "AK" }
    return ""
}

function Normalize-State([string]$st, [string]$addr, [string]$zip = "") {
    $map = @{
        "ALABAMA"="AL";"ALASKA"="AK";"ARIZONA"="AZ";"ARKANSAS"="AR";"CALIFORNIA"="CA";"COLORADO"="CO";
        "CONNECTICUT"="CT";"DELAWARE"="DE";"FLORIDA"="FL";"GEORGIA"="GA";"HAWAII"="HI";"IDAHO"="ID";
        "ILLINOIS"="IL";"INDIANA"="IN";"IOWA"="IA";"KANSAS"="KS";"KENTUCKY"="KY";"LOUISIANA"="LA";
        "MAINE"="ME";"MARYLAND"="MD";"MASSACHUSETTS"="MA";"MICHIGAN"="MI";"MINNESOTA"="MN";"MISSISSIPPI"="MS";
        "MISSOURI"="MO";"MONTANA"="MT";"NEBRASKA"="NE";"NEVADA"="NV";"NEW HAMPSHIRE"="NH";"NEW JERSEY"="NJ";
        "NEW MEXICO"="NM";"NEW YORK"="NY";"NORTH CAROLINA"="NC";"NORTH DAKOTA"="ND";"OHIO"="OH";"OKLAHOMA"="OK";
        "OREGON"="OR";"PENNSYLVANIA"="PA";"RHODE ISLAND"="RI";"SOUTH CAROLINA"="SC";"SOUTH DAKOTA"="SD";
        "TENNESSEE"="TN";"TEXAS"="TX";"UTAH"="UT";"VERMONT"="VT";"VIRGINIA"="VA";"WASHINGTON"="WA";
        "WEST VIRGINIA"="WV";"WISCONSIN"="WI";"WYOMING"="WY";"DISTRICT OF COLUMBIA"="DC";"PUERTO RICO"="PR"
    }
    if (-not [string]::IsNullOrWhiteSpace($st)) {
        $u = $st.Trim().ToUpper()
        if ($u.Length -eq 2) { return $u }
        if ($map.ContainsKey($u)) { return $map[$u] }
    }
    $combined = "$addr $zip"
    if (-not [string]::IsNullOrWhiteSpace($combined)) {
        $m = [regex]::Match($combined, '\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|PR)\b')
        if ($m.Success) { return $m.Groups[1].Value }
        foreach ($k in $map.Keys) {
            if ($combined.ToUpper().Contains($k)) { return $map[$k] }
        }
    }
    return (Get-StateFromZip $zip)
}

$features = New-Object System.Collections.Generic.List[object]
$flagshipCount = 0
$epochCount = 0
$peeringCount = 0

# Track flagship coordinates so we avoid visually duplicating exact same campus from Epoch AI
$flagshipIndex = @()

# 1. Load Curated Flagship Deep-Dive Profiles
$flagships = Get-Content $flagshipPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($f in $flagships) {
    $props = @{
        id = $f.id
        tier = "flagship"
        category = $f.category
        name = $f.name
        operator = $f.operator
        status = $f.status
        city = $f.city
        state = $f.state
        county = $f.county
        summary = $f.summary
        powerMw = $f.power.capacityMw
        annualMwh = $f.power.annualMwh
        powerStatus = $f.power.status
        powerNote = $f.power.note
        waterMillionGal = $f.water.annualMillionGallons
        waterWithdrawnMillionGal = $f.water.withdrawnMillionGallons
        coolingType = $f.water.coolingType
        waterStress = $f.water.waterStress
        waterStatus = $f.water.status
        waterNote = $f.water.note
        landAcres = $f.land.acres
        landSqft = $f.land.sqft
        landStatus = $f.land.status
        landNote = $f.land.note
        gridContext = $f.gridContext
        localBenefits = $f.localBenefits
        localConcerns = $f.localConcerns
        sources = $f.sources
        registrySource = "Corporate Environmental Disclosures & Public Filings"
    }
    $feat = @{
        type = "Feature"
        geometry = @{ type = "Point"; coordinates = @([double]$f.lng, [double]$f.lat) }
        properties = $props
    }
    $features.Add($feat)
    $flagshipIndex += @{ lat = [double]$f.lat; lng = [double]$f.lng; feature = $feat; name = $f.name.ToLower(); operator = $f.operator.ToLower() }
    $flagshipCount++
}

# 2. Load Epoch AI U.S. Frontier AI Data Centers
if ((Test-Path $epochCsvPath) -and (Test-Path $epochCoordsPath)) {
    $epochRows = Import-Csv $epochCsvPath -Encoding UTF8 | Where-Object { $_.Country -match "United States" }
    $coordObj = Get-Content $epochCoordsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $coordMap = @{}
    foreach ($p in $coordObj.PSObject.Properties) { $coordMap[$p.Name] = $p.Value }

    $idx = 0
    foreach ($r in $epochRows) {
        $idx++
        $name = $r.Name.Trim()
        if (-not $coordMap.ContainsKey($name)) { continue }
        $c = $coordMap[$name]
        $lat = [double]$c.lat
        $lng = [double]$c.lng
        if (-not (Is-ValidUSCoord $lat $lng)) { continue }

        $mw = 0.0
        [void][double]::TryParse($r.'Current power (MW)', [ref]$mw)
        $h100 = 0.0
        [void][double]::TryParse($r.'Current H100 equivalents', [ref]$h100)
        $capex = 0.0
        [void][double]::TryParse($r.'Current total capital cost (2025 USD billions)', [ref]$capex)

        $owner = Clean-EpochTag $r.Owner
        $users = Clean-EpochTag $r.Users
        $chips = ($r.'Current chip types' -replace ',', ', ').Trim()
        $energyCo = ($r.'Energy companies').Trim()
        $addr = ($r.Address -replace '\s+', ' ').Trim()
        $city = if ($c.city) { [string]$c.city } else { "" }
        if ([string]::IsNullOrWhiteSpace($city) -and -not [string]::IsNullOrWhiteSpace($addr)) {
            $cm = [regex]::Match($addr, ',\s*([^,]+),\s*[A-Z]{2}\b')
            if ($cm.Success) { $city = $cm.Groups[1].Value.Trim() }
        }
        $st = Normalize-State ([string]$c.state) $addr
        $epSources = Parse-MarkdownSources $r.'Selected Sources' $r.'Calculations sheet'

        # Check if within ~11 km of a flagship campus of same operator -> enrich the flagship card instead of duplicating pin!
        $matchedFlagship = $null
        foreach ($fi in $flagshipIndex) {
            $dLat = [Math]::Abs($fi.lat - $lat)
            $dLng = [Math]::Abs($fi.lng - $lng)
            if ($dLat -lt 0.105 -and $dLng -lt 0.105) {
                $firstWord = if ($owner) { ($owner -split '[\s(/]+')[0] } else { "" }
                $sameOp = ($firstWord -and ($fi.operator -match [regex]::Escape($firstWord) -or $fi.name -match [regex]::Escape($firstWord)))
                $sameName = ($fi.name -match "stargate" -and $name -match "Stargate") -or ($fi.name -match "colossus" -and $name -match "Colossus") -or ($fi.name -match "rainier" -and $name -match "New Carlisle") -or ($fi.name -match "hyperion" -and $name -match "Hyperion")
                if ($sameOp -or $sameName) {
                    $matchedFlagship = $fi.feature
                    break
                }
            }
        }

        if ($matchedFlagship -ne $null) {
            if ($h100 -gt 0 -and (-not $matchedFlagship.properties.h100Equiv -or $h100 -gt $matchedFlagship.properties.h100Equiv)) {
                $matchedFlagship.properties.h100Equiv = [Math]::Round($h100, 0)
                $matchedFlagship.properties.chipTypes = $chips
                $matchedFlagship.properties.capexBillions = if ($capex -gt 0) { [Math]::Round($capex, 2) } else { $null }
                $matchedFlagship.properties.aiUsers = $users
            }
            # Append up to 3 unique Epoch AI sources to flagship
            $existingUrls = @($matchedFlagship.properties.sources | ForEach-Object { $_.url })
            $added = 0
            foreach ($s in $epSources) {
                if ($existingUrls -notcontains $s.url -and $added -lt 3) {
                    $matchedFlagship.properties.sources += $s
                    $existingUrls += $s.url
                    $added++
                }
            }
            continue
        }

        $statusStr = if ($mw -gt 0) { "Operating / Scaling" } else { "Planned / Under Construction" }
        $summaryParts = @("Tracked in Epoch AI's Frontier AI Data Centers database.")
        if ($users) { $summaryParts += "Known compute users: $users." }
        if ($chips) { $summaryParts += "Reported accelerator hardware: $chips." }

        $props = @{
            id = "epoch-$idx"
            tier = "epoch_ai"
            category = "ai_hyperscale"
            name = $name
            operator = if ($owner) { $owner } else { "AI Infrastructure Developer" }
            status = $statusStr
            city = $city
            state = $st
            address = $addr
            summary = ($summaryParts -join " ")
            powerMw = if ($mw -gt 0) { [Math]::Round($mw, 1) } else { $null }
            annualMwh = $null
            powerStatus = if ($mw -gt 0) { "estimated" } else { "undisclosed" }
            powerNote = if ($mw -gt 0) { "Current active IT power capacity modeled by Epoch AI from permits, satellite imagery, and disclosures." } else { "Planned/under-construction AI campus; active operational MW not yet online." }
            waterMillionGal = $null
            waterWithdrawnMillionGal = $null
            coolingType = $null
            waterStress = $null
            waterStatus = "undisclosed"
            waterNote = "Site-level water consumption is not publicly disclosed."
            landAcres = $null
            landSqft = $null
            landStatus = "undisclosed"
            h100Equiv = if ($h100 -gt 0) { [Math]::Round($h100, 0) } else { $null }
            chipTypes = $chips
            capexBillions = if ($capex -gt 0) { [Math]::Round($capex, 2) } else { $null }
            aiUsers = $users
            gridContext = if ($energyCo) { "Utility / Energy partner: $energyCo" } else { $null }
            sources = @($epSources | Select-Object -First 6)
            registrySource = "Epoch AI Frontier Data Centers Database"
        }

        $features.Add(@{
            type = "Feature"
            geometry = @{ type = "Point"; coordinates = @([Math]::Round($lng, 5), [Math]::Round($lat, 5)) }
            properties = $props
        })
        $epochCount++
    }
}

# 3. Load PeeringDB U.S. Colocation / Interconnection Data Centers
if (Test-Path $peeringPath) {
    $pdb = (Get-Content $peeringPath -Raw -Encoding UTF8 | ConvertFrom-Json).data
    foreach ($fac in $pdb) {
        if ($fac.status -ne "ok") { continue }
        if ($null -eq $fac.latitude -or $null -eq $fac.longitude) { continue }
        $lat = [double]$fac.latitude
        $lng = [double]$fac.longitude
        if (-not (Is-ValidUSCoord $lat $lng)) { continue }

        $st = Normalize-State ([string]$fac.state) ([string]$fac.address1) ([string]$fac.zipcode)
        $addr = (@($fac.address1, $fac.city, $st, $fac.zipcode) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join ", "

        # Omit repetitive default properties for PeeringDB entries (hydrated on load in app/utils.js) to cut GeoJSON size >50%
        $props = @{
            id = "pdb-$($fac.id)"
            pdbId = [int]$fac.id
            name = $fac.name.Trim()
            operator = if ($fac.org_name) { $fac.org_name.Trim() } else { "Colocation Operator" }
            city = if ($fac.city) { $fac.city.Trim() } else { "" }
            state = $st
            address = $addr
            netCount = [int]$fac.net_count
            ixCount = [int]$fac.ix_count
            carrierCount = [int]$fac.carrier_count
        }
        if (-not [string]::IsNullOrWhiteSpace($fac.website) -and $fac.website -match '^https?://') {
            $props.website = $fac.website.Trim()
        }

        $features.Add(@{
            type = "Feature"
            geometry = @{ type = "Point"; coordinates = @([Math]::Round($lng, 5), [Math]::Round($lat, 5)) }
            properties = $props
        })
        $peeringCount++
    }
}

$geojson = @{
    type = "FeatureCollection"
    features = $features
}

$geojsonOut = Join-Path $outDir "facilities.geojson"
$jsonText = $geojson | ConvertTo-Json -Depth 7 -Compress
[System.IO.File]::WriteAllText($geojsonOut, $jsonText, (New-Object System.Text.UTF8Encoding($false)))

Copy-Item -Path $industriesPath -Destination (Join-Path $outDir "industries.json") -Force

$meta = @{
    builtAt = (Get-Date).ToString("yyyy-MM-dd")
    totalFacilities = $features.Count
    flagshipCount = $flagshipCount
    epochAiCount = $epochCount
    peeringDbCount = $peeringCount
}
$metaText = $meta | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText((Join-Path $outDir "meta.json"), $metaText, (New-Object System.Text.UTF8Encoding($false)))

$sizeKb = [Math]::Round((Get-Item $geojsonOut).Length / 1024, 1)
Write-Host "Built dataset successfully:"
Write-Host "  Total mapped facilities : $($features.Count)"
Write-Host "  Flagship impact sites   : $flagshipCount"
Write-Host "  Epoch AI campuses       : $epochCount"
Write-Host "  PeeringDB colocation    : $peeringCount"
Write-Host "  GeoJSON bundle size     : $sizeKb KB"
