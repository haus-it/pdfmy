# Schwachstellen- und Vorfallmanagement PDFMy

Stand 15.11.2026. Gilt für die Web-App pdfmy.de, pdfmy Scan (Windows, Mac, Linux), die Browser-Erweiterung und die Add-ins. Grundlage: Art. 14 VO (EU) 2024/2847 (Cyberresilienz-Verordnung, Meldepflichten seit 11.09.2026), Anhang I Teil II CRA (ab 11.12.2027), ISO/IEC 27001 A.5.24–A.5.28 und A.8.8.

## 1. Eingang

- Meldeweg öffentlich: `https://pdfmy.de/.well-known/security.txt` (RFC 9116) und `sicherheit.html#schwachstellen`; Kontakt: E-Mail-Adresse aus dem Impressum.
- Weitere Quellen: „Problem melden“ in PDFMy, GitHub (haus-it/pdfmy), vierteljährliche CVE-Prüfung der Bibliotheken (ISO-Maßnahme M4) gegen die SBOM.
- Jede Meldung bekommt einen Eintrag in diesem Dokument (Abschnitt 5) mit Eingangszeitpunkt.

## 2. Bewertung (sofort, spätestens am Eingangstag)

1. Nachvollziehen und betroffene Bestandteile/Versionen bestimmen (SBOM `download/pdfmy-sbom.cdx.json`).
2. Einstufen: **aktiv ausgenutzt?** (Hinweise auf Ausnutzung in freier Wildbahn) – dann gelten die Fristen in Abschnitt 3 ab dem Zeitpunkt, zu dem wir davon Kenntnis haben.
3. Schweregrad nach CVSS festhalten.

## 3. Meldung nach Art. 14 CRA (aktiv ausgenutzte Schwachstelle oder schwerer Sicherheitsvorfall)

Gemeldet wird über die zentrale Meldeplattform der ENISA (https://portal.cra-srp.enisa.europa.eu/) an das koordinierende CSIRT in Deutschland und gleichzeitig an die ENISA.

| Frist ab Kenntnis | Inhalt |
|---|---|
| **24 Stunden** | Frühwarnung (bei Schwachstellen: Mitgliedstaaten, in denen das Produkt bereitgestellt ist) |
| **72 Stunden** | Meldung mit allgemeinen Angaben, Art der Ausnutzung bzw. des Vorfalls, ergriffene und empfohlene Maßnahmen |
| **14 Tage** nach Verfügbarkeit einer Abhilfe (Schwachstelle) bzw. **1 Monat** nach der 72-h-Meldung (Vorfall) | Abschlussbericht: Beschreibung, Schwere, Auswirkung, Ursache, Abhilfe |

Außerdem: betroffene Nutzer informieren (Art. 14 Abs. 8), z. B. Hinweis auf pdfmy.de, in pdfmy Scan und im Änderungsprotokoll.

**Voraussetzung (offen):** Konto der Mentor GmbH auf der Meldeplattform (EU Login) – durch die Geschäftsführung anzulegen; koordinierendes CSIRT bestätigen.

## 4. Behebung und Veröffentlichung

- Korrektur entwickeln, Tests ergänzen (Regressionstest), Freigabe über das Test-Gate (`tools/deploy.ps1`).
- Web-App: Ausrollen wirkt beim nächsten Start; pdfmy Scan: neue signierte Version, Update-Hinweis; Erweiterung/Add-ins: neue Version in den Stores bzw. Download.
- Sicherheitsupdates sind kostenlos.
- Eintrag in `CHANGELOG.md` und `docs/RELEASES.md`; Meldende auf Wunsch nennen.

## 5. Protokoll

| Eingang | Quelle | Bestandteil/Version | aktiv ausgenutzt? | Meldungen (24 h / 72 h / Abschluss) | Behoben in | Status |
|---|---|---|---|---|---|---|
| – | – | – | – | – | – | bisher keine Meldung |
