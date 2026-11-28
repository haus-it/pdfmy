# Neue Oberflächensprache für PDFMy – Übersetzungsauftrag

Ordner: `C:\Users\Administrator\ADOBE\tools\neue-sprache\`

PDFMy ist ein kostenloses PDF-Programm im Browser (Briefe scannen, PDFs bearbeiten, unterschreiben, Bewerbungen).
Neu: **Kiswahili** für Nutzer in Kenia (Amtssprachen Englisch und Kiswahili), Tansania und Ostafrika.

## Sprache (Code → Sprache)
- `sw` Kiswahili (Standard-Kiswahili wie in Kenia und Tansania geschrieben; einfache Alltagssprache)

## Pakete
- `paket-g.json` – 800 Grundbegriffe (Knöpfe, Menüs, Überschriften). **Zuerst** und als Glossar: Ergebnis `g/<code>.json`.
- `paket-app-1.json`, `paket-app-2.json` – weitere App-Texte → `app-1/<code>.json`, `app-2/<code>.json`
- `paket-site-1.json` … `paket-site-4.json` – Webseite und Hilfe → `site-1/<code>.json` …
Jedes Paket ist ein Array deutscher Schlüssel. Ergebnis je Paket: ein JSON-Objekt `{ "<deutscher Schlüssel>": "<Übersetzung>" }` mit **allen** Schlüsseln, Schlüssel Zeichen für Zeichen unverändert.

## Regeln
1. **Glossar:** Wenn `g/<code>.json` existiert, musst du für alle Knopf-, Menü- und Feldnamen genau diese Wörter verwenden (auch in „…“ oder `<i>…</i>`). Lies es vor dem Übersetzen.
2. **Leichte, klare Sprache**, höfliche Anrede, kurze Sätze, Alltagswörter. Leser: Menschen ohne Computerkenntnisse.
3. **HTML und Platzhalter unverändert:** gleiche Tags in gleicher Anzahl (`<b>`, `<i>`, `<a …>`, `<kbd>`, `<br>`, `<span …>`), Attribute (href, class) exakt gleich, nur Text übersetzen (sichtbare Texte in title/aria-label/placeholder dürfen übersetzt werden). Platzhalter `{0}`, `{1}` und benannte wie `{datum}` bleiben. Entities (`&amp;`) bleiben.
4. **Nicht übersetzen:** PDFMy, pdfmy Scan, Produkt-/Markennamen (Word, Excel, Outlook, Windows, Mac, iPhone, WhatsApp, Teams, ZUGFeRD, XRechnung, DATEV, beA, ELSTER, jobcenter.digital …), Dateinamen und Dateiendungen, Ordnernamen (z. B. `_Versionen`), E-Mail-Adressen, URLs, Formate, technische Werte (PDF-Schlüssel, XML, MIME, Regex, Wortlisten anderer Sprachen), Tastennamen in `<kbd>` (Strg → „Ctrl“, Umschalt → „Shift“, Entf → „Delete“ ist erlaubt).
5. Deutsche Rechts-/Behördenbegriffe (Jobcenter, Agentur für Arbeit, Finanzamt, Bescheid, Zuwendungsbestätigung …): verständlich übersetzen und den deutschen Begriff in Klammern dazuschreiben, wenn man ihn auf Formularen wiederfinden muss. Sparsam.
6. Ziffern 0–9 behalten. Menüwege „Mehr → …“ mit dem Glossarwort für „Mehr“.
7. Vollständig: nichts weglassen, nichts hinzufügen, keine Werbung.
8. **Arbeitsweise:** Paket lesen, in Teilen übersetzen (Zwischenstände unter `tools\neue-sprache\_sw-<paket>\`) und mit einem Node-Skript als UTF-8 schreiben (`JSON.stringify(obj, null, 1)`). Zum Schluss prüfen: `node pruefen.js <paket> sw` (z. B. `node pruefen.js app-1 sw`) – muss „ohne Befund“ melden.
9. Ändere nichts außerhalb von `tools\neue-sprache\`.

Antwort knapp: „<paket> sw: N/N, ohne Befund“.
