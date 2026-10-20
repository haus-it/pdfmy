# Übersetzung der PDFMy-Webseiten (Hilfe, Scanner-Anleitung)

Gilt zusätzlich zu `i18n/parts/ANLEITUNG.md` (Regeln 1–9 dort gelten unverändert: Platzhalter, HTML, Eigennamen, Sie-Form, Typografie, Bruchstücke, en-GB/en-US, gültiges JSON).

Die Hilfeseite (`hilfe.html`) und die Anleitung „Scanner einrichten“ (`scanner.html`) von pdfmy.de werden wie die App im Browser übersetzt.
Schlüssel = deutscher Text (Leerraum zusammengefasst). Wörterbuch je Sprache: `i18n/site/<code>.json`.
Rechtstexte (Impressum, Datenschutzerklärung, Barrierefreiheit) werden **nicht** übersetzt und sind hier nicht enthalten.

## Dateien
- Schlüssel: `i18n/site/parts/_keys.1.json`, `_keys.2.json` → Übersetzung als `i18n/site/parts/<code>.1.json`, `<code>.2.json`
  (JSON-Objekt `{ "deutscher Schlüssel": "Übersetzung", … }`, jeder Schlüssel exakt unverändert).
- Zusammenführen und prüfen: `node tools/i18n-check.js --site merge <code>` → Ziel **0 fehlen, 0 Fehler**.

## Zusätzliche Regeln
1. **Begriffe wie in der App:** Menüs, Knöpfe und Einstellungen von PDFMy (z. B. *Mehr → Sprache*, *Einstellungen → Scannen → Dokumentsprache*,
   „Scanner verbinden“, „Digital signieren“) genau so übersetzen wie im App-Wörterbuch `i18n/<code>.json` (dort den deutschen Text als Schlüssel nachschlagen).
   So findet der Nutzer, was die Hilfe beschreibt.
2. **Fremde Programme:** Meldungen und Menüs von Windows, macOS, Chrome/Edge (z. B. „Der Computer wurde durch Windows geschützt“, „Weitere Informationen“,
   „Trotzdem ausführen“, „Systemeinstellungen → Datenschutz & Sicherheit“, „Dennoch öffnen“, „Entpackte Erweiterung laden“) mit der offiziellen
   Bezeichnung in der Zielsprache wiedergeben, soweit bekannt; sonst sinngemäß.
3. **Unverändert lassen:** E-Mail-Adressen, Adressen/URLs, Dateinamen, Gerätenamen (Epson EcoTank L5290, Dell Color MFP E525w, EPSON2CBBCB),
   Protokolle (SMB, CIFS, eSCL, AirScan, WSD, SANE, Bonjour/AirPrint, Mopria), Paketnamen, „pdfmy“, „pdfmy Scan“, „PDFMy“, „Mentor Group“, „powered by“.
4. **Attribute:** `href`, `download=""`, `style`, `class`, `id` exakt übernehmen. Text in `title`, `aria-label`, `alt`, `placeholder` übersetzen.
5. **Suchbegriffe** (kurze Schlüssel wie „Standard PDF“, „unterschreiben“, „Handy“, „Passwort“, „Mac“, „Scanner einrichten“) sind Suchanfragen für die
   Hilfesuche: so übersetzen, wie ein Nutzer in der Zielsprache danach suchen würde – kurz, mit den Wörtern, die auch im übersetzten Hilfetext stehen.
6. **Tasten** in `<kbd>`: Strg → Ctrl (bzw. die in der Zielsprache übliche Beschriftung), Entf → Del, Bild↑/Bild↓ → PgUp/PgDn (bzw. üblich), Esc, Enter, Tab bleiben.
7. Rechtliches: deutsche Gesetze/Normen (GoBD, DSGVO …) bei Bedarf mit Erklärung, deutsche Abkürzung in Klammern lassen.
