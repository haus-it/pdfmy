# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Baut die Web-Version und lädt geänderte Dateien per SFTP nach pdfmy.de hoch.
#   tools\deploy.ps1          → bauen + hochladen
#   tools\deploy.ps1 -Test    → nur Verbindung prüfen
#   tools\deploy.ps1 -DryRun  → zeigen, was hochgeladen würde
# Qualitätssicherung (ISO 9001): Ohne bestandene Tests wird nichts veröffentlicht; jede Veröffentlichung
# wird in docs\RELEASES.md protokolliert (Datum, Versionen, Testergebnis, Prüfsumme pdfmy Scan, Bearbeiter).
param([switch]$Test, [switch]$DryRun, [switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) '.deploy'
$credFile = Join-Path $dir 'credential.xml'
$py = Join-Path $dir 'venv\Scripts\python.exe'
if (-not (Test-Path $credFile) -or -not (Test-Path $py)) { throw 'Noch nicht eingerichtet: zuerst tools\deploy-setup.ps1 ausführen.' }

$site = Get-Content (Join-Path $PSScriptRoot 'site.json') -Raw | ConvertFrom-Json
$testSummary = ''
if (-not $Test) {
  Push-Location $root
  $out = & npm test 2>&1 | Out-String
  Pop-Location
  $pass = [regex]::Match($out, 'pass (\d+)').Groups[1].Value; $fail = [regex]::Match($out, 'fail (\d+)').Groups[1].Value
  if ($LASTEXITCODE -or $fail -ne '0') { Write-Host $out; throw "Tests fehlgeschlagen ($fail) – Veröffentlichung abgebrochen." }
  $testSummary = "$pass/$pass Tests bestanden"
  Write-Host $testSummary -ForegroundColor Green
}
if (-not $Test -and -not $NoBuild) {
  # Scan-Programm für Windows mitbauen
  & dotnet build (Join-Path $PSScriptRoot 'pdfmy-scan\pdfmy-scan.csproj') -c Release -nologo -v q | Out-Null
  if ($LASTEXITCODE) { throw 'pdfmy Scan konnte nicht gebaut werden.' }
  # Signieren (Mentor GmbH, Microsoft Artifact Signing) – der Build überschreibt die Signatur jedes Mal
  & (Join-Path $PSScriptRoot 'sign.ps1') | Out-Null
  Write-Host 'pdfmy Scan signiert (Mentor GmbH)' -ForegroundColor Green
  & node (Join-Path $PSScriptRoot 'build-web.js')
  if ($LASTEXITCODE) { throw 'Build fehlgeschlagen.' }
}

$cred = Import-Clixml $credFile
# Passwort nur als Umgebungsvariable an den Kindprozess – es erscheint nicht in Befehlszeile oder Ausgabe
$env:PDFMY_SFTP_USER = $cred.UserName
$env:PDFMY_SFTP_PASS = $cred.GetNetworkCredential().Password
try {
  $pyArgs = @((Join-Path $PSScriptRoot 'deploy.py'), '--host', $site.sftpHost, '--local', (Join-Path $root "dist\$($site.domain)"), '--known-hosts', (Join-Path $dir 'known_hosts'))
  if ($Test) { $pyArgs += '--test' }
  if ($DryRun) { $pyArgs += '--dry-run' }
  $log = & $py -I @pyArgs 2>&1 | Out-String
  Write-Host $log.TrimEnd()
  if ($LASTEXITCODE) { throw "Upload fehlgeschlagen (Code $LASTEXITCODE)." }
  if (-not $Test -and -not $DryRun) {
    # Release-Protokoll (Nachweis für Änderungs- und Freigabemanagement)
    $dist = Join-Path $root "dist\$($site.domain)"
    $web = [regex]::Match((Get-Content (Join-Path $dist 'sw.js') -Raw), "VERSION = '([^']+)'").Groups[1].Value
    $ver = Get-Content (Join-Path $dist 'download\version.json') -Raw | ConvertFrom-Json
    $files = [regex]::Match($log, '(\d+) ge.nderte Datei').Groups[1].Value
    $rel = Join-Path $root 'docs\RELEASES.md'
    if (-not (Test-Path $rel)) { Set-Content $rel -Encoding utf8 -Value "# Release-Protokoll PDFMy`r`n`r`nAutomatisch geschrieben von tools\deploy.ps1 bei jeder Veröffentlichung.`r`n`r`n| Datum | Web-Stand | pdfmy Scan | SHA-256 pdfmy Scan | Tests | geänderte Dateien | Bearbeiter | Fingerabdruck pruefsummen.txt |`r`n|---|---|---|---|---|---|---|---|" }
    # Fingerabdruck der Prüfsummenliste (SHA-256 von pruefsummen.txt) – die App zeigt ihn unter „Datenschutz selbst prüfen“
    $finger = (Get-FileHash (Join-Path $dist 'pruefsummen.txt') -Algorithm SHA256).Hash.ToLower()
    Add-Content $rel -Encoding utf8 -Value "| $(Get-Date -Format 'yyyy-MM-dd HH:mm') | $web | $($ver.pdfmyScan) | $($ver.sha256.Substring(0,16))… | $testSummary | $files | $env:USERNAME | $($finger.Substring(0,16)) |"
  }
} finally {
  Remove-Item Env:PDFMY_SFTP_PASS -ErrorAction SilentlyContinue
  Remove-Item Env:PDFMY_SFTP_USER -ErrorAction SilentlyContinue
}
