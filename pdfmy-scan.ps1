# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# pdfmy Scan-Helfer: findet Scanner und scannt alle Seiten in den Scan-Ordner – mit oder ohne Treiber.
#  - Netzwerkgeräte werden direkt per eSCL ("AirScan"/"Mopria") angesprochen: KEIN Treiber nötig.
#  - Über Windows eingerichtete Scanner (USB/Netzwerk mit Treiber) werden per WIA genutzt.
# pdfmy (Browser) überwacht den Scan-Ordner und übernimmt die Seiten automatisch.
#
# Starten: Rechtsklick auf die Datei > "Mit PowerShell ausführen"
#   oder:  powershell -ExecutionPolicy Bypass -File pdfmy-scan.ps1 [-Ip 192.168.1.50]
param(
  [string]$OutDir = 'C:\Scans\Eingang',
  [ValidateSet('grau', 'farbe', 'sw')][string]$Farbe = 'grau',
  [int]$Dpi = 300,
  [string]$Ip = ''
)
$ErrorActionPreference = 'Stop'
$JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Say($t, $c = 'Gray') { Write-Host "  $t" -ForegroundColor $c }

# ---------------- eSCL (treiberlos) ----------------
function Get-EsclCaps([string]$host_) {
  foreach ($base in @("http://$host_", "https://$host_")) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "$base/eSCL/ScannerCapabilities"
      [xml]$x = $r.Content
      $ns = New-Object Xml.XmlNamespaceManager $x.NameTable
      $ns.AddNamespace('pwg', 'http://www.pwg.org/schemas/2010/12/sm'); $ns.AddNamespace('scan', 'http://schemas.hp.com/imaging/escl/2011/05/03')
      $model = $x.SelectSingleNode('//pwg:MakeAndModel', $ns).InnerText
      if (-not $model) { $model = "Scanner $host_" }
      return [pscustomobject]@{
        Kind = 'eSCL'; Name = "$model ($host_, ohne Treiber)"; Base = $base
        Feeder = [bool]$x.SelectSingleNode('//scan:Adf', $ns)
        Duplex = [bool]$x.SelectSingleNode('//scan:Adf/scan:AdfDuplexInputCaps', $ns)
        Jpeg = $r.Content -match 'image/jpeg'
      }
    } catch {}
  }
  return $null
}

function Find-EsclScanners {
  # Eigene IPv4-Adressen direkt aus .NET (schnell, ohne WMI), nur private Netze
  $mine = @()
  foreach ($ni in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($ni.OperationalStatus -ne 'Up' -or $ni.NetworkInterfaceType -eq 'Loopback') { continue }
    foreach ($ua in $ni.GetIPProperties().UnicastAddresses) {
      $a = $ua.Address.ToString()
      if ($ua.Address.AddressFamily -eq 'InterNetwork' -and $a -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') { $mine += $a }
    }
  }
  $targets = @(); foreach ($a in ($mine | Select-Object -Unique)) { $p = $a.Split('.'); 1..254 | ForEach-Object { $targets += "$($p[0]).$($p[1]).$($p[2]).$_" } }
  if (-not $targets) { return @() }
  # 1) Alle Adressen gleichzeitig auf Port 80 prüfen (max. 0,8 s)
  $pending = foreach ($t in $targets) { $c = New-Object Net.Sockets.TcpClient; [pscustomobject]@{ Ip = $t; Client = $c; Task = $c.ConnectAsync($t, 80) } }
  [void][Threading.Tasks.Task]::WaitAll(@($pending.Task), 800)
  $open = @(); foreach ($x in $pending) { if ($x.Task.Status -eq 'RanToCompletion' -and $x.Client.Connected) { $open += $x.Ip }; try { $x.Client.Dispose() } catch {} }
  if (-not $open) { return @() }
  # 2) Offene Geräte gleichzeitig nach eSCL fragen (max. 3 s), Antworten auswerten
  Add-Type -AssemblyName System.Net.Http
  $http = New-Object Net.Http.HttpClient; $http.Timeout = [TimeSpan]::FromSeconds(3)
  $asks = foreach ($h in $open) { [pscustomobject]@{ Ip = $h; Task = $http.GetAsync("http://$h/eSCL/ScannerCapabilities") } }
  try { [void][Threading.Tasks.Task]::WaitAll(@($asks.Task), 3500) } catch {}
  $found = @()
  foreach ($q in $asks) {
    if ($q.Task.Status -eq 'RanToCompletion' -and $q.Task.Result.IsSuccessStatusCode) { $c = Get-EsclCaps $q.Ip; if ($c) { $found += $c } }
  }
  $http.Dispose()
  return $found
}

function Invoke-EsclScan($dev) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if ($dev.Base -like 'https*') { [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } }  # Geräte nutzen meist selbstsignierte Zertifikate
  $source = 'Platen'; $duplex = 'false'
  if ($dev.Feeder) {
    $source = 'Feeder'
    if ($dev.Duplex -and (Read-Host '  Beidseitig scannen? (j/n)') -match '^[jJyY]') { $duplex = 'true' }
  }
  $mode = @{ grau = 'Grayscale8'; farbe = 'RGB24'; sw = 'BlackAndWhite1' }[$Farbe]
  $fmt = if ($dev.Jpeg) { 'image/jpeg' } else { 'application/pdf' }
  $xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.0</pwg:Version>
  <pwg:ScanRegions><pwg:ScanRegion>
    <pwg:Height>3508</pwg:Height><pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
    <pwg:Width>2480</pwg:Width><pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset>
  </pwg:ScanRegion></pwg:ScanRegions>
  <pwg:InputSource>$source</pwg:InputSource>
  <scan:Duplex>$duplex</scan:Duplex>
  <scan:ColorMode>$mode</scan:ColorMode>
  <scan:XResolution>$Dpi</scan:XResolution><scan:YResolution>$Dpi</scan:YResolution>
  <pwg:DocumentFormat>$fmt</pwg:DocumentFormat><scan:DocumentFormatExt>$fmt</scan:DocumentFormatExt>
</scan:ScanSettings>
"@
  Say "Scanne ($(if ($source -eq 'Feeder') { 'Einzug' } else { 'Glas' }), $Dpi dpi) …"
  $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($dev.Base)/eSCL/ScanJobs" -ContentType 'text/xml' -Body $xml -TimeoutSec 30
  $loc = $r.Headers['Location']; if (-not $loc) { throw 'Gerät hat keinen Scanauftrag angelegt.' }
  if ($loc -notmatch '^https?://') { $loc = $dev.Base + $loc }
  $job = Get-Date -Format 'yyyyMMdd_HHmmss'; $n = 0; $ext = if ($fmt -eq 'image/jpeg') { 'jpg' } else { 'pdf' }
  while ($true) {
    $file = Join-Path $OutDir ('Scan_{0}_{1:D3}.{2}' -f $job, ($n + 1), $ext)
    try { Invoke-WebRequest -UseBasicParsing -Uri "$loc/NextDocument" -OutFile "$file.part" -TimeoutSec 120 }
    catch {
      $code = [int]$_.Exception.Response.StatusCode
      Remove-Item "$file.part" -ErrorAction SilentlyContinue
      if ($code -eq 503) { Start-Sleep -Seconds 2; continue }   # Gerät noch beschäftigt
      if ($code -eq 404 -or $code -eq 410) { break }            # keine weiteren Seiten
      if ($n -eq 0) { throw "Scan fehlgeschlagen ($code): $($_.Exception.Message)" } else { break }
    }
    Move-Item "$file.part" $file -Force; $n++
    Say "Seite $n gespeichert" Green
    if ($source -eq 'Platen') { break }
  }
  return $n
}

# ---------------- WIA (mit Treiber) ----------------
function Find-WiaScanners {
  # In eigenem Thread mit Zeitgrenze: hängt der Windows-Scannerdienst, blockiert der Helfer nicht
  $ps = [PowerShell]::Create().AddScript({
    $o = @()
    try { $dm = New-Object -ComObject WIA.DeviceManager; foreach ($d in $dm.DeviceInfos) { if ($d.Type -eq 1) { $o += [pscustomobject]@{ Id = $d.DeviceID; Name = $d.Properties.Item('Name').Value } } } } catch {}
    $o
  })
  $h = $ps.BeginInvoke()
  if (-not $h.AsyncWaitHandle.WaitOne(15000)) { Say 'Windows-Scannerdienst antwortet nicht – nur Netzwerkscanner werden genutzt.' Yellow; return @() }
  return @($ps.EndInvoke($h) | ForEach-Object { [pscustomobject]@{ Kind = 'WIA'; Name = "$($_.Name) (Windows-Treiber)"; Id = $_.Id } })
}
function Set-Prop($props, [int]$id, $value) { foreach ($p in $props) { if ($p.PropertyID -eq $id) { try { $p.Value = $value } catch {}; return } } }
function Invoke-WiaScan($s) {
  $dm = New-Object -ComObject WIA.DeviceManager
  $info = $null; foreach ($d in $dm.DeviceInfos) { if ($d.DeviceID -eq $s.Id) { $info = $d } }
  if (-not $info) { throw 'Scanner nicht mehr erreichbar.' }
  $dev = $info.Connect()
  $caps = 0; foreach ($p in $dev.Properties) { if ($p.PropertyID -eq 3086) { $caps = [int]$p.Value } }
  $feeder = ($caps -band 1) -ne 0
  if ($feeder) {
    $sel = if (($caps -band 4) -and (Read-Host '  Beidseitig scannen? (j/n)') -match '^[jJyY]') { 5 } else { 1 }
    Set-Prop $dev.Properties 3088 $sel; Set-Prop $dev.Properties 3096 0
  }
  $item = $dev.Items.Item(1)
  Set-Prop $item.Properties 6146 @{ farbe = 1; grau = 2; sw = 4 }[$Farbe]
  Set-Prop $item.Properties 6147 $Dpi; Set-Prop $item.Properties 6148 $Dpi
  Say "Scanne ($(if ($feeder) { 'Einzug' } else { 'Glas' }), $Dpi dpi) …"
  $job = Get-Date -Format 'yyyyMMdd_HHmmss'; $n = 0
  while ($true) {
    try { $img = $item.Transfer($JPEG) }
    catch {
      $c = $_.Exception.HResult
      if ($c -eq -2145320957) { break }                                   # Einzug leer
      if ($c -eq -2145320954) { Start-Sleep -Seconds 2; continue }        # beschäftigt
      if ($c -eq -2145320958) { Say 'Papierstau – bitte beheben.' Red; break }
      throw
    }
    if ($img.FormatID -ne $JPEG) {
      $ip = New-Object -ComObject WIA.ImageProcess; $ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
      $ip.Filters.Item(1).Properties.Item('FormatID').Value = $JPEG; $ip.Filters.Item(1).Properties.Item('Quality').Value = 90
      $img = $ip.Apply($img)
    }
    $n++; $img.SaveFile((Join-Path $OutDir ('Scan_{0}_{1:D3}.jpg' -f $job, $n))); Say "Seite $n gespeichert" Green
    if (-not $feeder) { break }
  }
  return $n
}

# ---------------- Ablauf ----------------
Write-Host ''; Write-Host '  pdfmy Scan-Helfer' -ForegroundColor Cyan; Write-Host '  -----------------'
$cfgFile = Join-Path $OutDir '.pdfmy-scanner.txt'
if (-not $Ip -and (Test-Path $cfgFile)) { $Ip = (Get-Content $cfgFile -Raw).Trim() }   # zuletzt benutztes Netzwerkgerät
$scanners = @()
if ($Ip) { Say "Prüfe gemerkten Scanner $Ip …"; $c = Get-EsclCaps $Ip; if ($c) { $scanners += $c } }
if (-not $scanners) {
  Say 'Suche Scanner im Netzwerk (ohne Treiber) und in Windows …'
  $scanners += Find-EsclScanners
  $scanners += Find-WiaScanners
}
if (-not $scanners) {
  Say 'Kein Scanner gefunden.' Red
  Say '- Gerät eingeschaltet und im selben Netzwerk wie dieser PC?'
  Say '- IP-Adresse des Geräts bekannt? Dann direkt eingeben (steht am Gerätedisplay unter Netzwerk/TCP-IP).'
  $Ip = Read-Host '  IP-Adresse (leer = beenden)'
  if ($Ip) { $c = Get-EsclCaps $Ip; if ($c) { $scanners += $c } else { Say "Unter $Ip antwortet kein eSCL-Scanner. Bitte am Gerät 'AirPrint/eSCL/Mopria' aktivieren oder 'Scan to Folder' nutzen: https://pdfmy.de/scanner.html" Red } }
  if (-not $scanners) { Read-Host '  Enter zum Beenden'; [Environment]::Exit(1) }
}
for ($i = 0; $i -lt $scanners.Count; $i++) { Say ("[{0}] {1}" -f ($i + 1), $scanners[$i].Name) White }
$pick = 0; if ($scanners.Count -gt 1) { $pick = [int](Read-Host '  Welcher Scanner? Nummer') - 1 }
$dev = $scanners[[Math]::Max(0, [Math]::Min($pick, $scanners.Count - 1))]
if ($dev.Kind -eq 'eSCL') { ($dev.Base -replace '^https?://', '') | Set-Content $cfgFile }   # fürs nächste Mal merken
Say "Scanner: $($dev.Name)" Green

do {
  Read-Host '  Papier einlegen und Enter drücken'
  try { $n = if ($dev.Kind -eq 'eSCL') { Invoke-EsclScan $dev } else { Invoke-WiaScan $dev } }
  catch { Say "Fehler: $($_.Exception.Message)" Red; $n = 0 }
  if ($n) { Say "$n Seite(n) liegen in $OutDir – pdfmy übernimmt sie automatisch." Cyan }
  $again = Read-Host '  Weitere Seiten scannen? (j/n)'
} while ($again -match '^[jJyY]')

# Einmalig: Desktop-Verknüpfung anlegen
$lnkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Scannen (pdfmy).lnk'
if (-not (Test-Path $lnkPath) -and $PSCommandPath) {
  if ((Read-Host '  Verknüpfung "Scannen (pdfmy)" auf dem Desktop anlegen? (j/n)') -match '^[jJyY]') {
    $sh = New-Object -ComObject WScript.Shell; $l = $sh.CreateShortcut($lnkPath)
    $l.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $l.IconLocation = "$env:SystemRoot\System32\wiaacmgr.exe,0"; $l.Save()
    Say 'Verknüpfung angelegt.' Green
  }
}

# Sauber beenden, auch falls der Windows-Scannerdienst im Hintergrund noch hängt
[Environment]::Exit(0)
