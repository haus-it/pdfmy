# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Einmalig: SFTP-Zugang für das automatische Hochladen nach pdfmy.de hinterlegen.
# Das Passwort wird mit Windows-DPAPI verschlüsselt gespeichert – nur dieses Windows-Konto auf diesem PC kann es lesen.
param([string]$User = '')
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) '.deploy'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host 'Ein Windows-Anmeldefenster öffnet sich (evtl. hinter anderen Fenstern) – dort das SFTP-Passwort eingeben.' -ForegroundColor Cyan
$cred = Get-Credential -UserName $User -Message "SFTP-Passwort für pdfmy.de (IONOS-Zugang $User)"
if (-not $cred -or -not $cred.Password.Length) { Write-Host 'Abgebrochen – nichts gespeichert.' -ForegroundColor Yellow; exit 1 }
$cred | Export-Clixml -Path (Join-Path $dir 'credential.xml')
Write-Host "Gespeichert (verschlüsselt): $dir\credential.xml" -ForegroundColor Green

# Python-Umgebung mit paramiko für den SFTP-Upload
$venv = Join-Path $dir 'venv'
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
  Write-Host 'Richte Upload-Werkzeug ein (einmalig) …'
  python -m venv $venv
  & (Join-Path $venv 'Scripts\python.exe') -m pip install --quiet --disable-pip-version-check paramiko==3.5.1
}
Write-Host 'Teste Verbindung …'
& (Join-Path $PSScriptRoot 'deploy.ps1') -Test
