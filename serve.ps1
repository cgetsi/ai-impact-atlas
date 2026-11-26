param(
    [int]$Port = 8080
)

$root = Resolve-Path $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "AI Impact Atlas running at $prefix" -ForegroundColor Cyan
Write-Host "Serving: $root"
Write-Host "Press Ctrl+C to stop."

$mimeTypes = @{
    ".html"    = "text/html; charset=utf-8"
    ".css"     = "text/css; charset=utf-8"
    ".js"      = "application/javascript; charset=utf-8"
    ".mjs"     = "application/javascript; charset=utf-8"
    ".json"    = "application/json; charset=utf-8"
    ".geojson" = "application/geo+json; charset=utf-8"
    ".svg"     = "image/svg+xml"
    ".png"     = "image/png"
    ".jpg"     = "image/jpeg"
    ".ico"     = "image/x-icon"
    ".woff2"   = "font/woff2"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        # One bad request (HEAD probe, client disconnect, etc.) must never stop the server
        try {
            $isHead = $req.HttpMethod -eq "HEAD"
            $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }

            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $path))
            if (-not $fullPath.StartsWith($root.Path) -or -not (Test-Path $fullPath -PathType Leaf)) {
                $res.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            } else {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                $res.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                $res.Headers.Add("Cache-Control", "no-cache")
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            }

            $res.ContentLength64 = $bytes.Length
            if (-not $isHead) {
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            Write-Host "Request failed ($($req.HttpMethod) $($req.Url.AbsolutePath)): $($_.Exception.Message)" -ForegroundColor Yellow
        } finally {
            try { $res.Close() } catch { }
        }
    }
} finally {
    $listener.Stop()
}
