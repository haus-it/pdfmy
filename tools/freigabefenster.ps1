# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Freigabefenster nach docs\Update-Strategie.md, Abschnitt 4 (verbindlich ab 01.12.2026) – genutzt von tools\deploy.ps1, geprüft in tests\selfhost.test.js.
# Mo–Do 8–16 Uhr; nicht Freitag ab 12 Uhr, Wochenende, bundesweite Feiertage und Tag davor, Ruhezeit 20.12.–06.01.
# Test-Freigabefenster liefert $null (im Fenster) oder den Grund, warum nicht.

function Get-Ostern([int]$j) {   # Gaußsche Osterformel (gregorianisch)
  $a = $j % 19; $b = [math]::Floor($j / 100); $c = $j % 100; $d = [math]::Floor($b / 4); $e = $b % 4
  $f = [math]::Floor(($b + 8) / 25); $g = [math]::Floor(($b - $f + 1) / 3); $h = (19 * $a + $b - $d - $g + 15) % 30
  $i = [math]::Floor($c / 4); $k = $c % 4; $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = [math]::Floor(($a + 11 * $h + 22 * $l) / 451)
  $x = $h + $l - 7 * $m + 114
  return (Get-Date -Year $j -Month ([math]::Floor($x / 31)) -Day (($x % 31) + 1)).Date
}
function Get-Feiertage([int]$j) {   # bundesweit: Neujahr, Karfreitag, Ostermontag, 1. Mai, Himmelfahrt, Pfingstmontag, 3. Oktober, 1./2. Weihnachtstag
  $o = Get-Ostern $j
  return @((Get-Date -Year $j -Month 1 -Day 1).Date, $o.AddDays(-2), $o.AddDays(1), (Get-Date -Year $j -Month 5 -Day 1).Date, $o.AddDays(39), $o.AddDays(50),
    (Get-Date -Year $j -Month 10 -Day 3).Date, (Get-Date -Year $j -Month 12 -Day 25).Date, (Get-Date -Year $j -Month 12 -Day 26).Date)
}
function Test-Freigabefenster([datetime]$t) {
  $f = (Get-Feiertage $t.Year) + (Get-Feiertage ($t.Year + 1))   # Folgejahr: 31.12. ist Tag vor Neujahr
  $tag = $t.Date
  if (($t.Month -eq 12 -and $t.Day -ge 20) -or ($t.Month -eq 1 -and $t.Day -le 6)) { return 'Ruhezeit 20.12.–06.01.' }
  if ($f -contains $tag) { return 'Feiertag' }
  if ($f -contains $tag.AddDays(1)) { return 'Tag vor einem Feiertag' }
  if ($t.DayOfWeek -eq [DayOfWeek]::Saturday -or $t.DayOfWeek -eq [DayOfWeek]::Sunday) { return 'Wochenende' }
  if ($t.DayOfWeek -eq [DayOfWeek]::Friday -and $t.Hour -ge 12) { return 'Freitag ab 12 Uhr' }
  if ($t.Hour -lt 8 -or $t.Hour -ge 16) { return 'außerhalb 8–16 Uhr' }
  return $null
}
