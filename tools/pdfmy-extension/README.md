# PDFMy – PDFs direkt öffnen (Browser-Erweiterung)

Erweiterung für **Chrome und Edge** (Manifest V3). PDFs, die man im Browser anklickt, öffnen sich in PDFMy (https://pdfmy.de) statt im Adobe-Acrobat-Viewer oder im eingebauten Viewer. Die Datei wird **nicht hochgeladen**: Die Erweiterung lädt sie im Browser und reicht sie per `postMessage` an PDFMy weiter.

## Installation für Anwender (ohne Konsole)

Anleitung auf **https://pdfmy.de/erweiterung.html** (wird von `tools/build-web.js` erzeugt, Download-ZIP liegt unter `download/pdfmy-erweiterung-<version>.zip`):

1. ZIP herunterladen, im Explorer: Rechtsklick → **Alle extrahieren …**
2. `chrome://extensions` (Edge: `edge://extensions`) öffnen, **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** → entpackten Ordner wählen.
4. Auf der Seite „Fast fertig“ **PDFs automatisch in PDFMy öffnen** klicken und **Zulassen**.

Sobald die Erweiterung im Chrome Web Store / bei Edge-Add-ons steht, entfallen Schritte 1–3 („Hinzufügen“).

## Bedienung

- **PDF anklicken** → öffnet sich in PDFMy (gleicher Tab bzw. neuer Tab bei `target=_blank`). „Zurück“ zeigt die Original-PDF (wird 10 Minuten lang nicht erneut umgeleitet).
- **Rechtsklick auf Link** → „In PDFMy öffnen“ (neuer Tab). Auf einer geöffneten PDF: „Diese PDF in PDFMy öffnen“.
- **Popup** (Symbol PDFMy): automatisch öffnen an/aus, „Diese PDF in PDFMy öffnen“, Ziel *pdfmy.de* oder *PDFMy intern (Mentor)*.
- Downloads (`Content-Disposition: attachment`) und POST-Antworten bleiben unverändert.

## Funktionsweise

| Datei | Aufgabe |
|---|---|
| `background.js` | Erkennt PDF-Aufrufe (`webRequest.onHeadersReceived`: `Content-Type: application/pdf` oder Endung `.pdf`; `onBeforeRedirect` für Umleitungen in den Viewer anderer Erweiterungen wie Adobe Acrobat). Lädt die Datei (`fetch`, mit Cookies der Quelle), prüft die PDF-Signatur `%PDF-`, öffnet `https://pdfmy.de/#pdfmy-import=<Token>`. Kontextmenü. |
| `pdfmy-bridge.js` | Content-Script nur für `https://pdfmy.de/*`. Holt die Datei zum Token über einen Port (Base64-Stücke), entfernt das Token aus der Adresse, übergibt die Bytes per `postMessage` (Transfer) an die Seite. |
| `js/app.js` (PDFMy) | Import-Schnittstelle: akzeptiert `{type:'pdfmy:open-file', name, bytes}` nur aus dem eigenen Fenster und der eigenen Herkunft; `pdfmy:ping`/`pdfmy:ready` für den Handshake. |
| `popup.*`, `welcome.*`, `ui.css` | Oberfläche im Mentor-Design (Archivo, Source Sans 3, #4A5280). |

Das Token ist eine zufällige UUID, gilt genau einmal und verfällt mit der Browsersitzung.

## Rechte (Datenminimierung, ISO 27001 A.5.34 / A.8.9)

| Recht | Wofür | Warnung bei Installation |
|---|---|---|
| `https://pdfmy.de/*` | Content-Script für die Übergabe | „Daten auf pdfmy.de lesen und ändern“ |
| `contextMenus` | „In PDFMy öffnen“ | – |
| `storage` | zwei Einstellungen, Einmal-Token | – |
| `webRequest` (nur beobachtend, nicht blockierend) | PDF-Antworten erkennen | – |
| `activeTab` | Rechtsklick/Popup ohne Webseiten-Zugriff (nur der aktuelle Tab, nur nach Klick) | – |
| `http://*/*`, `https://*/*` **optional** | automatisches Öffnen und PDFs anderer Websites laden | erst beim Einschalten, wieder entzogen beim Ausschalten |

Nicht verwendet: `tabs`, `history`, `downloads`, `cookies`, `scripting`, Fernzugriff, Telemetrie. CSP der Erweiterungsseiten: `script-src 'self'`.

## Test

```bash
node tools/build-web.js
NODE_PATH=<ordner-mit-puppeteer-core>/node_modules node tools/pdfmy-extension/test/e2e.js
```

Echter Chrome (headless) mit geladener Erweiterung; pdfmy.de und eine Test-Webseite `docs.test` werden über `--host-resolver-rules` auf lokale Server umgeleitet (PDFMy aus `dist/pdfmy.de`). Geprüft werden 15 Fälle: Klick auf PDF-Link (gleicher und neuer Tab, mit und ohne `.pdf`), Dateiname, Token entfernt, „Zurück“ ohne Schleife und ohne Rückfrage, Downloads unverändert, Kontextmenü-Aktion, Nicht-PDF-Meldung, Adobe-Viewer-Adressen, fremde `postMessage` wird ignoriert, Popup-Schalter, Schalter „aus“.

## Chrome Web Store / Edge-Add-ons (später)

- Paket: `dist/pdfmy.de/download/pdfmy-erweiterung-<version>.zip` (Manifest im Wurzelverzeichnis, ohne `test/` und `.md`).
- Datenschutzerklärung: https://pdfmy.de/datenschutz.html (Abschnitt 6).
- Begründung der Rechte: Tabelle oben. „Single purpose“: PDFs in PDFMy öffnen.
- Nach der Veröffentlichung die Store-ID in die PDFMy-Hilfe und `erweiterung.html` aufnehmen; Version in `manifest.json` erhöhen und in `CHANGELOG.md` eintragen.
