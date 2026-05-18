$ErrorActionPreference = "Stop"

$DataBase = "https://transport.tallinn.ee"
$LiveDir = Join-Path $PSScriptRoot "..\data\live"
$ShapesDir = Join-Path $LiveDir "shapes"

New-Item -ItemType Directory -Force -Path $ShapesDir | Out-Null

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
    param([Parameter(Mandatory = $true)][string]$RoutesText)

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
        if ($currentLine -ne "" -and ($currentTransport -eq "" -or $currentTransport -eq "bus") -and $routeStops -ne "") {
            [void]$lines.Add($currentLine)
        }
    }

    return $lines | Sort-Object { [int]($_ -replace "\D.*$", "0") }, { $_ }
}

$gps = Save-TransitText -Uri "$DataBase/gps.txt" -Path (Join-Path $LiveDir "gps.txt")
$stops = Save-TransitText -Uri "$DataBase/data/stops.txt" -Path (Join-Path $LiveDir "stops.txt")
$routes = Save-TransitText -Uri "$DataBase/data/routes.txt" -Path (Join-Path $LiveDir "routes.txt")

$shapeLines = @()
foreach ($line in Get-RouteLines $routes) {
    $shapeUri = "$DataBase/data/tallinna-linn_bus_$([uri]::EscapeDataString($line)).txt"
    $shapePath = Join-Path $ShapesDir "$line.txt"

    try {
        [void](Save-TransitText -Uri $shapeUri -Path $shapePath)
        $shapeLines += $line
    } catch {
        Write-Warning "Shape $line skipped: $($_.Exception.Message)"
    }
}

$manifest = [ordered]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    source = $DataBase
    vehiclesBytes = $gps.Length
    stopsBytes = $stops.Length
    routesBytes = $routes.Length
    shapeLines = $shapeLines
} | ConvertTo-Json -Depth 4

[System.IO.File]::WriteAllText((Resolve-FullPath (Join-Path $LiveDir "manifest.json")), $manifest, [System.Text.Encoding]::UTF8)
Write-Host "Updated transit mirror: $($shapeLines.Count) route shape files."
