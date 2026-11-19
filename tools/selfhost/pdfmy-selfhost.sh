#!/usr/bin/env bash
# PDFMy auf dem eigenen Server – installieren und automatisch aktualisieren (Linux, auch in Docker-Hosts).
# Herausgeber: Mentor GmbH, Paderborn – https://__DOMAIN__
# Lizenzbedingungen beachten: https://github.com/haus-it/pdfmy/blob/main/LICENSE (PolyForm Noncommercial 1.0.0)
# Jede Fassung ist von der Mentor GmbH signiert (RSA-3072, SHA-256). Installiert wird nur eine Fassung mit gültiger Signatur,
# passender Prüfsumme und höherer Nummer als die vorhandene. Eigene Dateien im Hauptordner des Ziels (z. B. impressum.html,
# eigene-links.json, eigene Unterordner) bleiben bei jedem Update erhalten – nicht aber eigene Dateien in Ordnern des Pakets (js/, vendor/ …). Benötigt: bash, curl, tar, gzip, openssl.
set -euo pipefail
umask 022
SKRIPT_VERSION="__VERSION__"
KANAL=stabil
STABIL_TAGE=7
PAKET_QUELLE=
QUELLE="${PDFMY_QUELLE:-}"
SCHLUESSEL='__PUBKEY__'
STILL=0
tmp=''

hilfe() {
  cat <<'EOF'
PDFMy auf dem eigenen Server

  pdfmy-selfhost installieren  ZIELORDNER   neueste Fassung installieren und täglich automatisch aktualisieren
  pdfmy-selfhost aktualisieren ZIELORDNER   jetzt auf die neueste Fassung bringen (nichts zu tun, wenn aktuell)
  pdfmy-selfhost pruefen       ZIELORDNER   nur anzeigen, ob es eine neue Fassung gibt (Rückgabewert 10 = ja)
  pdfmy-selfhost zurueck       ZIELORDNER   die vorige Fassung wiederherstellen
  pdfmy-selfhost automatik-aus ZIELORDNER   tägliche Aktualisierung abschalten

  --still          nur Ausgaben bei einem Update oder Fehler (für die tägliche Aktualisierung)
  --kanal=aktuell  jede Fassung sofort (Standard: stabil = erst nach 7 Tagen ohne Rücknahme auf __DOMAIN__)

Beispiel: sudo pdfmy-selfhost installieren /var/www/pdfmy
Eigener Spiegel im Intranet: PDFMY_QUELLE=https://spiegel.intern/pdfmy pdfmy-selfhost aktualisieren /var/www/pdfmy
Proxy: wie bei curl über die Umgebungsvariable https_proxy.
EOF
}
sag() { [ "$STILL" = 1 ] || echo "$*"; }
fehler() { echo "pdfmy-selfhost: $*" >&2; exit 1; }
for p in curl tar gzip openssl mktemp; do command -v "$p" >/dev/null 2>&1 || fehler "benötigt das Programm „$p“ – bitte installieren"; done

holen() {   # holen URL DATEI – Standardquelle nur über HTTPS
  local opt=(-fsSL --retry 3 --max-time 600)
  [ -z "${PDFMY_QUELLE:-}" ] && opt+=(--proto '=https' --tlsv1.2)
  curl "${opt[@]}" -o "$2" "$1" || fehler "Download fehlgeschlagen: $1"
}
wert() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" "$2" | head -n 1; }   # flaches JSON aus latest.json
sha256() { openssl dgst -sha256 -r "$1" | cut -d' ' -f1; }

# Signatur der Versionsdatei prüfen: signiert ist „pdfmy-selfhost-v1“ + Zeilenumbruch + latest.json (Byte für Byte)
sig_ok() {   # sig_ok JSON SIG → 0 = Signatur gültig
  local t rc=1; t=$(mktemp -d)
  printf 'pdfmy-selfhost-v1\n' > "$t/nachricht"; cat "$1" >> "$t/nachricht"
  printf '%s\n' "$SCHLUESSEL" > "$t/schluessel.pem"
  if openssl base64 -d -A -in "$2" -out "$t/signatur" 2>/dev/null && openssl dgst -sha256 -verify "$t/schluessel.pem" -signature "$t/signatur" "$t/nachricht" >/dev/null 2>&1; then rc=0; fi
  rm -rf "$t"; return $rc
}
pruefe_signatur() { sig_ok "$1" "$2" || fehler "Signatur ungültig – Update abgebrochen (nichts verändert)"; }
gueltig() {   # gueltig JSON → Format, Nummer und Dateiname plausibel
  [ "$(wert format "$1")" = "1" ] && case "$(wert nr "$1")" in ''|*[!0-9]*) false;; *) true;; esac && case "$(wert datei "$1")" in ''|*/*|*..*) false;; *) true;; esac
}

# Neueste Fassung beschreiben: setzt NEU_NR, NEU_VERSION, NEU_DATEI, NEU_SHA, PAKET_QUELLE; Arbeitsordner $1
neueste() {
  holen "$QUELLE/latest.json" "$1/latest.json"
  holen "$QUELLE/latest.json.sig" "$1/latest.json.sig"
  pruefe_signatur "$1/latest.json" "$1/latest.json.sig"
  [ "$(wert format "$1/latest.json")" = "1" ] || fehler "unbekanntes Format der Versionsdatei – bitte das Skript aktualisieren"
  gueltig "$1/latest.json" || fehler "Versionsdatei mit ungültiger Nummer oder ungültigem Dateinamen"
  NEU_NR=$(wert nr "$1/latest.json"); NEU_VERSION=$(wert version "$1/latest.json"); NEU_DATEI=$(wert datei "$1/latest.json"); NEU_SHA=$(wert sha256 "$1/latest.json")
  PAKET_QUELLE="$QUELLE"
  # Kanal „stabil“ rechnet selbst nach (Update-Strategie 5.2): eine Fassung aus „aktuell“, die seit STABIL_TAGE Tagen veröffentlicht
  # ist – oder eine Sicherheitsfassung –, gilt als stabil, auch wenn pdfmy.de seitdem nichts Neues ausgerollt hat. Eine zurückgenommene
  # Fassung steht nicht mehr in „aktuell“. Fehlt „aktuell“ oder ist es nicht gültig signiert, bleibt es bei „stabil“.
  if [ "$KANAL" = stabil ] && [ "${QUELLE%/stabil}" != "$QUELLE" ]; then
    local akt="${QUELLE%/stabil}/aktuell" nr2 datum2 alter
    if curl -fsSL --max-time 60 -o "$1/akt.json" "$akt/latest.json" 2>/dev/null && curl -fsSL --max-time 60 -o "$1/akt.json.sig" "$akt/latest.json.sig" 2>/dev/null \
       && sig_ok "$1/akt.json" "$1/akt.json.sig" && gueltig "$1/akt.json"; then
      nr2=$(wert nr "$1/akt.json"); datum2=$(wert datum "$1/akt.json")
      alter=$(( ( $(date -u +%s) - $(date -u -d "$datum2" +%s 2>/dev/null || echo 9999999999) ) / 86400 ))
      if [ "$nr2" -gt "$NEU_NR" ] && { [ "$(wert sicherheit "$1/akt.json")" = 1 ] || [ "$alter" -ge "$STABIL_TAGE" ]; }; then
        NEU_NR=$nr2; NEU_VERSION=$(wert version "$1/akt.json"); NEU_DATEI=$(wert datei "$1/akt.json"); NEU_SHA=$(wert sha256 "$1/akt.json"); PAKET_QUELLE="$akt"
      fi
    fi
  fi
}
# Absoluter Zielpfad; bricht ab, wenn der übergeordnete Ordner fehlt (Tippfehler wie /var/wwww/pdfmy: nie nach /pdfmy installieren).
# Nur als einfache Zuweisung aufrufen (ZIEL=$(absolut …)) – dann beendet set -e das Skript bei einem Fehler.
absolut() {
  local d; d=$(cd "$(dirname "$1")" 2>/dev/null && pwd) || fehler "übergeordneter Ordner von $1 fehlt – bitte den Pfad prüfen"
  printf '%s/%s\n' "${d%/}" "$(basename "$1")"
}
installiert_nr() { [ -f "$1/.pdfmy-version" ] && sed -n 's/^nr=//p' "$1/.pdfmy-version" | head -n 1 || true; }

aktualisieren() {   # aktualisieren ZIEL [nur_pruefen]
  local ziel eltern name alt b   # tmp bleibt global: die Aufräum-Falle (EXIT) braucht ihn auch nach dem Ende der Funktion
  ziel="$1"   # schon absolut (absolut)
  eltern=$(dirname "$ziel"); name=$(basename "$ziel")
  [ -w "$eltern" ] || fehler "keine Schreibrechte in $eltern (mit sudo aufrufen?)"
  tmp=$(mktemp -d "$eltern/.pdfmy-arbeit.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
  neueste "$tmp"
  alt=$(installiert_nr "$ziel")
  if [ -n "$alt" ] && [ "$NEU_NR" -le "$alt" ]; then sag "PDFMy ist aktuell ($NEU_VERSION)."; return 0; fi
  if [ "${2:-}" = nur_pruefen ]; then echo "Neue Fassung verfügbar: $NEU_VERSION (installiert: ${alt:-keine})"; exit 10; fi
  sag "Lade $NEU_VERSION …"
  holen "$PAKET_QUELLE/$NEU_DATEI" "$tmp/paket.tar.gz"
  [ "$(sha256 "$tmp/paket.tar.gz")" = "$NEU_SHA" ] || fehler "Prüfsumme des Pakets stimmt nicht – Update abgebrochen (nichts verändert)"
  mkdir "$tmp/neu"
  gzip -dc "$tmp/paket.tar.gz" | tar -xf - -C "$tmp/neu" || fehler "Paket lässt sich nicht entpacken"   # über stdin: GNU tar deutet „C:/…“ sonst als Rechnername
  [ -f "$tmp/neu/index.html" ] && [ -f "$tmp/neu/sw.js" ] && [ -f "$tmp/neu/pruefsummen.json" ] || fehler "Paket unvollständig – Update abgebrochen"
  (cd "$tmp/neu" && ls -A) > "$tmp/paketinhalt"
  : > "$tmp/eigen"
  if [ -d "$ziel" ]; then
    # Webserver-Einstellungen: eigene oder vom Betreiber geänderte Fassung hat Vorrang (Prüfsumme gegen die bisherige Fassung);
    # die neue Fassung von PDFMy liegt dann als Vorlage daneben. Unverändert übernommene Dateien werden einfach ersetzt.
    for b in .htaccess web.config nginx-pdfmy.conf; do
      [ -f "$ziel/$b" ] && [ -f "$tmp/neu/$b" ] || continue
      if [ -f "$ziel/pruefsummen.json" ] && grep -qF "\"$b\":\"$(sha256 "$ziel/$b")\"" "$ziel/pruefsummen.json"; then continue; fi
      mv "$tmp/neu/$b" "$tmp/neu/$b.pdfmy-vorlage"; cp -a "$ziel/$b" "$tmp/neu/"; echo "$b" >> "$tmp/eigen"
      sag "Eigene bzw. angepasste $b behalten – die Fassung von PDFMy liegt als $b.pdfmy-vorlage daneben."
    done
    # Eigene Dateien übernehmen: alles im bisherigen Ordner, was nicht zum bisherigen Paket gehört
    for e in "$ziel"/* "$ziel"/.[!.]*; do
      [ -e "$e" ] || continue; b=$(basename "$e")
      case "$b" in .pdfmy-version|.pdfmy-dateien|.htaccess|web.config|nginx-pdfmy.conf) continue;; esac
      if [ -f "$ziel/.pdfmy-dateien" ] && grep -qxF "$b" "$ziel/.pdfmy-dateien"; then continue; fi
      [ -e "$tmp/neu/$b" ] && continue
      cp -a "$e" "$tmp/neu/"
    done
  fi
  { grep -vxF -f "$tmp/eigen" "$tmp/paketinhalt" || true; sed 's/$/.pdfmy-vorlage/' "$tmp/eigen"; } > "$tmp/neu/.pdfmy-dateien"
  printf 'nr=%s\nversion=%s\ndatum=%s\nkanal=%s\n' "$NEU_NR" "$NEU_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$KANAL" > "$tmp/neu/.pdfmy-version"
  chmod -R a+rX "$tmp/neu"
  if [ -d "$ziel" ]; then chown -R --reference="$ziel" "$tmp/neu" 2>/dev/null || true; fi
  # Wechsel in zwei Umbenennungen (Bruchteile einer Sekunde); die vorige Fassung bleibt für „zurueck“
  rm -rf "$eltern/.$name.vorher"
  [ -d "$ziel" ] && mv "$ziel" "$eltern/.$name.vorher"
  mv "$tmp/neu" "$ziel"
  echo "PDFMy aktualisiert: ${alt:+v$alt → }$NEU_VERSION ($ziel)"
  # Dieses Skript selbst aktuell halten (es steckt im signierten Paket)
  local self; self=$(command -v "$0" 2>/dev/null || echo "$0")
  if [ -f "$ziel/pdfmy-selfhost.sh" ] && [ -w "$self" ] && ! cmp -s "$ziel/pdfmy-selfhost.sh" "$self"; then
    cp "$ziel/pdfmy-selfhost.sh" "$self.neu" && chmod 755 "$self.neu" && mv "$self.neu" "$self" && sag "Aktualisierungsskript erneuert."
  fi
}

zurueck() {
  local ziel eltern name
  ziel="$1"; eltern=$(dirname "$ziel"); name=$(basename "$ziel")
  [ -d "$eltern/.$name.vorher" ] || fehler "keine vorige Fassung vorhanden"
  mv "$ziel" "$eltern/.$name.tausch" && mv "$eltern/.$name.vorher" "$ziel" && mv "$eltern/.$name.tausch" "$eltern/.$name.vorher"
  echo "Vorige Fassung wiederhergestellt: $(sed -n 's/^version=//p' "$ziel/.pdfmy-version" 2>/dev/null)"
  echo "Hinweis: Die tägliche Aktualisierung installiert wieder die neueste Fassung – bei Bedarf „automatik-aus“."
}

cronname() { echo "pdfmy-selfhost-$(printf '%s' "$1" | openssl dgst -sha256 -r | cut -c1-8)"; }
automatik_an() {
  local ziel="$1" bin m h
  m=$(( $(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % 60 )); h=$(( 3 + $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % 3 ))   # 3–5 Uhr, Minute zufällig
  if [ "$(id -u)" = 0 ] && [ -d /etc/cron.d ]; then
    bin=/usr/local/bin/pdfmy-selfhost; [ "$(readlink -f "$0")" = "$bin" ] || install -m 755 "$0" "$bin"
    printf '# PDFMy täglich aktualisieren (pdfmy-selfhost)\n%s %s * * * root %s aktualisieren %q --kanal=%s --still >> /var/log/pdfmy-selfhost.log 2>&1\n' "$m" "$h" "$bin" "$ziel" "$KANAL" > "/etc/cron.d/$(cronname "$ziel")"
    echo "Tägliche Aktualisierung eingerichtet (/etc/cron.d/$(cronname "$ziel"), Protokoll /var/log/pdfmy-selfhost.log)."
  elif command -v crontab >/dev/null 2>&1; then
    bin=$(readlink -f "$0")
    { crontab -l 2>/dev/null | grep -v "# $(cronname "$ziel")" || true; printf '%s %s * * * %q aktualisieren %q --kanal=%s --still # %s\n' "$m" "$h" "$bin" "$ziel" "$KANAL" "$(cronname "$ziel")"; } | crontab -
    echo "Tägliche Aktualisierung in Ihrer crontab eingerichtet."
  else
    echo "Kein cron gefunden – bitte „$0 aktualisieren $ziel --still“ täglich selbst starten (z. B. systemd-Timer)."
  fi
}
automatik_aus() {
  local n; n=$(cronname "$1")
  rm -f "/etc/cron.d/$n" 2>/dev/null || true
  if command -v crontab >/dev/null 2>&1; then (crontab -l 2>/dev/null | grep -v "# $n" || true) | crontab - 2>/dev/null || true; fi
  echo "Tägliche Aktualisierung abgeschaltet."
}

args=(); for a in "$@"; do case "$a" in --still) STILL=1;; --kanal=stabil|--kanal=aktuell) KANAL="${a#--kanal=}";; --kanal=*) fehler "Kanal „${a#--kanal=}“ unbekannt (stabil oder aktuell)";; --version) echo "pdfmy-selfhost $SKRIPT_VERSION"; exit 0;; -h|--help) hilfe; exit 0;; *) args+=("$a");; esac; done
[ "${#args[@]}" -eq 2 ] || { hilfe; exit 2; }
[ -n "$QUELLE" ] || QUELLE="https://__DOMAIN__/selfhost/$KANAL"
ZIEL=$(absolut "${args[1]}")
case "${args[0]}" in
  installieren) echo "Lizenzbedingungen beachten: https://github.com/haus-it/pdfmy/blob/main/LICENSE – bitte prüfen, ob Ihre Nutzung davon gedeckt ist."
    aktualisieren "$ZIEL"; automatik_an "$ZIEL"
    echo "Fertig. Den Ordner per HTTPS ausliefern (Webserver-Beispiele: https://__DOMAIN__/firmen.html#eigener-server).";;
  aktualisieren) aktualisieren "$ZIEL";;
  pruefen) aktualisieren "$ZIEL" nur_pruefen;;
  zurueck) zurueck "$ZIEL";;
  automatik-aus) automatik_aus "$ZIEL";;
  *) hilfe; exit 2;;
esac
