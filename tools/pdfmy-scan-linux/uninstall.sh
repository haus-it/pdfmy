#!/bin/sh
# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# pdfmy Scan für Linux – entfernen (Scan-Dienst, Eintrag „PDFMy“, Standard für PDFs, Einstellungen und Protokoll).
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
DIR="$DATA/pdfmy-scan"
echo ""
echo "  pdfmy Scan für Linux wird entfernt …"
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now pdfmy-scan.service >/dev/null 2>&1
  rm -f "$CONF/systemd/user/pdfmy-scan.service"; systemctl --user daemon-reload >/dev/null 2>&1
fi
pkill -f "$DIR/pdfmy-scan.pl" >/dev/null 2>&1
rm -f "$CONF/autostart/pdfmy-scan.desktop" "$DATA/applications/pdfmy.desktop"
# Rechtsklick-Einträge der Dateimanager (ab 1.9.0): Nemo, Dolphin (KDE 5/6), Nautilus und Caja
for t in merge compress; do
  rm -f "$DATA/nemo/actions/pdfmy-$t.nemo_action" "$DATA/kio/servicemenus/pdfmy-$t.desktop" "$DATA/kservices5/ServiceMenus/pdfmy-$t.desktop"
done
for d in "$DATA/nautilus/scripts" "$CONF/caja/scripts"; do
  rm -f "$d/In PDFMy zusammenfügen" "$d/Mit PDFMy verkleinern" "$d/Combine in PDFMy" "$d/Compress with PDFMy"
done
# PDFMy als Standard für PDFs austragen (das bisherige Programm der Arbeitsoberfläche gilt wieder)
if [ -f "$CONF/mimeapps.list" ]; then
  sed -i -e 's/pdfmy\.desktop;\{0,1\}//g' -e '/^application\/pdf=$/d' "$CONF/mimeapps.list"
fi
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1
rm -rf "$DIR"
echo "  ✓ Entfernt. PDF-Dateien öffnet jetzt wieder das bisherige Programm."
echo ""
