# Validate Radyo.m3u: detect broken and duplicate stations
[CmdletBinding()]
param(
    [string]$InputFile = 'Radyo.m3u',
    [string]$BrokenOutput = 'Radyo-broken.m3u',
    [string]$DuplicateOutput = 'Radyo-duplicates.m3u',
    [string]$ReportJson = 'stream-report.json',
    [int]$TimeoutSeconds = 3,
    [switch]$SkipNetworkTest,
    [int]$MaxConcurrent = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Net.Http

function Get-M3UStations {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Input file '$Path' not found."
    }

    $lines = Get-Content -LiteralPath $Path -Encoding UTF8
    if (-not $lines) {
        return @()
    }

    $stations = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i].Trim()
        if ($line -like '#EXTINF*') {
            $extInf = $lines[$i]
            $name = ''
            $group = 'Genel'
            $logo = ''

            $nameSeparator = $line.LastIndexOf(',')
            if ($nameSeparator -ge 0 -and $nameSeparator -lt $line.Length - 1) {
                $name = $line.Substring($nameSeparator + 1).Trim()
            }

            if ([string]::IsNullOrWhiteSpace($name)) {
                $name = 'Bilinmeyen Radyo'
            }

            if ($line -match 'group-title="([^"]*)"') {
                $groupValue = $matches[1].Trim()
                if ($groupValue) {
                    $group = $groupValue
                }
            }

            if ($line -match 'tvg-logo="([^"]*)"') {
                $logo = $matches[1].Trim()
            }

            # Find the next non-empty, non-comment line for the stream URL
            $url = ''
            $j = $i + 1
            while ($j -lt $lines.Count) {
                $candidate = $lines[$j].Trim()
                if ($candidate -and -not $candidate.StartsWith('#')) {
                    $url = $candidate
                    $i = $j
                    break
                }
                $j++
            }

            $stations += [PSCustomObject]@{
                Name   = $name
                Group  = $group
                Logo   = $logo
                Url    = $url
                ExtInf = $extInf
            }
        }
    }

    return $stations
}

function Normalize-StreamUrl {
    param([string]$Url)
    if (-not $Url) { return '' }
    $normalized = $Url -replace ';stream\.mp3$', ''
    $normalized = $normalized -replace '[?/;]+$', ''
    return $normalized.ToLowerInvariant()
}

function Write-M3UFile {
    param(
        [string]$Path,
        [System.Collections.IEnumerable]$Stations
    )

    if (-not $Stations) {
        if (Test-Path -LiteralPath $Path) {
            Remove-Item -LiteralPath $Path -Force
        }
        return
    }

    $output = New-Object System.Collections.Generic.List[string]
    $output.Add('#EXTM3U') | Out-Null
    foreach ($station in $Stations) {
        $output.Add($station.ExtInf) | Out-Null
        $output.Add($station.Url) | Out-Null
    }
    $output | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Test-StreamAvailability {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][System.Net.Http.HttpClient]$Client,
        [int]$TimeoutSeconds = 8
    )

    $result = [PSCustomObject]@{
        Url         = $Url
        IsWorking   = $false
        StatusCode  = $null
        ContentType = $null
        Reason      = ''
    }

    if ([string]::IsNullOrWhiteSpace($Url)) {
        $result.Reason = 'Boş URL'
        return $result
    }

    if ($Url -match 'placeholder') {
        $result.Reason = 'Placeholder'
        return $result
    }

    try {
        $cts = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))
        $request = $null
        $response = $null
        
        # Try HEAD first (much faster - only gets headers)
        try {
            $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Head, $Url)
            $response = $Client.SendAsync($request, $cts.Token).GetAwaiter().GetResult()
        } catch {
            # If HEAD fails (405 Method Not Allowed), try GET with headers only
            if ($request) { $request.Dispose() }
            if ($response) { $response.Dispose() }
            $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $Url)
            $response = $Client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $cts.Token).GetAwaiter().GetResult()
        }
        
        $result.StatusCode = [int]$response.StatusCode
        
        if (-not $response.IsSuccessStatusCode) {
            $result.Reason = "HTTP $($response.StatusCode)"
            if ($request) { $request.Dispose() }
            if ($response) { $response.Dispose() }
            return $result
        }

        if ($response.Content.Headers.ContentType) {
            $result.ContentType = $response.Content.Headers.ContentType.MediaType
        }

        # For streaming URLs, accept various content types or no content-type
        if ($result.ContentType -and $result.ContentType -notmatch 'audio|mpegurl|aac|mpeg|octet-stream|video|application') {
            $result.Reason = "Beklenmeyen content-type: $($result.ContentType)"
            if ($request) { $request.Dispose() }
            if ($response) { $response.Dispose() }
            return $result
        }

        $result.IsWorking = $true
        if ($request) { $request.Dispose() }
        if ($response) { $response.Dispose() }
        return $result
    } catch {
        $result.Reason = $_.Exception.Message
        return $result
    }
}

Write-Host "'$InputFile' dosyası okunuyor..."
$stations = Get-M3UStations -Path $InputFile

if ($stations.Count -eq 0) {
    Write-Warning 'M3U içinde kanal bulunamadı.'
    return
}

Write-Host ("Toplam {0} kanal bulundu." -f $stations.Count)

# Detect duplicates
$duplicateGroups = $stations |
    Where-Object { $_.Url } |
    Group-Object { Normalize-StreamUrl $_.Url } |
    Where-Object { $_.Count -gt 1 }

$duplicateStations = @()
foreach ($group in $duplicateGroups) {
    $duplicateStations += $group.Group
}

if ($duplicateStations.Count -gt 0) {
    Write-Host ("{0} adet çift kanal bulundu." -f $duplicateGroups.Count)
    Write-M3UFile -Path $DuplicateOutput -Stations $duplicateStations
    Write-Host ("   Ayrı dosya: {0}" -f $DuplicateOutput)
} else {
    Write-Host 'Çift kanal bulunamadı.'
    if (Test-Path -LiteralPath $DuplicateOutput) {
        Remove-Item -LiteralPath $DuplicateOutput -Force
    }
}

# Detect broken streams
$httpClient = $null
$brokenStations = @()
$testResults = @()

if ($SkipNetworkTest) {
    Write-Host 'Ağ testi atlandı (SkipNetworkTest). Sadece placeholder/boş URL tespiti yapılacak.'
    foreach ($station in $stations) {
        if (-not $station.Url -or $station.Url -match 'placeholder') {
            $brokenStations += $station
            $testResults += [PSCustomObject]@{
                Name        = $station.Name
                Url         = $station.Url
                Reason      = if ($station.Url) { 'Placeholder' } else { 'Boş URL' }
                StatusCode  = $null
                ContentType = $null
            }
        }
    }
} else {
    Write-Host 'Yayın kontrolleri başlatıldı (bu işlem uzun sürebilir)...'
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
    $handler.AllowAutoRedirect = $true

    $httpClient = [System.Net.Http.HttpClient]::new($handler)
    $httpClient.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds + 2)
    $httpClient.DefaultRequestHeaders.Add('User-Agent', 'PlusRadio/1.0 (+https://github.com)')

    $index = 0
    $lastProgressUpdate = 0
    foreach ($station in $stations) {
        $index++
        # Update progress every 10 stations to reduce overhead
        if ($index - $lastProgressUpdate -ge 10 -or $index -eq $stations.Count) {
            Write-Progress -Activity 'Yayın Testi' -Status ("{0}/{1} -> {2}" -f $index, $stations.Count, $station.Name) -PercentComplete (($index / $stations.Count) * 100)
            $lastProgressUpdate = $index
        }

        $result = Test-StreamAvailability -Url $station.Url -Client $httpClient -TimeoutSeconds $TimeoutSeconds
        $testResults += [PSCustomObject]@{
            Name        = $station.Name
            Url         = $station.Url
            Reason      = if ($result.IsWorking) { '' } else { $result.Reason }
            StatusCode  = $result.StatusCode
            ContentType = $result.ContentType
        }

        if (-not $result.IsWorking) {
            $brokenStations += $station
        }
    }

    Write-Progress -Activity 'Yayın Testi' -Completed
    if ($httpClient) { $httpClient.Dispose() }
}

if ($brokenStations.Count -gt 0) {
    Write-Host ("{0} kanal çalışmıyor gibi görünüyor." -f $brokenStations.Count)
    Write-M3UFile -Path $BrokenOutput -Stations $brokenStations
    Write-Host ("   Ayrı dosya: {0}" -f $BrokenOutput)
} else {
    Write-Host 'Tüm kanallar çalışır görünüyor.'
    if (Test-Path -LiteralPath $BrokenOutput) {
        Remove-Item -LiteralPath $BrokenOutput -Force
    }
}

# Export JSON report
$report = [ordered]@{
    generatedAt    = (Get-Date).ToString('o')
    inputFile      = $InputFile
    totalStations  = $stations.Count
    duplicateGroupCount = $duplicateGroups.Count
    duplicateStationCount = $duplicateStations.Count
    brokenStationCount = $brokenStations.Count
    timeoutSeconds = $TimeoutSeconds
    skipNetworkTest = [bool]$SkipNetworkTest
    duplicates = $duplicateGroups | ForEach-Object {
        [ordered]@{
            normalizedUrl = $_.Name
            stations = $_.Group | Select-Object Name, Url, Group
        }
    }
    brokenStations = $testResults | Where-Object { $_.Reason } | Select-Object Name, Url, Reason, StatusCode, ContentType
}

$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportJson -Encoding UTF8
Write-Host ("Rapor: {0}" -f $ReportJson)

Write-Host 'İşlem tamamlandı.'

