# Remove duplicate entries from Radyo.m3u
$lines = Get-Content Radyo.m3u

$m3uLines = New-Object System.Collections.Generic.List[string]
$m3uLines.Add('#EXTM3U') | Out-Null

$seen = New-Object System.Collections.Generic.HashSet[string]
$i = 1

while ($i -lt $lines.Length) {
    if ($lines[$i] -match '^#EXTINF') {
        $extinf = $lines[$i]
        if ($i + 1 -lt $lines.Length) {
            $url = $lines[$i + 1]
            
            # Normalize URL (remove trailing ?/; etc)
            $normalizedUrl = $url -replace '[?/;]+$', ''
            
            if ($url -and -not $seen.Contains($normalizedUrl)) {
                $seen.Add($normalizedUrl) | Out-Null
                $m3uLines.Add($extinf) | Out-Null
                $m3uLines.Add($url) | Out-Null
            }
            $i += 2
        } else {
            $i++
        }
    } else {
        $i++
    }
}

$m3uLines | Set-Content -LiteralPath 'Radyo.m3u' -Encoding UTF8
$stationCount = ($m3uLines | Where-Object { $_ -match '^#EXTINF' }).Count
Write-Host "Cleaned Radyo.m3u: $stationCount stations (removed duplicates)"

