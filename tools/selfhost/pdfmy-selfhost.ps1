# PDFMy auf dem eigenen Server – installieren und automatisch aktualisieren (Windows Server mit IIS, Windows PowerShell 5.1)
# Herausgeber: Mentor GmbH, Paderborn – https://__DOMAIN__
# Lizenzbedingungen beachten: https://github.com/haus-it/pdfmy/blob/main/LICENSE (PolyForm Noncommercial 1.0.0)
# Jede Fassung ist von der Mentor GmbH signiert (RSA-3072, SHA-256). Installiert wird nur eine Fassung mit gültiger Signatur,
# passender Prüfsumme und höherer Nummer als die vorhandene. Eigene Dateien im Zielordner bleiben bei jedem Update erhalten.
#   .\pdfmy-selfhost.ps1 installieren  C:\inetpub\pdfmy            (neueste Fassung + tägliche Aktualisierung als Aufgabe)
#   .\pdfmy-selfhost.ps1 aktualisieren C:\inetpub\pdfmy [-Still]
#   .\pdfmy-selfhost.ps1 pruefen       C:\inetpub\pdfmy            (Rückgabewert 10 = neue Fassung verfügbar)
#   .\pdfmy-selfhost.ps1 zurueck       C:\inetpub\pdfmy
#   .\pdfmy-selfhost.ps1 automatik-aus C:\inetpub\pdfmy
#   -Kanal stabil|aktuell (Standard: stabil = erst nach 7 Tagen ohne Rücknahme auf __DOMAIN__) · -Quelle https://spiegel.intern/pdfmy
param(
  [Parameter(Position = 0)][string]$Befehl,
  [Parameter(Position = 1)][string]$Ziel,
  [ValidateSet('stabil', 'aktuell')][string]$Kanal = 'stabil',
  [string]$Quelle = '',
  [switch]$Still
)
$ErrorActionPreference = 'Stop'
$SkriptVersion = '__VERSION__'; $StabilTage = 7
$Modulus = '__MODULUS__'; $Exponent = '__EXPONENT__'   # öffentlicher Schlüssel der Mentor GmbH (Base64)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}   # Umlaute in Protokollen und Aufgabenplanung lesbar
function Sag($t) { if (-not $Still) { Write-Output $t } }
function Fehler($t) { [Console]::Error.WriteLine("pdfmy-selfhost: $t"); exit 1 }   # eine klare Zeile statt PowerShell-Fehlerblock
if (-not $Befehl -or -not $Ziel) { Get-Content $PSCommandPath -TotalCount 12 | Select-Object -Skip 1 | ForEach-Object { $_.TrimStart('# ') }; exit 2 }
$eigeneQuelle = [bool]$Quelle
if (-not $Quelle) { $Quelle = "https://__DOMAIN__/selfhost/$Kanal" }
$Ziel = [IO.Path]::GetFullPath($Ziel); $Eltern = Split-Path $Ziel -Parent; $Name = Split-Path $Ziel -Leaf
if (-not (Test-Path $Eltern)) { Fehler "Übergeordneter Ordner fehlt: $Eltern" }

function Holen($url, $datei) {
  if (-not $eigeneQuelle -and -not $url.StartsWith('https://')) { Fehler "nur HTTPS erlaubt: $url" }
  try { Invoke-WebRequest -Uri $url -OutFile $datei -UseBasicParsing -TimeoutSec 600 } catch { Fehler "Download fehlgeschlagen: $url ($($_.Exception.Message))" }
}
function Sha256($datei) { (Get-FileHash $datei -Algorithm SHA256).Hash.ToLower() }

function SigOk($jsonDatei, $sigDatei) {   # Signatur der Versionsdatei: „pdfmy-selfhost-v1“ + Zeilenumbruch + latest.json
  $json = [IO.File]::ReadAllBytes($jsonDatei)
  $nachricht = [Text.Encoding]::UTF8.GetBytes("pdfmy-selfhost-v1`n") + $json
  $rsa = New-Object Security.Cryptography.RSACryptoServiceProvider
  $p = New-Object Security.Cryptography.RSAParameters; $p.Modulus = [Convert]::FromBase64String($Modulus); $p.Exponent = [Convert]::FromBase64String($Exponent)
  $rsa.ImportParameters($p)
  try { $sig = [Convert]::FromBase64String(([IO.File]::ReadAllText($sigDatei)).Trim()) } catch { return $false }
  return $rsa.VerifyData($nachricht, 'SHA256', $sig)
}
function Gueltig($v) { $v -and $v.format -eq '1' -and $v.nr -match '^\d+$' -and $v.datei -match '^[A-Za-z0-9._-]+$' -and $v.datei -notmatch '\.\.' }
function Neueste($tmp) {
  Holen "$Quelle/latest.json" "$tmp\latest.json"; Holen "$Quelle/latest.json.sig" "$tmp\latest.json.sig"
  if (-not (SigOk "$tmp\latest.json" "$tmp\latest.json.sig")) { Fehler 'Signatur ungültig – Update abgebrochen (nichts verändert)' }
  $v = [IO.File]::ReadAllText("$tmp\latest.json") | ConvertFrom-Json
  if ($v.format -ne '1') { Fehler 'unbekanntes Format der Versionsdatei – bitte das Skript aktualisieren' }
  if (-not (Gueltig $v)) { Fehler 'Versionsdatei mit ungültiger Nummer oder ungültigem Dateinamen' }
  $v | Add-Member -NotePropertyName quelle -NotePropertyValue $Quelle -Force
  # Kanal „stabil“ rechnet selbst nach (Update-Strategie 5.2): eine Fassung aus „aktuell“, die seit $StabilTage Tagen veröffentlicht ist
  # – oder eine Sicherheitsfassung –, gilt als stabil, auch wenn pdfmy.de seitdem nichts Neues ausgerollt hat.
  if ($Kanal -eq 'stabil' -and $Quelle -match '/stabil$') {
    $akt = $Quelle -replace '/stabil$', '/aktuell'
    try {
      Invoke-WebRequest -Uri "$akt/latest.json" -OutFile "$tmp\akt.json" -UseBasicParsing -TimeoutSec 60
      Invoke-WebRequest -Uri "$akt/latest.json.sig" -OutFile "$tmp\akt.json.sig" -UseBasicParsing -TimeoutSec 60
      if (SigOk "$tmp\akt.json" "$tmp\akt.json.sig") {
        $a = [IO.File]::ReadAllText("$tmp\akt.json") | ConvertFrom-Json
        $alter = ((Get-Date).ToUniversalTime() - [datetime]::Parse($a.datum, $null, [Globalization.DateTimeStyles]::AdjustToUniversal)).TotalDays
        if ((Gueltig $a) -and [int]$a.nr -gt [int]$v.nr -and ($a.sicherheit -eq '1' -or $alter -ge $StabilTage)) { $a | Add-Member -NotePropertyName quelle -NotePropertyValue $akt -Force; $v = $a }
      }
    } catch {}
  }
  return $v
}
function InstalliertNr {
  $f = Join-Path $Ziel '.pdfmy-version'
  if (Test-Path $f) { $m = Select-String -Path $f -Pattern '^nr=(\d+)' | Select-Object -First 1; if ($m) { return [int]$m.Matches[0].Groups[1].Value } }
  return $null
}

function Aktualisieren([switch]$NurPruefen) {
  $tmp = Join-Path $Eltern ('.pdfmy-arbeit.' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    $v = Neueste $tmp; $alt = InstalliertNr
    if ($null -ne $alt -and [int]$v.nr -le $alt) { Sag "PDFMy ist aktuell ($($v.version))."; return }
    if ($NurPruefen) { Write-Output "Neue Fassung verfügbar: $($v.version) (installiert: $(if ($null -ne $alt) { "v$alt" } else { 'keine' }))"; exit 10 }
    Sag "Lade $($v.version) …"
    Holen "$($v.quelle)/$($v.datei)" "$tmp\paket.tar.gz"
    if ((Sha256 "$tmp\paket.tar.gz") -ne $v.sha256) { Fehler 'Prüfsumme des Pakets stimmt nicht – Update abgebrochen (nichts verändert)' }
    $neu = Join-Path $tmp 'neu'; New-Item -ItemType Directory $neu | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'; if (-not (Test-Path $tar)) { Fehler 'tar.exe fehlt (ab Windows Server 2019 / Windows 10 1803 enthalten)' }
    & $tar -xzf "$tmp\paket.tar.gz" -C $neu; if ($LASTEXITCODE) { Fehler 'Paket lässt sich nicht entpacken' }
    foreach ($f in 'index.html', 'sw.js', 'pruefsummen.json') { if (-not (Test-Path (Join-Path $neu $f))) { Fehler 'Paket unvollständig – Update abgebrochen' } }
    $inhalt = @(Get-ChildItem -Force $neu | ForEach-Object Name)
    # Eigene Dateien übernehmen: alles im bisherigen Ordner, was nicht zum bisherigen Paket gehört
    if (Test-Path $Ziel) {
      $altListe = @(); $al = Join-Path $Ziel '.pdfmy-dateien'; if (Test-Path $al) { $altListe = Get-Content $al }
      $altSummen = $null; $ap = Join-Path $Ziel 'pruefsummen.json'; if (Test-Path $ap) { try { $altSummen = ([IO.File]::ReadAllText($ap) | ConvertFrom-Json).dateien } catch {} }
      $konf = '.htaccess', 'web.config', 'nginx-pdfmy.conf'
      # Webserver-Einstellungen: eigene oder vom Betreiber geänderte Fassung hat Vorrang (Prüfsumme gegen die bisherige Fassung);
      # die neue Fassung von PDFMy liegt dann als Vorlage daneben. Unverändert übernommene Dateien werden einfach ersetzt.
      foreach ($b in $konf) {
        $alt = Join-Path $Ziel $b; $nb = Join-Path $neu $b
        if (-not (Test-Path $alt) -or -not (Test-Path $nb)) { continue }
        if ($altSummen -and $altSummen.$b -eq (Sha256 $alt)) { continue }
        Move-Item $nb ($nb + '.pdfmy-vorlage') -Force; Copy-Item $alt -Destination $neu -Force
        $inhalt = @($inhalt | Where-Object { $_ -ne $b }) + ($b + '.pdfmy-vorlage')
        Sag "Eigene bzw. angepasste $b behalten – die Fassung von PDFMy liegt als $b.pdfmy-vorlage daneben."
      }
      # Eigene Dateien übernehmen: alles im bisherigen Ordner, was nicht zum bisherigen Paket gehört
      foreach ($e in Get-ChildItem -Force $Ziel) {
        if ($e.Name -in '.pdfmy-version', '.pdfmy-dateien' -or $e.Name -in $konf -or $altListe -contains $e.Name -or (Test-Path (Join-Path $neu $e.Name))) { continue }
        Copy-Item $e.FullName -Destination $neu -Recurse -Force
      }
    }
    [IO.File]::WriteAllLines((Join-Path $neu '.pdfmy-dateien'), [string[]]$inhalt)
    [IO.File]::WriteAllText((Join-Path $neu '.pdfmy-version'), "nr=$($v.nr)`nversion=$($v.version)`ndatum=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))`nkanal=$Kanal`n")
    # Rechte wie der bisherige Ordner (bzw. vom übergeordneten Ordner geerbt)
    if (Test-Path $Ziel) { try { Set-Acl -Path $neu -AclObject (Get-Acl $Ziel) } catch {} }
    $vorher = Join-Path $Eltern ".$Name.vorher"
    if (Test-Path $vorher) { Remove-Item $vorher -Recurse -Force }
    try {
      if (Test-Path $Ziel) { Rename-Item $Ziel $vorher }
      Rename-Item $neu $Ziel
    } catch {
      # IIS hält Dateien offen: Inhalt spiegeln statt umbenennen (robocopy /MIR), vorher Sicherung anlegen
      if (-not (Test-Path $vorher) -and (Test-Path $Ziel)) { & robocopy $Ziel $vorher /MIR /NFL /NDL /NJH /NJS /NP | Out-Null }
      & robocopy $neu $Ziel /MIR /NFL /NDL /NJH /NJS /NP | Out-Null; if ($LASTEXITCODE -ge 8) { Fehler "Kopieren nach $Ziel fehlgeschlagen" }
    }
    Write-Output "PDFMy aktualisiert: $(if ($null -ne $alt) { "v$alt → " })$($v.version) ($Ziel)"
    # Dieses Skript selbst aktuell halten (es steckt im signierten Paket)
    $neuSkript = Join-Path $Ziel 'pdfmy-selfhost.ps1'
    if ((Test-Path $neuSkript) -and $PSCommandPath -and ((Sha256 $neuSkript) -ne (Sha256 $PSCommandPath))) {
      try { Copy-Item $neuSkript $PSCommandPath -Force; Sag 'Aktualisierungsskript erneuert.' } catch {}
    }
  } finally { if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue } }
}

function Zurueck {
  $vorher = Join-Path $Eltern ".$Name.vorher"; $tausch = Join-Path $Eltern ".$Name.tausch"
  if (-not (Test-Path $vorher)) { Fehler 'keine vorige Fassung vorhanden' }
  Rename-Item $Ziel $tausch; Rename-Item $vorher $Ziel; Rename-Item $tausch $vorher
  Write-Output 'Vorige Fassung wiederhergestellt. Die tägliche Aktualisierung installiert wieder die neueste Fassung – bei Bedarf „automatik-aus“.'
}

function AufgabeName { 'PDFMy aktualisieren ' + ((Sha256Text $Ziel).Substring(0, 8)) }
function Sha256Text($t) { -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t)) | ForEach-Object { $_.ToString('x2') }) }
function AutomatikAn {
  $dir = Join-Path $env:ProgramData 'PDFMy'; New-Item -ItemType Directory -Force $dir | Out-Null
  $ps1 = Join-Path $dir 'pdfmy-selfhost.ps1'; if ($PSCommandPath -ne $ps1) { Copy-Item $PSCommandPath $ps1 -Force }
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" aktualisieren `"$Ziel`" -Kanal $Kanal -Still" + $(if ($eigeneQuelle) { " -Quelle `"$Quelle`"" } else { '' })
  $zeit = (Get-Date).Date.AddHours(3 + (Get-Random -Maximum 3)).AddMinutes((Get-Random -Maximum 60))
  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
  $t = New-ScheduledTaskTrigger -Daily -At $zeit
  Register-ScheduledTask -TaskName (AufgabeName) -Action $a -Trigger $t -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
  Write-Output "Tägliche Aktualisierung eingerichtet (Aufgabenplanung: „$(AufgabeName)“, $($zeit.ToString('HH:mm')) Uhr, Kanal $Kanal)."
}
function AutomatikAus { Unregister-ScheduledTask -TaskName (AufgabeName) -Confirm:$false -ErrorAction SilentlyContinue; Write-Output 'Tägliche Aktualisierung abgeschaltet.' }

switch ($Befehl) {
  'installieren' { Write-Output 'Lizenzbedingungen beachten: https://github.com/haus-it/pdfmy/blob/main/LICENSE – bitte prüfen, ob Ihre Nutzung davon gedeckt ist.'; Aktualisieren; AutomatikAn; Write-Output "Fertig. Den Ordner in IIS als Website oder Anwendung per HTTPS ausliefern (https://__DOMAIN__/firmen.html#eigener-server)." }
  'aktualisieren' { Aktualisieren }
  'pruefen' { Aktualisieren -NurPruefen }
  'zurueck' { Zurueck }
  'automatik-aus' { AutomatikAus }
  default { Fehler "unbekannter Befehl „$Befehl“ (installieren, aktualisieren, pruefen, zurueck, automatik-aus)" }
}
