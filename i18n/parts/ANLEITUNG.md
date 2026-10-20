# Übersetzung der PDFMy-Oberfläche

PDFMy ist eine deutsche Web-App (pdfmy.de) zum Scannen, Bearbeiten, Signieren und Ablegen von PDFs – alles im Browser, ohne Upload.
Anbieter: Mentor GmbH, Paderborn. Zielgruppe: Privatleute, Selbstständige, kleine Firmen, Vereine.

Die Dateien `_keys.1.json` … `_keys.4.json` enthalten die deutschen Oberflächentexte (Schlüssel). Für jede Zielsprache entstehen
`<code>.1.json` … `<code>.4.json`: ein JSON-Objekt `{ "deutscher Schlüssel": "Übersetzung", … }` – jeder Schlüssel exakt unverändert übernommen.

## Regeln
1. **Platzhalter** `{0}`, `{1}` … genau so übernehmen (jeder genau einmal, Reihenfolge darf sich ändern). Sie stehen für Zahlen, Namen, Datum oder eingesetzte Textteile.
2. **HTML** (`<b>`, `<span class="…">`, `<a href="…">`, `<input …>` …): Tags und alle Attribute unverändert lassen, nur den sichtbaren Text übersetzen
   (Ausnahme: Text in `title="…"`, `aria-label="…"`, `alt="…"`, `placeholder="…"` übersetzen). `&amp;`, `&nbsp;` usw. bleiben.
3. **Nicht übersetzen:** PDFMy, pdfmy Scan, Mentor Group, DATEV, ZUGFeRD, Factur-X, XRechnung, GiroCode, EPC, PDF/A, PDF/UA, PAdES, OCR, eSCL, AirScan, WSD, TWAIN, WIA, SANE,
   SharePoint, OneDrive, Excel, WhatsApp, Windows, macOS, Linux, Chrome, Edge, Firefox, Safari, IBAN, BIC, DIN 5008, Dateiendungen (.pdf, .p12/.pfx, .eml/.msg), Tastennamen in kbd (Strg → in der Zielsprache übliche Bezeichnung, meist „Ctrl“; „Umschalt“ → „Shift“ bzw. üblich).
4. **Deutsche Fachbegriffe** sinngemäß übersetzen und bei Bedarf das deutsche Wort in Klammern lassen, wenn es eine deutsche Behörde/Einrichtung ist (z. B. Finanzamt, Steuerbescheid, Schufa).
5. **Ton:** höflich-formell (Sie-Form → vous, usted, Lei, вы, Ви, Siz …), kurz und klar wie in einer guten App. Knopfbeschriftungen kurz halten (ähnliche Länge wie das Deutsche).
6. **Typografie** der Zielsprache (Anführungszeichen « », “ ”, „ “, Dezimal- und Leerzeichen-Regeln). Auslassungspunkte „…“ beibehalten.
7. Ein Schlüssel kann ein Bruchstück sein (z. B. „ – keine Frist erkannt.“ oder „Seite“): so übersetzen, dass es an dieser Stelle passt.
8. Englisch: `en-GB` britisch (colour, organise, licence, centre, „post“, Datum TT/MM/JJJJ in Beispielen), `en-US` amerikanisch (color, organize, license, center, „mail“).
9. Keine Schlüssel weglassen, keine hinzufügen. Gültiges JSON (Anführungszeichen im Text mit \" maskieren, keine Kommentare).

## Ablauf
- Pro Teil die Datei `_keys.<n>.json` lesen, Übersetzung als `<code>.<n>.json` schreiben.
- Danach `node tools/i18n-check.js merge <code>` im Projektordner ausführen. Ziel: **0 fehlen, 0 Fehler**. Gemeldete Fehler in den Teildateien korrigieren und erneut zusammenführen.
- Nachträge: `_keys.5.json`, `_keys.6.json` (Tab-Titel, Meta-Beschreibung, Fußzeile der Web-Version aus `i18n/_web.json`) – Übersetzung als `<code>.5.json`, `<code>.6.json`. Nicht `split` ausführen (überschreibt die Teile 1–4).
- Webseiten (Hilfe, Scanner): eigene Anleitung `i18n/site/parts/ANLEITUNG.md`.
