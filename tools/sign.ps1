# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Signiert pdfmy-Scan.exe (Release) mit Microsoft Artifact Signing (Konto hausit-signatur, Profil mentor-public-trust)
# Voraussetzung: Azure-CLI angemeldet (az login) mit Rolle "Artifact Signing Certificate Profile Signer".
# Aufruf: powershell -File tools\sign.ps1 [Datei ...]   – danach node tools\build-web.js
param([string[]]$Files = @("$PSScriptRoot\pdfmy-scan\bin\Release\net48\pdfmy-Scan.exe"))
$ErrorActionPreference = 'Stop'
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw 'signtool.exe nicht gefunden (Windows SDK installieren).' }
$dlib = "$PSScriptRoot\signing\x64\Azure.CodeSigning.Dlib.dll"
# Gleicher Programmstand → dieselbe signierte Datei wiederverwenden: Jede neue Signatur ändert die Prüfsumme,
# und SmartScreen müsste das Vertrauen ("Reputation") für die Datei neu aufbauen.
$cache = "$PSScriptRoot\signing\cache"; New-Item -ItemType Directory -Force $cache | Out-Null
foreach ($f in $Files) {
  if ((Get-AuthenticodeSignature $f).Status -eq 'Valid') { Write-Host "OK  $f  (bereits signiert)"; continue }
  $key = (Get-FileHash $f -Algorithm SHA256).Hash
  $hit = Join-Path $cache "$key$([IO.Path]::GetExtension($f))"
  if ((Test-Path $hit) -and (Get-AuthenticodeSignature $hit).Status -eq 'Valid') { Copy-Item $hit $f -Force; Write-Host "OK  $f  (signierte Fassung wiederverwendet)"; continue }
  & $signtool.FullName sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 /dlib $dlib /dmdf "$PSScriptRoot\signing\metadata.json" $f
  if ($LASTEXITCODE -ne 0) { throw "Signieren fehlgeschlagen: $f" }
  $s = Get-AuthenticodeSignature $f
  if ($s.Status -ne 'Valid') { throw "Signatur ungültig: $f ($($s.Status))" }
  Copy-Item $f $hit -Force
  Write-Host "OK  $f  –  $($s.SignerCertificate.Subject)"
}
