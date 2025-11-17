# Basit HTTP Sunucusu
$port = 8000
$url = "http://localhost:$port/"

Write-Host "Plus Radio sunucusu başlatılıyor..." -ForegroundColor Green
Write-Host "Tarayıcınızda şu adresi açın: $url" -ForegroundColor Yellow
Write-Host "Durdurmak için Ctrl+C tuşlarına basın" -ForegroundColor Gray
Write-Host ""

# HTTP listener oluştur
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

Write-Host "Sunucu çalışıyor: $url" -ForegroundColor Green
Write-Host ""

# Tarayıcıyı aç
Start-Process $url

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") {
            $localPath = "/index.html"
        }
        
        $filePath = Join-Path $PSScriptRoot $localPath.TrimStart('/')
        
        if (Test-Path $filePath) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $mimeType = "text/html"
            
            if ($filePath.EndsWith(".js")) {
                $mimeType = "application/javascript"
            } elseif ($filePath.EndsWith(".css")) {
                $mimeType = "text/css"
            } elseif ($filePath.EndsWith(".m3u")) {
                $mimeType = "application/vnd.apple.mpegurl"
            } elseif ($filePath.EndsWith(".json")) {
                $mimeType = "application/json"
            }
            
            $response.ContentType = $mimeType
            $response.ContentLength64 = $content.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $response.Close()
        }
        
        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host "Sunucu durduruldu." -ForegroundColor Red
}

















