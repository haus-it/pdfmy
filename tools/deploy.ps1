# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Baut die Web-Version, prüft sie im Browser (Probelauf) und lädt geänderte Dateien per SFTP nach pdfmy.de hoch.
#   tools\deploy.ps1                       → testen, bauen, Probelauf, hochladen, Fassung für den Rückweg aufbewahren
#   tools\deploy.ps1 -Test                 → nur Verbindung prüfen
#   tools\deploy.ps1 -DryRun               → zeigen, was hochgeladen würde
#   tools\deploy.ps1 -Target test          → in das Testverzeichnis laden (testDir/testUrl in tools\site.json) und dort prüfen
#   tools\deploy.ps1 -TestUrl https://…/   → nur den Probelauf gegen eine Adresse ausführen
#   tools\deploy.ps1 -Rollback [-Release <Stand>] [-DryRun] → vorige (oder genannte) Fassung wieder hochladen
#   tools\deploy.ps1 -ScanRollout 10       → neue pdfmy-Scan-Version erst 10 % der Installationen automatisch anbieten (später 100)
#   tools\deploy.ps1 -Sicherheit           → Sicherheitsupdate: eigene Server bekommen es sofort, auch im Kanal „stabil“
# Regeln für Fassungen, Kanäle, Fristen und Sicherheitsupdates ab 01.12.2026: docs\Update-Strategie.md
# Qualitätssicherung (ISO 9001, ISO 27001 A.8.32): Ohne bestandene Tests und bestandenen Probelauf wird nichts veröffentlicht;
# jede Veröffentlichung und jeder Rückweg wird in docs\RELEASES.md protokolliert.
param([switch]$Test, [switch]$DryRun, [switch]$NoBuild, [ValidateSet('prod', 'test')][string]$Target = 'prod', [string]$TestUrl = '', [switch]$Rollback, [string]$Release = '', [ValidateRange(0, 100)][int]$ScanRollout = -1, [switch]$Sicherheit, [string]$Ausnahme = '')
$ErrorActionPreference = 'Stop'

# ---------- Freigabefenster (docs\Update-Strategie.md, Abschnitt 4; verbindlich ab 01.12.2026) ----------
# Mo–Do 8–16 Uhr; nicht Freitag ab 12 Uhr, Wochenende, bundesweite Feiertage und Tag davor, Ruhezeit 20.12.–06.01.
# Ausgenommen: Sicherheitsfassungen (-Sicherheit), Rücknahmen (-Rollback), Testadresse, Probe (-Test/-DryRun). Sonst nur mit -Ausnahme "Grund".
. (Join-Path $PSScriptRoot 'freigabefenster.ps1')
$fensterGrund = Test-Freigabefenster (Get-Date)
if ($fensterGrund -and -not ($Sicherheit -or $Rollback -or $Test -or $DryRun -or $TestUrl -or $Target -eq 'test')) {
  if ((Get-Date) -ge (Get-Date -Year 2026 -Month 12 -Day 1 -Hour 0 -Minute 0 -Second 0)) {
    if (-not $Ausnahme) { throw "Außerhalb des Freigabefensters ($fensterGrund) – docs\Update-Strategie.md, Abschnitt 4. Sicherheitsfassung: -Sicherheit; sonst mit Zustimmung der Geschäftsführung: -Ausnahme ""Grund""." }
    Write-Host "Ausnahme vom Freigabefenster ($fensterGrund): $Ausnahme" -ForegroundColor Yellow
  } else { Write-Host "Hinweis: außerhalb des Freigabefensters ($fensterGrund) – ab 01.12.2026 nur mit -Sicherheit oder -Ausnahme ""Grund""." -ForegroundColor Yellow }
}
$root = Split-Path $PSScriptRoot -Parent
# Protokoll jedes Laufs in .deploy/logs (nicht im Repository) – bei einem Abbruch steht dort, an welcher Stelle und warum
$logDir = Join-Path $root '.deploy\logs'; New-Item -ItemType Directory -Force $logDir | Out-Null
try { Start-Transcript -Path (Join-Path $logDir ("deploy-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))) | Out-Null } catch {}
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) '.deploy'
$credFile = Join-Path $dir 'credential.xml'
$py = Join-Path $dir 'venv\Scripts\python.exe'
$releases = Join-Path $dir 'releases'
$site = Get-Content (Join-Path $PSScriptRoot 'site.json') -Raw | ConvertFrom-Json
$distDir = Join-Path $root "dist\$($site.domain)"

# Probelauf im Browser (tools\smoke.js) – bei Fehler wird nichts hochgeladen
function Invoke-Smoke([string[]]$smokeArgs) {
  & node (Join-Path $PSScriptRoot 'smoke.js') @smokeArgs
  if ($LASTEXITCODE) { throw 'Probelauf fehlgeschlagen – nichts hochgeladen.' }
}
if ($TestUrl) { Invoke-Smoke @('--url', $TestUrl); return }

if (-not (Test-Path $credFile) -or -not (Test-Path $py)) { throw 'Noch nicht eingerichtet: zuerst tools\deploy-setup.ps1 ausführen.' }
if ($Target -eq 'test' -and -not $site.testDir) { throw 'Testadresse noch nicht eingerichtet: in tools\site.json "testDir" (Verzeichnis im Webspace) und "testUrl" eintragen.' }

function Add-ReleaseLine([string]$line) {
  $rel = Join-Path $root 'docs\RELEASES.md'
  if (-not (Test-Path $rel)) { Set-Content $rel -Encoding utf8 -Value "# Release-Protokoll PDFMy`r`n`r`nAutomatisch geschrieben von tools\deploy.ps1 bei jeder Veröffentlichung.`r`n`r`n| Datum | Web-Stand | pdfmy Scan | SHA-256 pdfmy Scan | Tests | geänderte Dateien | Bearbeiter | Fingerabdruck pruefsummen.txt |`r`n|---|---|---|---|---|---|---|---|" }
  Add-Content $rel -Encoding utf8 -Value $line
}
function Get-WebStand([string]$d) { [regex]::Match((Get-Content (Join-Path $d 'sw.js') -Raw), "VERSION = '([^']+)'").Groups[1].Value }

# Hochladen mit deploy.py; Zugangsdaten nur als Umgebungsvariablen an den Kindprozess (nie in Befehlszeile oder Ausgabe)
function Invoke-Upload([string]$localDir, [string]$subdir = '') {
  $cred = Import-Clixml $credFile
  $env:PDFMY_SFTP_USER = $cred.UserName
  $env:PDFMY_SFTP_PASS = $cred.GetNetworkCredential().Password
  try {
    $pyArgs = @((Join-Path $PSScriptRoot 'deploy.py'), '--host', $site.sftpHost, '--local', $localDir, '--known-hosts', (Join-Path $dir 'known_hosts'))
    if ($subdir) { $pyArgs += @('--subdir', $subdir) }
    if ($Test) { $pyArgs += '--test' }
    if ($DryRun) { $pyArgs += '--dry-run' }
    if (-not $Test -and -not $DryRun -and -not $subdir -and $localDir -eq $distDir) { $pyArgs += @('--indexnow', $site.domain) }   # nur Produktion: geänderte Seiten an Bing & Co. melden
    $log = & $py -I @pyArgs 2>&1 | Out-String
    Write-Host $log.TrimEnd()
    if ($LASTEXITCODE) { throw "Upload fehlgeschlagen (Code $LASTEXITCODE)." }
    return $log
  } finally {
    Remove-Item Env:PDFMY_SFTP_PASS -ErrorAction SilentlyContinue
    Remove-Item Env:PDFMY_SFTP_USER -ErrorAction SilentlyContinue
  }
}

# ---------- Rückweg: eine aufbewahrte Fassung wieder hochladen ----------
if ($Rollback) {
  $zips = @(Get-ChildItem $releases -Filter '*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  if (-not $zips.Count) { throw 'Keine aufbewahrte Fassung in .deploy\releases.' }
  $nrOf = { param($n) $m = [regex]::Match([string]$n, '-v(\d+)$'); if ($m.Success) { [int]$m.Groups[1].Value } else { 0 } }
  # Live-Stand laut Release-Protokoll (letzte Veröffentlichung bzw. letzter Rückweg) – nicht „neuestes ZIP“: ein fehlgeschlagenes Packen
  # oder ein früherer Rückweg würden sonst die falsche Fassung treffen (Fehlersuche 19.11.2026)
  $live = $null
  foreach ($l in [Linq.Enumerable]::Reverse([string[]](Get-Content (Join-Path $root 'docs\RELEASES.md') -Encoding UTF8))) {
    $m = [regex]::Match($l, '^\| \d{4}-\d\d-\d\d [\d:]+ \| (?:Rückweg auf )?(pdfmy-\d+-v\d+) \|'); if ($m.Success) { $live = $m.Groups[1].Value; break }
  }
  $liveNr = & $nrOf $live
  # zurückgezogene Fassungen (Archiv des Selbstbetriebs) nie wieder hochladen
  $zurueck = @{}; Get-ChildItem (Join-Path $root 'dist\selfhost-archiv') -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    try { $i = Get-Content (Join-Path $_.FullName 'info.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ($i.zurueckgezogen) { $zurueck[[int]$i.nr] = $true } } catch {} }
  $zip = if ($Release) { $zips | Where-Object { $_.BaseName -eq $Release } | Select-Object -First 1 }
    else { $zips | Where-Object { $n = & $nrOf $_.BaseName; $n -and $n -lt $liveNr -and -not $zurueck[$n] } | Sort-Object { & $nrOf $_.BaseName } -Descending | Select-Object -First 1 }
  if (-not $zip) { throw "Keine ältere, nicht zurückgezogene Fassung als $live gefunden. Vorhanden: $(($zips | ForEach-Object BaseName) -join ', ')" }
  if ($zip.BaseName -eq $live) { throw "$live ist schon live." }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('pdfmy-rollback-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  Expand-Archive $zip.FullName -DestinationPath $tmp
  try {
    Write-Host "Rückweg auf $($zip.BaseName)" -ForegroundColor Yellow
    Invoke-Smoke @('--dir', $tmp)
    $log = Invoke-Upload $tmp
    if (-not $DryRun -and -not $Test) {   # -Test lädt nichts hoch: nichts protokollieren
      $files = [regex]::Match($log, '(\d+) ge.nderte Datei').Groups[1].Value
      # Eigener Server: die zurückgenommene Live-Fassung nie in den Kanal „stabil“ übernehmen (wirkt ab dem nächsten Build)
      $zielNr = & $nrOf $zip.BaseName
      if ($liveNr -and $liveNr -ne $zielNr) {
        & node (Join-Path $PSScriptRoot 'selfhost.js') --zurueckgezogen $liveNr | Out-Host
        if ($LASTEXITCODE) { Write-Warning "v$liveNr ließ sich im Archiv des Selbstbetriebs nicht als zurückgezogen vermerken." }
      }
      # Fingerabdruck der zurückgeholten Fassung (aus ihrer Veröffentlichungszeile) – die Betriebsprüfung vergleicht damit weiter
      $fp = (Select-String -Path (Join-Path $root 'docs\RELEASES.md') -Pattern ("\| " + [regex]::Escape($zip.BaseName) + " \|.*\| ([0-9a-f]{16}) \|$") | Select-Object -Last 1)
      $finger = if ($fp) { $fp.Matches[0].Groups[1].Value } else { '–' }
      Add-ReleaseLine "| $(Get-Date -Format 'yyyy-MM-dd HH:mm') | Rückweg auf $($zip.BaseName) | – | – | Probelauf bestanden | $files | $env:USERNAME | $finger |"
    }
  } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  return
}

$testSummary = ''
if (-not $Test) {
  Push-Location $root
  # stderr der Tests ist kein Abbruch (Windows PowerShell 5.1 machte daraus sonst einen Fehler) – maßgeblich sind Rückgabewert und „fail“
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $out = & npm test 2>&1 | ForEach-Object { "$_" } | Out-String } finally { $ErrorActionPreference = $eap }
  Pop-Location
  $pass = [regex]::Match($out, 'pass (\d+)').Groups[1].Value; $fail = [regex]::Match($out, 'fail (\d+)').Groups[1].Value
  if ($LASTEXITCODE -or $fail -ne '0') { Write-Host $out; throw "Tests fehlgeschlagen ($fail) – Veröffentlichung abgebrochen." }
  $testSummary = "$pass/$pass Tests bestanden"
  Write-Host $testSummary -ForegroundColor Green
}
if (-not $Test -and -not $NoBuild) {
  # Scan-Programm für Windows mitbauen
  $exe = Join-Path $PSScriptRoot 'pdfmy-scan\bin\Release\net48\pdfmy-Scan.exe'
  & dotnet build (Join-Path $PSScriptRoot 'pdfmy-scan\pdfmy-scan.csproj') -c Release -nologo -v q | Out-Null
  if ($LASTEXITCODE) { throw 'pdfmy Scan konnte nicht gebaut werden.' }
  # Nur bei Änderung signieren (Mentor GmbH, Microsoft Artifact Signing): Der Build ist deterministisch – gleiche Quellen ergeben
  # dieselbe unsignierte Datei. Dann wird die schon signierte Fassung wiederverwendet (spart Signaturen, eine Fehlerquelle weniger).
  $stateFile = Join-Path $dir 'sign-state.json'; $signedCopy = Join-Path $dir 'signed\pdfmy-Scan.exe'
  $state = if (Test-Path $stateFile) { Get-Content $stateFile -Raw | ConvertFrom-Json } else { $null }
  $now = (Get-FileHash $exe -Algorithm SHA256).Hash
  if ($state -and $now -eq $state.signed -and (Test-Path $signedCopy)) {
    Write-Host 'pdfmy Scan unverändert und schon signiert' -ForegroundColor Green
  } elseif ($state -and $now -eq $state.unsigned -and (Test-Path $signedCopy) -and (Get-FileHash $signedCopy -Algorithm SHA256).Hash -eq $state.signed) {
    Copy-Item $signedCopy $exe -Force
    Write-Host 'pdfmy Scan unverändert – signierte Fassung wiederverwendet (keine neue Signatur)' -ForegroundColor Green
  } else {
    & (Join-Path $PSScriptRoot 'sign.ps1') | Out-Null
    if ((Get-AuthenticodeSignature $exe).Status -ne 'Valid') { throw 'pdfmy Scan ist nach dem Signieren nicht gültig signiert.' }
    New-Item -ItemType Directory -Force (Split-Path $signedCopy) | Out-Null
    Copy-Item $exe $signedCopy -Force
    @{ unsigned = $now; signed = (Get-FileHash $exe -Algorithm SHA256).Hash } | ConvertTo-Json | Set-Content $stateFile -Encoding utf8
    Write-Host 'pdfmy Scan geändert und neu signiert (Mentor GmbH)' -ForegroundColor Green
  }
  if ($ScanRollout -ge 0) { $env:PDFMY_SCAN_ROLLOUT = "$ScanRollout" }
  # Sicherheitsupdate (docs/Update-Strategie.md, Abschnitt 8): eigene Server bekommen es sofort, auch im Kanal „stabil“
  if ($Sicherheit) { $env:PDFMY_SICHERHEIT = '1'; Write-Host 'Sicherheitsupdate: sofort auch im Kanal „stabil“ für eigene Server' -ForegroundColor Yellow } else { Remove-Item Env:PDFMY_SICHERHEIT -ErrorAction SilentlyContinue }   # Freigabe in Stufen für pdfmy Scan (download/version.json „rollout“)
  $env:PDFMY_PRERENDER = '1'   # Webseiten je Sprache vorab übersetzen (tools/prerender.js)
  # EU-Vertrauensliste (Signaturprüfung „qualifiziert laut EU-Liste“): Schnappschuss auffrischen, wenn älter als 7 Tage – ohne Netz bleibt der alte
  $eutl = Join-Path $PSScriptRoot '..\vendor\eutl\eutl.json'
  if (-not (Test-Path $eutl) -or ((Get-Date) - (Get-Item $eutl).LastWriteTime).TotalDays -gt 7) { & node (Join-Path $PSScriptRoot 'eutl.js') 2>&1 | ForEach-Object { "$_" } | Out-Host }
  # Warnungen des Builds (stderr, z. B. „zweiter Versuch“ der Vorab-Übersetzung) sind kein Abbruch – maßgeblich ist der Rückgabewert.
  # Windows PowerShell 5.1 wertet sonst jede stderr-Zeile als Fehler und brach ab, obwohl der Build die Seite erneut versucht hätte.
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & node (Join-Path $PSScriptRoot 'build-web.js') 2>&1 | ForEach-Object { "$_" } | Out-Host }   # über die Pipeline, damit die Ausgabe im Protokoll landet
  finally { $ErrorActionPreference = $eap }
  if ($LASTEXITCODE) { throw "Build fehlgeschlagen (Code $LASTEXITCODE) – Einzelheiten in .deploy\logs." }
}
if (-not $Test) { Invoke-Smoke @('--dir', $distDir) }

$log = Invoke-Upload $distDir $(if ($Target -eq 'test') { $site.testDir } else { '' })
if ($Test -or $DryRun) { return }
if ($Target -eq 'test') {
  if ($site.testUrl) { Invoke-Smoke @('--url', $site.testUrl) }
  Write-Host 'Testadresse aktualisiert – Live-Seite unverändert.' -ForegroundColor Green
  return
}
# Release-Protokoll (Nachweis für Änderungs- und Freigabemanagement)
$web = Get-WebStand $distDir
$ver = Get-Content (Join-Path $distDir 'download\version.json') -Raw | ConvertFrom-Json
$files = [regex]::Match($log, '(\d+) ge.nderte Datei').Groups[1].Value
# Fingerabdruck der Prüfsummenliste (SHA-256 von pruefsummen.txt) – die App zeigt ihn unter „Datenschutz selbst prüfen“
$finger = (Get-FileHash (Join-Path $distDir 'pruefsummen.txt') -Algorithm SHA256).Hash.ToLower()
# Eigener Server (tools/selfhost.js): Veröffentlichung vermerken – ab hier zählen die 7 Tage bis zum Kanal „stabil“
$webNr = [regex]::Match($web, '-v(\d+)$').Groups[1].Value
if ($webNr) {
  & node (Join-Path $PSScriptRoot 'selfhost.js') --veroeffentlicht $webNr | Out-Host
  if ($LASTEXITCODE) { Write-Warning "v$webNr fehlt im Archiv des Selbstbetriebs – Veröffentlichung dort nicht vermerkt (Kanal „stabil“ rückt nicht nach)." }
  # -Sicherheit ohne Bau (-NoBuild): Kennzeichen nachträglich ins Archiv
  if ($Sicherheit -and $NoBuild) { & node (Join-Path $PSScriptRoot 'selfhost.js') --sicherheit $webNr | Out-Host }
}
Add-ReleaseLine "| $(Get-Date -Format 'yyyy-MM-dd HH:mm') | $web | $($ver.pdfmyScan) | $($ver.sha256.Substring(0,16))… | $testSummary, Probelauf bestanden$(if ($Sicherheit) { ' · Sicherheitsfassung' })$(if ($Ausnahme -and $fensterGrund) { " · Ausnahme Freigabefenster ($fensterGrund): $Ausnahme" }) | $files | $env:USERNAME | $($finger.Substring(0,16)) |"
# Fassung für den Rückweg aufbewahren (letzte 5)
New-Item -ItemType Directory -Force $releases | Out-Null
$zipPath = Join-Path $releases "$web.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
# Python statt Compress-Archive: Compress-Archive brauchte für die rund 1.700 Dateien 45 min bis viele Stunden (08.11.2026), Python ~3 min
& $py -I -c "import shutil, sys; shutil.make_archive(sys.argv[1][:-4], 'zip', sys.argv[2])" $zipPath $distDir
if ($LASTEXITCODE -or -not (Test-Path $zipPath)) { Write-Warning 'Fassung für den Rückweg konnte nicht gepackt werden – die Auslieferung selbst ist fertig.' }
Get-ChildItem $releases -Filter '*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Force
Write-Host "Fassung $web für den Rückweg aufbewahrt (tools\deploy.ps1 -Rollback)." -ForegroundColor Green
