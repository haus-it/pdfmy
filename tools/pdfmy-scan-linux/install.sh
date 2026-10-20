#!/bin/sh
# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# pdfmy Scan für Linux – Einrichtung. Im Terminal:  sh pdfmy-scan-linux.sh   (oder: curl -fsSL https://pdfmy.de/download/pdfmy-scan-linux.sh | sh)
# Richtet ein: den Scan-Dienst (systemd-Benutzerdienst, startet mit der Anmeldung), den Eintrag „PDFMy“ im Anwendungsmenü
# (öffnet PDFs per Doppelklick in PDFMy) und auf Wunsch PDFMy als Standard für PDF-Dateien.
# Kein sudo nötig, alles nur für den angemeldeten Benutzer. Der Dienst ist nur vom eigenen Rechner aus erreichbar (127.0.0.1).
set -u
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
DIR="$DATA/pdfmy-scan"
UNIT="$CONF/systemd/user/pdfmy-scan.service"
APPS="$DATA/applications"
echo ""
echo "  pdfmy Scan für Linux __PDFMY_VERSION__ wird eingerichtet …"
echo ""
if [ "$(id -u)" = "0" ]; then echo "  ✗ Bitte ohne sudo starten – pdfmy Scan wird nur für Ihren Benutzer eingerichtet."; exit 1; fi
PERL="$(command -v perl || true)"
if [ -z "$PERL" ] || ! command -v curl >/dev/null 2>&1; then
  echo "  ✗ Es fehlen Perl oder curl. Bitte installieren und erneut starten, z. B.:"
  echo "      Debian/Ubuntu/Mint:  sudo apt install perl curl"
  echo "      Fedora:              sudo dnf install perl curl"
  echo "      openSUSE:            sudo zypper install perl curl"
  echo "      Arch:                sudo pacman -S perl curl"
  exit 1
fi
if ! "$PERL" -MJSON::PP -MIO::Socket::INET -MIO::Select -MMIME::Base64 -MFile::Temp -MEncode -e1 >/dev/null 2>&1; then
  echo "  ✗ Perl ist unvollständig (Module wie JSON::PP fehlen). Bitte nachinstallieren, z. B.:"
  echo "      Fedora:  sudo dnf install perl-JSON-PP perl-IO perl-MIME-Base64 perl-Encode"
  echo "      andere:  sudo apt install perl   bzw.  sudo zypper install perl"
  exit 1
fi
mkdir -p "$DIR" "$APPS" "$CONF/systemd/user"

# 1. Scan-Dienst
cat > "$DIR/pdfmy-scan.pl" <<'PDFMY_PERL_END'
__PDFMY_PERL__
PDFMY_PERL_END
if ! "$PERL" -c "$DIR/pdfmy-scan.pl" >/dev/null 2>&1; then echo "  ✗ Das Programm ist beschädigt. Bitte neu herunterladen."; exit 1; fi
ok=""
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  cat > "$UNIT" <<UNIT
[Unit]
Description=pdfmy Scan – Scanner für PDFMy (nur 127.0.0.1)
After=network-online.target

[Service]
ExecStart=$PERL $DIR/pdfmy-scan.pl
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable pdfmy-scan.service >/dev/null 2>&1
  systemctl --user restart pdfmy-scan.service
  STARTER="systemctl --user restart pdfmy-scan.service"
else
  # Ohne systemd (z. B. manche Minimal-Systeme): Start bei der Anmeldung über den Autostart der Arbeitsoberfläche
  mkdir -p "$CONF/autostart"
  cat > "$CONF/autostart/pdfmy-scan.desktop" <<AUTO
[Desktop Entry]
Type=Application
Name=pdfmy Scan
Exec=$PERL "$DIR/pdfmy-scan.pl"
NoDisplay=true
X-GNOME-Autostart-enabled=true
AUTO
  pkill -f "$DIR/pdfmy-scan.pl" >/dev/null 2>&1; sleep 1
  nohup "$PERL" "$DIR/pdfmy-scan.pl" >"$DIR/fehler.txt" 2>&1 &
  STARTER="( nohup $PERL \"$DIR/pdfmy-scan.pl\" >/dev/null 2>&1 & )"
fi
for i in 1 2 3 4 5 6 7 8; do sleep 1; if curl -s -m 2 http://127.0.0.1:52880/status | grep -q pdfmy-scan; then ok=1; break; fi; done
if [ -n "$ok" ]; then echo "  ✓ Scan-Dienst läuft (startet künftig mit der Anmeldung)"; else echo "  ✗ Der Scan-Dienst startet nicht. Details: journalctl --user -u pdfmy-scan  bzw.  $DIR/log.txt"; fi

# 2. „PDFMy“ im Anwendungsmenü: öffnet PDFs per Doppelklick in PDFMy (die Datei bleibt auf dem Rechner)
cat > "$DIR/pdfmy-open" <<OPEN
#!/bin/sh
# Öffnet die übergebenen PDFs in PDFMy im Browser. Die Datei bleibt auf dem Rechner: pdfmy Scan gibt sie einmalig über 127.0.0.1 heraus.
[ \$# -eq 0 ] && exec xdg-open https://pdfmy.de/
send() { printf '%s' "\$1" | curl -sf -m 5 -X POST --data-binary @- http://127.0.0.1:52880/open-local; }
# Als App installiertes PDFMy (Chrome/Edge legen dafür eine .desktop-Datei mit --app-id an): Datei direkt im App-Fenster öffnen
pwa() {
  for d in "\${XDG_DATA_HOME:-\$HOME/.local/share}"/applications/*.desktop; do
    [ -f "\$d" ] && grep -q '^Name=PDFMy\$' "\$d" && grep -q -- '--app-id=' "\$d" && grep -q 'application/pdf' "\$d" && { printf '%s' "\$d"; return 0; }
  done
  return 1
}
app=\$(pwa)
for f in "\$@"; do
  p=\$(readlink -f -- "\$f" 2>/dev/null || printf '%s' "\$f")
  if [ -n "\$app" ]; then
    e=\$(sed -n 's/^Exec=//p' "\$app" | head -n 1 | sed 's/ %[UuFf]//g')
    if [ -n "\$e" ]; then sh -c "\$e \"\\\$1\"" pdfmy "\$p" >/dev/null 2>&1 & continue; fi
  fi
  r=\$(send "\$p") || { $STARTER; sleep 2; r=\$(send "\$p"); }
  u=\$(printf '%s' "\$r" | sed -n 's/.*"url":"\\([^"]*\\)".*/\\1/p')
  if [ -n "\$u" ]; then xdg-open "\$u" >/dev/null 2>&1 &
  else
    m="PDFMy konnte die Datei nicht öffnen, weil pdfmy Scan nicht läuft. Bitte die Einrichtung (pdfmy-scan-linux.sh) noch einmal starten."
    command -v notify-send >/dev/null 2>&1 && notify-send "PDFMy" "\$m" || { command -v zenity >/dev/null 2>&1 && zenity --error --text="\$m"; } || echo "\$m" >&2
  fi
done
OPEN
chmod +x "$DIR/pdfmy-open"
curl -sf -m 10 -o "$DIR/pdfmy.png" https://pdfmy.de/icons/app-512.png || true
cat > "$APPS/pdfmy.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=PDFMy
GenericName=PDF-Programm
Comment=PDFs öffnen, bearbeiten, unterschreiben und scannen – im Browser, ohne Upload
Exec="$DIR/pdfmy-open" %F
Icon=$DIR/pdfmy.png
MimeType=application/pdf;
Categories=Office;Viewer;Graphics;
Terminal=false
StartupNotify=false
DESK
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1
echo "  ✓ „PDFMy“ im Anwendungsmenü und unter „Öffnen mit“ angelegt"

# 3. Standard für PDF-Dateien?
ans=""
if { : </dev/tty; } 2>/dev/null; then printf "  Sollen PDF-Dateien künftig per Doppelklick in PDFMy geöffnet werden? [J/n] "; read -r ans </dev/tty || ans="n"; fi
case "$ans" in
  ""|j|J|ja|Ja|y|Y)
    if command -v xdg-mime >/dev/null 2>&1; then xdg-mime default pdfmy.desktop application/pdf >/dev/null 2>&1; fi
    curl -s -m 5 -X POST -H 'Origin: https://pdfmy.de' -H 'X-Pdfmy: 1' http://127.0.0.1:52880/defaultapps >/dev/null 2>&1
    echo "  ✓ PDFMy ist jetzt Ihr Standard für PDF-Dateien (änderbar im Dateimanager: Rechtsklick → Öffnen mit)";;
esac

# 4. Hinweise zu Scannern
echo ""
if ! command -v avahi-browse >/dev/null 2>&1; then echo "  ℹ Für die automatische Suche nach Netzwerkscannern empfohlen: avahi-utils (Paket „avahi-utils“ bzw. „avahi-tools“)."; fi
if ! command -v scanimage >/dev/null 2>&1; then
  echo "  ℹ Netzwerkscanner (eSCL/AirScan, WSD) funktionieren ohne Treiber. Für USB-Scanner und ältere Geräte zusätzlich SANE:"
  if command -v apt >/dev/null 2>&1; then echo "      sudo apt install sane-utils sane-airscan ipp-usb"
  elif command -v dnf >/dev/null 2>&1; then echo "      sudo dnf install sane-backends sane-airscan ipp-usb"
  elif command -v zypper >/dev/null 2>&1; then echo "      sudo zypper install sane-backends sane-airscan ipp-usb"
  elif command -v pacman >/dev/null 2>&1; then echo "      sudo pacman -S sane sane-airscan ipp-usb"
  else echo "      Pakete: sane-backends (scanimage), sane-airscan, ipp-usb"; fi
fi
echo ""
if [ -n "$ok" ]; then
  echo "  Fertig. In PDFMy heißt der Knopf oben jetzt „Scannen“."
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then xdg-open "https://pdfmy.de/" >/dev/null 2>&1 & fi
fi
echo "  Entfernen: sh pdfmy-scan-linux-entfernen.sh  (von pdfmy.de/scanner.html#linux)"
echo ""
