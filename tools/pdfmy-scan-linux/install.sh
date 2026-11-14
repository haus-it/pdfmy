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
# Herunterladen ohne Pflicht-Werkzeug: curl, sonst wget (unter Mint/Ubuntu fehlt curl manchmal – Fehlerbericht 14.11.2026)
fetch() { { command -v curl >/dev/null 2>&1 && curl -sf -m 20 -o "$2" "$1"; } || { command -v wget >/dev/null 2>&1 && wget -q -T 20 -O "$2" "$1"; }; }
# Mit Arbeitsoberfläche: statt im Terminal weiterzumachen das passende Installationspaket holen und grafisch installieren –
# Mint/Ubuntu/Debian (.deb), Fedora/openSUSE/RHEL (.rpm), Arch/Manjaro (.pkg.tar.gz). Paketverwaltung mit Fenster (gdebi, Pamac)
# oder über pkexec: das System fragt im eigenen Fenster nach dem Passwort. Klappt das nicht, geht es unten wie bisher weiter (ohne sudo).
pkg_gui() {
  [ -z "${PDFMY_SKRIPT:-}" ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] || return 1
  if command -v dpkg >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then EXT=deb
  elif command -v rpm >/dev/null 2>&1 && { command -v dnf >/dev/null 2>&1 || command -v zypper >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; }; then EXT=rpm
  elif command -v pacman >/dev/null 2>&1; then EXT=pkg.tar.gz
  else return 1; fi
  PKG="${XDG_DOWNLOAD_DIR:-$HOME/Downloads}/pdfmy-scan-linux.$EXT"; mkdir -p "$(dirname "$PKG")"
  fetch "https://pdfmy.de/download/pdfmy-scan-linux.$EXT" "$PKG" && [ -s "$PKG" ] || return 1
  if [ "$EXT" = deb ] && command -v gdebi-gtk >/dev/null 2>&1; then
    echo "  ➜ Die Paketinstallation öffnet sich jetzt: „Paket installieren“ klicken und mit Ihrem Passwort bestätigen – fertig."
    ( nohup gdebi-gtk "$PKG" >/dev/null 2>&1 & ); exit 0
  fi
  if [ "$EXT" = pkg.tar.gz ] && command -v pamac-installer >/dev/null 2>&1; then
    echo "  ➜ Pamac öffnet sich jetzt: Installation bestätigen – fertig."
    ( nohup pamac-installer "$PKG" >/dev/null 2>&1 & ); exit 0
  fi
  command -v pkexec >/dev/null 2>&1 || return 1
  echo "  ➜ pdfmy Scan wird als Paket installiert. Bitte im Fenster Ihr Passwort eingeben …"
  case "$EXT" in
    deb) pkexec env DEBIAN_FRONTEND=noninteractive apt-get install -y "$PKG" ;;
    rpm) if command -v dnf >/dev/null 2>&1; then pkexec dnf install -y "$PKG"
         elif command -v zypper >/dev/null 2>&1; then pkexec zypper --non-interactive install --allow-unsigned-rpm "$PKG"
         else pkexec yum install -y "$PKG"; fi ;;
    *) pkexec pacman -U --noconfirm --needed "$PKG" ;;
  esac >/dev/null 2>&1 || { echo "  (Paket nicht installiert – pdfmy Scan wird stattdessen nur für Ihren Benutzer eingerichtet.)"; return 1; }
  echo ""; echo "  ✓ Fertig. In PDFMy (https://pdfmy.de) heißt der Knopf oben jetzt „Scannen“."; echo ""
  exit 0
}
pkg_gui
if [ -z "$PERL" ]; then
  echo "  ✗ Perl fehlt. Bitte installieren und erneut starten, z. B.:"
  echo "      Debian/Ubuntu/Mint:  sudo apt install perl"
  echo "      Fedora:              sudo dnf install perl"
  echo "      openSUSE:            sudo zypper install perl"
  echo "      Arch:                sudo pacman -S perl"
  exit 1
fi
if ! "$PERL" -MJSON::PP -MIO::Socket::INET -MIO::Select -MMIME::Base64 -MFile::Temp -MEncode -e1 >/dev/null 2>&1; then
  echo "  ✗ Perl ist unvollständig (Module wie JSON::PP fehlen). Bitte nachinstallieren, z. B.:"
  echo "      Fedora:  sudo dnf install perl-JSON-PP perl-IO perl-MIME-Base64 perl-Encode"
  echo "      andere:  sudo apt install perl   bzw.  sudo zypper install perl"
  exit 1
fi
mkdir -p "$DIR" "$APPS" "$CONF/systemd/user"
# Anfragen an pdfmy Scan (127.0.0.1) mit Perl statt curl: pdfmy-http.pl METHODE PFAD [mit-Origin] – Inhalt eines POST von der Standardeingabe
cat > "$DIR/pdfmy-http.pl" <<'PDFMY_HTTP_END'
use strict; use IO::Socket::INET;
my ($m, $p, $o) = @ARGV; my $dir = $ENV{PDFMY_DIR} || (($ENV{XDG_DATA_HOME} || "$ENV{HOME}/.local/share") . '/pdfmy-scan');
my $port = 52880; if (open(my $f, '<', "$dir/port")) { my $l = <$f> // ''; $port = $1 if $l =~ /(\d+)/; }
my $b = $m eq 'POST' ? do { local $/; <STDIN> } // '' : '';
my $s = IO::Socket::INET->new(PeerAddr => '127.0.0.1', PeerPort => $port, Timeout => 5) or exit 1;
print $s "$m $p HTTP/1.0\r\nHost: 127.0.0.1:$port\r\nContent-Length:" . length($b) . "\r\n" . ($o ? "Origin: https://pdfmy.de\r\nX-Pdfmy: 1\r\n" : '') . "\r\n$b";
local $/; my $r = <$s> // ''; my ($st) = $r =~ m{^HTTP/\S+\s+(\d+)}; $r =~ s/^.*?\r\n\r\n//s; print $r; exit($st && $st < 300 ? 0 : 1);
PDFMY_HTTP_END

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
for i in 1 2 3 4 5 6 7 8; do sleep 1; if "$PERL" "$DIR/pdfmy-http.pl" GET /status </dev/null 2>/dev/null | grep -q pdfmy-scan; then ok=1; break; fi; done
if [ -n "$ok" ]; then echo "  ✓ Scan-Dienst läuft (startet künftig mit der Anmeldung)"; else echo "  ✗ Der Scan-Dienst startet nicht. Details: journalctl --user -u pdfmy-scan  bzw.  $DIR/log.txt"; fi

# 2. „PDFMy“ im Anwendungsmenü: öffnet PDFs per Doppelklick in PDFMy (die Datei bleibt auf dem Rechner)
cat > "$DIR/pdfmy-open" <<OPEN
#!/bin/sh
# Öffnet die übergebenen PDFs in PDFMy im Browser. Die Datei bleibt auf dem Rechner: pdfmy Scan gibt sie einmalig über 127.0.0.1 heraus.
[ \$# -eq 0 ] && exec xdg-open https://pdfmy.de/
send() { printf '%s' "\$1" | "$PERL" "$DIR/pdfmy-http.pl" POST /open-local; }   # eigener Port (bei mehreren angemeldeten Benutzern ggf. 52881–52889)
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
fetch https://pdfmy.de/icons/app-512.png "$DIR/pdfmy.png" || true
ICON="$DIR/pdfmy.png"; [ -s "$ICON" ] || ICON=application-pdf   # ohne Netz: allgemeines PDF-Symbol
cat > "$APPS/pdfmy.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=PDFMy
GenericName=PDF-Programm
Comment=PDFs öffnen, bearbeiten, unterschreiben und scannen – im Browser, ohne Upload
Exec="$DIR/pdfmy-open" %F
Icon=$ICON
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
    "$PERL" "$DIR/pdfmy-http.pl" POST /defaultapps 1 </dev/null >/dev/null 2>&1
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
