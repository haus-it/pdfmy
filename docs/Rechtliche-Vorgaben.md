# Rechtliche Vorgaben für PDFMy – geprüft am 15.11.2026

> Keine Rechtsberatung. Grundlage sind die genannten Primärquellen, die gelesen wurden. „Bewertung“ kennzeichnet eine eigene Einordnung. Offene Punkte stehen am Ende und sollten anwaltlich geklärt werden.

## Übersicht

| Vorgabe | Gilt für PDFMy? | Was wir tun | Quelle |
|---|---|---|---|
| **Cyberresilienz-Verordnung (CRA), VO (EU) 2024/2847** – Meldepflichten Art. 14 seit **11.09.2026**, übrige Pflichten ab **11.12.2027** | voraussichtlich ja für pdfmy Scan, Browser-Erweiterung und lokal laufende Add-ins (kostenlos, aber Geschäftstätigkeit: ErwG 15 „intention to monetise … other services“; FOSS-Ausnahme greift nicht, weil PolyForm Noncommercial nicht alle Rechte nach Art. 3 Nr. 48 gewährt – Bewertung). Die reine Web-App im Browser ist kein Produkt (Leitlinien C(2026) 5252, Rn. 21). | Meldeprozess `docs/Schwachstellenmanagement.md`; SBOM, Meldeweg (security.txt), kostenlose Sicherheitsupdates bereits vorhanden; automatische Updates als Voreinstellung mit Abschaltmöglichkeit für jeden Benutzer und Update-Meldung (Anhang I Teil I Nr. 2 Buchst. c, pdfmy Scan 1.18.1). **Offen:** Konto auf der ENISA-Meldeplattform (EU Login, Geschäftsführung); Supportzeitraum (≥ 5 Jahre, Art. 13 Abs. 8) bis 11.12.2027 festlegen; Konformitätsbewertung/CE bis 11.12.2027 | EUR-Lex CELEX 32024R2847 (ErwG 15, 18; Art. 3, 13, 14, 71); Leitlinien der Kommission C(2026) 5252 |
| **NIS2 / BSI-Gesetz** (NIS2UmsuCG, BGBl. 2025 I Nr. 301) | nicht direkt (unter 50 Beschäftigte und Umsatz-/Bilanzschwelle; reine Softwareherstellung nicht in Anlage 1/2). **Offen:** Zusammenrechnung mit verbundenen Unternehmen nach § 28 Abs. 4 BSIG (Mentor GmbH / Mertens GmbH) | Kunden unter dem BSIG müssen ihre Lieferkette prüfen (§ 30 Abs. 2 Nr. 4, 5 BSIG): Angaben dafür auf `sicherheit.html` | gesetze-im-internet.de/bsig_2025 §§ 28, 30 |
| **§ 25 TDDDG** (Speichern im Endgerät) | ja, für die Web-App | Zähler für den Werbehinweis und für den Empfehlungshinweis entfernt (app-v263), iOS-Hinweis ohne Speicherung; gespeichert wird nur, was der Nutzer selbst einstellt oder nutzt → kein Einwilligungsbanner nötig. **Offen:** automatische Update-Prüfung von pdfmy Scan (DSK Rn. 22) | gesetze-im-internet.de/ttdsg/__25.html; DSK OH Digitale Dienste 1.2 (Nov. 2024), Rn. 21, 22, 74, 78, 80, 86 |
| **Produkthaftung neu** (RL (EU) 2024/2853; ProdHaftG n. F., BGBl. 2026 I Nr. 321, in Kraft **09.12.2026**) | voraussichtlich ja, auch für die Web-App (Software inkl. SaaS, auch unentgeltlich; FOSS-Ausnahme greift nicht – Bewertung) | Updates sicherstellen (Art. 11 Abs. 2: fehlende Updates schließen die Entlastung aus); Nutzungsbedingungen § 7 Abs. 1 nennt die Haftung nach ProdHaftG. **Offen:** Versicherungsschutz prüfen | EUR-Lex CELEX 32024L2853 (Art. 2, 4, 11, ErwG 13); recht.bund.de BGBl. 2026 I Nr. 321 |
| **KI-Verordnung**, VO (EU) 2024/1689 i. d. F. VO (EU) 2026/1744 – Art. 50 seit 02.08.2026 (Altsysteme Art. 50 Abs. 2 bis 02.12.2026) | unklar, ob PDFMy „Anbieter“ ist (nutzt die KI des Browsers) | vorsorglich gekennzeichnet: Dialog, kopierte Zusammenfassung, übersetzte PDFs sichtbar und in den Dokumenteigenschaften (Betreff, Stichwörter „KI-generiert“). Art. 4 (KI-Kompetenz): Hinweise in Hilfe und Dialog | EUR-Lex CELEX 32024R1689, 32026R1744 |
| **BFSG** | eher nein (kein Verbrauchervertrag, § 1 Abs. 3, § 2 Nr. 26 BFSG – Bewertung) | freiwillige Erklärung zur Barrierefreiheit bleibt | gesetze-im-internet.de/bfsg |
| **BGG / BITV 2.0, § 121 GWB** | für Kunden (Bundesbehörden; Vergabe) | WCAG 2.1 AA / EN 301 549 (Selbstbewertung), PDF/UA | gesetze-im-internet.de/bgg/__12a.html; bitv_2_0; gwb/__121.html; vgv_2016/__31.html |
| **Kirchlicher Datenschutz** – KDG (katholisch, u. a. Caritas, § 3 Abs. 1 lit. b), DSG-EKD (evangelisch, Diakonie, § 2 Abs. 1) | für Kunden | lokale Verarbeitung, keine Auftragsverarbeitung | KDG (Bistum Trier, aktuelle Fassung); kirchenrecht-ekd.de/pdf/57226.pdf |
| **§ 203 StGB** | für Kunden (Krankenhäuser, Beratungsstellen) | keine Offenbarung, da lokal; bei Support mit Datenzugriff Verpflichtung nach § 203 Abs. 4 S. 2 Nr. 1 nötig | gesetze-im-internet.de/stgb/__203.html |
| **§ 391 SGB V** | für Kunden (Krankenhäuser) | Angaben für die Risikoanalyse auf `sicherheit.html` | gesetze-im-internet.de/sgb_5/__391.html |
| **§ 5 DDG** (Impressum) | ja | vollständig (Name, Anschrift, Vertretung, E-Mail, Register, USt-IdNr.) | gesetze-im-internet.de/ddg/__5.html |
| **eIDAS** Art. 25 | Signaturfunktion | nur qualifizierte Signaturen stehen der Unterschrift gleich – nie anders bewerben | EUR-Lex CELEX 32014R0910 |
| **security.txt** (RFC 9116) | Empfehlung | umgesetzt, Expires < 1 Jahr, text/plain; charset=utf-8 | rfc-editor.org/rfc/rfc9116 |
| **SBOM** (CycloneDX 1.5) | ab 11.12.2027 Pflicht (CRA Anhang I Teil II Nr. 1) | umgesetzt, gegen das offizielle Schema geprüft | cyclonedx.org, Schema bom-1.5 |

## Offene Punkte (anwaltlich bzw. durch die Geschäftsführung zu klären)

1. **CRA:** Konto auf der ENISA-Meldeplattform (https://portal.cra-srp.enisa.europa.eu/, EU Login) anlegen; koordinierendes CSIRT in Deutschland bestätigen (vermutlich BSI – nicht verifiziert).
2. **CRA:** Supportzeitraum festlegen (mindestens 5 Jahre, Enddatum angeben) – bis 11.12.2027 (GF 15.11.2026: später entscheiden).
3. **CRA:** Gelten Office-, Outlook- und Teams-Add-ins (vom Server geladen) als Produkt?
4. **NIS2:** Zusammenrechnung mit verbundenen Unternehmen (§ 28 Abs. 4 BSIG); erbringt eine Gesellschaft der Gruppe Managed Services (Anlage 1 Nr. 6.1.10)?
5. **TDDDG:** Ist die automatische Update-Prüfung von pdfmy Scan ein ausdrücklich gewünschter Teil des Dienstes (DSK Rn. 22)?
6. **KI-Verordnung:** Rolle (Anbieter/Betreiber) bei Nutzung der Browser-KI.
7. **Produkthaftung:** Versicherungsschutz ab 09.12.2026.
8. **Lizenz:** PolyForm Noncommercial verhindert die FOSS-Ausnahmen in CRA und Produkthaftung. Entscheidung GF 15.11.2026: Nutzungsbedingungen bleiben unverändert (keine ausdrückliche Freigabe der kommerziellen Nutzung). Ausnahme: Nextcloud-App unter AGPL-3.0-or-later.
9. **Nutzungsbedingungen:** anwaltliche Prüfung steht weiter aus (docs/Nutzungsbedingungen.md).
