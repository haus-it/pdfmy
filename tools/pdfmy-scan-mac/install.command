#!/bin/bash
# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: AGPL-3.0-or-later
# pdfmy Scan für Mac – Einrichtung. Einmal doppelklicken, fertig.
# Richtet ein: den Scan-Dienst (läuft unauffällig im Hintergrund, startet mit dem Mac),
# die App „PDFMy“ (öffnet PDFs per Doppelklick in PDFMy) und auf Wunsch PDFMy als Standard für PDF-Dateien.
# Es wird nichts ins Internet hochgeladen; der Dienst ist nur vom eigenen Mac aus erreichbar (127.0.0.1).
DIR="$HOME/Library/Application Support/pdfmy-scan"
AGENT="$HOME/Library/LaunchAgents/de.pdfmy.scan.plist"
APP="$HOME/Applications/PDFMy.app"
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
clear 2>/dev/null
echo ""
echo "  pdfmy Scan für Mac __PDFMY_VERSION__ wird eingerichtet …"
echo ""
if [ ! -x /usr/bin/perl ] || [ ! -x /usr/bin/curl ]; then
  echo "  ✗ Auf diesem Mac fehlen Perl oder curl. Bitte melden: wumertens@mentor-group.de"; exit 1
fi
mkdir -p "$DIR" "$HOME/Library/LaunchAgents" "$HOME/Applications"

# 1. Scan-Dienst
cat > "$DIR/pdfmy-scan.pl" <<'PDFMY_PERL_END'
__PDFMY_PERL__
PDFMY_PERL_END
if ! /usr/bin/perl -c "$DIR/pdfmy-scan.pl" >/dev/null 2>&1; then echo "  ✗ Das Programm ist beschädigt. Bitte neu herunterladen."; exit 1; fi
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>de.pdfmy.scan</string>
  <key>ProgramArguments</key><array><string>/usr/bin/perl</string><string>$DIR/pdfmy-scan.pl</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>$DIR/fehler.txt</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/de.pdfmy.scan" >/dev/null 2>&1 || launchctl unload "$AGENT" >/dev/null 2>&1
sleep 1
launchctl bootstrap "gui/$(id -u)" "$AGENT" >/dev/null 2>&1 || launchctl load -w "$AGENT" >/dev/null 2>&1
ok=""
for i in 1 2 3 4 5 6; do sleep 1; if /usr/bin/curl -s -m 2 http://127.0.0.1:52880/status | grep -q pdfmy-scan; then ok=1; break; fi; done
if [ -n "$ok" ]; then echo "  ✓ Scan-Dienst läuft"; else echo "  ✗ Der Scan-Dienst startet nicht. Details: $DIR/fehler.txt"; fi

# 2. App „PDFMy“: öffnet PDFs per Doppelklick in PDFMy (die Datei bleibt auf dem Mac)
rm -rf "$APP"
/usr/bin/osacompile -o "$APP" \
  -e 'on open theFiles' \
  -e '  repeat with f in theFiles' \
  -e '    set p to POSIX path of f' \
  -e '    try' \
  -e '      do shell script "printf %s " & quoted form of p & " | /usr/bin/curl -sf -m 5 -X POST --data-binary @- http://127.0.0.1:52880/open-local"' \
  -e '    on error' \
  -e '      do shell script "launchctl kickstart -k gui/$(id -u)/de.pdfmy.scan >/dev/null 2>&1; sleep 2"' \
  -e '      try' \
  -e '        do shell script "printf %s " & quoted form of p & " | /usr/bin/curl -sf -m 5 -X POST --data-binary @- http://127.0.0.1:52880/open-local"' \
  -e '      on error' \
  -e '        display dialog "PDFMy konnte die Datei nicht öffnen, weil pdfmy Scan nicht läuft. Bitte die Einrichtung (pdfmy-Scan-Mac.command) noch einmal öffnen." buttons {"OK"} default button 1 with icon caution' \
  -e '      end try' \
  -e '    end try' \
  -e '  end repeat' \
  -e 'end open' \
  -e 'on print theFiles' \
  -e '  repeat with f in theFiles' \
  -e '    try' \
  -e '      do shell script "/usr/bin/lp " & quoted form of (POSIX path of f)' \
  -e '      display notification (name of (info for f)) with title "PDFMy" subtitle "An den Standarddrucker gesendet"' \
  -e '    on error e' \
  -e '      display dialog "PDFMy konnte die Datei nicht drucken: " & e buttons {"OK"} default button 1 with icon caution' \
  -e '    end try' \
  -e '  end repeat' \
  -e 'end print' \
  -e 'on run' \
  -e '  open location "https://pdfmy.de/"' \
  -e 'end run' >/dev/null 2>&1
if [ -d "$APP" ]; then
  PL="$APP/Contents/Info.plist"; PB=/usr/libexec/PlistBuddy
  $PB -c "Set :CFBundleIdentifier de.pdfmy.open" "$PL" >/dev/null 2>&1 || $PB -c "Add :CFBundleIdentifier string de.pdfmy.open" "$PL"
  $PB -c "Add :CFBundleDisplayName string PDFMy" "$PL" >/dev/null 2>&1
  $PB -c "Delete :CFBundleDocumentTypes" "$PL" >/dev/null 2>&1
  $PB -c "Add :CFBundleDocumentTypes array" "$PL"
  $PB -c "Add :CFBundleDocumentTypes:0 dict" "$PL"
  $PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeName string PDF-Dokument" "$PL"
  $PB -c "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Viewer" "$PL"
  $PB -c "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate" "$PL"
  $PB -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes array" "$PL"
  $PB -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string com.adobe.pdf" "$PL"
  # Symbol von pdfmy.de (falls offline: Standardsymbol)
  if /usr/bin/curl -sf -m 10 -o "$DIR/icon.png" https://pdfmy.de/icons/mentor-512.png; then
    /usr/bin/sips -s format icns "$DIR/icon.png" --out "$APP/Contents/Resources/applet.icns" >/dev/null 2>&1
  fi
  /usr/bin/codesign --force --deep -s - "$APP" >/dev/null 2>&1   # nach den Änderungen neu (lokal) signieren, sonst startet macOS die App nicht
  "$LSREG" -f "$APP" >/dev/null 2>&1
  echo "  ✓ App „PDFMy“ unter Programme angelegt"
  # 3. Standard für PDF-Dateien?
  answer=$(/usr/bin/osascript -e 'button returned of (display dialog "Sollen PDF-Dateien künftig per Doppelklick in PDFMy geöffnet werden?" & return & return & "Das lässt sich jederzeit im Finder unter „Informationen → Öffnen mit“ ändern." buttons {"Nein", "Ja, PDFMy verwenden"} default button 2 with title "pdfmy Scan für Mac")' 2>/dev/null)
  if [ "$answer" = "Ja, PDFMy verwenden" ]; then
    sleep 1
    /usr/bin/osascript -l JavaScript -e 'ObjC.import("CoreServices"); $.LSSetDefaultRoleHandlerForContentType($("com.adobe.pdf"), 0xFFFFFFFF, $("de.pdfmy.open"))' >/dev/null 2>&1
    rm -f "$DIR/pdfdefault.txt"
    echo "  ✓ PDFMy ist jetzt Ihr Standard für PDF-Dateien"
  fi
fi

echo ""
if [ -n "$ok" ]; then
  echo "  Fertig. In PDFMy heißt der Knopf oben jetzt „Scannen“."
  /usr/bin/open "https://pdfmy.de/" >/dev/null 2>&1
fi
echo "  Dieses Fenster können Sie schließen."
echo ""
