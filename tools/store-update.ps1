# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Store-Freigaben automatisch übernehmen (15.11.2026): prüft Firefox- und Thunderbird-Add-ons (tools/store-status.js).
# Ist eine Erweiterung neu freigegeben, wird die Store-Adresse in tools/site.json eingetragen, pdfmy.de ausgerollt
# (tools/deploy.ps1 mit Tests und Probelauf) und auf GitHub gepusht. Sonst passiert nichts.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\store-update.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root 'docs\Store-Status.log'
function Log($m) { $line = "{0:yyyy-MM-dd HH:mm} {1}" -f (Get-Date), $m; Add-Content -Path $log -Value $line -Encoding utf8; Write-Output $line }

$out = & node tools/store-status.js --apply 2>&1 | Out-String
$code = $LASTEXITCODE
Log ("Prüfung: " + (($out -split "`r?`n" | Where-Object { $_ -match '\S' }) -join ' | '))
if ($code -ne 10) { exit 0 }

Log 'Neue Freigabe – rolle pdfmy.de aus'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\deploy.ps1')
if ($LASTEXITCODE -ne 0) { Log "Ausrollen fehlgeschlagen (Exit $LASTEXITCODE) – site.json bleibt geändert, bitte prüfen"; exit 1 }
git add tools/site.json docs/RELEASES.md docs/Store-Status.log | Out-Null
git commit -q -m "Store-Freigabe übernommen: Store-Adresse auf pdfmy.de eingetragen (automatisch, tools/store-update.ps1)`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push https://haus-it@github.com/haus-it/pdfmy.git main 2>&1 | Out-Null
Log 'Ausgerollt und gepusht'
