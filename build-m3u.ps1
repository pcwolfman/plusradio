# Generate Radyo.m3u playlist by crawling canliradyodinle.fm
[CmdletBinding()]
param(
    [int]$StreamTestTimeout = 3,
    [switch]$SkipStreamTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Set UTF-8 encoding for output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

Add-Type -AssemblyName System.Net.Http

Write-Host 'Starting build-m3u.ps1'

function Get-StationLinks {
    param(
        [Parameter()][System.Net.Http.HttpClient]$Client,
        [Parameter()][string]$SourceFile = 'site.html'
    )

    $content = $null
    if (Test-Path -LiteralPath $SourceFile) {
        $content = Get-Content -LiteralPath $SourceFile -Raw
    } else {
        Write-Host "Downloading homepage..."
        try {
            $content = $Client.GetStringAsync('https://www.canliradyodinle.fm/').GetAwaiter().GetResult()
        } catch {
            Write-Warning "Failed to download homepage: $_"
            return @()
        }
    }

    $pattern = 'https://www\.canliradyodinle\.fm/[^"#\?]+\.html'
    $links = [regex]::Matches($content, $pattern) | ForEach-Object { $_.Value } | Sort-Object -Unique
    $stationLinks = $links | Where-Object { $_ -match '-dinle\.html$' }
    return $stationLinks
}

function Get-StationLinksFromCategories {
    param(
        [Parameter()][System.Net.Http.HttpClient]$Client
    )

    # Category mapping: URL -> Category Name (from site navigation)
    # Use UTF-8 encoding to ensure Turkish characters are correct
    $utf8 = [System.Text.Encoding]::UTF8
    $categoryMap = @{
        'https://www.canliradyodinle.fm/radyolar/turkce-pop-radyolari' = $utf8.GetString([byte[]](0x50,0x6F,0x70))  # "Pop"
        'https://www.canliradyodinle.fm/radyolar/turkce-slow-radyolari' = $utf8.GetString([byte[]](0x53,0x6C,0x6F,0x77))  # "Slow"
        'https://www.canliradyodinle.fm/radyolar/arabesk-radyolari' = $utf8.GetString([byte[]](0x41,0x72,0x61,0x62,0x65,0x73,0x6B))  # "Arabesk"
        'https://www.canliradyodinle.fm/radyolar/turk-halk-muzigi-radyolari' = $utf8.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x48,0x61,0x6C,0x6B,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))  # "Türk Halk Müziği"
        'https://www.canliradyodinle.fm/radyolar/turk-sanat-muzigi-radyolari' = $utf8.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x53,0x61,0x6E,0x61,0x74,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))  # "Türk Sanat Müziği"
        'https://www.canliradyodinle.fm/radyolar/islami-radyolar' = $utf8.GetString([byte[]](0xC4,0xB0,0x73,0x6C,0x61,0x6D,0x69))  # "İslami"
        'https://www.canliradyodinle.fm/radyolar/haber-spor-radyolari' = $utf8.GetString([byte[]](0x48,0x61,0x62,0x65,0x72,0x20,0x26,0x20,0x53,0x70,0x6F,0x72))  # "Haber & Spor"
        'https://www.canliradyodinle.fm/radyolar/rap-rock-radyolari' = $utf8.GetString([byte[]](0x52,0x61,0x70,0x20,0x26,0x20,0x52,0x6F,0x63,0x6B))  # "Rap & Rock"
        'https://www.canliradyodinle.fm/radyolar/yabanci-muzik-radyolari' = $utf8.GetString([byte[]](0x59,0x61,0x62,0x61,0x6E,0x63,0xC4,0xB1))  # "Yabancı"
        'https://www.canliradyodinle.fm/radyolar/web-radyolari' = $utf8.GetString([byte[]](0x53,0x61,0x6E,0x61,0x6C))  # "Sanal"
        'https://www.canliradyodinle.fm/radyolar/klasik-muzik-radyolari' = $utf8.GetString([byte[]](0x4B,0x6C,0x61,0x73,0x69,0x6B))  # "Klasik"
    }

    $stationLinks = @() # Array of objects with Url and Category

    foreach ($catUrl in $categoryMap.Keys) {
        $categoryName = $categoryMap[$catUrl]
        try {
            Write-Host "Crawling category: $categoryName ($catUrl)"
            
            # Check for pagination - try multiple pages
            $page = 1
            $hasMorePages = $true
            while ($hasMorePages -and $page -le 10) {  # Limit to 10 pages per category
                $pageUrl = if ($page -eq 1) { $catUrl } else { "$catUrl/page/$page/" }
                try {
                    $content = $Client.GetStringAsync($pageUrl).GetAwaiter().GetResult()
                    $pattern = 'https://www\.canliradyodinle\.fm/[^"#\?]+-dinle\.html'
                    $matches = [regex]::Matches($content, $pattern)
                    $foundCount = 0
                    foreach ($match in $matches) {
                        $stationLinks += [PSCustomObject]@{
                            Url = $match.Value
                            Category = $categoryName
                        }
                        $foundCount++
                    }
                    
                    # Check if there's a next page link
                    if ($content -match 'class="[^"]*next[^"]*"[^>]*href="([^"]+)"' -or $content -match 'rel="next"[^>]*href="([^"]+)"') {
                        $page++
                    } else {
                        $hasMorePages = $false
                    }
                    
                    if ($foundCount -eq 0) {
                        $hasMorePages = $false
                    }
                    
                    Start-Sleep -Milliseconds 300
                } catch {
                    $hasMorePages = $false
                }
            }
            
            Start-Sleep -Milliseconds 200
        } catch {
            Write-Warning "Failed to crawl category $catUrl : $_"
        }
    }

    return $stationLinks
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
                # Try multiple patterns to catch all station URLs
                $urlPatterns = @(
                    '<loc>(https://www\.canliradyodinle\.fm/[^<]+-dinle\.html)</loc>',
                    '<loc>(https://www\.canliradyodinle\.fm/[^<]+\.html)</loc>'
                )
                foreach ($urlPattern in $urlPatterns) {
                    $urlMatches = [regex]::Matches($subContent, $urlPattern)
                    foreach ($urlMatch in $urlMatches) {
                        $url = $urlMatch.Groups[1].Value
                        # Only add if it looks like a station page
                        if ($url -match '-dinle\.html$' -or $url -match '/radyo[^/]*\.html$' -or $url -match '/[^/]+-fm[^/]*\.html$') {
                            $allLinks.Add($url) | Out-Null
                        }
                    }
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

function Test-StreamAvailability {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][System.Net.Http.HttpClient]$Client,
        [int]$TimeoutSeconds = 3
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
    
    # Try multiple stream sources
    # Method 1: Try player API with different yayin numbers (try more if needed)
    $maxYayin = 10  # Try up to 10 yayin numbers
    $foundStreams = 0
    
    for ($yayin = 1; $yayin -le $maxYayin; $yayin++) {
        $playerUrl = "https://www.canliradyodinle.fm/radyo-cal?type=shouthtml&radyoid=$radyoId&yayinno=$yayin"
        try {
            $playerContent = $Client.GetStringAsync($playerUrl).GetAwaiter().GetResult()
            
            # Try multiple patterns for stream URLs
            $patterns = @(
                '<source[^>]+src="([^"]+)"',
                'player\.src\(\{"type":"[^"]+","src":"([^"]+)"\}\)',
                'src["\s:=]+([^"\s]+\.m3u8[^"\s]*)',
                'src["\s:=]+([^"\s]+\.mp3[^"\s]*)',
                'url["\s:=]+([^"\s]+\.m3u8[^"\s]*)',
                'url["\s:=]+([^"\s]+\.mp3[^"\s]*)',
                '"stream":"([^"]+)"',
                '"url":"([^"]+)"',
                'streamUrl["\s:=]+([^"\s]+)'
            )
            
            $foundInThisYayin = $false
            foreach ($pattern in $patterns) {
                $matches = [regex]::Matches($playerContent, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                foreach ($match in $matches) {
                    $streamUrl = $match.Groups[1].Value
                    if ($streamUrl -match '^https?://' -and $streamUrl -notmatch '\.(jpg|png|gif|css|js)$') {
                        $streams += $streamUrl
                        $foundInThisYayin = $true
                        $foundStreams++
                    }
                }
            }
            
            # If we found streams in early yayin numbers, we can continue to get alternatives
            # But if we haven't found any streams yet and this yayin also has none, keep trying
            if ($foundInThisYayin) {
                # Found at least one stream, continue to get alternatives
            } elseif ($foundStreams -eq 0 -and $yayin -ge 3) {
                # No streams found yet after trying 3 yayin numbers, try a few more
                if ($yayin -ge 5) {
                    # Tried 5 yayin numbers with no results, try different methods
                    break
                }
            }
        } catch {
            # If we have streams already, continue trying alternatives
            # If we don't have any streams yet, keep trying
            if ($foundStreams -eq 0 -and $yayin -lt 5) {
                continue
            } else {
                break
            }
        }
    }
    
    # Method 2: Try to extract from page directly (only if we haven't found streams yet)
    if ($streams.Count -eq 0) {
        $pageStreamPatterns = @(
            '"stream":"([^"]+)"',
            '"streamUrl":"([^"]+)"',
            'data-stream="([^"]+)"',
            'data-url="([^"]+)"',
            'src="([^"]+\.m3u8[^"]*)"',
            'src="([^"]+\.mp3[^"]*)"',
            'radyo["\s:=]+([^"\s]+\.m3u8[^"\s]*)',
            'radyo["\s:=]+([^"\s]+\.mp3[^"\s]*)',
            'yayin["\s:=]+([^"\s]+\.m3u8[^"\s]*)',
            'yayin["\s:=]+([^"\s]+\.mp3[^"\s]*)'
        )
        foreach ($pattern in $pageStreamPatterns) {
            $matches = [regex]::Matches($page, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            foreach ($match in $matches) {
                $streamUrl = $match.Groups[1].Value
                if ($streamUrl -match '^https?://' -and $streamUrl -notmatch '\.(jpg|png|gif|css|js)$') {
                    $streams += $streamUrl
                }
            }
        }
    }
    
    # Method 3: Try alternative API endpoints if still no streams
    if ($streams.Count -eq 0) {
        $alternativeEndpoints = @(
            "https://www.canliradyodinle.fm/radyo-cal?type=json&radyoid=$radyoId",
            "https://www.canliradyodinle.fm/api/radyo/$radyoId",
            "https://www.canliradyodinle.fm/radyo/$radyoId/stream"
        )
        
        foreach ($endpoint in $alternativeEndpoints) {
            try {
                $apiContent = $Client.GetStringAsync($endpoint).GetAwaiter().GetResult()
                $jsonPatterns = @(
                    '"url":"([^"]+)"',
                    '"stream":"([^"]+)"',
                    '"src":"([^"]+)"',
                    'url["\s:=]+([^"\s]+\.m3u8[^"\s]*)',
                    'url["\s:=]+([^"\s]+\.mp3[^"\s]*)'
                )
                foreach ($pattern in $jsonPatterns) {
                    $matches = [regex]::Matches($apiContent, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    foreach ($match in $matches) {
                        $streamUrl = $match.Groups[1].Value
                        if ($streamUrl -match '^https?://' -and $streamUrl -notmatch '\.(jpg|png|gif|css|js|html)$') {
                            $streams += $streamUrl
                        }
                    }
                }
                if ($streams.Count -gt 0) {
                    break
                }
            } catch {
                continue
            }
        }
    }

    $streams = @($streams | Where-Object { $_ -and ($_ -match '^https?://') -and $_ -notmatch '\.(jpg|png|gif|css|js|html)$' } | Select-Object -Unique)
    
    # If still no streams, try one more time with extended yayin numbers
    if ($streams.Count -eq 0) {
        Write-Host "No streams found with standard methods for $Url (id=$radyoId), trying extended yayin numbers..."
        for ($yayin = 6; $yayin -le 15; $yayin++) {
            $playerUrl = "https://www.canliradyodinle.fm/radyo-cal?type=shouthtml&radyoid=$radyoId&yayinno=$yayin"
            try {
                $playerContent = $Client.GetStringAsync($playerUrl).GetAwaiter().GetResult()
                $primary = [regex]::Match($playerContent, '<source[^>]+src="([^"]+)"').Groups[1].Value
                if ($primary -and $primary -match '^https?://') {
                    $streams += $primary
                    Write-Host "Found stream in yayin $yayin for $Url"
                    break
                }
            } catch {
                continue
            }
        }
    }
    
    # Don't return null if no streams - still save the station info, stream might be added later
    if ($streams.Count -eq 0) {
        Write-Warning "No streams found for $Url (id=$radyoId) after trying all methods, but keeping station info"
    } else {
        Write-Host "Found $($streams.Count) stream(s) for $Url"
    }

    # Extract category from page - check breadcrumb navigation
    $category = $null
    
    # Try multiple patterns to find category URL in breadcrumb
    # First try to find any link to /radyolar/ category pages
    $breadcrumbPatterns = @(
        'href="(https://www\.canliradyodinle\.fm/radyolar/[^"]+)"',
        'href="([^"]*radyolar/[^"]+)"',
        '<a[^>]+href="([^"]*radyolar/[^"]+)"',
        '<nav[^>]*>.*?<a[^>]+href="([^"]*radyolar/[^"]+)"',
        '/radyolar/([^/"]+)'
    )
    
    foreach ($pattern in $breadcrumbPatterns) {
        $match = [regex]::Match($page, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($match.Success) {
            $categoryUrl = $match.Groups[1].Value
            # Map category URL to category name (using UTF-8 encoding helper)
            $utf8 = [System.Text.Encoding]::UTF8
            if ($categoryUrl -match 'turkce-pop-radyolari') { 
                $category = $utf8.GetString([byte[]](0x50,0x6F,0x70))  # "Pop"
                break
            }
            elseif ($categoryUrl -match 'turkce-slow-radyolari') { 
                $category = $utf8.GetString([byte[]](0x53,0x6C,0x6F,0x77))  # "Slow"
                break
            }
            elseif ($categoryUrl -match 'arabesk-radyolari') { 
                $category = $utf8.GetString([byte[]](0x41,0x72,0x61,0x62,0x65,0x73,0x6B))  # "Arabesk"
                break
            }
            elseif ($categoryUrl -match 'turk-halk-muzigi-radyolari') { 
                # "Türk Halk Müziği"
                $category = $utf8.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x48,0x61,0x6C,0x6B,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))
                break
            }
            elseif ($categoryUrl -match 'turk-sanat-muzigi-radyolari') { 
                # "Türk Sanat Müziği"
                $category = $utf8.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x53,0x61,0x6E,0x61,0x74,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))
                break
            }
            elseif ($categoryUrl -match 'islami-radyolar') { 
                # "İslami"
                $category = $utf8.GetString([byte[]](0xC4,0xB0,0x73,0x6C,0x61,0x6D,0x69))
                break
            }
            elseif ($categoryUrl -match 'haber-spor-radyolari') { 
                $category = $utf8.GetString([byte[]](0x48,0x61,0x62,0x65,0x72,0x20,0x26,0x20,0x53,0x70,0x6F,0x72))  # "Haber & Spor"
                break
            }
            elseif ($categoryUrl -match 'rap-rock-radyolari') { 
                $category = $utf8.GetString([byte[]](0x52,0x61,0x70,0x20,0x26,0x20,0x52,0x6F,0x63,0x6B))  # "Rap & Rock"
                break
            }
            elseif ($categoryUrl -match 'yabanci-muzik-radyolari') { 
                # "Yabancı"
                $category = $utf8.GetString([byte[]](0x59,0x61,0x62,0x61,0x6E,0x63,0xC4,0xB1))
                break
            }
            elseif ($categoryUrl -match 'web-radyolari') { 
                $category = $utf8.GetString([byte[]](0x53,0x61,0x6E,0x61,0x6C))  # "Sanal"
                break
            }
            elseif ($categoryUrl -match 'klasik-muzik-radyolari') { 
                $category = $utf8.GetString([byte[]](0x4B,0x6C,0x61,0x73,0x69,0x6B))  # "Klasik"
                break
            }
        }
    }

    return [PSCustomObject]@{
        Name    = $name
        Logo    = $logo
        Streams = $streams
        Category = $category
    }
}

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$handler.AllowAutoRedirect = $true
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$client.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36')

$stationLinks = Get-StationLinks -Client $client
Write-Host "Found $($stationLinks.Count) station pages from homepage."

# Get additional links from category pages (with category info)
$categoryLinks = Get-StationLinksFromCategories -Client $client
Write-Host "Found $($categoryLinks.Count) additional station pages from categories."

# Get links from sitemap
$sitemapLinks = Get-StationLinksFromSitemap -Client $client
Write-Host "Found $($sitemapLinks.Count) additional station pages from sitemap."

# Function to extract category from station name
function Get-CategoryFromName {
    param([string]$Name)
    
    # Use UTF-8 encoding to ensure Turkish characters are correct
    $utf8 = [System.Text.Encoding]::UTF8
    
    $lowerName = $Name.ToLower()
    
    # Priority-based category detection (more specific first)
    if ($lowerName -match 'spor|beşiktaş|galatasaray|fenerbahçe|trabzonspor|süper lig|lig radyo|ntv spor|fenerbahçe radyo') {
        return $utf8.GetString([byte[]](0x48,0x61,0x62,0x65,0x72,0x20,0x26,0x20,0x53,0x70,0x6F,0x72))  # "Haber & Spor"
    }
    if ($lowerName -match 'habertürk|haber turk|ntv radyo|cnn türk|trt haber|a haber|show radyo|show tv|haber|news|info|gazete') {
        return $utf8.GetString([byte[]](0x48,0x61,0x62,0x65,0x72,0x20,0x26,0x20,0x53,0x70,0x6F,0x72))  # "Haber & Spor"
    }
    if ($lowerName -match 'türk sanat|tsm|sanat müziği|klasik türk|türk klasik|alaturka|musiki|makam') {
        return $utf8.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x53,0x61,0x6E,0x61,0x74,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))  # "Türk Sanat Müziği"
    }
    if ($lowerName -match 'türk halk|thm|halk müziği|türkü|turkü|folk|doğa|ekin') {
        return $utf8.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x48,0x61,0x6C,0x6B,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))  # "Türk Halk Müziği"
    }
    # Special case: "Damar Türk" is Arabesk, not Pop
    if ($lowerName -match 'damar türk|damar turk') {
        return $utf8.GetString([byte[]](0x41,0x72,0x61,0x62,0x65,0x73,0x6B))  # "Arabesk"
    }
    if ($lowerName -match 'arabesk|besk|arabesk fm|arabesk radyo') {
        return $utf8.GetString([byte[]](0x41,0x72,0x61,0x62,0x65,0x73,0x6B))  # "Arabesk"
    }
    if ($lowerName -match 'slow|romantik|romantic|akustik|kalp') {
        return $utf8.GetString([byte[]](0x53,0x6C,0x6F,0x77))  # "Slow"
    }
    if ($lowerName -match 'dini|islami|islam|kuran|kur''an|mevlid|ilahi|tasavvuf|semerkand|moral|erkam|barış|berat|davet|enderun|furkan|gonca|hak|isra|mesaj|nur|ozel|pal mina|radyo furkan|viva efkar') {
        return $utf8.GetString([byte[]](0xC4,0xB0,0x73,0x6C,0x61,0x6D,0x69))  # "İslami"
    }
    if ($lowerName -match 'rap|hip hop|hiphop|rap fm|boombox|duble|mars|rap home|best rap|yeni rap|fenomen rap|fenomen türkçe rap|number one türk rap|pal rap|powerturk rap|radyo duble rap|radyo mars') {
        return $utf8.GetString([byte[]](0x52,0x61,0x70,0x20,0x26,0x20,0x52,0x6F,0x63,0x6B))  # "Rap & Rock"
    }
    if ($lowerName -match 'rock|rock fm|rock radyo|rock station|joy türk rock|number 1 rock|fenomen türkçe rap|itu radyosu rock|radio beatbox|the rock radio|trend ankara|x radio') {
        return $utf8.GetString([byte[]](0x52,0x61,0x70,0x20,0x26,0x20,0x52,0x6F,0x63,0x6B))  # "Rap & Rock"
    }
    if ($lowerName -match 'jazz|jazz fm|caz|blues') {
        return $utf8.GetString([byte[]](0x4A,0x61,0x7A,0x7A))  # "Jazz"
    }
    if ($lowerName -match 'klasik|classical|klasik müzik|classical music|borusan|swiss classic|abc classic') {
        return $utf8.GetString([byte[]](0x4B,0x6C,0x61,0x73,0x69,0x6B))  # "Klasik"
    }
    if ($lowerName -match 'nostalji|nostalgia|eski|retro|doksanlar|90') {
        return $utf8.GetString([byte[]](0x4E,0x6F,0x73,0x74,0x61,0x6C,0x6A,0x69))  # "Nostalji"
    }
    if ($lowerName -match 'çocuk|cocuk|kids|children|baby') {
        return $utf8.GetString([byte[]](0xC3,0x87,0x6F,0x63,0x75,0x6B))  # "Çocuk"
    }
    if ($lowerName -match 'yabancı|yabanci|foreign|english|ingilizce|international|world music|joy fm|kiss fm|metro fm|fenomen|greatest hits|heart fm|number 1 dance|number 1 deep house|number 1 disco|bbc|berlin|radio veronika') {
        return $utf8.GetString([byte[]](0x59,0x61,0x62,0x61,0x6E,0x63,0xC4,0xB1))  # "Yabancı"
    }
    # Note: "damar" removed from here - handled above as special case for "Damar Türk"
    if ($lowerName -match 'türk|turk|türkçe|turkce|turk fm|türk fm') {
        return $utf8.GetString([byte[]](0x50,0x6F,0x70))  # "Pop" - Turkish pop stations
    }
    if ($lowerName -match 'fm|radyo') {
        return $utf8.GetString([byte[]](0x50,0x6F,0x70))  # "Pop" - Default for Turkish radio stations
    }

    return $utf8.GetString([byte[]](0x47,0x65,0x6E,0x65,0x6C))  # "Genel"
}

# Create a dictionary to track station URLs and their categories
$stationCategoryMap = @{}

# Category priority (higher number = higher priority, more specific)
# Use UTF-8 encoding to ensure Turkish characters are correct
$utf8ForPriority = [System.Text.Encoding]::UTF8
$categoryPriority = @{
    ($utf8ForPriority.GetString([byte[]](0x48,0x61,0x62,0x65,0x72,0x20,0x26,0x20,0x53,0x70,0x6F,0x72))) = 10  # "Haber & Spor"
    ($utf8ForPriority.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x53,0x61,0x6E,0x61,0x74,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))) = 9  # "Türk Sanat Müziği"
    ($utf8ForPriority.GetString([byte[]](0x54,0xC3,0xBC,0x72,0x6B,0x20,0x48,0x61,0x6C,0x6B,0x20,0x4D,0xC3,0xBC,0x7A,0x69,0xC4,0x9F,0x69))) = 9  # "Türk Halk Müziği"
    ($utf8ForPriority.GetString([byte[]](0x41,0x72,0x61,0x62,0x65,0x73,0x6B))) = 8  # "Arabesk"
    ($utf8ForPriority.GetString([byte[]](0xC4,0xB0,0x73,0x6C,0x61,0x6D,0x69))) = 8  # "İslami"
    ($utf8ForPriority.GetString([byte[]](0x52,0x61,0x70,0x20,0x26,0x20,0x52,0x6F,0x63,0x6B))) = 7  # "Rap & Rock"
    ($utf8ForPriority.GetString([byte[]](0x53,0x6C,0x6F,0x77))) = 7  # "Slow"
    ($utf8ForPriority.GetString([byte[]](0x4A,0x61,0x7A,0x7A))) = 6  # "Jazz"
    ($utf8ForPriority.GetString([byte[]](0x4B,0x6C,0x61,0x73,0x69,0x6B))) = 6  # "Klasik"
    ($utf8ForPriority.GetString([byte[]](0x4E,0x6F,0x73,0x74,0x61,0x6C,0x6A,0x69))) = 5  # "Nostalji"
    ($utf8ForPriority.GetString([byte[]](0xC3,0x87,0x6F,0x63,0x75,0x6B))) = 5  # "Çocuk"
    ($utf8ForPriority.GetString([byte[]](0x59,0x61,0x62,0x61,0x6E,0x63,0xC4,0xB1))) = 4  # "Yabancı"
    ($utf8ForPriority.GetString([byte[]](0x50,0x6F,0x70))) = 3  # "Pop"
    ($utf8ForPriority.GetString([byte[]](0x53,0x61,0x6E,0x61,0x6C))) = 2  # "Sanal"
    ($utf8ForPriority.GetString([byte[]](0x47,0x65,0x6E,0x65,0x6C))) = 1  # "Genel"
}

# Add category links with their categories (keep highest priority)
foreach ($catLink in $categoryLinks) {
    $existingCategory = if ($stationCategoryMap.ContainsKey($catLink.Url)) { $stationCategoryMap[$catLink.Url] } else { $null }
    $newCategory = $catLink.Category
    
    if (-not $existingCategory) {
        $stationCategoryMap[$catLink.Url] = $newCategory
    } else {
        # Keep category with higher priority
        $existingPriority = if ($categoryPriority.ContainsKey($existingCategory)) { $categoryPriority[$existingCategory] } else { 0 }
        $newPriority = if ($categoryPriority.ContainsKey($newCategory)) { $categoryPriority[$newCategory] } else { 0 }
        
        if ($newPriority -gt $existingPriority) {
            $stationCategoryMap[$catLink.Url] = $newCategory
        }
    }
}

# Combine all links
$allStationLinks = New-Object System.Collections.Generic.HashSet[string]
foreach ($link in $stationLinks) {
    $allStationLinks.Add($link) | Out-Null
}
foreach ($catLink in $categoryLinks) {
    $allStationLinks.Add($catLink.Url) | Out-Null
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
            # Priority order for category:
            # 1. Category from page (breadcrumb) - most reliable
            # 2. Category from category map (from category pages)
            # 3. Category from station name
            $category = $null
            
            # First, use category from page if available
            if ($info.Category) {
                $category = $info.Category
            }
            # Second, use category from map
            elseif ($stationCategoryMap.ContainsKey($link)) {
                $category = $stationCategoryMap[$link]
            }
            # Third, extract from name
            else {
                $category = Get-CategoryFromName -Name $info.Name
            }
            
            # If we have multiple sources, use the one with higher priority
            if ($info.Category -and $stationCategoryMap.ContainsKey($link)) {
                $pageCategory = $info.Category
                $mapCategory = $stationCategoryMap[$link]
                
                $pagePriority = if ($categoryPriority.ContainsKey($pageCategory)) { $categoryPriority[$pageCategory] } else { 0 }
                $mapPriority = if ($categoryPriority.ContainsKey($mapCategory)) { $categoryPriority[$mapCategory] } else { 0 }
                
                # Use category with higher priority
                if ($pagePriority -gt $mapPriority) {
                    $category = $pageCategory
                } else {
                    $category = $mapCategory
                }
            }
            
            # Final fallback: extract from name if still no category
            if (-not $category) {
                $category = Get-CategoryFromName -Name $info.Name
            }
            
            $info | Add-Member -MemberType NoteProperty -Name 'Category' -Value $category -Force
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

# Track seen URLs and names to avoid duplicates
$seenUrls = New-Object System.Collections.Generic.HashSet[string]
$seenNames = New-Object System.Collections.Generic.HashSet[string]

# Create HTTP client for stream testing
$testClient = $null
if (-not $SkipStreamTest) {
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
    $handler.AllowAutoRedirect = $true
    $testClient = New-Object System.Net.Http.HttpClient($handler)
    $testClient.Timeout = [TimeSpan]::FromSeconds($StreamTestTimeout + 2)
    $testClient.DefaultRequestHeaders.Add('User-Agent', 'PlusRadio/1.0 (+https://github.com)')
    Write-Host "Stream test modu aktif (timeout: $StreamTestTimeout saniye)"
} else {
    Write-Host "Stream test modu kapalı - tüm stream'ler eklenecek"
}

$testedCount = 0
$workingCount = 0
$brokenCount = 0

foreach ($station in $stationInfos) {
    $normalizedName = $station.Name.Trim()
    
    # Skip if duplicate name
    if ($seenNames.Contains($normalizedName)) {
        Write-Host "Skipping duplicate name: $normalizedName"
        continue
    }
    
    # Get all valid streams for this station
    $validStreams = @($station.Streams | Where-Object { $_ -and ($_ -match '^https?://') -and $_ -notmatch 'placeholder' } | Select-Object -Unique)
    
    # Test streams if test mode is enabled
    if (-not $SkipStreamTest -and $testClient -and $validStreams.Count -gt 0) {
        $workingStreams = @()
        foreach ($stream in $validStreams) {
            $testedCount++
            Write-Progress -Activity 'Stream Testi' -Status ("$testedCount -> $normalizedName") -PercentComplete (($testedCount / ($stationInfos.Count * 3)) * 100)
            
            $testResult = Test-StreamAvailability -Url $stream -Client $testClient -TimeoutSeconds $StreamTestTimeout
            if ($testResult.IsWorking) {
                $workingStreams += $stream
                $workingCount++
            } else {
                $brokenCount++
                Write-Host "  [BROKEN] $stream - $($testResult.Reason)" -ForegroundColor Yellow
            }
        }
        $validStreams = $workingStreams
    }
    
    # Skip station if no working streams found (don't add placeholder)
    if ($validStreams.Count -eq 0) {
        Write-Host "Skipping $normalizedName - no working streams found" -ForegroundColor Red
        continue
    }
    
    # Check if all streams are duplicates (but allow if at least one is new)
    $hasNewStream = $false
    foreach ($stream in $validStreams) {
        $normalizedUrl = $stream -replace '[?/;]+$', ''
        if (-not $seenUrls.Contains($normalizedUrl) -or $normalizedUrl -match 'placeholder') {
            $hasNewStream = $true
            break
        }
    }
    
    if (-not $hasNewStream -and $validStreams[0] -notmatch 'placeholder') {
        Write-Host "Skipping duplicate streams for: $normalizedName"
        continue
    }
    
    $seenNames.Add($normalizedName) | Out-Null
    
    $logoAttr = if ($station.Logo) { $station.Logo } else { '' }
    $utf8ForCategory = [System.Text.Encoding]::UTF8
    $defaultCategory = $utf8ForCategory.GetString([byte[]](0x47,0x65,0x6E,0x65,0x6C))  # "Genel"
    $category = if ($station.Category) { $station.Category } else { $defaultCategory }
    
    # Add EXTINF line once
    $m3uLines.Add("#EXTINF:-1 tvg-logo=""$logoAttr"" group-title=""$category"",$normalizedName") | Out-Null
    
    # Add all alternative streams (yayın 1, yayın 2, etc.)
    # Normalize URLs to avoid duplicates (remove trailing ;stream.mp3, ;, ?, /)
    $normalizedStreams = @()
    foreach ($stream in $validStreams) {
        # Normalize: remove trailing ;stream.mp3, ;, ?, /
        $normalized = $stream -replace ';stream\.mp3$', '' -replace '[?/;]+$', ''
        
        # Only add if not already in normalized list
        if ($normalized -notin $normalizedStreams) {
            $normalizedStreams += $normalized
        }
    }
    
    # Add normalized streams to M3U
    foreach ($stream in $normalizedStreams) {
        $normalizedUrl = $stream -replace '[?/;]+$', ''
        
        # Track unique URLs (but allow placeholder for multiple stations)
        if (-not $seenUrls.Contains($normalizedUrl) -or $normalizedUrl -match 'placeholder') {
            $seenUrls.Add($normalizedUrl) | Out-Null
            $m3uLines.Add($stream) | Out-Null
        }
    }
}

$outputPath = 'Radyo.m3u'
# Use UTF8 with BOM to ensure Turkish characters are displayed correctly
$utf8WithBom = New-Object System.Text.UTF8Encoding $true

# Write file with proper UTF-8 BOM encoding
$fileStream = New-Object System.IO.FileStream($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$streamWriter = New-Object System.IO.StreamWriter($fileStream, $utf8WithBom)

try {
    foreach ($line in $m3uLines) {
        $streamWriter.WriteLine($line)
    }
} finally {
    $streamWriter.Flush()
    $streamWriter.Close()
    $fileStream.Close()
}

Write-Progress -Activity 'Stream Testi' -Completed
if ($testClient) { 
    $testClient.Dispose() 
}

$stationCount = ($m3uLines | Where-Object { $_ -match '^#EXTINF' }).Count
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "ÖZET" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Toplam istasyon: $($stationInfos.Count)"
if (-not $SkipStreamTest) {
    Write-Host "Test edilen stream: $testedCount"
    Write-Host "Çalışan stream: $workingCount" -ForegroundColor Green
    Write-Host "Çalışmayan stream: $brokenCount" -ForegroundColor Red
}
Write-Host "Eklenen istasyon: $stationCount" -ForegroundColor Cyan
Write-Host "Toplam stream girişi: $($m3uLines.Count - 1)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host "Generated $outputPath with $stationCount stations and $($m3uLines.Count - 1) stream entries."
