# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Legt Verknüpfungen "mentor PDF" und "Brief scannen" auf dem Desktop und im Startmenü an.
$root = $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
$targets = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'mentor PDF'))
New-Item -ItemType Directory -Force -Path $targets[1] | Out-Null

foreach ($dir in $targets) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'mentor PDF.lnk'))
  $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$root\start.ps1`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$root\icons\mentor-group.ico"
  $lnk.WindowStyle = 7
  $lnk.Description = 'Briefe scannen und als PDF ablegen'
  $lnk.Save()

  $lnk = $shell.CreateShortcut((Join-Path $dir 'Brief scannen.lnk'))
  $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$root\scan.ps1`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$root\icons\mentor-pdf.ico"
  $lnk.Description = 'Mit dem Scanner in den Ordner Scan-Eingang scannen'
  $lnk.Save()
}
New-Item -ItemType Directory -Force -Path (Join-Path $root 'Scan-Eingang') | Out-Null
Write-Host 'Verknüpfungen "mentor PDF" und "Brief scannen" wurden auf dem Desktop und im Startmenü angelegt.' -ForegroundColor Green
