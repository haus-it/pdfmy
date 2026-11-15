# PDFMy-Erweiterung für Firefox – Einreichung bei addons.mozilla.org

Die Firefox-Fassung besteht aus **demselben Code** wie die Erweiterung für Chrome und Edge (dieser Ordner). `tools/build-web.js` erzeugt `download/pdfmy-firefox-<version>.xpi` mit eigenem Manifest:

- `background.scripts` statt `service_worker` (Firefox),
- `browser_specific_settings.gecko.id` = `pdfmy-erweiterung@mentor-group.de`, ab Firefox 140 (Android 142),
- `data_collection_permissions.required` = `["none"]` – die Erweiterung sammelt und überträgt keine Daten.

Geprüft (15.11.2026): `web-ext lint` 0 Fehler, 0 Warnungen; echter Firefox (vorübergehend geladen): PDF-Link anklicken → PDFMy auf pdfmy.de öffnet die PDF mit allen Seiten, Kennung aus der Adresse entfernt.

## Einreichen (einmalig, durch die Mentor GmbH)

1. Konto auf https://addons.mozilla.org/developers/ anlegen (Firefox-Konto der Mentor GmbH, nicht persönlich).
2. **Submit a New Add-on → On this site** (öffentlich gelistet) → `pdfmy-firefox-<version>.xpi` hochladen.
3. Frage nach Quellcode: **Nein** – der Code ist nicht minimiert und nicht gebündelt; die Dateien im Paket sind der Quelltext.
4. Angaben aus dem Abschnitt unten übernehmen, Kategorie „Produktivität“, Lizenz „Andere“ → Link auf https://github.com/haus-it/pdfmy (PolyForm Noncommercial 1.0.0).
5. Nach der Freigabe die Adresse der Add-on-Seite in `tools/site.json` als `"firefoxAmo": "https://addons.mozilla.org/de/firefox/addon/…/"` eintragen und neu ausrollen – dann zeigt erweiterung.html den Knopf „Zu Firefox hinzufügen“.

Neue Fassungen: Version in `manifest.json` erhöhen, bauen, neue .xpi bei AMO hochladen („Neue Version einreichen“); Firefox aktualisiert dann automatisch.

## Angaben für die Store-Seite

**Name:** PDFMy – PDFs direkt öffnen

**Kurzbeschreibung (DE):** Öffnet PDFs aus dem Browser mit einem Klick in PDFMy – ausfüllen, unterschreiben, schwärzen, speichern. Lokal, ohne Upload, kostenlos.

**Summary (EN):** Opens PDFs from the browser in PDFMy with one click – fill in, sign, redact, save. Local, no upload, free.

**Beschreibung (DE):** PDFs aus Webportalen, Webmail, Behörden- und Bankseiten öffnen sich direkt in PDFMy (pdfmy.de) statt im eingebauten Viewer. Die Datei wird nicht hochgeladen: Die Erweiterung lädt sie im Browser und übergibt sie an PDFMy auf demselben Gerät. Rechtsklick auf einen Link → „In PDFMy öffnen“. Downloads bleiben Downloads. Der Zugriff auf Webseiten wird erst beim Einschalten des automatischen Öffnens erteilt und beim Ausschalten entzogen. Kein Konto, keine Statistik, keine Werbung.

**Hinweise für die Prüfer (EN):** No build step, no minified code – the files in the package are the source. The extension detects top-level PDF navigations (webRequest, non-blocking), fetches the PDF in the background script and opens https://pdfmy.de/#pdfmy-import=<one-time token>; the content script `pdfmy-bridge.js` (only on https://pdfmy.de/*) fetches the bytes via a runtime port and passes them to the page with `window.postMessage` (same origin). No data is sent anywhere else. Host access to all sites is an optional permission requested only when the user enables "open automatically". Test: enable the switch in the toolbar popup, open any PDF link (e.g. https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf).

**Datenschutz:** https://pdfmy.de/datenschutz.html (Nr. 6) · **Support:** https://pdfmy.de/hilfe.html
