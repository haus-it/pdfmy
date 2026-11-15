# PDFMy in die Stores bringen – alles vorbereitet

Stand 15.11.2026. **Was Sie tun müssen, ist nur noch: Konto anlegen, Dateien hochladen, Texte einfügen, absenden.** Alle Dateien liegen fertig in der Store-Mappe `store/` (neu erzeugen: `node tools/build-web.js` und dann `node tools/store-assets.js`). Je Store gibt es einen Ordner mit `paket/` (hochladen) und `bilder/` (hochladen). Die Texte stehen unten zum Kopieren.

## Überblick

| Store | Kosten | Aufwand für Sie | Prüfung | Ordner |
|---|---|---|---|---|
| **Firefox-Add-ons** (addons.mozilla.org) | kostenlos | Konto ist da (support@haus-it.de) – nur hochladen, ca. 10 Min. | meist 1–5 Tage | `store/firefox` |
| **Microsoft Edge-Add-ons** | kostenlos | Partner-Center-Konto + hochladen, ca. 20 Min. | bis 7 Werktage | `store/edge` |
| **Chrome Web Store** | einmalig 5 US-Dollar | Google-Konto, Gebühr zahlen, hochladen, ca. 20 Min. | meist 1–3 Tage | `store/chrome` |
| **Thunderbird-Add-ons** (addons.thunderbird.net) | kostenlos | Anmeldung mit dem Firefox-Konto, hochladen, ca. 10 Min. | einige Tage | `store/thunderbird` |
| **Microsoft AppSource** (Outlook, Word, Excel, PowerPoint) | kostenlos | Partner-Center-Konto der Firma (Firmenprüfung durch Microsoft), ca. 30 Min. + Wartezeit | 1–3 Wochen | `store/microsoft-appsource` |
| **Microsoft Teams Store** | kostenlos | im selben Partner Center, ca. 15 Min. | 1–3 Wochen | `store/microsoft-teams` |
| Nextcloud-App-Store, ONLYOFFICE-Marktplatz | kostenlos | erst nach Entscheidung (siehe `docs/Entscheidungen-Stores.md`) | – | `store/nextcloud`, `store/onlyoffice` |

**Empfohlene Reihenfolge:** Firefox (Konto vorhanden) → Edge → Chrome → Thunderbird → Microsoft AppSource und Teams (dauert am längsten, früh anstoßen).

**Für alle Stores gleich:**

- Kontakt-E-Mail: support@haus-it.de · Anbieter: Mentor GmbH
- Webseite: https://pdfmy.de/ · Hilfe/Support: https://pdfmy.de/hilfe.html · Datenschutz: https://pdfmy.de/datenschutz.html
- Kategorie: Produktivität / Office
- **Datenerhebung: keine.** Die Erweiterungen senden keine Daten an die Mentor GmbH oder an Dritte, es gibt kein Konto, keine Statistik und keine Werbung.

---

## 1. Firefox-Add-ons

**Link:** https://addons.mozilla.org/de/developers/addon/submit/distribution (mit support@haus-it.de angemeldet). Erscheint ein Bilderrätsel („Client Challenge“), einfach lösen.

1. **„Auf dieser Website“** wählen → **Weiter**.
2. Datei hochladen: `store/firefox/paket/pdfmy-firefox-1.1.0.xpi` → Mozillas Prüfung abwarten (0 Fehler erwartet) → **Weiter**.
3. Frage „Müssen Sie Quellcode einreichen?“ → **Nein** (der Code ist nicht minimiert).
4. Angaben einfügen:
   - **Name:** PDFMy – PDFs direkt öffnen
   - **Zusammenfassung:** Öffnet PDFs aus dem Browser mit einem Klick in PDFMy – ausfüllen, unterschreiben, schwärzen, speichern. Lokal, ohne Upload, kostenlos.
   - **Beschreibung:** Text „Beschreibung (DE)“ unten
   - **Kategorie:** Produktivität · **Lizenz:** „Eigene Lizenz“ → https://github.com/haus-it/pdfmy (PolyForm Noncommercial 1.0.0)
   - **Datenschutzerklärung:** Link https://pdfmy.de/datenschutz.html
   - **Hinweise für Prüfer:** Text „Hinweise für Prüfer (EN)“ unten
5. Bilder: `store/firefox/bilder/bildschirm-*.png`, Symbol `symbol-128.png`.
6. **Absenden.**
7. **Danach mir den Link zur Add-on-Seite schicken** – ich trage ihn ein, dann erscheint auf pdfmy.de „Zu Firefox hinzufügen“.

## 2. Microsoft Edge-Add-ons

**Link:** https://partner.microsoft.com/dashboard/microsoftedge/overview → mit einem Microsoft-Konto der Firma anmelden → „Registrieren“ (kostenlos, als **Unternehmen**: Mentor GmbH, Anschrift laut Impressum).

1. **Neue Erweiterung** → Paket hochladen: `store/edge/paket/pdfmy-erweiterung-1.1.0.zip`.
2. **Verfügbarkeit:** Öffentlich, alle Märkte.
3. **Eigenschaften:** Kategorie „Produktivität“, Datenschutz-URL https://pdfmy.de/datenschutz.html, Webseite https://pdfmy.de/, Support https://pdfmy.de/hilfe.html. „Erfasst die Erweiterung personenbezogene Daten?“ → **Nein**.
4. **Store-Einträge** (Sprache Deutsch, optional Englisch): Beschreibung „Beschreibung (DE)“ bzw. „(EN)“, Kurzbeschreibung = Zusammenfassung, Logo `store/edge/bilder/symbol-128.png`, Kacheln `kachel-klein-440x280.png` und `kachel-gross-1400x560.png`, Bildschirmfotos `bildschirm-*.png`.
5. **Übermittlung:** Hinweise für Prüfer = „Hinweise für Prüfer (EN)“ → **Veröffentlichen**.

## 3. Chrome Web Store

**Link:** https://chrome.google.com/webstore/devconsole → Google-Konto der Firma → einmalige Registrierungsgebühr 5 US-Dollar (zahlen Sie selbst), Kontotyp **Unternehmen** (Mentor GmbH).

1. **Neues Element** → `store/chrome/paket/pdfmy-erweiterung-1.1.0.zip` hochladen.
2. **Store-Eintrag:** Beschreibung „Beschreibung (DE)“, Kategorie „Produktivität“, Sprache Deutsch; Symbol `symbol-128.png`, kleine Kachel `kachel-klein-440x280.png`, große Kachel `kachel-gross-1400x560.png`, Bildschirmfotos `bildschirm-*.png` (1280×800). Webseite https://pdfmy.de/, Support https://pdfmy.de/hilfe.html.
3. **Datenschutz** – die Felder so ausfüllen:
   - **Einziger Zweck:** PDFs, die der Nutzer im Browser öffnet, in der Web-App PDFMy (pdfmy.de) öffnen – ohne Upload.
   - **activeTab:** Um die gerade angezeigte PDF auf Wunsch („Diese PDF in PDFMy öffnen“) an PDFMy zu übergeben.
   - **contextMenus:** Für den Rechtsklick „In PDFMy öffnen“ auf Links und PDFs.
   - **storage:** Speichert nur zwei Einstellungen (automatisch öffnen an/aus, Ziel) und kurz die zuletzt übergebene Adresse, damit „Zurück“ nicht erneut umleitet.
   - **webRequest:** Erkennt, ob eine aufgerufene Seite eine PDF ist (Content-Type), um sie in PDFMy zu öffnen. Es werden keine Anfragen verändert oder blockiert.
   - **Host-Berechtigungen:** pdfmy.de für die Übergabe an PDFMy; der Zugriff auf alle Webseiten ist optional und wird erst beim Einschalten von „Automatisch öffnen“ erfragt, um die angeklickte PDF laden zu können.
   - **Remote-Code:** Nein.
   - **Datennutzung:** keine Kategorie ankreuzen; alle drei Bestätigungen (kein Verkauf, keine Nutzung zu anderen Zwecken, keine Kreditwürdigkeit) ankreuzen. Datenschutz-URL https://pdfmy.de/datenschutz.html.
4. **Zur Überprüfung einreichen.**

## 4. Thunderbird-Add-ons

**Link:** https://addons.thunderbird.net/de/developers/addon/submit/ → „Anmelden“ mit dem Firefox-Konto support@haus-it.de.

1. **Auf dieser Website veröffentlichen** → `store/thunderbird/paket/pdfmy-thunderbird-1.0.0.xpi` hochladen.
2. Quellcode: **Nein**. Name „PDFMy“, Zusammenfassung „PDF-Anhänge in PDFMy öffnen, bearbeiten und unterschreiben – und wieder anhängen. Alles bleibt auf Ihrem Gerät.“, Beschreibung „Beschreibung Thunderbird“ unten, Kategorie „Nachrichtenlesen“ bzw. „Anhänge“, Lizenz wie bei Firefox, Datenschutz-Link wie oben.
3. Bilder: `store/thunderbird/bilder/`. **Absenden.**

## 5. Microsoft AppSource (Outlook, Word, Excel, PowerPoint) und Teams

**Einmalig:** https://partner.microsoft.com/dashboard/account/v3/enrollment/introduction/partnership → Programm **„Microsoft 365 und Copilot“** (früher „Office Store“) → als Unternehmen Mentor GmbH registrieren. Microsoft prüft die Firma (E-Mail an die Firmenadresse, ggf. Handelsregister HRB 9975) – das dauert einige Tage, darum früh anstoßen.

**Nutzungsbedingungen:** https://pdfmy.de/nutzungsbedingungen.html (veröffentlicht 15.11.2026, im Teams-Manifest eingetragen).

**Outlook-Add-in:** Partner Center → Marketplace-Angebote → **Neues Angebot → Office-Add-in** →

1. Paket: `store/microsoft-appsource/paket/pdfmy-outlook.xml` (von Microsofts Prüfer als gültig bestätigt). Bei „Mobilgeräte unterstützen“ **ja** ankreuzen (Outlook für iPhone und Android).
2. Eintrag: Name „PDFMy“, Kurzbeschreibung = „Zusammenfassung Outlook“, Beschreibung = „Beschreibung Outlook“, Symbol `symbol-300.png`, Bildschirmfotos `bildschirm-*-1366x768.png`, Kategorie „Produktivität“, Datenschutz-URL, Support-URL, Nutzungsbedingungen-URL.
3. Hinweise für die Prüfung: „Hinweise für Microsoft-Prüfer (EN)“ unten. **Einreichen.**

**Word, Excel, PowerPoint:** genauso, zweites Angebot mit `pdfmy-office.xml` und „Beschreibung Office“.

**Teams:** Partner Center → Neues Angebot → **Teams-App** → `store/microsoft-teams/paket/pdfmy-teams.zip`, Texte wie Outlook, Bild `bildschirm-1-pdfmy-in-teams-1366x768.png`.

---

## Texte zum Kopieren

**Beschreibung (DE)**

> PDFs aus Webportalen, Webmail, Behörden- und Bankseiten öffnen sich mit einem Klick in PDFMy statt im eingebauten Viewer – zum Ausfüllen, Unterschreiben, Schwärzen, Zusammenfügen und Speichern.
>
> • Kein Upload: Die Erweiterung lädt die PDF im Browser und übergibt sie direkt an PDFMy auf Ihrem Gerät.
> • Rechtsklick auf einen Link → „In PDFMy öffnen“. Downloads bleiben Downloads.
> • Automatisches Öffnen jederzeit an- und abschaltbar. Den Zugriff auf Webseiten erteilen Sie erst beim Einschalten, beim Ausschalten wird er wieder entzogen.
> • Kostenlos, ohne Konto, ohne Werbung, ohne Statistik.
>
> PDFMy ist eine kostenlose PDF-Web-App der Mentor GmbH (Paderborn): https://pdfmy.de

**Beschreibung (EN)**

> PDFs from web portals, webmail, government and banking sites open in PDFMy with one click instead of the built-in viewer – to fill in, sign, redact, merge and save.
>
> • No upload: the extension loads the PDF in your browser and hands it straight to PDFMy on your device.
> • Right-click a link → "Open in PDFMy". Downloads stay downloads.
> • Automatic opening can be switched on and off at any time. Site access is only requested when you switch it on and is removed when you switch it off.
> • Free, no account, no ads, no tracking.
>
> PDFMy is a free PDF web app by Mentor GmbH (Paderborn, Germany): https://pdfmy.de

**Hinweise für Prüfer (EN)** (Firefox, Edge, Chrome, Thunderbird)

> No build step and no minified code – the files in the package are the source. The extension detects top-level PDF navigations (webRequest, non-blocking), fetches the PDF in the background script and opens https://pdfmy.de/#pdfmy-import=<one-time token>. The content script pdfmy-bridge.js runs only on https://pdfmy.de/*, fetches the bytes via a runtime port and passes them to the page with window.postMessage (same origin). No data is sent anywhere else. Access to all sites is an optional permission requested only when the user enables "open automatically". Test: click the toolbar icon, enable the switch, then open any PDF link, e.g. https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf

**Beschreibung Thunderbird**

> Öffnet PDF-Anhänge, Bilder und Office-Dateien aus E-Mails mit einem Klick in PDFMy – über den Knopf „PDFMy“ oder per Rechtsklick auf den Anhang. Beim Verfassen einer E-Mail: PDF-Anhang bearbeiten und ersetzen oder ein neues PDF (Scan, Fotos, zusammengefügte Dateien) anhängen – „An E-Mail anhängen“ in PDFMy gibt das Ergebnis direkt zurück. Der Anhang geht nur von Thunderbird an PDFMy auf diesem Gerät, nichts wird hochgeladen. Kostenlos, ohne Konto.

**Zusammenfassung Outlook**

> PDF-Anhänge öffnen, bearbeiten und unterschreiben, neue PDFs scannen – und an die E-Mail anhängen. Alles bleibt auf Ihrem Gerät.

**Beschreibung Outlook**

> Mit PDFMy öffnen Sie PDF-Anhänge, Bilder und Office-Dateien direkt aus Outlook – bearbeiten, unterschreiben, schwärzen, zusammenfügen. Beim Verfassen einer E-Mail hängt „An E-Mail anhängen“ das fertige PDF wieder an; mit „Neues PDF anhängen“ scannen oder fotografieren Sie ein Dokument direkt in die E-Mail. In Outlook für iPhone und Android öffnen Sie Anhänge beim Lesen in PDFMy.
>
> Datenschutz: Der Anhang geht nur von Outlook an PDFMy auf demselben Gerät. Es gibt keinen Server, kein Konto und keine Telemetrie. Kostenlos.

**Beschreibung Office** (Word, Excel, PowerPoint)

> Der Knopf „In PDFMy öffnen“ auf der Registerkarte „Start“ öffnet das aktuelle Dokument als PDF in PDFMy – zum Bearbeiten, Unterschreiben, Schwärzen und Speichern. Word und PowerPoint erzeugen das PDF selbst, Excel-Arbeitsmappen wandelt PDFMy um. Das Dokument geht nur von Office an PDFMy auf demselben Gerät, nichts wird hochgeladen. Kostenlos, ohne Konto.

**Hinweise für Microsoft-Prüfer (EN)**

> PDFMy is a free, client-side PDF editor (https://pdfmy.de). The add-in opens a large Office dialog with PDFMy and passes the selected attachment (Outlook) or the document as PDF (Word/PowerPoint via getFileAsync, Excel as .xlsx) to it with messageChild in chunks; in Outlook compose mode the edited PDF is returned with messageParent and attached via addFileAttachmentFromBase64Async. On iOS/Android the task pane embeds PDFMy (same origin) instead of using the dialog. No sign-in, no backend, no data leaves the device except loading the static web app from pdfmy.de. Test: open any email with a PDF attachment → PDFMy button → "In PDFMy öffnen"; in compose: attach a PDF → PDFMy → "Bearbeiten" → in PDFMy click "An E-Mail anhängen".
