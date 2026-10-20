# Mitmachen bei PDFMy

Schön, dass Sie PDFMy weiterentwickeln möchten – wir freuen uns über jeden Beitrag!

## So helfen Sie

- **Fehler melden:** als *Issue* mit Schritten zum Nachstellen, Browser und System. Bei Scannerproblemen bitte das Protokoll aus dem Scan-Fenster („Protokoll“) anhängen – ohne persönliche Dokumente.
- **Ideen:** als *Issue* mit kurzer Beschreibung, wem die Funktion hilft.
- **Übersetzungen:** Wörterbücher in `i18n/<sprache>.json` (App) und `i18n/site/<sprache>.json` (Website). Prüfen mit `node tools/i18n-check.js` und `node tools/i18n-check.js --site`.
- **Code:** *Fork* → Branch → *Pull Request*.

## Regeln für Code

1. **Kein Upload von Dokumenten.** Alles läuft auf dem Gerät; keine neuen Server- oder Cloud-Abhängigkeiten, kein Tracking.
2. **So einfach wie möglich** für Nutzerinnen und Nutzer – keine Konsole, keine Skripte.
3. **Tests:** `npm test` muss grün sein; neue Logik bekommt Tests in `tests/`.
4. **Barrierefreiheit:** neue Oberflächen nach WCAG 2.1 AA (Beschriftungen, Kontrast, Tastatur).
5. **Texte:** Oberflächentexte auf Deutsch im Code; Übersetzungen über die Wörterbücher.
6. **Stil:** wie der umgebende Code (Vanilla JavaScript, keine Build-Kette, Kommentare auf Deutsch).
7. **Copyright-Kopf** in neuen Dateien:
   ```
   // Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
   // SPDX-License-Identifier: AGPL-3.0-or-later
   ```

## Eigene Projekte auf Basis von PDFMy

Gern! Bedingungen (siehe [NOTICE](NOTICE)): Copyright-Hinweise und den Banner der Mentor GmbH / Haus iT erhalten, Änderungen unter der AGPL veröffentlichen und sichtbar auf das Original hinweisen: **„Basiert auf PDFMy – [www.pdfmy.de](https://www.pdfmy.de)“**.

## Lizenz der Beiträge

Mit einem Pull Request stimmen Sie zu, dass Ihr Beitrag unter der Lizenz des Projekts (AGPL-3.0-or-later, siehe [LICENSE](LICENSE)) veröffentlicht wird. Das Copyright am Gesamtprojekt liegt bei der Mentor GmbH.

## Kontakt

Mentor GmbH, Paderborn · [wumertens@mentor-group.de](mailto:wumertens@mentor-group.de) · [pdfmy.de](https://pdfmy.de)
