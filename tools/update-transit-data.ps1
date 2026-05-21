$ErrorActionPreference = "Stop"

$DataBase = "https://transport.tallinn.ee"
$LiveDir = Join-Path $PSScriptRoot "..\data\live"
$ShapesDir = Join-Path $LiveDir "shapes"
$TramShapesDir = Join-Path $ShapesDir "tram"

New-Item -ItemType Directory -Force -Path $ShapesDir | Out-Null
New-Item -ItemType Directory -Force -Path $TramShapesDir | Out-Null

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

        $line = (Clean-Text $row[0]).ToUpperInvariant()
        $transport = (Clean-Text $row[3]).ToLowerInvariant()

        if ($line -ne "") {
            if ($line -notmatch "^[0-9A-Z]+$") {
                continue
            }
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
}

foreach ($type in @("bus", "tram")) {
    foreach ($line in Get-RouteLines -RoutesText $routes -WantedTransport $type) {
        $shapeUri = "$DataBase/data/tallinna-linn_${type}_$([uri]::EscapeDataString($line)).txt"
        $shapePath = if ($type -eq "tram") { Join-Path $TramShapesDir "$line.txt" } else { Join-Path $ShapesDir "$line.txt" }

        try {
            [void](Save-TransitText -Uri $shapeUri -Path $shapePath)
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
} | ConvertTo-Json -Depth 4

[System.IO.File]::WriteAllText((Resolve-FullPath (Join-Path $LiveDir "manifest.json")), $manifest, [System.Text.Encoding]::UTF8)
Write-Host "Updated transit mirror: $($shapeLines.bus.Count) bus and $($shapeLines.tram.Count) tram shape files."
