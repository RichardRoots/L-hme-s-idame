$ErrorActionPreference = "Stop"

$DataBase = "https://transport.tallinn.ee"
$LiveDir = Join-Path $PSScriptRoot "..\data\live"
$ShapesDir = Join-Path $LiveDir "shapes"
$TramShapesDir = Join-Path $ShapesDir "tram"
$TrolleyShapesDir = Join-Path $ShapesDir "trolleybus"

New-Item -ItemType Directory -Force -Path $ShapesDir | Out-Null
New-Item -ItemType Directory -Force -Path $TramShapesDir | Out-Null
New-Item -ItemType Directory -Force -Path $TrolleyShapesDir | Out-Null
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Save-TransitText {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $fullPath = Resolve-FullPath $Path
    Invoke-WebRequest -Uri $Uri -UseBasicParsing -OutFile $fullPath
    return [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
}

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    return [System.IO.Path]::GetFullPath($Path)
}

function Clean-Text {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) {
        return ""
    }

    return (($Value -replace "^\uFEFF", "") -replace "\s+", " ").Trim()
}

function Normalize-TransportType {
    param([AllowNull()][string]$Value)

    $normalized = (Clean-Text $Value).ToLowerInvariant()
    if ($normalized -eq "tram") {
        return "tram"
    }
    if ($normalized -eq "trol" -or $normalized -eq "trolley" -or $normalized -eq "trolleybus") {
        return "trolleybus"
    }
    return "bus"
}

function Get-ShapeTransportName {
    param([Parameter(Mandatory = $true)][string]$Value)

    $normalized = Normalize-TransportType $Value
    if ($normalized -eq "tram") {
        return "tram"
    }
    if ($normalized -eq "trolleybus") {
        return "trol"
    }
    return "bus"
}

function Normalize-RouteLine {
    param(
        [AllowNull()][string]$Value,
        [AllowNull()][string]$TransportType
    )

    $normalizedType = Normalize-TransportType $TransportType
    $cleaned = (Clean-Text $Value) -replace "\s*\(.+\)\s*$", ""
    $cleaned = $cleaned.ToUpperInvariant()
    if ($normalizedType -eq "tram") {
        $cleaned = $cleaned -replace "^T(?=\d)", ""
    }
    if ($cleaned -match "^[0-9A-Z]+$") {
        return $cleaned
    }
    return ""
}

function Get-ShapeLineName {
    param(
        [Parameter(Mandatory = $true)][string]$TransportType,
        [Parameter(Mandatory = $true)][string]$Line
    )

    $normalizedType = Normalize-TransportType $TransportType
    $normalizedLine = ((Clean-Text $Line) -replace "\s*\(.+\)\s*$", "") -replace "[^0-9A-Za-z]", ""
    $normalizedLine = $normalizedLine.ToLowerInvariant()
    if ($normalizedType -eq "tram" -and $normalizedLine -notmatch "^t") {
        return "t$normalizedLine"
    }
    return $normalizedLine
}

function Format-ShapeText {
    param([AllowNull()][string]$Value)

    $lines = [string]$Value -split "\r\n|\r|\n"
    while ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -eq "") {
        if ($lines.Count -eq 1) {
            $lines = @()
        } else {
            $lines = $lines[0..($lines.Count - 2)]
        }
    }

    return (($lines | ForEach-Object { $_.TrimEnd() }) -join "`n") + "`n"
}

function Get-RouteLines {
    param(
        [Parameter(Mandatory = $true)][string]$RoutesText,
        [Parameter(Mandatory = $true)][string]$WantedTransport
    )

    $lines = [System.Collections.Generic.HashSet[string]]::new()
    $currentLine = ""
    $currentTransport = ""
    $rows = $RoutesText -split "\r\n|\r|\n"

    foreach ($textRow in $rows | Select-Object -Skip 1) {
        if ([string]::IsNullOrWhiteSpace($textRow)) {
            continue
        }

        $row = $textRow -split ";", -1
        while ($row.Count -lt 14) {
            $row += ""
        }

        $rawTransport = (Clean-Text $row[3]).ToLowerInvariant()
        $transport = if ($rawTransport -ne "") { Normalize-TransportType $rawTransport } else { "" }
        $typeHint = $transport
        if ($typeHint -eq "") {
            $typeHint = if ($currentTransport -ne "") { $currentTransport } else { $WantedTransport }
        }
        $line = Normalize-RouteLine -Value $row[0] -TransportType $typeHint

        if ($line -ne "") {
            $currentLine = $line
        }

        if ($transport -ne "") {
            $currentTransport = $transport
        }

        $routeStops = Clean-Text $row[13]
        $matchesTransport = $currentTransport -eq $WantedTransport -or ($WantedTransport -eq "bus" -and $currentTransport -eq "")
        if ($currentLine -ne "" -and $matchesTransport -and $routeStops -ne "") {
            [void]$lines.Add($currentLine)
        }
    }

    return $lines | Sort-Object { [int]($_ -replace "\D.*$", "0") }, { $_ }
}

$gps = Save-TransitText -Uri "$DataBase/gps.txt" -Path (Join-Path $LiveDir "gps.txt")
$stops = Save-TransitText -Uri "$DataBase/data/stops.txt" -Path (Join-Path $LiveDir "stops.txt")
$routes = Save-TransitText -Uri "$DataBase/data/routes.txt" -Path (Join-Path $LiveDir "routes.txt")

$shapeLines = @{
    bus = @()
    tram = @()
    trolleybus = @()
}

foreach ($type in @("bus", "tram", "trolleybus")) {
    foreach ($line in Get-RouteLines -RoutesText $routes -WantedTransport $type) {
        $shapeTransport = Get-ShapeTransportName $type
        $shapeLine = Get-ShapeLineName -TransportType $type -Line $line
        $shapeUri = "$DataBase/data/tallinna-linn_${shapeTransport}_$([uri]::EscapeDataString($shapeLine)).txt"
        $shapePath = if ($type -eq "tram") { Join-Path $TramShapesDir "$line.txt" } elseif ($type -eq "trolleybus") { Join-Path $TrolleyShapesDir "$line.txt" } else { Join-Path $ShapesDir "$line.txt" }

        try {
            $shape = Format-ShapeText (Save-TransitText -Uri $shapeUri -Path $shapePath)
            [System.IO.File]::WriteAllText((Resolve-FullPath $shapePath), $shape, $Utf8NoBom)
            $shapeLines[$type] += $line
        } catch {
            Write-Warning "$type shape $line skipped: $($_.Exception.Message)"
        }
    }
}

$manifest = [ordered]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    source = $DataBase
    vehiclesBytes = $gps.Length
    stopsBytes = $stops.Length
    routesBytes = $routes.Length
    shapeLines = $shapeLines.bus
    tramShapeLines = $shapeLines.tram
    trolleyShapeLines = $shapeLines.trolleybus
} | ConvertTo-Json -Depth 4

[System.IO.File]::WriteAllText((Resolve-FullPath (Join-Path $LiveDir "manifest.json")), $manifest, $Utf8NoBom)
Write-Host "Updated transit mirror: $($shapeLines.bus.Count) bus, $($shapeLines.tram.Count) tram and $($shapeLines.trolleybus.Count) trolley shape files."
