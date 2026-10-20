# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Startet mentor PDF lokal unter http://localhost:8765 (keine Installation nötig).
# Der Server ist nur von diesem Rechner aus erreichbar. Läuft er bereits, wird nur das App-Fenster geöffnet.
param([int]$Port = 8765, [switch]$NoBrowser)

$url = "http://localhost:$Port/"
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'

function Open-App {
  if ($NoBrowser) { return }
  # Edge im App-Modus (eigenes Fenster ohne Adressleiste), sonst Standardbrowser
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($edge) { Start-Process $edge "--app=$url" } else { Start-Process $url }
}

$types = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css'; '.json'='application/json'
  '.webmanifest'='application/manifest+json'; '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'
  '.wasm'='application/wasm'; '.ttf'='font/ttf'; '.icc'='application/vnd.iccprofile'; '.gz'='application/gzip'
  '.jpg'='image/jpeg'; '.md'='text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($url)
try { $listener.Start() }
catch {
  Write-Host "mentor PDF läuft bereits (oder Port $Port ist belegt) – öffne die App."
  Open-App; exit 0
}
Write-Host "mentor PDF läuft auf $url  – dieses Fenster offen lassen, schließen beendet den Server."
Open-App

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if (-not $rel) { $rel = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      # Nur Dateien unterhalb des App-Ordners, keine Scans/Ablagen und keine versteckten Ordner ausliefern
      $allowed = $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and
                 $rel -notmatch '(^|[\\/])(\.|Scan-Eingang|tests)' -and (Test-Path -LiteralPath $file -PathType Leaf)
      if ($allowed) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers['Cache-Control'] = 'no-cache'
        $res.Headers['X-Content-Type-Options'] = 'nosniff'
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    } catch { try { $res.StatusCode = 500 } catch {} } finally { try { $res.Close() } catch {} }
  }
} finally { $listener.Stop() }
