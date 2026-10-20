# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Richtet auf dem Büro-PC einen Scan-Ordner ein, in den das Multifunktionsgerät per SMB ("Scan to Folder") scannt.
# Ausführen als Administrator:  Rechtsklick auf scanordner-einrichten.bat > "Als Administrator ausführen"
#
# Was passiert:
#  1. Ordner C:\Scans\Eingang wird angelegt
#  2. Lokaler Standard-Benutzer "scanner" mit zufälligem Passwort (nur für das Gerät gedacht)
#  3. Freigabe \\<PC>\Scans – nur "scanner" darf schreiben, Sie selbst dürfen alles
#  4. Windows-Firewall: Datei- und Druckerfreigabe im privaten/Domänen-Netz erlauben
param([string]$Path = 'C:\Scans\Eingang', [string]$Share = 'Scans', [string]$User = 'scanner')
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Bitte als Administrator ausführen (Rechtsklick > Als Administrator ausführen).' -ForegroundColor Red
  Read-Host 'Enter zum Beenden'; exit 1
}

New-Item -ItemType Directory -Force -Path $Path | Out-Null
Write-Host "Ordner: $Path" -ForegroundColor Green

# Zufälliges Passwort ohne verwechselbare Zeichen (für die Eingabe am Gerätedisplay)
$chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$bytes = New-Object byte[] 16; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$plain = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
$secure = ConvertTo-SecureString $plain -AsPlainText -Force

if (Get-LocalUser -Name $User -ErrorAction SilentlyContinue) {
  Set-LocalUser -Name $User -Password $secure -PasswordNeverExpires $true
  Write-Host "Benutzer '$User' existiert – neues Passwort gesetzt."
} else {
  New-LocalUser -Name $User -Password $secure -PasswordNeverExpires -UserMayNotChangePassword -Description 'Nur für Scan-to-Folder des Multifunktionsgeräts' | Out-Null
  Write-Host "Benutzer '$User' angelegt."
}
# NTFS-Rechte: Scan-Konto darf schreiben/ändern, aktueller Benutzer Vollzugriff
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $Path /grant "${User}:(OI)(CI)M" /grant "${me}:(OI)(CI)F" | Out-Null

# SMB-Freigabe
if (Get-SmbShare -Name $Share -ErrorAction SilentlyContinue) { Remove-SmbShare -Name $Share -Force }
New-SmbShare -Name $Share -Path $Path -ChangeAccess $User -FullAccess $me -Description 'Eingang für Scans (pdfmy / mentor PDF)' | Out-Null
# Ältere Geräte können nur SMB2 mit NTLMv2 – das ist Standard; SMB1 wird bewusst NICHT aktiviert.

# Firewall: Datei- und Druckerfreigabe (nicht im öffentlichen Netz)
try { Get-NetFirewallRule -Group '@FirewallAPI.dll,-28502' | Where-Object { $_.Profile -notmatch 'Public' } | Enable-NetFirewallRule } catch {}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -in 'Dhcp','Manual' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Host ''
Write-Host '================ Einstellungen für das Multifunktionsgerät ================' -ForegroundColor Cyan
Write-Host "  Protokoll:     SMB (Windows-Freigabe / CIFS / Scan to Network Folder)"
Write-Host "  Server/Host:   $ip        (oder Rechnername: $env:COMPUTERNAME)"
Write-Host "  Freigabe/Pfad: \\$ip\$Share   (bei manchen Geräten: Host $ip, Pfad /$Share)"
Write-Host "  Benutzer:      $env:COMPUTERNAME\$User   (manche Geräte: nur $User)"
Write-Host "  Passwort:      $plain"
Write-Host "  Dateiformat:   PDF oder JPEG, 300 dpi, Graustufen, Dateiname mit Datum/Uhrzeit"
Write-Host '==========================================================================' -ForegroundColor Cyan
Write-Host 'Das Passwort wird nur jetzt angezeigt – bitte direkt am Gerät eintragen.'
Write-Host "Danach in pdfmy.de (Chrome/Edge) auf 'Scan-Ordner verbinden' klicken und $Path wählen."
Read-Host 'Enter zum Beenden'
