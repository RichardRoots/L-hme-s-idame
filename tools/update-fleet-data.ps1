$ErrorActionPreference = "Stop"

$Sources = @(
    "https://ebus.ee/index.php?a=ps&did=8&v=list",
    "https://ebus.ee/index.php?a=ps&did=13&v=list"
)
$DataDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot (Join-Path ".." "data")))
$OutputPath = Join-Path $DataDir "fleet.json"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
function Clean-HtmlText {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) {
        return ""
    }

    $withoutTags = $Value -replace "<[^>]+>", ""
    $decoded = [System.Net.WebUtility]::HtmlDecode($withoutTags)
    return (($decoded -replace "\s+", " ").Trim())
}

function Vehicle-Profile {
    param([Parameter(Mandatory = $true)][string]$Model)

    $modelLower = $Model.ToLowerInvariant()
    $isElectric = $modelLower -match "electric|ecitaro|\bev\b|12m ev|e-bus|elektr"
    $isHybrid = $modelLower -match "hybrid"
    $isCng = $modelLower -match "cng|gaas"
    $isArticulated = $modelLower -match "\b18\b|18m|a40|6x2|ng323|ng313|liigend|articulated|gl "
    $isStandard = $modelLower -match "\b12\b|12m|12\.|a78|a21|nl283|el293|7900|procity|urbino iv 12|urbino 12|irizar i4 12"

    $power = "unknown"
    $powerLabel = "Ajam teadmata"
    $powerShort = "?"
    if ($isElectric) {
        $power = "electric"
        $powerLabel = "Elektribuss"
        $powerShort = "elekter"
    } elseif ($isHybrid) {
        $power = "hybrid"
        $powerLabel = "H$([char]0x00FC)briid"
        $powerShort = "h$([char]0x00FC)briid"
    } elseif ($isCng) {
        $power = "cng"
        $powerLabel = "Gaasibuss"
        $powerShort = "gaas"
    } else {
        $power = "diesel"
        $powerLabel = "Diisel"
        $powerShort = "diisel"
    }

    $size = "unknown"
    $sizeLabel = "Pikkus teadmata"
    $lengthMeters = $null
    $badge = "?"
    if ($isArticulated) {
        $size = "articulated"
        $sizeLabel = "Pikk buss"
        $lengthMeters = 18
        $badge = "18"
    } elseif ($isStandard) {
        $size = "standard"
        $sizeLabel = "L$([char]0x00FC)hike buss"
        $lengthMeters = 12
        $badge = "12"
    }

    return [ordered]@{
        size = $size
        sizeLabel = $sizeLabel
        lengthMeters = $lengthMeters
        power = $power
        powerLabel = $powerLabel
        powerShort = $powerShort
        isElectric = $isElectric
        isArticulated = $isArticulated
        badge = $badge
    }
}

$rowRegex = [regex]::new(
    '<tr[^>]*>\s*<td[^>]*>\s*<a[^>]*>(?:<b>)?(?<id>[^<]*)(?:</b>)?</a>\s*<td[^>]*>\s*<a[^>]*>(?:<b>)?(?<reg>[^<]*)(?:</b>)?</a></td>\s*<td>\s*<a[^>]*>\s*<b>(?<model>.*?)</b>\s*</a>\s*</td>\s*<td>(?<year>.*?)</td>\s*<td>(?<factory>.*?)</td>\s*<td>(?<started>.*?)</td>\s*<td>(?<retired>.*?)</td>\s*<td>(?<note>.*?)</td>\s*</tr>',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$vehicles = [ordered]@{}
foreach ($source in $Sources) {
    $tempPath = Join-Path $DataDir ("fleet-source-{0}.html" -f ([Array]::IndexOf($Sources, $source)))
    Invoke-WebRequest -Uri $source -UseBasicParsing -OutFile $tempPath
    $html = [System.IO.File]::ReadAllText(([System.IO.Path]::GetFullPath($tempPath)), [System.Text.Encoding]::UTF8)

    foreach ($match in $rowRegex.Matches($html)) {
        $id = Clean-HtmlText $match.Groups["id"].Value
        if ($id -notmatch "^\d{3,5}$") {
            continue
        }

        $retired = Clean-HtmlText $match.Groups["retired"].Value
        if ($retired -ne "") {
            continue
        }

        $model = Clean-HtmlText $match.Groups["model"].Value
        if ($model -eq "") {
            continue
        }

        $profile = Vehicle-Profile $model
        $vehicles[$id] = [ordered]@{
            id = $id
            registration = Clean-HtmlText $match.Groups["reg"].Value
            model = $model
            year = Clean-HtmlText $match.Groups["year"].Value
            factoryNumber = Clean-HtmlText $match.Groups["factory"].Value
            inServiceSince = Clean-HtmlText $match.Groups["started"].Value
            note = Clean-HtmlText $match.Groups["note"].Value
            sourceUrl = $source
            size = $profile.size
            sizeLabel = $profile.sizeLabel
            lengthMeters = $profile.lengthMeters
            power = $profile.power
            powerLabel = $profile.powerLabel
            powerShort = $profile.powerShort
            isElectric = $profile.isElectric
            isArticulated = $profile.isArticulated
            badge = $profile.badge
        }
    }

    Remove-Item -LiteralPath $tempPath -ErrorAction SilentlyContinue
}

$payload = [ordered]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sources = $Sources
    vehicles = $vehicles
}

$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(([System.IO.Path]::GetFullPath($OutputPath)), $json, [System.Text.Encoding]::UTF8)
Write-Host "Updated fleet data: $($vehicles.Count) active vehicles."
