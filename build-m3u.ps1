# Generate Radyo.m3u playlist by crawling canliradyodinle.fm
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

Add-Type -AssemblyName System.Net.Http

Write-Host 'Starting build-m3u.ps1'

function Get-StationLinks {
    param(
        [Parameter()][string]$SourceFile = 'site.html'
    )

    if (-not (Test-Path -LiteralPath $SourceFile)) {
        throw "Source file '$SourceFile' not found. Run Invoke-WebRequest to download the homepage first."
    }

    $content = Get-Content -LiteralPath $SourceFile -Raw
    $pattern = 'https://www\.canliradyodinle\.fm/[^"#\?]+\.html'
    $links = [regex]::Matches($content, $pattern) | ForEach-Object { $_.Value } | Sort-Object -Unique
    $stationLinks = $links | Where-Object { $_ -match '-dinle\.html$' }
    return $stationLinks
}

function Get-StationLinksFromCategories {
    param(
        [Parameter()][System.Net.Http.HttpClient]$Client
    )

    $categories = @(
        'https://www.canliradyodinle.fm/radyolar/turkce-pop-radyolari',
        'https://www.canliradyodinle.fm/radyolar/turkce-slow-radyolari',
        'https://www.canliradyodinle.fm/radyolar/arabesk-radyolari',
        'https://www.canliradyodinle.fm/radyolar/turk-halk-muzigi-radyolari',
        'https://www.canliradyodinle.fm/radyolar/turk-sanat-muzigi-radyolari',
        'https://www.canliradyodinle.fm/radyolar/islami-radyolar',
        'https://www.canliradyodinle.fm/radyolar/haber-spor-radyolari',
        'https://www.canliradyodinle.fm/radyolar/rap-rock-radyolari',
        'https://www.canliradyodinle.fm/radyolar/yabanci-muzik-radyolari',
        'https://www.canliradyodinle.fm/radyolar/web-radyolari',
        'https://www.canliradyodinle.fm/radyolar/klasik-muzik-radyolari'
    )

    $allLinks = New-Object System.Collections.Generic.HashSet[string]
    
    foreach ($catUrl in $categories) {
        try {
            Write-Host "Crawling category: $catUrl"
            $content = $Client.GetStringAsync($catUrl).GetAwaiter().GetResult()
            $pattern = 'https://www\.canliradyodinle\.fm/[^"#\?]+-dinle\.html'
            $matches = [regex]::Matches($content, $pattern)
            foreach ($match in $matches) {
                $allLinks.Add($match.Value) | Out-Null
            }
            Start-Sleep -Milliseconds 500
        } catch {
            Write-Warning "Failed to crawl category $catUrl : $_"
        }
    }

    return @($allLinks)
}

function Get-StationLinksFromSitemap {
    param(
        [Parameter()][System.Net.Http.HttpClient]$Client
    )

    $allLinks = New-Object System.Collections.Generic.HashSet[string]
    
    try {
        Write-Host "Crawling sitemap..."
        $sitemapUrl = 'https://www.canliradyodinle.fm/sitemap_index.xml'
        $sitemapContent = $Client.GetStringAsync($sitemapUrl).GetAwaiter().GetResult()
        
        # Extract sitemap URLs
        $sitemapPattern = '<loc>([^<]+sitemap[^<]+)</loc>'
        $sitemapMatches = [regex]::Matches($sitemapContent, $sitemapPattern)
        
        foreach ($sitemapMatch in $sitemapMatches) {
            $subSitemapUrl = $sitemapMatch.Groups[1].Value
            try {
                Write-Host "  Crawling sub-sitemap: $subSitemapUrl"
                $subContent = $Client.GetStringAsync($subSitemapUrl).GetAwaiter().GetResult()
                $urlPattern = '<loc>(https://www\.canliradyodinle\.fm/[^<]+-dinle\.html)</loc>'
                $urlMatches = [regex]::Matches($subContent, $urlPattern)
                foreach ($urlMatch in $urlMatches) {
                    $allLinks.Add($urlMatch.Groups[1].Value) | Out-Null
                }
                Start-Sleep -Milliseconds 300
            } catch {
                Write-Warning "  Failed to crawl sub-sitemap $subSitemapUrl : $_"
            }
        }
    } catch {
        Write-Warning "Failed to crawl sitemap: $_"
    }

    return @($allLinks)
}

function Get-StationInfo {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter()][System.Net.Http.HttpClient]$Client
    )

    Write-Host "Processing $Url"

    $response = $Client.GetStringAsync($Url).GetAwaiter().GetResult()
    $page = $response

    $radyoId = [regex]::Match($page, '"radyo":"(\d+)"').Groups[1].Value
    if (-not $radyoId) {
        Write-Warning "No radyo id found for $Url"
        return $null
    }

    $name = [regex]::Match($page, '<h1[^>]*><span>([^<]+)').Groups[1].Value.Trim()
    if (-not $name) {
        $name = [regex]::Match($page, '<meta property="og:title" content="([^"\r\n]+)').Groups[1].Value.Trim()
    }

    # Try multiple sources for logo
    $logo = [regex]::Match($page, '<meta property="og:image" content="([^"\r\n]+)').Groups[1].Value.Trim()
    if (-not $logo) {
        $logo = [regex]::Match($page, '<meta itemprop="image" content="([^"\r\n]+)').Groups[1].Value.Trim()
    }
    if (-not $logo) {
        $logoMatch = [regex]::Match($page, '<img[^>]+class="radyo-oynatici-logo"[^>]+src="([^"]+)"')
        if ($logoMatch.Success) {
            $logo = $logoMatch.Groups[1].Value.Trim()
        }
    }
    if (-not $logo) {
        $logoMatch = [regex]::Match($page, '<img[^>]+alt="[^"]*' + [regex]::Escape($name) + '[^"]*"[^>]+src="([^"]+)"')
        if ($logoMatch.Success) {
            $logo = $logoMatch.Groups[1].Value.Trim()
        }
    }

    $streams = @()
    for ($yayin = 1; $yayin -le 3; $yayin++) {
        $playerUrl = "https://www.canliradyodinle.fm/radyo-cal?type=shouthtml&radyoid=$radyoId&yayinno=$yayin"
        try {
            $playerContent = $Client.GetStringAsync($playerUrl).GetAwaiter().GetResult()
        } catch {
            continue
        }

        $primary = [regex]::Match($playerContent, '<source[^>]+src="([^"]+)"').Groups[1].Value
        if ($primary) {
            $streams += $primary
        }

        $fallbackMatches = [regex]::Matches($playerContent, 'player\.src\(\{"type":"[^"]+","src":"([^"]+)"\}\)')
        foreach ($match in $fallbackMatches) {
            $streams += $match.Groups[1].Value
        }
    }

    $streams = @($streams | Where-Object { $_ -and ($_ -match '^https?://') } | Select-Object -Unique)
    if ($streams.Count -eq 0) {
        Write-Warning "No streams found for $Url (id=$radyoId)"
        return $null
    }

    return [PSCustomObject]@{
        Name    = $name
        Logo    = $logo
        Streams = $streams
    }
}

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$handler.AllowAutoRedirect = $true
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$client.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36')

$stationLinks = Get-StationLinks
Write-Host "Found $($stationLinks.Count) station pages from homepage."

# Get additional links from category pages
$categoryLinks = Get-StationLinksFromCategories -Client $client
Write-Host "Found $($categoryLinks.Count) additional station pages from categories."

# Get links from sitemap
$sitemapLinks = Get-StationLinksFromSitemap -Client $client
Write-Host "Found $($sitemapLinks.Count) additional station pages from sitemap."

# Combine and deduplicate
$allStationLinks = New-Object System.Collections.Generic.HashSet[string]
foreach ($link in $stationLinks) {
    $allStationLinks.Add($link) | Out-Null
}
foreach ($link in $categoryLinks) {
    $allStationLinks.Add($link) | Out-Null
}
foreach ($link in $sitemapLinks) {
    $allStationLinks.Add($link) | Out-Null
}

$stationLinks = @($allStationLinks)
Write-Host "Total unique station pages: $($stationLinks.Count)"

$stationInfos = @()
foreach ($link in $stationLinks) {
    try {
        $info = Get-StationInfo -Url $link -Client $client
        if ($info) {
            $stationInfos += $info
        }
    } catch {
        Write-Warning "Failed to process $link : $_"
    }
}

if ($stationInfos.Count -eq 0) {
    throw 'No station streams were collected.'
}

$m3uLines = New-Object System.Collections.Generic.List[string]
$m3uLines.Add('#EXTM3U') | Out-Null

foreach ($station in $stationInfos) {
    # Use first valid stream for each station
    $stream = $station.Streams[0]
    if ($stream) {
        $logoAttr = if ($station.Logo) { $station.Logo } else { '' }
        $m3uLines.Add("#EXTINF:-1 tvg-logo=""$logoAttr"" group-title=""canliradyodinle.fm"",$($station.Name)") | Out-Null
        $m3uLines.Add($stream) | Out-Null
    }
}

$outputPath = 'Radyo.m3u'
$m3uLines | Set-Content -LiteralPath $outputPath -Encoding UTF8

Write-Host "Generated $outputPath with $($m3uLines.Count - 1) stream entries."
