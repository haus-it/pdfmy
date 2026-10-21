# Risikobeurteilung PDFMy (ISO/IEC 27001:2022, Kap. 6.1.2 / 8.2)

**Stand:** 21.10.2026 · **Status:** Entwurf zur Freigabe durch die Geschäftsführung · **Version:** PDFMy app-v165 / pdfmy Scan 1.4.x
**Verantwortlich:** Mentor GmbH, Paderborn (Geschäftsführer Wolfgang-Udo Mertens) · **Nächste Überprüfung:** 21.04.2027 und bei jeder wesentlichen Änderung (neue Funktion mit Netz- oder Dateizugriff, neuer Fremdcode, Sicherheitsvorfall)

## 1. Geltungsbereich
Web-Anwendung PDFMy (https://pdfmy.de, https://pdfmy.de/mentor/), Hilfsprogramm „pdfmy Scan“ (Windows, Mac, Linux), Browser-Erweiterung „PDFMy – PDFs direkt öffnen“, Build- und Veröffentlichungsprozess (`tools/build-web.js`, `tools/deploy.ps1`), Quellcode auf GitHub (`haus-it/pdfmy`).

Nicht im Geltungsbereich: die Rechner der Nutzer selbst, deren Ablage (SharePoint, OneDrive, Netzlaufwerk) und E-Mail-Programme – dafür ist der jeweilige Betreiber verantwortlich (Hinweise in Abschnitt 6).

## 2. Grundannahme der Architektur
Oberstes Ziel (KONZEPT.md, Abschnitt 4): **Alles bleibt auf dem Rechner des Kunden.** pdfmy.de liefert nur statische Dateien; Dokumente, erkannter Text und Eingaben werden im Browser verarbeitet. Damit entfallen die größten Risiken klassischer PDF-Dienste (zentrale Datenhaltung, Abfluss beim Anbieter, Konten). Die verbleibenden Risiken liegen bei der **Integrität des ausgelieferten Codes**, bei **lokalen Schnittstellen** und bei **Bedienfehlern**.

## 3. Methode
- **Werte (Assets):** A1 Dokumente und Inhalte der Nutzer · A2 ausgelieferter Programmcode (Web-App, pdfmy Scan, Erweiterung) · A3 Schlüssel und Zugänge (Code-Signatur, SFTP-Zugang, GitHub) · A4 Verfügbarkeit von pdfmy.de · A5 Ruf und Vertrauen („kein Upload“).
- **Eintrittswahrscheinlichkeit (W):** 1 selten · 2 möglich · 3 wahrscheinlich.
- **Auswirkung (A):** 1 gering · 2 spürbar · 3 schwer (Datenabfluss, Rechtsverstoß, Vertrauensverlust).
- **Risiko = W × A.** 1–2 akzeptiert · 3–4 behandeln, wenn wirtschaftlich · 6–9 muss behandelt werden.
- Bewertet wird zuerst ohne, dann mit den umgesetzten Maßnahmen (Restrisiko).

## 4. Risikoregister

| Nr. | Bedrohung / Schwachstelle | Wert | W×A vorher | Maßnahmen (umgesetzt) | W×A Rest | Entscheidung |
|---|---|---|---|---|---|---|
| R1 | Manipulierter Code auf pdfmy.de (Webserver kompromittiert, Zugang gestohlen) → Dokumente könnten abfließen | A1, A2, A5 | 2×3 = 6 | CSP erlaubt Verbindungen nur zu pdfmy.de und zum eigenen Rechner; Veröffentlichung nur über `deploy.ps1` mit Test-Gate; Quellcode öffentlich vergleichbar (GitHub); Dialog „Datenschutz selbst prüfen“ macht Abflüsse sichtbar | 1×3 = 3 | behandeln: Subresource-Integrity/Hash-Liste der Releases in RELEASES.md veröffentlichen (offen, siehe M10) |
| R2 | Kompromittierte Fremdbibliothek (pdf.js, pdf-lib, Tesseract …) | A1, A2 | 2×3 = 6 | Bibliotheken lokal eingebunden, keine CDNs; Versionen dokumentiert; vierteljährliche CVE-Prüfung (nächste bis 15.01.2027); CSP begrenzt Abfluss | 1×3 = 3 | akzeptiert mit laufender Prüfung |
| R3 | Bösartige PDF des Nutzers (Skripte, Exploits gegen den PDF-Leser) | A1, A2 | 2×2 = 4 | PDF-JavaScript wird nicht ausgeführt (pdf.js ohne Scripting-Modul); CSP ohne `unsafe-eval` (nur `wasm-unsafe-eval`); Verarbeitung in der Browser-Sandbox | 1×2 = 2 | akzeptiert |
| R4 | Lokale Schnittstelle pdfmy Scan (127.0.0.1:52880) von fremder Webseite angesprochen | A1, A2 | 2×3 = 6 | Herkunftsprüfung (nur pdfmy.de / localhost), Kopfzeile `X-Pdfmy`, nur Loopback, Private-Network-Access; Signierte Programmdatei (Authenticode) | 1×2 = 2 | akzeptiert |
| R5 | Lokale KI (Ollama, LM Studio) auf eine Netzadresse umgebogen → Text verlässt den Rechner | A1 | 2×3 = 6 | Nur localhost/127.0.0.1/[::1] erlaubt (Prüfung im Dialog und CSP); aus als Voreinstellung; Cloud-KI bewusst nicht angebunden (KONZEPT 4) | 1×2 = 2 | akzeptiert |
| R6 | Bedienfehler: Schwärzung nur optisch, Text bleibt lesbar | A1, A5 | 2×3 = 6 | Echtes Schwärzen (Seite wird gerastert, OCR-Text entfernt); Prüfung im Test | 1×3 = 3 | akzeptiert; Hinweis in der Hilfe |
| R7 | Versand an falschen Empfänger (Unterschriftsanfrage, E-Mail) | A1 | 2×2 = 4 | Versand nur durch den Nutzer im eigenen Mailprogramm (Entwurf), kein automatischer Versand; Empfänger sichtbar vor dem Senden | 2×2 = 4 | akzeptiert (liegt beim Nutzer) |
| R8 | Datenverlust in der Ablage (Überschreiben, versehentliches Löschen) | A1 | 2×2 = 4 | Versionen in `_Versionen`, SHA-256 und Siegel je Eintrag, Original bleibt erhalten; Ordner überwachen verschiebt Originale nach `_erledigt` statt zu löschen | 1×2 = 2 | behandeln organisatorisch: Datensicherung der Ablage (M7, Abschnitt 6) |
| R9 | Missbrauch des Code-Signatur-Zugangs (Microsoft Artifact Signing) | A2, A3, A5 | 1×3 = 3 | Zugang an Microsoft-Konto mit MFA; Signierschlüssel nicht exportierbar (HSM beim Anbieter); `tools/signing` nicht im Repository | 1×3 = 3 | akzeptiert |
| R10 | SFTP-Zugangsdaten für pdfmy.de gelangen ins Repository | A2, A3 | 2×3 = 6 | `.deploy/` per `.gitignore` ausgeschlossen; vor jedem Commit Prüfung der Dateiliste | 1×3 = 3 | behandeln: Zugang auf Schlüssel statt Passwort umstellen, wenn der Hoster es anbietet (offen, M11) |
| R11 | Ausfall von pdfmy.de | A4 | 2×1 = 2 | Service Worker: App läuft nach dem ersten Aufruf offline weiter; installierbar (PWA) | 1×1 = 1 | akzeptiert |
| R12 | Gefälschte PDFMy-Seite oder -Erweiterung (Phishing, Nachbau) | A5 | 2×2 = 4 | Herkunftshinweis www.pdfmy.de, Lizenz nicht-kommerziell (PolyForm NC); Erweiterung bisher „entpackt“ | 2×2 = 4 | behandeln: Veröffentlichung in Chrome Web Store/Edge-Add-ons (M9) |
| R13 | Formularskripte in erzeugten PDFs werden missbraucht oder stören Archivierung | A1 | 1×2 = 2 | Skripte nur bei Feldern, die rechnen oder prüfen; nie in PDF/A; Hinweis im Designer (KONZEPT 4, Punkt 6) | 1×1 = 1 | akzeptiert |
| R14 | Verstoß gegen Datenschutzrecht durch unbemerkte Übermittlung (z. B. Schriftarten, Statistik) | A5 | 2×3 = 6 | Keine Cookies, kein Tracking, keine Fremdschriften; alle Dateien von pdfmy.de; Datenschutzerklärung aus dem Build erzeugt; Selbstprüfung im Dialog | 1×2 = 2 | akzeptiert |
| R15 | Fehlerhafte Ausgabe (PDF/A ungültig, E-Rechnung fehlerhaft, Text falsch erkannt) | A1, A5 | 2×2 = 4 | Test-Gate (Unit-Tests), veraPDF, KoSIT-Prüfung, Prüfung gegen Testdokumente vor jedem Release | 1×2 = 2 | akzeptiert |

## 5. Behandlungsplan (neue bzw. offene Maßnahmen)
| Nr. | Maßnahme | Bezug | Verantwortlich | Termin |
|---|---|---|---|---|
| M7 | Datensicherung der Ablage festlegen (Abschnitt 6) | R8 | GF / IT-Betreuung Haus iT | 31.12.2026 |
| M9 | Browser-Erweiterung in Chrome Web Store und Edge-Add-ons veröffentlichen | R12 | GF | offen |
| M10 | Prüfsummen (SHA-256) der ausgelieferten Dateien je Release in RELEASES.md veröffentlichen, damit Dritte die Auslieferung mit GitHub abgleichen können | R1 | Entwicklung | 31.12.2026 |
| M11 | SFTP-Zugang auf Schlüsselanmeldung umstellen (falls vom Hoster angeboten) | R10 | GF | 31.12.2026 |

## 6. Empfehlung Datensicherung der Ablage (M7, ISO 27001 A.8.13)
PDFMy speichert selbst nichts zentral. Gesichert werden muss deshalb die **Ablage des Kunden**, in die PDFMy schreibt:
1. **SharePoint/OneDrive (Microsoft 365):** Versionsverlauf eingeschaltet lassen (Standard: 500 Versionen); Papierkorb 93 Tage. Für steuerrelevante Unterlagen eine **Aufbewahrungsrichtlinie** (Microsoft Purview, 10 Jahre, „Element aufbewahren“) – sie verhindert endgültiges Löschen (zugleich M5, unveränderbarer Speicher).
2. **Netzlaufwerk/NAS:** tägliche Sicherung mit Versionierung (3-2-1-Regel: drei Kopien, zwei Medien, eine außer Haus), Schattenkopien bzw. Snapshots, Sicherung gegen Verschlüsselungstrojaner (unveränderliche Snapshots).
3. **Lokaler Ordner auf einem Einzelplatz:** nur mit regelmäßiger Sicherung auf ein externes Medium oder in die Cloud nach eigener Wahl.
4. **Rücksicherung testen:** mindestens einmal pro Jahr eine Datei und einen Ordner zurückholen und das GoBD-Siegel (SHA-256) prüfen.

## 7. Freigabe
| Rolle | Name | Datum | Unterschrift |
|---|---|---|---|
| Geschäftsführung (Risikoeigner) | Wolfgang-Udo Mertens | | |
