#!/bin/bash
# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# pdfmy Scan für Mac – entfernen (Scan-Dienst, App „PDFMy“, Einstellungen und Protokoll).
DIR="$HOME/Library/Application Support/pdfmy-scan"
AGENT="$HOME/Library/LaunchAgents/de.pdfmy.scan.plist"
APP="$HOME/Applications/PDFMy.app"
echo ""
echo "  pdfmy Scan für Mac wird entfernt …"
launchctl bootout "gui/$(id -u)/de.pdfmy.scan" >/dev/null 2>&1 || launchctl unload "$AGENT" >/dev/null 2>&1
rm -f "$AGENT"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$APP" >/dev/null 2>&1
rm -rf "$APP" "$DIR"
echo "  ✓ Entfernt. PDF-Dateien öffnet jetzt wieder das bisherige Programm (z. B. Vorschau)."
echo "  Dieses Fenster können Sie schließen."
echo ""
