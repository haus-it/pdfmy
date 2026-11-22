# Verschiebt PDFMy-Fehlerberichte und -Verbesserungsvorschlaege aus dem Posteingang in den Ordner "PDFMy-Rueckmeldungen"
# (Ersatz fuer eine Outlook-Regel: das Postfach hat keinen Platz fuer weitere Regeln). Gibt die verschobenen Mails aus.
# Nur ASCII im Skript (Windows PowerShell 5.1). Loescht nichts.
$ErrorActionPreference = 'Stop'
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
$inbox = $ns.GetDefaultFolder(6)
$name = 'PDFMy-R' + [char]0x00FC + 'ckmeldungen'
$ziel = $null
foreach ($f in $inbox.Folders) { if ($f.Name -eq $name) { $ziel = $f } }
if (-not $ziel) { $ziel = $inbox.Folders.Add($name) }
$treffer = @()
foreach ($m in @($inbox.Items)) {
  try { $s = [string]$m.Subject } catch { continue }
  if ($s -match '^(AW: |WG: |RE: |Re: )*PDFMy (Fehlerbericht|Verbesserungsvorschlag)') { $treffer += $m }
}
foreach ($m in $treffer) {
  $zeile = "{0:yyyy-MM-dd HH:mm} | {1} | {2}" -f $m.ReceivedTime, $m.SenderName, $m.Subject
  [void]$m.Move($ziel)
  "verschoben: $zeile"
}
"Im Ordner jetzt: $($ziel.Items.Count)"
