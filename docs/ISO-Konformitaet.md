# ISO-Konformität PDFMy

**Stand:** 15.10.2026 · **Version:** PDFMy (Web) app-v31 / pdfmy Scan 1.4.4 · **Verantwortlich:** Mentor GmbH (Geschäftsführer Wolfgang-Udo Mertens)
**Geltungsbereich:** Web-Anwendung PDFMy (https://pdfmy.de und https://pdfmy.de/mentor/), Windows-Programm „pdfmy Scan“, Browser-Erweiterung „PDFMy – PDFs direkt öffnen“ (Chrome/Edge, `tools/pdfmy-extension`), Build- und Veröffentlichungsprozess.

> **Einordnung:** ISO 27001 und ISO 9001 sind Normen für Managementsysteme. Zertifiziert wird die **Organisation**, nicht eine Software. Dieses Dokument weist nach, wie PDFMy die softwarebezogenen Anforderungen dieser Normen unterstützt. Es dient als Baustein für ein ISMS bzw. QMS und als Grundlage für Audits. Für die Produktnormen (PDF/A, PDF) gibt es überprüfbare Prüfergebnisse (Abschnitt 4).

## 1. Übersicht der relevanten Normen

| Norm | Thema | Status | Nachweis |
|---|---|---|---|
| ISO 19005-2 (PDF/A-2b) | Langzeitarchivierung | ✅ erfüllt | veraPDF 1.30: PASS (Abschnitt 4) |
| ISO 32000-1 (PDF 1.7) | PDF-Format | ✅ erfüllt | qpdf-Strukturprüfung ohne Fehler (Abschnitt 4) |
| ISO 32000-2 §7.6 | Verschlüsselung | ✅ AES-256 (Standard Security Handler V5/R6, AESV3, Hash-Algorithmus 2.B) – seit 18.10.2026 | pdf.js öffnet mit Benutzerpasswort, lehnt falsches ab; Unit-Tests `tests/pdfcrypt.test.js` |
| ISO 14289-1 (PDF/UA-1) | Barrierefreie PDFs | ✅ erfüllt für alle PDF/A-Ausgaben | veraPDF ua1: PASS (Abschnitt 4) |
| ISO/IEC 27001:2022 Anhang A | Informationssicherheit | ✅ umgesetzt, Rest siehe Maßnahmen | Abschnitt 2 |
| ISO 9001:2015 | Qualitätsmanagement | ✅ umgesetzt, Rest siehe Maßnahmen | Abschnitt 3 |
| ISO 8601 | Datumsformat | ✅ Dateinamen, Protokolle, Posteingangsbuch (JJJJ-MM-TT) | Tests `letter.test.js`, `journal.test.js` |
| ISO 13616 | IBAN-Prüfziffer | ✅ | Test „IBAN-Prüfsumme“ |
| ISO 4217 | Währungscodes | ✅ (EUR, CHF, GBP, USD) | Belegliste, GiroCode |
| ISO/IEC 18004 + EPC069-12 | QR-Code / GiroCode | ✅ | Test „GiroCode“ |
| EN 16931 (CEN) / XRechnung, ZUGFeRD | E-Rechnung | ✅ Lesen (Original wird unverändert archiviert) und Erstellen (ZUGFeRD-PDF, XRechnung 3.0 CII) | Tests `einvoice.test.js`, `einvoice-out.test.js`; KoSIT-Validator (Abschnitt 4) |
| ISO 19005-3 (PDF/A-3b) | E-Rechnung mit eingebetteter XML (ZUGFeRD/Factur-X) | ✅ erfüllt | veraPDF 3b: PASS (Abschnitt 4) |
| ISO 15489 / GoBD | Schriftgutverwaltung, Unveränderbarkeit | ✅ teilweise (SHA-256, Originalerhalt, Protokoll); kein WORM-Speicher | Abschnitt 2 (A.8.32), Maßnahme M5 |
| ISO 9241-110 / EN 301 549 (WCAG 2.1 AA) | Bedienbarkeit, Barrierefreiheit Web | ✅ weitgehend erfüllt | axe-core 4.10: 0 Verstöße in 11 Ansichten (Hell, Dunkel, Handy), manuelle Tastaturprüfung; Erklärung zur Barrierefreiheit (pdfmy.de/barrierefreiheit.html) |

**Hinweis zur Verschlüsselung:** Die verwendete Bibliothek bietet AES-256 nur in der veralteten Adobe-Revision 5 an (Passwort nur einmal mit SHA-256 gehasht). PDFMy nutzt deren Dateiverschlüsselung (AESV3, zufälliger 256-Bit-Dateischlüssel), berechnet die Passwort-Einträge U/UE/O/OE aber selbst nach ISO 32000-2 Revision 6 (iterierter Hash 2.B mit SHA-256/384/512, WebCrypto, `js/pdfcrypt.js`). Kennzeichnung als PDF 1.7 mit Adobe-Erweiterungsstufe 8 – lesbar in Acrobat/Reader ab X, pdf.js, Chrome, Edge, Firefox, macOS-Vorschau.

## 2. ISO/IEC 27001:2022 – umgesetzte Kontrollen (Anhang A)

| Kontrolle | Umsetzung in PDFMy |
|---|---|
| A.5.12/5.13 Klassifizierung, Kennzeichnung | Dokumente verlassen das Gerät nicht. OCR, Analyse und PDF-Erzeugung laufen im Browser. Auch die KI-Funktionen (Texterkennung, Briefanalyse, Vorlesen) laufen lokal. |
| A.5.14 Informationsübertragung | Kein Upload. Weitergabe nur bewusst durch Nutzer (Teilen, E-Mail). Fehlerberichte zeigen vor dem Versand den vollständigen Inhalt; Dateinamen, Absender, E-Mail-Adressen und Windows-Benutzernamen sind standardmäßig unkenntlich (Art. 25 Abs. 2 DSGVO, seit 16.10.2026). Externe Links ohne Referrer (`noreferrer` und Referrer-Policy). |
| A.5.15, A.8.2, A.8.5 Zugang, Authentisierung | Keine Benutzerkonten in PDFMy. SFTP-Konto auf den Webordner beschränkt. Zugangsdaten DPAPI-verschlüsselt, nur für das Windows-Konto lesbar. |
| A.5.21 Lieferkette (IKT) | Alle Bibliotheken in festen Versionen lokal eingebunden (keine CDNs, keine Fremd-Server). Lizenzen in `vendor/licenses`. Liste in Abschnitt 5. |
| A.5.23 Cloud-Dienste | IONOS-Webhosting liefert nur statische Dateien aus. Auftragsverarbeitung nach Art. 28 DSGVO. |
| A.5.33/A.5.34 Datenschutz, PII | Datenschutzerklärung (DSGVO-Prüfung 16.10.2026: vollständige Liste der lokal gespeicherten Daten, Gerätefunktionen, pdfmy Scan, Fehlerberichte, Anzeige, zuständige Aufsichtsbehörde LDI NRW). Lokale Verarbeitung. Vorlesen nur mit Offline-Stimmen des Geräts (`localService`), Online-Stimmen wie „Google Deutsch“ werden nicht genutzt, damit kein Brieftext an Dritte geht. Löschfunktion „Alle lokal gespeicherten Daten löschen“ (Einstellungen). |
| A.5.34, A.8.9 Datenminimierung Browser-Erweiterung | Erweiterung „PDFMy – PDFs direkt öffnen“ (1.0.0): feste Rechte nur `activeTab`, `contextMenus`, `storage`, `webRequest` (nur beobachtend) und `https://pdfmy.de/*`. Zugriff auf andere Websites ist **optional** und wird erst beim Einschalten von „automatisch öffnen“ vom Nutzer erteilt, beim Ausschalten wieder entzogen. Keine Rechte für Tabs, Verlauf, Downloads, Cookies. Keine Telemetrie, kein Fernzugriff. Gespeichert: 2 Einstellungen; Einmal-Token und zuletzt übergebene Adresse nur im Sitzungsspeicher (≤ 10 min). Begründung je Recht: `tools/pdfmy-extension/README.md`. |
| A.5.14, A.8.12 Übergabe Erweiterung → PDFMy | Die PDF wird im Browser geladen und per `postMessage` (Transfer, ohne Kopie auf Server) an PDFMy übergeben. PDFMy nimmt nur Nachrichten aus dem eigenen Fenster und der eigenen Herkunft an; das Token (UUID) gilt einmal und wird sofort aus der Adresse entfernt. Signaturprüfung `%PDF-`, Größenlimit 300 MB, Dateinamen werden bereinigt. Downloads (`attachment`) und POST-Antworten werden nicht umgeleitet. CSP der Erweiterung `script-src 'self'`. |
| A.8.13/A.5.30 Sicherung, Verfügbarkeit (Absturzschutz) | Ungespeicherte Dokumente werden lokal im Browser (IndexedDB) gesichert und nach Absturz/versehentlichem Schließen zur Wiederherstellung angeboten. Datenminimierung: nur solange ungespeichert, max. 5 Sicherungen, Löschung beim Speichern/Schließen, per „Verwerfen“ oder nach 7 Tagen; in der Datenschutzerklärung aufgeführt, von „Alle lokal gespeicherten Daten löschen“ erfasst. Keine Übertragung an Server. |
| A.8.20/A.8.26 pdfmy Scan für Linux (1.1.0) | Einrichtung ohne Administratorrechte nur im Benutzerkonto (systemd-Benutzerdienst, ~/.local/share, ~/.config). Dienst nur auf 127.0.0.1, Herkunftsprüfung und Pflicht-Header wie unter Windows/Mac; Dateiübergabe per Einmal-Kennwort (5 min). Installer ist ein lesbares Shell-Skript, SHA-256 auf pdfmy.de/scanner.html. Keine Herstellertreiber mitgeliefert (Lizenzen); SANE nur, wenn vom Nutzer installiert. IPv6-Unterstützung ohne Öffnen eingehender Ports. |
| A.8.24/A.5.14 Signaturprüfung | Prüfung digitaler PDF-Signaturen lokal (WebCrypto, keine Übertragung): Integrität (messageDigest), Signatur (RSA/ECDSA), Zertifikatsgültigkeit zum Zeitpunkt, angehängte Änderungen. Keine Aussage zur Vertrauenswürdigkeit des Ausstellers (keine Vertrauensliste) – im Dialog ausdrücklich so benannt. Automatisierte Tests mit eigenen und fremd (OpenSSL) erzeugten Signaturen: tests/pdfverify.test.js. |
| A.8.7 Schutz vor Schadsoftware | Content-Security-Policy, keine Fremd-Skripte. pdf.js mit `isEvalSupported: false` (schließt CVE-2024-4367). Formularfeldnamen aus fremden PDFs werden bereinigt. |
| A.8.20/A.8.26 PDF per Doppelklick (pdfmy Scan 1.5.0) | Zuordnung nur für den angemeldeten Benutzer (HKCU, keine Adminrechte). Übergabe der Datei an PDFMy nur über 127.0.0.1. Dafür gibt es ein zufälliges Einmal-Kennwort (128 Bit, 5 Minuten gültig, im #-Teil der Adresse, wird also nie an den Server gesendet). Abruf nur von freigegebenen PDFMy-Adressen mit eigenem Header. Die Datei verlässt den Rechner nicht. Windows lässt Programme die Standard-App nicht selbst setzen; die Festlegung trifft der Nutzer in den Windows-Einstellungen. |
| A.8.24 Kryptografie – digitale Signatur | Signatur mit eigenem Zertifikat (.p12/.pfx) lokal im Browser: CMS/PKCS#7 detached, SHA-256, RSA, ganze Datei abgedeckt (ByteRange). Das Passwort wird nicht gespeichert; im Gerät (IndexedDB) liegt auf Wunsch nur die verschlüsselte Zertifikatsdatei, der entschlüsselte Schlüssel nur im Arbeitsspeicher der Sitzung. Abgelaufene Zertifikate werden abgelehnt. Prüfnachweis: pyHanko (intakt, gültig, ENTIRE_FILE), veraPDF PDF/A-2b und PDF/UA-1 PASS. Hinweis: Eine qualifizierte elektronische Signatur (QES, eIDAS) braucht eine Signaturkarte bzw. einen Fernsignaturdienst; PDFMy erzeugt fortgeschrittene Signaturen. |
| A.8.8 Technische Schwachstellen | Bibliotheksstände dokumentiert (Abschnitt 5) und auf bekannte CVEs geprüft (`npm audit` gegen die GitHub Advisory Database, zuletzt 15.10.2026: keine offenen Lücken in ausgelieferten Bibliotheken). Prüfung vierteljährlich (Maßnahme M4). |
| A.8.9 Konfiguration | Server-Konfiguration wird bei jedem Build erzeugt: HSTS, CSP, X-Frame-Options DENY, nosniff, Referrer-Policy no-referrer, Permissions-Policy, COOP. Interne Dateien gesperrt. |
| A.8.10 Löschung | Lokale Daten (Einstellungen, Posteingangsbuch-Kopie, Volltext-Index, Regeln, Team, eigene Anschrift, Briefbogen, E-Rechnungs-Firmendaten, Vorlagen für Unterschriftsanfragen, Unterschrift, Signatur-Zertifikat, Ordnerfreigaben) mit einem Klick löschbar (localStorage `mpdf.*`, IndexedDB `mpdf`, sessionStorage). |
| A.8.12 Verhinderung von Datenabfluss | Echtes Schwärzen entfernt auch die Textebene. Schwärzen-Vorschläge für IBAN, E-Mail, Telefon, Steuer-ID, Geburtsdatum, SV-Nummer. |
| A.8.15/A.8.16 Protokollierung, Überwachung | pdfmy Scan protokolliert Suche, Scans, Installation und Updates. Fehlerbericht „Problem melden“ an den Support (wumertens@mentor-group.de). |
| A.8.20/A.8.21 Netzwerksicherheit | Lokaler Dienst nur auf 127.0.0.1, Herkunftsprüfung (Origin-Liste) und Pflicht-Header. Kein Zugriff aus dem Netz. Gilt gleich für pdfmy Scan für Mac (1.0.0, `tools/pdfmy-scan-mac`): fremde Herkunft und Anfragen ohne Header → 403 (getestet), `/open-local` nur ohne Origin, Datei-Übergabe per Einmal-Kennwort (128 Bit, 5 Minuten). Keine Fremdbibliotheken: nur Perl-Kernmodule und macOS-Bordmittel. Scanner wecken (Windows 1.8.6, Mac/Linux 1.1.6): nur ausgehende Verbindungsversuche bzw. Wake-on-LAN an bereits bekannte Geräte im eigenen privaten Netz; `/maildraft` (1.8.8) legt nur einen übergebenen E-Mail-Entwurf (.eml) im eigenen Ordner ab und öffnet ihn mit dem Standard-Mailprogramm; `/attachment` (1.8.7/1.1.7) reicht nur frisch (≤ 30 Min.) abgelegte PDF/Bild-Dateien mit genau dem angefragten Namen aus festen Anhang-Ordnern (Outlook, Apple Mail, Thunderbird, Temp) an PDFMy weiter – Herkunftsprüfung und Pflicht-Header wie alle Endpunkte, keine Pfadangaben von außen; `/wake` mit derselben Herkunftsprüfung; Netzsuche nur in privaten Adressbereichen (10/8, 172.16/12, 192.168/16). |
| A.8.24 Kryptografie | TLS mit HSTS, AES-256 (ISO 32000-2 R6) für PDF-Passwortschutz, SHA-256 für Ablage-Prüfsummen und Update-Integrität, bcrypt für Passwörter. |
| A.8.25–A.8.29 Sichere Entwicklung, Tests | Automatisierte Tests (39 Fälle). Veröffentlichung nur bei bestandenen Tests (Test-Gate in `tools/deploy.ps1`). PDF/A-Prüfung mit veraPDF. |
| A.8.24 Kryptografie, A.5.33 Schutz von Aufzeichnungen | Unterschriftsanfragen: Unterschriften werden inkrementell angehängt (ISO 32000-2, 7.5.6); jede Person hält die SHA-256-Prüfsumme der empfangenen Fassung fest, „Übersicht“ weist nach, dass jede Fassung unverändert in der Datei enthalten ist (js/pdfinc.js, Tests tests/pdfinc.test.js; unabhängig geprüft mit qpdf/pikepdf und pypdf). |
| A.5.32 Geistiges Eigentum, A.8.4 Zugriff auf Quellcode | Quellcode öffentlich auf GitHub (haus-it/pdfmy, seit 20.10.2026) unter AGPL-3.0-or-later mit Copyright-Kopf und SPDX-Kennung in jeder eigenen Datei; Fremdbibliotheken mit eigenen Lizenzen (vendor/licenses). Zugangsdaten, Signier-Einrichtung und Build-Ausgaben per .gitignore ausgeschlossen und vor der Veröffentlichung geprüft; Schreibrechte nur beim Konto haus-it, Beiträge über Pull Requests. |
| A.8.32 Änderungsmanagement | Versionsnummern (pdfmy Scan nach SemVer, Web mit Build-Zeitstempel). Release-Protokoll `docs/RELEASES.md` (Datum, Versionen, Tests, SHA-256, Bearbeiter). Changelog `CHANGELOG.md`. Updates von pdfmy Scan werden vor dem Start per SHA-256 geprüft. |

## 3. ISO 9001:2015 – Qualitätsnachweise

| Abschnitt | Umsetzung |
|---|---|
| 7.5 Dokumentierte Information | README (Bedienung, IT), Hilfe in der App, KONZEPT.md, dieses Dokument, CHANGELOG.md, docs/RELEASES.md |
| 8.3 Entwicklung | Anforderungen aus Nutzerrückmeldungen und Wettbewerbsanalyse. Umsetzung in kleinen, geprüften Schritten. |
| 8.3.4 Verifizierung | Automatisierte Tests: Briefanalyse, IBAN, E-Rechnung, Posteingangsbuch, Kamera-Logik, Export. Browser-Erweiterung: Headless-Test in echtem Chrome (`tools/pdfmy-extension/test/e2e.js`, 15 Fälle, am 15.10.2026 bestanden: Klick auf PDF-Link → PDFMy, Kontextmenü, Downloads unverändert, fremde Nachrichten abgewiesen, Schalter aus). Browser-Tests auf Desktop, Android-Emulation und WebKit (Safari-Engine). veraPDF/qpdf für PDF-Ausgaben. |
| 8.3.4 Validierung | Praxistests beim Anwender, z. B. Brother MFC-L2730DW (Einzug, Glas) und Epson DS-730N (beidseitig, bestätigt am 15.10.2026). |
| 8.5.6 / 8.3.6 Änderungen | Freigabe nur mit bestandenen Tests. Jede Veröffentlichung im Release-Protokoll. Nutzer sehen die installierten Versionen (Statuszeile, Taskleiste, „Installierte Apps“). |
| 8.7 / 10.2 Nichtkonformitäten, Korrekturmaßnahmen | „Problem melden“ mit Protokoll. Ursachenanalyse anhand des Protokolls, z. B. Epson-Duplex: WIA lehnt Duplex ab → TWAIN-Anbindung (1.4.0). Korrektur wird beim Anwender verifiziert. |
| 7.5 / 8.2 Sprachen der Oberfläche | 40 Oberflächensprachen, maschinell übersetzt; maßgeblich ist die deutsche Fassung (Hinweis in der Hilfe). Wörterbücher `i18n/*.json` werden mit `tools/i18n-check.js` geprüft (Platzhalter, HTML-Struktur, Vollständigkeit) und im Test-Gate (`tests/i18n.test.js`) mitgeprüft. Rechtstexte (Impressum, Datenschutz, Nutzungsbedingungen) bleiben deutsch. Seit 18.10.2026 auch Hilfe und Scanner-Anleitung (`i18n/site/*.json`, gleiche Prüfungen, `tests/i18n.test.js` prüft zusätzlich: Rechtstexte ohne Sprachwahl, keine Erwähnung von /mentor) sowie Tab-Titel/Meta-Beschreibung (`i18n/_web.json`). Datum und Zahlen der Oberfläche im Format der gewählten Sprache (BCP 47); Datumswerte in Dokumenten und Dateinamen bleiben unverändert (Nachweis: Unit-Test „Datum und Zahlen“). |
| 8.2.2 Anforderungen (Justiz) | beA-Prüfung nach ERVB 2025 (BAnz AT 29.07.2025 B2) zu § 5 ERVV in `js/bea.js`, Unit-Tests `tests/bea.test.js`. Bei einer neuen Bekanntmachung (jährlich prüfen, justiz.de) Regeln und Tests anpassen. |
| 9.1.2 Kundenzufriedenheit | Rückmeldungen über „Problem melden“ und direkten Kontakt. |

## 4. Prüfnachweis PDF-Normen (15.10.2026)

Prüfwerkzeuge: **veraPDF 1.30.3** (PDF/A, PDF/UA) und **qpdf 11 über pikepdf 9.4.2** (ISO-32000-Strukturprüfung).

**Barrierefreiheit (PDF/UA-1):** Jede PDF/A-Ausgabe hat einen Strukturbaum (Document → Absätze in Lesereihenfolge). Der erkannte Text ist zeilenweise als Absatz (P) mit echten Wortabständen getaggt, Unterschriften sind Figuren mit Alternativtext, und Notizen, Stempel und eingefügter Text sind Absätze. Das Scanbild, Markierungen, Stiftstriche, Seitenzahlen, Kopf-/Fußzeilen, Bates-Nummern und Wasserzeichen sind als Artefakt gekennzeichnet. Sprache (de-DE), Dokumenttitel (DisplayDocTitle), MarkInfo und die XMP-Kennung pdfuaid:part=1 mit PDF/A-Erweiterungsschema sind gesetzt. Ausgaben im Format „PDF“ (Originalseiten als Vektor) bleiben ungetaggt, weil ihr fremder Inhalt nicht zuverlässig nachträglich strukturiert werden kann. Für barrierefreie Dokumente deshalb PDF/A wählen (Standard bei Scans).

| Testdatei | Inhalt | PDF/A-2b | ISO 32000 | PDF/UA-1 |
|---|---|---|---|---|
| 1-pdfa-scan-kompakt | Scan, Kompaktmodus (MRC), OCR-Textebene | PASS | OK | PASS |
| 2-pdfa-pro-funktionen | Notiz, Markierung, Schwärzung, Stempel, Text, Stift, Kopf-/Fußzeile, Bates, Wasserzeichen, Seitenzahlen, Lesezeichen, 2 Seiten | PASS | OK | PASS |
| 6-pdfa-unterschrift | Scan mit Unterschrift (Figur mit Alternativtext) | PASS | – | PASS |
| 3-pdf-standard | wie 2, ohne PDF/A | – | OK | – |
| 4-pdf-klein | Größe „Klein“ | – | OK | – |
| 5-pdf-passwort | AES-256-Verschlüsselung (seit 18.10.2026, vorher AES-128) | – | OK (R6) | – |

**E-Rechnung (16.10.2026):** Ausgangsrechnungen wurden mit dem offiziellen **KoSIT-Validator 1.6.3** und der Konfiguration **XRechnung 3.0.2 (2026-08-31)** geprüft: XRechnung (Szenario „EN16931 XRechnung (CII)“), eingebettete factur-x.xml des ZUGFeRD-PDFs (Szenario „EN16931 (CII)“) sowie eine Kleinunternehmer-Rechnung (§ 19 UStG, ohne USt-IdNr.) – jeweils **ACCEPTABLE, 0 Fehler, 0 Warnungen**. Das ZUGFeRD-PDF besteht **veraPDF PDF/A-3b** (eingebettete Datei mit AFRelationship /Alternative, Factur-X-XMP-Erweiterungsschema). Normale PDF/A-Ausgaben bestehen nach der Erweiterung von `makePdfA` weiterhin PDF/A-2b und PDF/UA-1.

Wiederholung der Prüfung: bei jeder Änderung an der PDF-Erzeugung (`buildPdf`, `makePdfA`, `buildInvoicePdf`) bzw. am E-Rechnungs-Generator (`js/einvoice-out.js`) und mindestens vierteljährlich.

Nachtrag 16.10.2026: PDF/A-Ausgabe mit übernommener, mehrstufiger Lesezeichen-Gliederung (Inhalt) mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS.

Nachtrag 16.10.2026: PDF/A-Ausgabe einer reparierten, abgeschnittenen PDF mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS.

Nachtrag 18.10.2026: Signatur über Windows-Zertifikat/Signaturkarte (pdfmy Scan 1.8.0) ebenfalls nach PAdES-Baseline B-B (ETSI EN 319 142-1, ETSI.CAdES.detached, signing-certificate-v2 nach RFC 5035, ohne signing-time) – CMS mit Windows-Testzertifikat erzeugt, Gegenprüfung OpenSSL cms -verify gültig, Attribut und Zertifikats-Hash geprüft. Ältere pdfmy-Scan-Versionen signieren weiter im ISO-32000-Format adbe.pkcs7.detached.

Nachtrag 18.10.2026 (Hilfe/Scanner mehrsprachig): Hilfe und Scanner-Anleitung in 40 Sprachen (39 Wörterbücher `i18n/site/*.json` à 346 Texte, `i18n-check --site`: 0 fehlen, 0 Fehler), Tab-Titel/Meta-Beschreibung/Fußzeile übersetzbar (`i18n/_web.json`, App-Wörterbücher 1.848 Texte, 0 fehlen). Browserprüfung aller 39 Sprachen: keine deutschen Sätze auf Hilfe/Scanner; Rechtstexte ohne Sprachwahl. axe-core 4.10: 0 Verstöße in 72 Ansichten (Hilfe, Hilfesuche, Scanner, Startseite × hell/dunkel/Handy × de, en-GB, ru, el, fr, ga). Unit-Tests 103/103 (1 übersprungen). Datum/Zahlen der Oberfläche nach BCP 47; PDF-Erzeugung unverändert (keine erneute veraPDF-Prüfung nötig).

Nachtrag 18.10.2026: Mehrfachsignatur per inkrementellem Update (ISO 32000, 7.5.6) – zweifach signiertes PDF/A mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS; jede Signatur mit OpenSSL cms -verify gültig.

Nachtrag 17.10.2026: Digitale Signatur nach PAdES-Baseline B-B (ETSI EN 319 142-1, ETSI.CAdES.detached, signing-certificate-v2) – Gegenprüfung OpenSSL cms -verify gültig; signiertes PDF/A mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS.

Nachtrag 17.10.2026: Suchen & Ersetzen (gleiche Technik wie „Text ändern“, mit Fälschungsschutz) – Ausgabe mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS.

Nachtrag 17.10.2026: „Text ändern“ für Absätze (Umbruch, Zeilenabstand, Laufweite per Tz-Operator) – Ausgabe mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS.

Nachtrag 17.10.2026: Fälschungsschutz (Urkunden/Bescheide gesperrt, Kontoauszüge und Nachweise mit erzwungener roter Markierung und Vermerk, Stichwort „nachträglich geändert (PDFMy)“) – Ausgabe mit veraPDF geprüft: PDF/A-2b PASS, PDF/UA-1 PASS. Bedrohungsanalyse, rechtlicher Rahmen und Maßnahmenplan F1–F5: docs/Faelschungsschutz.md.

Nachtrag 17.10.2026: Fälschungsschutz F3 – Warnung vor der ersten Textänderung, Abdeckung oder Texteinfügung in digital signierten PDFs (Signatur wird ungültig); reine Bedienoberfläche, PDF-Erzeugung unverändert (keine erneute veraPDF-Prüfung nötig). Browsertest mit signiertem Test-PDF, axe-core hell/dunkel/mobil 0 Verstöße.

Nachtrag 17.10.2026: „Text ändern“ mit originalgetreuen Schriften (DejaVu Sans/Serif/Mono, fett, kursiv; je als Teilmenge eingebettet), farbiger Abdeckung und Schriftfarbe: PDF/A-2b PASS, PDF/UA-1 PASS (veraPDF).

## 5. Eingesetzte Bibliotheken (Stand, Lizenz, Sicherheit)

| Bibliothek | Version | Lizenz | Sicherheitshinweis |
|---|---|---|---|
| pdf-lib | 1.17.1 | MIT | keine bekannten CVEs |
| @pdf-lib/fontkit | 1.1.1 | MIT | – |
| @cantoo/pdf-lib (nur Verschlüsselung) | 2.4.2 | MIT | – |
| pdf.js (pdfjs-dist, „legacy“-Build, ES-Modul) | 6.4.299 | Apache-2.0 | aktuell; CVE-2024-4367 (betraf ≤ 4.1.392) durch Update behoben. Bilddecoder (OpenJPEG, JBIG2, QCMS) als WebAssembly lokal; JavaScript in PDFs wird nicht ausgeführt (kein Scripting-Modul eingebunden) |
| tesseract.js / -core | 5.1.1 | Apache-2.0 | – |
| Tesseract-Sprachdaten (40 Sprachen: alle europäischen Amtssprachen und weitere inkl. Türkisch, Russisch, Ukrainisch, Belarussisch, Serbisch kyrillisch/lateinisch; 4.0.0_best_int über @tesseract.js-data, gzip-Prüfung beim Einspielen am 18.10.2026) | 4.0.0 | Apache-2.0 | lokal, Laden bei Bedarf |
| qrcode-generator | 1.4.4 | MIT | – |
| jsQR (QR-Codes lesen) | 1.4.0 | Apache-2.0 | lokal, keine Netzwerkzugriffe |
| node-forge (Signatur, Zertifikate) | 1.4.0 | BSD-3-Clause | aktuelle Version; wird nur beim Signieren geladen |
| Lucide (Symbole) | 0.460.0 | ISC | – |
| DejaVu Sans, Sans fett/kursiv, Serif (4 Schnitte), Sans Mono; Archivo, Source Sans 3 | DejaVu 2.37 | frei (Bitstream Vera/DejaVu) / OFL | – |

## 6. Maßnahmenplan (offene Punkte)

| Nr. | Maßnahme | Norm | Priorität |
|---|---|---|---|
| M1 | ~~Getaggte PDFs → PDF/UA-1~~ **erledigt am 15.10.2026** (veraPDF PASS). Optional später: Überschriften- und Tabellenerkennung für reichere Struktur, PDF/A-2a | ISO 14289-1, ISO 19005-2 (Level a) | erledigt |
| M2 | ~~Code-Signing für pdfmy Scan (Windows)~~ **erledigt am 18.10.2026**: Authenticode-Signatur über Microsoft Artifact Signing (Konto `hausit-signatur`, Profil `mentor-public-trust`, Public Trust, Identität Mentor GmbH validiert bis 20.01.2029), SHA-256 mit Zeitstempel (timestamp.acs.microsoft.com), Signieren per `tools\sign.ps1` vor jedem Build. SmartScreen-Prüfung bei Microsoft eingereicht am 18.10.2026 (Submission-ID c6f3a69f-c73c-4f9a-9a2e-fea733e45302); gleicher Programmstand behält dieselbe signierte Datei (Reputation bleibt). Offen: Apple-Notarisierung für pdfmy Scan Mac | ISO 27001 A.5.21, A.8.32 | erledigt (Windows) |
| M3 | ~~Barrierefreiheits-Prüfung der Web-Oberfläche~~ **erledigt am 15.10.2026**: axe-core ohne Befund, Tastaturbedienung vollständig, Erklärung veröffentlicht. Optional: Prüfung mit Screenreader (NVDA, VoiceOver) durch Betroffene bzw. externes Audit | ISO 9241-171, EN 301 549 | erledigt |
| M4 | ~~Update pdf.js~~ **erledigt am 15.10.2026** (6.4.299, Prüfung mit `npm audit`; Hinweis zu `tar` betrifft nur das Node-Entwicklungspaket von pdf.js, nicht die ausgelieferte App). Weiterhin: vierteljährliche CVE-Prüfung, nächste bis 15.01.2027 | ISO 27001 A.8.8 | laufend |
| M5 | Verfahrensdokumentation nach GoBD: **technischer Teil umgesetzt am 18.10.2026** – SHA-256 je Datei, Siegel je Eintrag, Versionen in `_Versionen`, GoBD-Prüfprotokoll mit Verfahrensbeschreibung. Offen (organisatorisch): unveränderbarer Speicher (z. B. M365-Aufbewahrungsrichtlinie/WORM), Zugriffsrechte, Freigabe der Verfahrensdokumentation durch die Geschäftsführung | ISO 15489, GoBD | mittel |
| M6 | ~~PDF-Verschlüsselung AES-256 nach ISO 32000-2 (R6)~~ **erledigt am 18.10.2026** | ISO 32000-2 | erledigt |
| M7 | Datensicherung der Ablage (SharePoint/OneDrive-Versionierung) im ISMS festlegen | ISO 27001 A.8.13 | organisatorisch |
| M8 | Formale Risikobeurteilung für PDFMy im ISMS | ISO 27001 Kap. 6.1 | organisatorisch |
| M9 | Browser-Erweiterung im Chrome Web Store und bei Edge-Add-ons veröffentlichen (geprüfte Herkunft, automatische Updates; ersetzt „Entpackte Erweiterung laden“). Für verwaltete PCs optional Verteilung per Gruppenrichtlinie `ExtensionInstallForcelist` | ISO 27001 A.5.21, A.8.19, A.8.32 | hoch |
