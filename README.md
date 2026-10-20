# PDFMy – Post rein. PDF raus.

**PDFMy** ist ein kostenloses PDF- und Posteingangs-Werkzeug, das komplett im Browser läuft – **ohne Upload, ohne Konto, ohne Abo**.
Briefe scannen, Texterkennung (OCR), Briefdaten erkennen, ablegen, Fristen im Blick behalten, bearbeiten, schwärzen, unterschreiben und unterschreiben lassen, digital signieren, PDF/A und E-Rechnung.

👉 **Live ausprobieren: [pdfmy.de](https://pdfmy.de)**

> **Wir freuen uns, wenn Sie PDFMy weiterentwickeln!** Fehler melden, Ideen einbringen, Übersetzungen verbessern, Code beitragen – jeder Beitrag ist willkommen. Wie es geht, steht in [CONTRIBUTING.md](CONTRIBUTING.md).

## Was PDFMy kann

| Bereich | Funktionen |
|---|---|
| **Scannen** | Netzwerk- und USB-Scanner über das Hilfsprogramm *pdfmy Scan* (Windows, Mac, Linux: eSCL/AirScan, WSD, TWAIN/WIA, SANE), Handy-Foto mit Blatterkennung und Entzerrung |
| **Verstehen** | Texterkennung lokal (Tesseract), Absender, Betrag, Frist, IBAN, GiroCode, E-Rechnung (XRechnung/ZUGFeRD) |
| **Ablegen** | Posteingangsbuch mit Eingangsnummer, Fristen, Wiedervorlage, Volltextsuche, Kontoabgleich, DATEV-Export, GoBD-Prüfprotokoll |
| **Bearbeiten** | Seiten ordnen, zusammenführen, Text ändern, echtes Schwärzen, Formulare, Wasserzeichen, Bates-Nummern, AES-256-Kennwortschutz |
| **Unterschreiben** | Gezeichnete Unterschrift, digitale Signatur nach PAdES (eIDAS), Signaturprüfung, Unterschriftsablauf per E-Mail – ohne Server |
| **Normen** | PDF/A-2b + PDF/UA-1 (geprüft mit veraPDF), EN 16931, WCAG 2.1 AA, entwickelt nach ISO 27001/9001 |
| **Sprachen** | Oberfläche und Website in 40 Sprachen |

## Aufbau

- `index.html`, `js/` – die Web-App (Vanilla JavaScript, kein Build-Schritt nötig)
- `vendor/` – feste Versionen von pdf-lib, fontkit, pdf.js, Tesseract.js u. a. (Lizenzen in `vendor/licenses`)
- `i18n/` – Wörterbücher der Oberfläche (`i18n/<sprache>.json`) und der Website (`i18n/site/`)
- `tools/pdfmy-scan/` – *pdfmy Scan* für Windows (C#/.NET), `tools/pdfmy-scan-mac/` und `tools/pdfmy-scan-linux/` – Mac/Linux (Perl, nur Kernmodule)
- `tools/pdfmy-extension/` – Browser-Erweiterung „PDFs direkt öffnen“
- `tools/build-web.js` – baut die Website nach `dist/`
- `tests/` – automatische Tests, `docs/` – ISO-Nachweis, Release-Protokoll, internes Handbuch

## Loslegen

```bash
git clone <dieses-repository>
cd pdfmy
npm test                 # automatische Tests (Node.js 20+)
node tools/build-web.js  # Website nach dist/pdfmy.de bauen
```

Zum Ausprobieren genügt ein lokaler Webserver im Projektordner, z. B. `python -m http.server 8765`, dann `http://localhost:8765` öffnen (Chrome oder Edge empfohlen).

## Grundsätze

1. **Datenschutz durch Technik:** Dokumente verlassen das Gerät nicht. Kein Tracking, keine Cloud-KI.
2. **So einfach wie möglich:** keine Konsole, keine Skripte beim Nutzer.
3. **Nachweis statt Versprechen:** Keine Veröffentlichung ohne bestandene Tests; PDF-Normen werden mit unabhängigen Werkzeugen geprüft.

## Copyright und Lizenz

**Copyright © 2026 Mentor GmbH, Paderborn.** Alle Quelldateien tragen diesen Hinweis.

PDFMy steht unter der **GNU Affero General Public License v3.0 oder später** ([LICENSE](LICENSE)). Sie dürfen den Code nutzen, ändern und weitergeben – Änderungen müssen ebenfalls unter der AGPL veröffentlicht werden, auch wenn sie als Online-Dienst angeboten werden, und der Copyright-Hinweis bleibt erhalten. **Bedingung für die freie Nutzung:** Der Banner unten auf der Startseite (Haus iT / Mentor GmbH) und der Hinweis „powered by Mentor Group“ bleiben sichtbar und unverändert erhalten (zusätzliche Bedingung nach § 7 b AGPLv3). Der Name „PDFMy“ und das Logo sind nicht Teil der Lizenz – Details in [NOTICE](NOTICE).

## Kontakt und Kanäle

**Mentor GmbH** · Am Hoppenhof 30a · 33104 Paderborn · [wumertens@mentor-group.de](mailto:wumertens@mentor-group.de)

- LinkedIn: [Haus iT](https://www.linkedin.com/company/haus-it) · [Wolfgang-Udo Mertens](https://www.linkedin.com/in/wolfgang-udo-mertens75)
- YouTube: [Kanal](https://www.youtube.com/channel/UCcCSaQv0fccvMIPg0crMTkw)
- Facebook: [hausit24](https://www.facebook.com/hausit24)

---

*English: PDFMy is a free, privacy-first PDF and mail-inbox tool that runs entirely in the browser (no upload, no account). Contributions are very welcome – see [CONTRIBUTING.md](CONTRIBUTING.md). Copyright © 2026 Mentor GmbH, licensed under AGPL-3.0-or-later; the Mentor GmbH / Haus iT banner and the "powered by Mentor Group" notice must remain visible (additional term, AGPLv3 §7b).*
