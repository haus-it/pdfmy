# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: AGPL-3.0-or-later
# Legt das Passwort für pdfmy.de/mentor fest (interne Mentor-Version).
# Das Passwort wird nur als bcrypt-Hash gespeichert (.deploy\htpasswd-mentor) – im Klartext steht es nirgends.
param([string]$User = 'mentor')
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) '.deploy'
$py = Join-Path $dir 'venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Write-Host 'Zuerst tools\deploy-setup.ps1 ausführen.' -ForegroundColor Red; exit 1 }
& $py -m pip install --quiet --disable-pip-version-check bcrypt==4.2.1

Write-Host 'Ein Windows-Anmeldefenster öffnet sich (evtl. hinter anderen Fenstern).' -ForegroundColor Cyan
$cred = Get-Credential -UserName $User -Message 'Zugang für pdfmy.de/mentor festlegen: Benutzername und neues Passwort (mind. 10 Zeichen)'
if (-not $cred -or $cred.Password.Length -lt 10) { Write-Host 'Abgebrochen oder Passwort zu kurz (mind. 10 Zeichen) – nichts geändert.' -ForegroundColor Yellow; exit 1 }

$env:PDFMY_HT_USER = $cred.UserName
$env:PDFMY_HT_PASS = $cred.GetNetworkCredential().Password
try {
  & $py -I -c "import os,bcrypt;h=bcrypt.hashpw(os.environ['PDFMY_HT_PASS'].encode(),bcrypt.gensalt(12)).decode().replace('`$2b`$','`$2y`$',1);open(os.path.join(r'$dir','htpasswd-mentor'),'w').write(os.environ['PDFMY_HT_USER']+':'+h+'\n')"
} finally { Remove-Item Env:PDFMY_HT_PASS, Env:PDFMY_HT_USER -ErrorAction SilentlyContinue }
if ($LASTEXITCODE) { Write-Host 'Fehler beim Speichern.' -ForegroundColor Red; exit 1 }
Write-Host "Gespeichert. Benutzer: $($cred.UserName). Beim nächsten Veröffentlichen ist pdfmy.de/mentor damit geschützt." -ForegroundColor Green
