# mentor PDF – Konzept & Wettbewerbsvergleich

**Ziel:** Eingehende Briefe einscannen, als durchsuchbares PDF ablegen und bei Bedarf bearbeiten.
Das Tool soll schnell, kostenlos und DSGVO-konform sein: Keine Datei verlässt den Rechner.

## 1. Was der Markt kann (Stand 2026, qualitativ)

| Funktion | Adobe Acrobat Pro | Foxit PDF Editor | ABBYY FineReader PDF | PDF-XChange Editor | NAPS2 (Open Source) | Smallpdf / iLovePDF (Cloud) | **mentor PDF** |
|---|---|---|---|---|---|---|---|
| Scannen direkt vom Gerät (TWAIN/WIA) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ über `scan.ps1` (WIA) + Scan-Ordner |
| Scan-Optimierung (Kontrast, S/W) | ✅ | ✅ | ✅✅ | ✅ | ✅ | teilweise | ✅ |
| OCR → durchsuchbares PDF | ✅ | ✅ | ✅✅ (Referenz) | ✅ | ✅ | ✅ (Upload!) | ✅ (Tesseract, lokal) |
| Text im PDF frei editieren | ✅✅ | ✅✅ | ✅ | ✅ | ❌ | eingeschränkt | ➖ (Textfelder / Abdecken) |
| Kommentieren, Markieren | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Echtes Schwärzen (Redaction) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (Seite wird gerastert) |
| Unterschrift | ✅ (+ Sign-Workflow) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (gezeichnet) |
| Seiten sortieren, drehen, löschen, mergen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| KI-Assistent / Zusammenfassung | ✅ (Aufpreis) | ✅ | ❌ | ❌ | ❌ | ✅ | ➖ (Stufe 3) |
| **Brief erkennen: Absender, Datum, Betreff, Typ** | ❌ | ❌ | teilweise | ❌ | ❌ | ❌ | ✅ |
| **Automatischer Dateiname** (`Datum_Typ_Absender_Betreff`) | ❌ | ❌ | ❌ | ❌ | Platzhalter | ❌ | ✅ |
| Datenverarbeitung | lokal + Adobe Cloud | lokal + Cloud | lokal | lokal | lokal | **Cloud** | **nur lokal** |
| Kosten | Abo pro Nutzer | Abo / Kauf | Abo / Kauf | Lizenz pro Nutzer | kostenlos | Abo | kostenlos (eigen) |

### Erkenntnisse
- **Acrobat** kann alles, ist aber für „Brief scannen und ablegen" überdimensioniert und kostet pro Arbeitsplatz ein Abo.
- **ABBYY** hat die beste OCR. **NAPS2** zeigt, dass Scannen plus OCR auch kostenlos gut funktioniert.
- **Cloud-Tools** scheiden für Geschäftspost aus, weil Briefe personenbezogene Daten enthalten und hochgeladen würden.
- **Lücke im Markt:** Keines der Tools versteht, *was* ein Brief ist. Datum, Absender, Betreff und Dokumenttyp tippt man überall von Hand ab, um die Datei sinnvoll zu benennen. Genau das automatisieren wir.

## 1b. Öffentliche Web-Version pdfmy.de – Wettbewerb online (Stand 22.10.2026)

| | Smallpdf | iLovePDF | PDF24 Tools (online) | Adobe Acrobat online | Sejda | **pdfmy.de** |
|---|---|---|---|---|---|---|
| Dateien werden hochgeladen | ja | ja | ja | ja | ja | **nein, alles im Browser** |
| Kostenlos-Limits | wenige Aufgaben/Tag | Größen-/Stapel-Limits | kaum | Anmeldung nötig | 3 Aufgaben/Std., Größen-Limit | **keine** |
| Anmeldung / Werbung | Upsell | Werbung, Upsell | Werbung | Konto | Upsell | **keine** |
| Bedienkonzept | ein Werkzeug pro Seite: hochladen → warten → herunterladen | dito | dito | dito | dito | **ein Arbeitsplatz**: alles an derselben Datei, ohne Neu-Hochladen |
| OCR | Pro | Premium | ja | Pro | begrenzt | **ja, unbegrenzt, über 40 Sprachen** (auch Arabisch, Hebräisch, Chinesisch, Japanisch, Koreanisch) |
| Scan-Aufbereitung, Entzerren von Fotos | App | App | ja | App | nein | **ja** |
| Brief verstehen (Datum, Absender, Betrag, IBAN, Frist → Dateiname, Termin) | nein | nein | nein | KI (Pro) | nein | **ja, kostenlos** |
| Echtes Schwärzen | Pro | ja | ja | Pro | ja | **ja** |
| Formulare ausfüllen, unterschreiben | ja | ja | ja | ja | ja | **ja** |
| Komprimieren, Seiten organisieren, Bilder ↔ PDF, Seitenzahlen, Wasserzeichen, Passwort | ja | ja | ja | ja | ja | **ja** |
| PDF/A | Pro | ja | ja | Pro | ja | **ja (veraPDF-geprüft)** |
| Offline nutzbar / installierbar | Desktop-App kostenpflichtig | Desktop-App | Desktop-App | Desktop | Desktop-App | **ja, als App installierbar** |
| Office ↔ PDF | ja (Upload) | ja (Upload) | ja (Upload) | ja (Upload) | ja (Upload) | **ja, im Browser:** Word, Excel, LibreOffice, EPUB, Text, Markdown, CSV → PDF; PDF → PowerPoint, Word, Excel, Markdown, HTML |
| Text in der PDF ändern | Pro | nein | begrenzt | Pro | ja | **ja, mit Originalschrift** bzw. breitengleicher Ersatzschrift |
| Zur Unterschrift senden | Pro, Server | Premium, Server | nein | Konto, Server | nein | **ja, ohne Server** (per E-Mail; Gesendet/Empfangen/Gelesen, Erinnerung, Serienversand) |
| Formulare mit Rechenfeldern und Prüfungen | nein | nein | nein | Acrobat Pro | nein | **ja** (Summen, MwSt., E-Mail/IBAN/PLZ; nie in PDF/A) |
| KI (Zusammenfassen, Fragen, Übersetzen) | Cloud | Cloud | nein | Cloud, Abo | nein | **ohne Upload:** KI des Browsers oder lokale KI auf demselben PC; aus abschaltbar |
| Ordner überwachen (Hot Folder) | nein | nein | Desktop-App | Desktop (Pro) | nein | **ja, im Browser** (Edge/Chrome) |
| Prüfbar, dass nichts hochgeladen wird | nein | nein | nein | nein | nein | **ja:** Dialog „Datenschutz selbst prüfen“, CSP, offline nutzbar; ausgelieferter Programmstand per Prüfsummenliste gegen GitHub prüfbar |
| PDF-Drucker (aus jedem Programm) | nein | nein | Desktop-App | Acrobat Pro (Abo) | nein | **ja:** Drucker „PDFMy“ (Windows, je Benutzer, ohne eigenen Treiber; Mac über PDF-Menü), öffnet direkt in PDFMy |
| Trennblätter für Scan-Stapel | nein | nein | nein | nein | nein | **ja:** QR- und Kodak-Patchcode-Trennblätter, Erkennung am Inhalt |
| Werkzeug-Einstiegsseiten (Suchmaschinen) | sehr viele | sehr viele | viele | viele | viele | 21 (Stand 22.10.2026), in 40 Sprachen |

**Wie pdfmy die Wettbewerber übertrifft:**
1. **Datenschutz als Produkt:** Kein Upload. Das kann man prüfen, die App funktioniert sogar offline.
2. **Ein Arbeitsplatz statt 25 Einzelwerkzeuge:** Öffnen, dann organisieren, schwärzen, unterschreiben, komprimieren und schützen, alles in einem Durchgang.
3. **Kein Limit, kein Konto, keine Werbung.**
4. **Intelligenz für Briefe** (Alleinstellung): Die Datei heißt automatisch richtig, Fristen landen im Kalender.
5. **Sofort:** Es gibt keine Upload- und Wartezeit, große Dateien bleiben schnell.

## 2. Unser Zuschnitt („optimiert für uns")
1. **Ein Ablauf statt Werkzeugkasten:** Scannen → verbessern → OCR → Briefdaten prüfen → speichern. Der Ablauf braucht etwa 3 Klicks.
2. **Briefintelligenz:** Datum, Absender, Betreff und Typ (Rechnung, Mahnung, Bescheid, Vertrag …) werden aus dem OCR-Text erkannt. Daraus entstehen ein Dateiname und die PDF-Metadaten (Titel, Autor, Stichwörter).
3. **Datenschutz by Design:** Alles läuft im Browser. Nur die OCR-Sprachdaten und Bibliotheken werden einmalig aus dem CDN geladen, Dokumente nie.
4. **Echtes Schwärzen:** Seiten mit Schwärzung werden gerastert und der verdeckte OCR-Text entfernt. So kann man Kopien weitergeben, ohne dass Daten durchsickern.
5. **Kein Abo, keine Installation:** Eine HTML-Datei und ein Startskript genügen.

## 3. Umsetzungsstand (Version 1.0, 14.10.2026)
| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Import (Scan-Ordner, Datei, Handykamera), Scan-Aufbereitung, deutsche OCR, durchsuchbares PDF, Seiten-Werkzeuge, Text, Markieren, Schwärzen, Unterschrift, Briefdaten-Erkennung, automatischer Dateiname | ✅ |
| 2 | Perspektivkorrektur für Handyfotos (eigene Kantenerkennung und Entzerrung, ohne OpenCV), automatisches Geraderichten, Kopfüber- und Quer-Erkennung, Stapel-Trennung per Leerseite oder ✂-Markierung | ✅ |
| 3 | Ablage nach Regeln (Jahr/Typ → Ordner). SharePoint/DMS über einen synchronisierten Ordner. Fristen → Outlook-Termin (.ics) mit Erinnerung. Schlüsseldaten statt KI-Zusammenfassung: Betrag, IBAN (mit Prüfsumme), Rechnungs-, Kunden- und Aktenzeichen | ✅ |
| 4 | PDF/A-2b-Export (mit veraPDF geprüft: PASS). Textänderungen in bestehenden PDFs über „Abdecken + Text“ | ✅ |
| Betrieb | Komplett offline (alle Bibliotheken und OCR-Daten lokal), als App installierbar (PWA, „Öffnen mit“), Desktop-Verknüpfungen, Rückgängig, Unit-Tests | ✅ |

### Bewusst nicht umgesetzt (Stand 14.10.2026, inzwischen teils überholt – siehe Abschnitt 4)
- ~~**KI-Zusammenfassung**~~ → seit 20.10.2026 mit der KI, die der Browser selbst mitbringt (lokal, kein Upload, ausschaltbar). Cloud-Modelle bleiben ausgeschlossen (Entscheidung 21.10.2026, Abschnitt 4).
- ~~**Freies Umschreiben von Originaltext**~~ → seit 17.10.2026 „Text ändern“ mit Absatzumbruch, seit 21.10.2026 mit der eingebetteten Originalschrift bzw. gleich breiter Ersatzschrift; Fälschungsschutz für Urkunden, Bescheide, Kontoauszüge.
- **Direkter SharePoint-Upload per API:** Er bräuchte eine Azure-App-Registrierung samt Anmeldung. Der synchronisierte Ordner erreicht dasselbe ohne Konfiguration.

## 4. Grundsatzentscheidungen (Leitplanken für jede neue Funktion)

**Oberstes Ziel: Alles bleibt auf dem Rechner des Kunden.** Jede neue Funktion wird **vor dem Bau** gegen die folgenden Punkte geprüft. Verletzt sie einen davon, wird sie nicht gebaut oder nur so, dass der Punkt gewahrt bleibt.

1. **Alles bleibt auf dem Rechner des Kunden:** Dokumente, erkannter Text, Eingaben und die Verarbeitung (auch KI) verlassen den Rechner nicht – kein Upload, auch nicht an Server im eigenen Netz. Ausnahmen gibt es nur, wenn der Kunde selbst etwas versendet oder speichert (E-Mail, Teilen, Ablage in einem Ordner seiner Wahl) – nie automatisch, nie im Hintergrund.
2. **Kein Server, keine Fremddienste:** pdfmy.de liefert nur statische Dateien. Alle Bibliotheken, Schriften und Sprachdaten kommen von pdfmy.de. Die Sicherheitsrichtlinie (CSP) erlaubt Verbindungen nur zu pdfmy.de und zum eigenen Rechner (pdfmy Scan, lokale KI – localhost/127.0.0.1).
3. **Kostenlos, ohne Konto, ohne Limit, ohne Werbung/Tracking.**
4. **So einfach wie möglich:** keine Konsole, keine Skripte beim Nutzer; neue Funktionen dürfen Bestehendes nicht verstecken.
5. **Normgerecht und prüfbar:** PDF/A und PDF/UA (veraPDF), E-Rechnung (KoSIT), WCAG 2.1 AA (axe), ISO 27001/9001-Nachweis in docs/ISO-Konformitaet.md.
6. **So wenig aktive Inhalte wie möglich:** Skripte in erzeugten PDFs nur, wenn eine Funktion es zwingend braucht und der Nutzer sie gewählt hat (z. B. Rechenfeld im Formular), nie in PDF/A.
7. **Besser als der Wettbewerb – ohne Punkt 1–6 aufzugeben.**

### Prüfung 21.10.2026
| Funktion | Ergebnis |
|---|---|
| Ordner überwachen (Hot Folder) | passt: lokal (Ordnerzugriff nur nach Freigabe), kein Konto, ohne Konsole; braucht Edge/Chrome wie der Scan-Ordner |
| Formulare rechnen und prüfen | passt mit Auflage aus Punkt 6: Skripte nur für Felder, die rechnen oder prüfen, mit Hinweis im Designer; Datum/Text ohne Skript; PDF/A ohne Skript |
| KI-Assistent: Dialog „… Mehr → KI-Assistent“ (KI des Browsers / Aus) | passt: lokal, ausschaltbar |
| Lokale KI auf diesem PC (Ollama, LM Studio, localhost) | passt: der Text bleibt auf dem Rechner; nur localhost/127.0.0.1 erlaubt (Prüfung im Dialog + CSP); aus als Voreinstellung; Freigabe ohne Konsole (LM Studio: Häkchen, Ollama: Windows-Umgebungsvariable per Dialog) – umgesetzt 21.10.2026 |
| Claude mit eigenem API-Schlüssel | **verworfen**: verletzt Punkt 1 und 2 (Text an Anthropic, CSP-Öffnung) und Punkt 3 (Konto/Schlüssel). Gebaut, getestet, vor dem Ausrollen zurückgenommen. |

### Prüfung 21.10.2026 (2): Was Foren und Testberichte noch vermissen
| Kritik / Wunsch (Quelle) | Stand PDFMy | Ergebnis |
|---|---|---|
| „Woher weiß ich, dass nichts hochgeladen wird?“ (Foren zu Online-PDF-Diensten) | vorher nur Versprechen | **umgesetzt:** „… Mehr → Datenschutz selbst prüfen“ zeigt Verbindungen und gesendete Bytes live, Online/Offline-Zustand, Anleitung zum Selbsttest. Passt: Punkt 1, 2, 4 |
| Kantenerkennung bei hellem Untergrund (Kritik an Adobe Scan) | eigene Kantenerkennung | **geprüft, kein Handlungsbedarf:** Testbilder dunkler Tisch, helles Holz, heller und weißer Tisch, Schatten, starkes Rauschen → max. 0,5 % Eckabweichung. Erst unter ca. 5 Helligkeitsstufen Unterschied versagt sie (wie jede Erkennung); dann Ecken von Hand ziehen |
| Trennblätter für Stapel (Kodak/Fujitsu-Patchcode) | QR-Trennblatt + Erkennung am Inhalt | **passt, umgesetzt 21.10.2026:** Patchcode-Blätter (Typ 1, 2, 3, 4, 6, T) werden lokal erkannt – vorhandene Blätter aus dem Büro funktionieren weiter; eigenes Patchcode-T-Blatt zum Drucken. Kein Server, kein Upload, keine Bedienung nötig (Punkt 1, 2, 4). Acrobat erkennt Patchcodes nicht, sonst nur kostenpflichtige Erfassungssoftware |
| Virtueller Drucker „Als PDF drucken in PDFMy“ (Kritik an PDFgear) | Windows hat „Microsoft Print to PDF“; Ordner überwachen nimmt die Datei auf | passt grundsätzlich (lokal über pdfmy Scan), aber Druckertreiber + Signatur = großer Aufwand; zurückgestellt, Entscheidung GF |
| Handschrift erkennen | Tesseract liest Druckschrift | passt nur lokal; heute gibt es kein freies, lokal im Browser lauffähiges Modell mit brauchbarer Qualität für Deutsch → beobachten |
| Formulare/PowerPoint in Acrobat, Foxit, PowerPoint | Skripte simuliert ausgeführt (Summe, MwSt., Format 1.234,56 €, E-Mail/IBAN/PLZ-Prüfung), PPTX-Struktur geprüft (Inhaltstypen, Verweise, Kennungen) | ohne Fehler; Test auf echten Geräten steht noch aus |
| Nachprüfbar, dass das ausgelieferte Programm dem veröffentlichten Stand entspricht (kein Mitbewerber bietet das; ISO-Maßnahme M10) | bisher nur Quellcode auf GitHub | **passt, umgesetzt:** Prüfsummenliste je Release (pruefsummen.txt, sha256sum-Format), Fingerabdruck im Release-Protokoll auf GitHub, Abgleich der laufenden Programmdateien im Dialog „Datenschutz selbst prüfen“. Statische Datei, kein Server, kein Upload (Punkt 1, 2, 4, 5) |

### Umgesetzt 24.10.2026: PDFMy am Handy beim Öffnen von PDFs anbieten (Android-Teilen-Ziel)
**Anlass (GF 24.10.2026):** Android und iPhone bieten PDFMy beim Öffnen einer PDF nicht an. Ursache: file_handlers gelten nur für Desktop-Chrome. Android: Web Share Target der installierten App; iOS: für Web-Apps nicht vorgesehen (nur native App aus dem App Store – Entscheidung GF, Kosten Apple Developer Program, Prüfverfahren, Pflege einer zweiten Codebasis).

| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: Service Worker nimmt die Datei im Browser entgegen, eigener Zwischenspeicher, nach Übernahme gelöscht; fehlt der Service Worker, leitet der Server ohne Verarbeitung zurück |
| 2 Kein Server | passt |
| 3 Kostenlos, ohne Konto | passt |
| 4 Einfach | passt: „Teilen → PDFMy“, wie bei nativen Apps |
| 5 Normgerecht und prüfbar | passt: W3C-Web-Share-Target, Browser-Test |
| 6 Wenig aktive Inhalte | passt |
**Umgesetzt (app-v194).** Offen: Test auf echtem Android-Gerät; Entscheidung GF zu einer iOS-App.

### Entschieden 24.10.2026: sichere Update-Strategie – Stufe 1
**Ausgangslage:** `tools\deploy.ps1` testet (npm test), baut und lädt direkt nach pdfmy.de – ohne Probelauf im Browser und ohne Rückweg; ein Fehler erreicht sofort alle Nutzer (Service Worker lädt zuerst übers Netz). pdfmy-Scan.exe wird bei jedem Ausrollen neu signiert, auch unverändert (Signaturkontingent, Fehlerquelle). pdfmy Scan prüft vor einem Update nur den SHA-256-Wert aus `download/version.json` – vom selben Server wie die Datei; wer den Server übernimmt, kann beides tauschen.
**Stufe 1 (umgesetzt 24.10.2026):**
1. **Probelauf** (`tools/smoke.js`): Nach dem Build und vor dem Hochladen wird die fertige Website lokal ausgeliefert und in Headless-Chrome geprüft – Startseite ohne Skriptfehler, PDF öffnen, als PDF und als PDF/A erzeugen, Vorabprüfung, Handyansicht ohne seitlichen Überlauf, Service Worker registriert. Rot → kein Upload. `-TestUrl` prüft eine schon hochgeladene Testadresse; `-Target test` lädt in ein Testverzeichnis (sobald die Testadresse eingerichtet ist, `testDir` in `tools/site.json`).
2. **Rückweg** (`deploy.ps1 -Rollback [Stand]`): Jede Veröffentlichung wird als ZIP in `.deploy/releases` aufbewahrt (letzte 5); der Rückweg lädt eine frühere Fassung wieder hoch und protokolliert das in `docs/RELEASES.md`.
3. **Nur bei Änderung signieren:** Der Hash der unsignierten exe wird mit dem letzten Stand verglichen; unverändert wird die schon signierte Datei wiederverwendet.
4. **pdfmy Scan prüft vor jedem Update die Signatur** (ab 1.13.0): gültige Authenticode-Signatur, Herausgeber „Mentor GmbH“, keine ältere Version – sonst wird nicht installiert. Grenze: pdfmy Scan für Mac/Linux (Perl-Skript, nicht signiert) prüft weiter nur den SHA-256-Wert.
5. **Auslegung auf 100.000 Nutzer** (Vorgabe GF 24.10.2026):
   - **Service Worker lädt nur geänderte Dateien.** Vorher bekam jede Veröffentlichung einen neuen Versionsnamen, und der Offline-Speicher wurde komplett verworfen: jedes Gerät lud gemessen **21,6 MB** neu (1,9 MB App-Dateien, 15,9 MB Bibliotheken, Rest Seiten/Bilder), dazu erneut jede schon genutzte OCR-Sprache (1–2 MB je Sprache). Jetzt bleibt der Speicher bestehen; beim Update wird jede Datei mit ihrer SHA-256-Prüfsumme aus `pruefsummen.json` (40 KB) verglichen. Gemessen (Test mit einer geänderten Datei): **0,41 MB** statt 21,6 MB. Der erste Wechsel auf das neue Verfahren übernimmt unveränderte Dateien aus den alten Speichern.
   - **pdfmy Scan:** Prüfzeitpunkte mit Zufallsversatz (erste Prüfung 1–16 min nach dem Start, dann alle 6 h ± 45 min statt bei allen 30 s nach dem Hochfahren); Freigabe in Stufen über `rollout` in `download/version.json` (`deploy.ps1 -ScanRollout 10` → automatisch nur 10 % der Installationen, anhand einer stabilen Zufallszahl je Installation; „Nach Updates suchen“ von Hand bekommt das Update immer). Versionen vor 1.13.0 kennen das Feld noch nicht.
   - **Datenvolumen je Veröffentlichung bei 100.000 aktiven Geräten (Abschätzung):**

     | | vorher | nachher |
     |---|---|---|
     | Web-App je Gerät | ≈ 21,6 MB (+ genutzte OCR-Sprachen) | ≈ 0,05 MB (sw.js 6 KB + Prüfsummen 40 KB) + geänderte Dateien, typisch 0,1–2 MB |
     | Web-App gesamt | ≈ 2,2 TB | ≈ 15–200 GB |
     | pdfmy Scan (0,46 MB) | alle gleichzeitig, bis 46 GB in wenigen Minuten | gleiche Menge, aber über Stunden bzw. Tage verteilt |

     Mit dem geplanten Release-Takt (wöchentlich statt mehrmals täglich) sinkt das Monatsvolumen auf grob **0,1–1 TB**. Der laufende Betrieb kommt hinzu: je Besuch prüft der Browser die App-Dateien nur auf Änderung (Antwort „304“, wenige KB) und fragt je offenem Fenster alle 10 min `sw.js` ab (6 KB).
   - **IONOS-Grenzen (zu klären, nicht geprüft):** Der Webspace-Tarif nennt Datenverkehr meist „inklusive“, begrenzt aber gleichzeitige Verbindungen bzw. Prozesse und kann bei Lastspitzen drosseln. Vor dem Wachstum auf 100.000 Nutzer die Vertragsbedingungen (Fair Use, gleichzeitige Verbindungen, Bandbreite) bei IONOS schriftlich bestätigen lassen.
   - **CDN später (Entscheidung GF):** sinnvoll ab hoher gleichzeitiger Last. Passt zu den Leitplanken nur mit Auflagen: **unter der eigenen Domain** (pdfmy.de bleibt Ursprung, CSP unverändert, keine Fremdadresse im Browser), **nur statische Dateien**, **EU-Standort und EU-Anbieter**, **kein Tracking, keine Cookies, Protokolle minimal/kurz**, Auftragsverarbeitungsvertrag, Hinweis in der Datenschutzerklärung (IP-Adressen gehen dann auch an den CDN-Anbieter – Punkt 1 betrifft Dokumente, nicht Abrufe der Programmdateien; trotzdem transparent machen). Prüfsummen und „Datenschutz selbst prüfen“ bleiben wirksam, weil die Dateien unverändert ausgeliefert werden.

**Geplant (Stufe 2/3, Entscheidung GF):** fester Release-Takt (z. B. dienstags, Sicherheitskorrekturen sofort), Updates von pdfmy Scan in Ringen (erst Mentor/Haus iT, nach 48 h alle), Freigabe neuer pdfmy-Scan-Versionen durch die GF, Übersetzungen mit günstigerem Modell und festem Glossar einmal je Release, SFTP nur mit Schlüssel (Maßnahme M11), Zwei-Faktor-Anmeldung beim Signierkonto.

| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: Probelauf lokal; Nutzerdaten sind nicht betroffen |
| 2 Kein Server | passt: weiterhin nur statische Dateien; Testadresse ist ebenfalls statisch |
| 3 Kostenlos, ohne Konto | passt; senkt Betriebskosten (weniger Signaturen) |
| 4 Einfach | passt: für Nutzer unsichtbar; Update-Ablehnung mit klarer Meldung |
| 5 Normgerecht und prüfbar | passt: Änderungs- und Freigabemanagement (ISO 27001 A.8.32), Integrität der Software (A.8.24, A.8.19), Protokoll in RELEASES.md |
| 6 Wenig aktive Inhalte | nicht betroffen |
**Entscheidung:** Stufe 1 umsetzen (Auftrag GF 24.10.2026).

### Entschieden 23.10.2026: Vorabprüfung („Preflight“) mit Profilen beA/ERV, ePA, BITV/PDF/UA, GoBD-Archiv
**Anlass (Recherche Berufsgruppen 23.10.2026):** Anwälte müssen eine umgewandelte PDF vor dem Versand prüfen (BGH II ZB 5/24, 12/2024); Gerichte lehnen Dateien nach ERVB 2025 ab (Schriften, JavaScript, Anhänge, Dateiname, 200 MB). Arztpraxen: ePA nimmt nur PDF/A bis 25 MB. Behörden: BITV 2.0/EN 301 549, Prüfung durch BFIT-Bund. Steuerberater: GoBD-Archiv, Verfahrensdokumentation. Mitbewerber bieten Preflight nur in Acrobat Pro (Abo) oder Spezialsoftware.
**Vorschlag:** „… Mehr → Vorabprüfung …“ und Werkzeug-Kachel: Profil wählen → Ampelbericht (✓ erfüllt, ✗ Fehler, i Hinweis) für die Datei, die gespeichert würde → „Automatisch beheben“ (je Profil: beA-tauglich speichern, PDF/A klein, barrierefrei machen, PDF/A) → „Bericht als PDF speichern“ (Nachweis für Akte/Verfahrensdokumentation, mit SHA-256-Fingerabdruck und Zeitpunkt). Bausteine vorhanden: BeaCheck (ERVB 2025), PdfACheck (PDF/A-2b-Kurzprüfung), A11yCheck (PDF/UA, Matterhorn-Auswahl).
**Grenzen:** Kurzprüfung, keine vollständige Validierung (dafür veraPDF); ERVV-Änderung vom 22.06.2026 noch nicht ausgewertet; ePA-Metadaten (Dokumenttyp) setzt das Praxisverwaltungssystem.

| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: Prüfung und Bericht lokal |
| 2 Kein Server | passt |
| 3 Kostenlos, ohne Konto | passt |
| 4 Einfach | passt: ein Dialog, Profil vorbelegt nach Edition/letzter Wahl, „Automatisch beheben“ |
| 5 Normgerecht und prüfbar | passt mit Auflage: Bericht nennt Grundlage und Grenzen; Ergebnisse gegen veraPDF an Testdateien abgleichen |
| 6 Wenig aktive Inhalte | passt: Bericht ohne Skripte |
**Entscheidung:** umsetzen (Auftrag GF 23.10.2026). **Umgesetzt 23.10.2026 (app-v187):** js/preflight.js mit vier Profilen, Dialog mit Ampel, „Automatisch beheben“, Bericht als PDF mit SHA-256. Abgleich mit veraPDF am Word-Original: Titel/DisplayDocTitle (7.1-9) übereinstimmend; fehlende PDF/UA-Kennung (5-1) im Profil „Barrierefrei“ jetzt Fehler statt Hinweis. BGH-Beschluss nur intern zitiert (nicht im Original geprüft).

### Entschieden 23.10.2026: „PDF barrierefrei machen“ (Anlass: Barrierefreiheitsstärkungsgesetz, BFSG, seit 28.06.2025)
**Stand vorher:** „Als PDF/A speichern“ erzeugt bereits ein formal gültiges PDF/UA-1 (veraPDF), aber inhaltlich dünn: jede Textzeile ist ein eigener Absatz `P` – keine Überschriften, Listen, Tabellen, kein Inhaltsverzeichnis. Screenreader lesen Zeile für Zeile; Tabellen sind nicht als Tabelle navigierbar. Bei Acrobat Pro kostet das „Automatisch taggen“, kostenlose Tools können es kaum.
**Vorschlag:** ein Befehl „PDF barrierefrei machen“ (Menü, Werkzeug-Kachel, Befehlssuche, im Dialog „Barrierefreiheit prüfen“):
1. Texterkennung, wo nötig; Gliederung aus js/reflow.js (dieselbe wie Lesemodus und PDF → Word).
2. Strukturbaum mit echten Tags: `H1`/`H2`, `P`, `L`/`LI`/`LBody`, `Table`/`TR`/`TH`/`TD` (Kopfzeile mit `Scope`), Reihenfolge = Lesereihenfolge.
3. Lesezeichen (Inhaltsverzeichnis im PDF) aus den Überschriften; Titel und Dokumentsprache gesetzt, Titel wird angezeigt.
4. Ergebnis als PDF/A-2b + PDF/UA-1; danach automatisch die eigene Prüfung auf der gespeicherten Datei mit Ergebnis („x von y Punkten erfüllt“).
**Grenzen (ehrlich in der Hilfe):** Bilder und Grafiken in Scans bleiben Teil des Seitenbilds (Artefakt) – Alternativtexte gibt es für eingefügte Bilder, Unterschriften und Stempel; komplexe Layouts werden vereinfacht; automatisch getaggte Dokumente sollten bei Veröffentlichung stichprobenartig mit Screenreader geprüft werden (wie bei jedem Werkzeug).

| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: Gliederung, Texterkennung, Strukturbaum lokal |
| 2 Kein Server | passt |
| 3 Kostenlos, ohne Konto | passt |
| 4 Einfach | passt: ein Befehl, keine Einstellungen; vorhandenes „Als PDF/A speichern“ bleibt |
| 5 Normgerecht und prüfbar | passt mit Auflage: jede Änderung mit veraPDF (PDF/UA-1 und PDF/A-2b) gegen Testdokumente (Brief, Rechnung mit Tabelle, Aufzählung, mehrseitig mit Überschriften) |
| 6 Wenig aktive Inhalte | passt: keine Skripte |
**Entscheidung:** umsetzen (Auftrag GF 23.10.2026). **Umgesetzt 23.10.2026 (app-v184):** Gliederung H1/H2, P, L/LI/LBody, Table/TR/TH(Scope)/TD; Kopf-/Fußzeilen und Seitenzahlen als Artefakt; Lesezeichen aus Überschriften; Prüfbericht nach dem Speichern. veraPDF PDF/UA-1 und PDF/A-2b bestanden für Rechnung mit Tabelle, Angebot mit Aufzählung und Tabelle, gescannte Rechnung, dreiseitige Satzung mit Kopf-/Fußzeile. **Screenreader-Test 23.10.2026 (app-v185):** NVDA 2026.2 in Edge liest Überschriften mit Ebene, Listen und Tabellen; Listenzeichen jetzt als `Lbl`.

### Entschieden 23.10.2026: weitere kostenlose Office-Programme und Cloud-Ordner (Nextcloud & Co.) – wie ONLYOFFICE
Wunsch: Verbindung zu kostenlosen Office-Anbietern, zu Nextcloud und weiteren – so wie bei ONLYOFFICE (über pdfmy Scan, auf dem Rechner).

| Variante | Daten bleiben … | Ergebnis |
|---|---|---|
| Weitere Office-Programme auf dem Rechner: SoftMaker FreeOffice (TextMaker), Apache OpenOffice, Inkscape; Textprogramme bekommen das gegliederte Word-Dokument aus PDFMy | auf dem Rechner | **passt, umgesetzt:** wie ONLYOFFICE – pdfmy Scan erkennt, legt lokal ab, startet (Punkt 1, 2, 4) |
| WPS Office | auf dem Rechner, Programm drängt zur Anmeldung in der Kingsoft-Cloud | nicht angeboten (Datenschutz-Bedenken; Nutzer kann die Datei selbst öffnen) |
| **Cloud-Ordner über das Sync-Programm des Nutzers** (Nextcloud, ownCloud, Seafile, Dropbox, OneDrive, Google Drive, iCloud): pdfmy Scan findet die Sync-Ordner, „In Cloud-Ordner speichern“ legt die PDF dort ab | auf dem Rechner; das Sync-Programm des Nutzers überträgt sie an **seinen** Speicher | **passt mit Auflage:** Ausnahme aus Punkt 1 („Kunde speichert in einem Ordner seiner Wahl“) – nur auf Klick, nie automatisch, im Dialog klar gesagt, dass das Sync-Programm die Datei hochlädt; PDFMy selbst baut keine Verbindung auf, CSP unverändert (Punkt 2), kein Konto in PDFMy (Punkt 3) |
| Direkte Anmeldung an Nextcloud/WebDAV/Google/Dropbox aus dem Browser | beim Anbieter | **verworfen:** CSP müsste beliebige Server zulassen, Zugangsdaten im Browser, Upload durch PDFMy (Punkt 1–3) |
| Online-Office (Google Docs, Microsoft 365 im Browser, ONLYOFFICE Docs/Collabora Online auf einem Server) | beim Anbieter bzw. Server | verworfen (Punkt 1, 2) – die Desktop-Programme derselben Anbieter sind angebunden |

### Prüfung 22.10.2026 (3): Was Nutzer bei Mitbewerbern vermissen oder kritisieren
Grundlage: Recherche 22.10.2026 (Herstellerseiten Adobe/Foxit/iLovePDF/Stirling-PDF, Fachpresse borncity/WinFuture/PC-WELT/IT Brief, Adobe-Community, r/sysadmin, Trustpilot). Ein Vergleichstest von Stiftung Warentest oder c't aus 2025/2026 war nicht zu finden.

**Kritik an Mitbewerbern – wo PDFMy schon besser ist:** Abo-Preise und Lizenzentzug (Adobe: Preiserhöhung 2026, alte Kauflizenzen entzogen, automatische Verlängerung von Probeabos), Limits für kostenlose Nutzer (iLovePDF 100 MB/Tageslimit, Smallpdf), Upload-Zwang (Online-Dienste von PDF24, iLovePDF, Smallpdf), Werbung (PDF24 online), KI mit Cloud-Upload (Acrobat-KI ab Werk an, PDFgear Copilot online). **Achtung:** Foxit bietet seit 2026.2 lokale KI, auch im kostenlosen Reader – „KI ohne Upload“ ist kein Alleinstellungsmerkmal mehr; Vorsprung halten wir über „gar nichts verlässt den Rechner, selbst prüfbar“.

| Wunsch / Kritik | Stand PDFMy vorher | Ergebnis |
|---|---|---|
| Formulare aus gespeicherten eigenen Daten ausfüllen (Acrobat nur in der Handy-App) | fehlte | **passt, umgesetzt:** „Meine Angaben“ – nur im Browser gespeichert, nie übertragen, nur leere Felder, „Alle löschen“ (Punkt 1–4). Auflage: Hinweis für gemeinsam genutzte Geräte im Dialog |
| Lesemodus mit Textumbruch auf dem Handy (Acrobat Liquid Mode: Cloud, max. 200 Seiten) | fehlte | **passt, umgesetzt:** lokal aus Textebene/OCR, ohne Seitenbegrenzung (Punkt 1, 2, 4) |
| Automatisches Schwärzen (Foxit Smart Redact kostenpflichtig) | IBAN, E-Mail, Telefon, Steuer-ID, Geburtsdatum, SV-Nr. | **passt, erweitert:** Namen nach Anrede, Straße/Hausnummer, PLZ/Ort; bleibt Vorschlag mit Prüfung durch den Nutzer |
| Dateinamen automatisch aus dem Inhalt | vorhanden (Datum_Typ_Absender_Betreff) | kein Handlungsbedarf; eigene Namensvorlage → beobachten |
| Belege nach DATEV | DATEV-XML (Belegbilder) + Belegliste CSV vorhanden | Buchungsstapel EXTF zurückgestellt: nur mit geprüfter DATEV-Spezifikation (Formatfehler → falsche Buchungen) |
| Formularfelder automatisch erkennen (Stirling-PDF 3.0) | vorhanden (Schreiblinien, Kästen, Ankreuzfelder) | kein Handlungsbedarf |
| Aufteilen nach Inhalt (iLovePDF) | vorhanden (Anrede, Datum, Absender, Seite 1 von n) | kein Handlungsbedarf |
| Bearbeiten per Anweisung in natürlicher Sprache (Acrobat, Cloud) | Befehlssuche Strg+K mit Synonymen, KI-Assistent lokal | passt nur lokal (Browser-KI/lokale KI) → später prüfen |
| Arbeitsraum mit Fragen über viele Dokumente (Acrobat PDF Spaces, Foxit) | Fragen an ein Dokument (lokale KI) | passt nur lokal, Speichergrenzen im Browser → beobachten |
| Handschrift erkennen | Druckschrift | weiterhin kein brauchbares lokales Modell für Deutsch → beobachten |
| Qualifizierte elektronische Signatur (QES) | fortgeschrittene Signatur, PAdES, Prüfung | braucht Vertrauensdiensteanbieter (Konto, oft kostenpflichtig) → verletzt Punkt 2/3; höchstens später Übergabe nur des Hashwerts auf ausdrücklichen Wunsch – Entscheidung GF |
| Layoutverlust bei PDF → Word (alle kostenlosen Tools) | gemessen 23.10.2026: jede Zeile ein Absatz, keine Überschriften/Tabellen | **passt, umgesetzt 23.10.2026:** Absätze, Word-Überschriften, Aufzählungen, Tabellen mit Originalbreiten – lokal (Punkt 1, 2), geprüft in Word und LibreOffice. Vergleich mit Acrobat/PDF24 offen (nicht installiert) |

### Umgesetzt (22.10.2026): Lesebestätigung für Unterschriftsanfragen per WhatsApp, Signal, Teams
**Wunsch:** Der Absender soll sehen, ob der Empfänger eine per Messenger verschickte Anfrage gelesen hat.
**Grenze:** Die Lesehaken von WhatsApp, Signal und Teams sind nur in deren App sichtbar; eine Abfrage durch PDFMy ginge nur mit Firmenkonto und Server (Business-API, Graph) – verletzt Punkt 1–3. Außerdem zeigen die Haken nur, dass die Nachricht angezeigt wurde, nicht, dass das Dokument gelesen ist.
**Vorschlag ohne Server:** (1) „Per Messenger senden“ in der Unterschriftsanfrage: PDF über das Teilen-Menü des Systems an WhatsApp/Signal/Teams, Vermerk „Gesendet“. (2) Hat der Empfänger alle Seiten in PDFMy durchgesehen, bietet PDFMy ihm an: „Dem Absender bestätigen, dass Sie es gelesen haben“ – ein Tipp öffnet seinen Messenger mit einer fertigen Nachricht samt Link pdfmy.de/#gelesen=… (Kennung der Anfrage, Zeit, Prüfwert; nichts vom Dokument). (3) Der Absender tippt in seinem Messenger auf den Link: PDFMy öffnet sich und setzt im Posteingangsbuch „Gelesen“ mit Uhrzeit. Der #-Teil eines Links wird nie an pdfmy.de übertragen.
| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: nur auf Wunsch des Empfängers, kein Dokumentinhalt im Link |
| 2 Kein Server | passt: Link mit #-Teil, Auswertung lokal |
| 3 Kostenlos, ohne Konto | passt |
| 4 Einfach | passt mit Auflage: je ein Tipp beim Empfänger und beim Absender; kein Zwang |
**Ehrlich zu sagen:** Ohne Mitwirkung des Empfängers ist eine Lesebestätigung über Messenger nicht möglich – sonst bräuchte es einen Server, der heimlich mitzählt (das wäre ein Tracking-Pixel, das wir bewusst nicht bauen).

### Umgesetzt (22.10.2026): Fotos scannen und zuschneiden
Wunsch: Fotos scannen (Farbe/Schwarzweiß), Scan zuschneiden, automatisch erkennen. **Passt:** alles lokal im Browser bzw. über pdfmy Scan, kein Upload (Punkt 1, 2); eine Auswahl „Art“ mit „Automatisch“ als Voreinstellung – der Nutzer muss nichts tun (Punkt 4); Fotos bleiben unverändert (keine Dokument-Aufbereitung).

### Umgesetzt (22.10.2026): Office-Programme anbinden (ONLYOFFICE, LibreOffice, Collabora, Word)
| Weg | Ergebnis |
|---|---|
| ONLYOFFICE → PDFMy: im Druckdialog den Drucker „PDFMy“ wählen | **passt, geht heute** – in der Hilfe beschrieben |
| PDFMy → Office-Programm nach Wahl: „… Mehr → In Office-Programm öffnen …“ (Wunsch 22.10.2026: der Nutzer entscheidet, mit welchem Programm er was macht) | **passt, wird gebaut:** pdfmy Scan erkennt die installierten Programme – ONLYOFFICE (PDF direkt bearbeiten), LibreOffice bzw. Collabora Office (Draw: PDF bearbeiten; Writer: als Textdokument), Microsoft Word (als Word-Dokument, Word wandelt um). Der Dialog zeigt nur Vorhandenes, merkt sich die Wahl; nichts installiert → Hinweis auf kostenlose ONLYOFFICE/LibreOffice. PDFMy erzeugt die aktuelle PDF, pdfmy Scan legt sie lokal unter %LOCALAPPDATA%\PDFMy\Office ab (nicht unter Dokumente – der Ordner liegt oft in OneDrive und würde die Datei ungefragt hochladen) und startet das Programm; Ergebnis im Programm mit „Speichern unter“ sichern. Zurück zu PDFMy über den Drucker „PDFMy“ (kein automatisches Zurückholen – vorhersehbar, einfach). Windows, Mac, Linux; die Datei verlässt den Rechner nicht |
| Plugin „In PDFMy öffnen“ in ONLYOFFICE Docs | zurückgestellt: GetFileToDownload funktioniert laut Hersteller in Desktop nicht; Lizenzfrage (AGPL) vorher klären |
| ONLYOFFICE Docs als Umwandlungs-Server | **verworfen:** Server im Netz verletzt Punkt 1 (wie KI-Server); lokal nur mit Docker – zu kompliziert (Punkt 4) |
| ONLYOFFICE DocSpace (Cloud) | **verworfen:** wäre ein Upload (Punkt 1) |
| Microsoft Office: Office-Add-in „An PDFMy senden“ (getFileAsync PDF) | zurückgestellt: braucht HTTPS-gehostete Add-in-Seite, Office im Web liefert kein PDF, Senden an 127.0.0.1 ungeklärt (Chrome „Local Network Access“); bis dahin Drucker „PDFMy“ |
| SoftMaker Office/FreeOffice, WPS Office, Apple Pages | kein PDF-Bearbeiten bzw. keine offene Schnittstelle – Weg zu PDFMy über den Drucker „PDFMy“; Apple Vorschau bleibt Systemprogramm |
| Google Docs, Microsoft 365 online, Collabora Online, openDesk/Nextcloud | **verworfen:** Server/Cloud (Punkt 1, 2) |
| Erweiterung „An PDFMy senden“ für LibreOffice (.oxt) und ONLYOFFICE-Plugin | passt grundsätzlich (lokal, offen); nach Rückmeldung der angeschriebenen Teams prüfen |

### Umgesetzt (22.10.2026): Website in 40 Sprachen für Suchmaschinen sichtbar
**Befund:** Die Webseiten (Hilfe, Werkzeug-Seiten, Presse …) werden immer auf Deutsch ausgeliefert und erst im Browser per JavaScript übersetzt. Auch pdfmy.de/…?lang=fr liefert deutsches HTML; kanonische Adresse immer deutsch, keine hreflang-Angaben, Sitemap nur 28 deutsche Adressen. Suchmaschinen finden die 39 Übersetzungen deshalb praktisch nicht; Crawler, die JavaScript ausführen (Google mit englischer Browsersprache), sehen unter der deutschen Adresse womöglich englischen Text.

**Lösung:** Beim Ausrollen werden die Webseiten je Sprache **vorab übersetzt** und als statische Seiten unter /<sprache>/ abgelegt (z. B. pdfmy.de/fr/pdf-verkleinern.html) – mit demselben Übersetzungsverfahren wie im Browser (headless Chrome auf dem Build-Rechner, nur geänderte Seiten neu). Jede Seite bekommt lang-Attribut, übersetzten Titel und Beschreibung, eigene kanonische Adresse und hreflang-Verweise auf alle 40 Fassungen (x-default = Deutsch); die Sitemap führt alle Fassungen. Die Sprachwahl auf diesen Seiten springt zur gleichen Seite in der anderen Sprache. Die deutschen Seiten bleiben, wie sie sind; für Menschen übersetzt die deutsche Seite weiter automatisch nach Browsersprache, für Suchmaschinen-Crawler nicht (sie folgen den hreflang-Verweisen). Die App selbst (Startseite) bleibt unverändert.

| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: betrifft nur öffentliche Webseiten, keine Nutzerdaten |
| 2 Kein Server | passt: statische Dateien, Übersetzung beim Build |
| 3 Kostenlos, ohne Tracking | passt |
| 4 So einfach wie möglich | passt: für Nutzer keine Änderung; teilbare Adressen je Sprache |
| 5 Normgerecht | passt: korrektes lang-Attribut (WCAG 3.1.1), axe-geprüft |
| 7 Besser als Wettbewerb | Wettbewerber haben Sprachfassungen je Adresse – das holen wir nach |

### Entschieden und umgesetzt (22.10.2026): virtueller Drucker „Drucken in PDFMy“
Ziel: In jedem Programm (Word, Browser, Warenwirtschaft) „Drucken“ → Drucker „PDFMy“ → das Dokument öffnet sich sofort in PDFMy.

| Plattform | Weg | Aufwand |
|---|---|---|
| Windows | pdfmy Scan legt mit **einer** Windows-Bestätigung (UAC) einen Drucker „PDFMy“ an – mit dem in Windows eingebauten Treiber „Microsoft Print to PDF“ und einem Anschluss, der in einen Ordner des Nutzers schreibt. pdfmy Scan bemerkt die fertige Datei, gibt ihr einen eindeutigen Namen und öffnet sie in PDFMy (vorhandener Weg wie beim Doppelklick). Kein eigener Treiber → keine Treibersignatur, keine Kernel-Komponente. Entfernen per Knopf. | ca. 1–1,5 Tage inkl. Tests (hier testbar) |
| Mac | Eintrag „In PDFMy öffnen“ im PDF-Menü des macOS-Druckdialogs (Ordner ~/Library/PDF Services, ohne Admin-Rechte), zeigt auf die vorhandene App „PDFMy“ | ca. 0,5 Tage, Test nur auf echtem Mac |
| Linux | zurückgestellt: Druckdialoge haben „In Datei drucken“; eigene CUPS-Warteschlange bräuchte Root | – |

| Leitplanke | Prüfung |
|---|---|
| 1 Alles bleibt auf dem Rechner | passt: Druckdatei entsteht lokal, Übergabe nur an 127.0.0.1 |
| 2 Kein Server | passt: nur pdfmy Scan auf dem eigenen PC |
| 3 Kostenlos, ohne Konto | passt |
| 4 So einfach wie möglich | passt mit Auflage: ein Knopf „Drucker PDFMy einrichten“ in pdfmy Scan, eine Windows-Bestätigung, keine Konsole |
| 5 Normgerecht | passt: Ergebnis ist echtes PDF mit Text; als PDF/A speicherbar |
| 6 Wenig aktive Inhalte | passt: keine |
| 7 Besser als Wettbewerb | gleichauf mit Acrobat (Drucker nur im Abo) und PDF24; besser als PDFgear (kein Drucker); dazu sofort bearbeiten, OCR-frei durchsuchbar |

**Umsetzung:** Windows über pdfmy Scan 1.10.0 (Drucker je Benutzer, Ordner unter `C:\ProgramData\PDFMy\Druck\<SID>`, weil Windows Datei-Anschlüsse im Profil verbietet; auf Terminalservern nicht angeboten), Mac über pdfmy Scan 1.3.0 (PDF-Menü). **Risiken (im Prototyp geklärt):** (a) Mehrbenutzer-PCs und Terminalserver: der Drucker gilt für alle Benutzer – Druckdateien dürfen nicht in einem gemeinsamen Ordner landen (Lösung: Drucker je Benutzer „PDFMy (Name)“ mit eigenem Ordner, Zugriffsrechte nur für diesen Benutzer; auf Terminalservern zunächst nicht anbieten). (b) Zwei Druckaufträge kurz hintereinander: Datei sofort nach Abschluss wegbewegen. (c) Gruppenrichtlinien in Firmen können das Anlegen von Druckern verbieten → verständliche Meldung. (d) „Microsoft Print to PDF“ kann abgeschaltet sein → pdfmy Scan prüft und erklärt das Einschalten.

### Entschieden 21.10.2026: KI nach eigener Wahl verbinden (ChatGPT, Claude, lokale KI)
Wunsch: Wer möchte, verbindet selbst eine KI – nur auf eigenen Wunsch, jederzeit ein- und ausschaltbar.

| Variante | Daten bleiben … | Passt zu den Leitplanken? |
|---|---|---|
| **KI des Browsers** (heute) | auf dem Gerät | ja |
| **Lokale KI auf dem eigenen PC** (z. B. Ollama, LM Studio – Adresse localhost) | auf dem eigenen Rechner | ja – Verbindung nur zum eigenen Rechner wie pdfmy Scan; keine Fremddienste, kein Konto |
| **KI-Server im eigenen Firmennetz** (selbst betrieben) | im Netz, aber nicht auf dem Rechner | nein – der Text verlässt den Rechner (oberstes Ziel, Punkt 1) |
| **Cloud-KI mit eigenem Schlüssel** (ChatGPT/OpenAI, Claude/Anthropic, Gemini) | **beim Anbieter, meist USA** | nein – verletzt Punkt 1, 2 und 3; schwächt das prüfbare Versprechen „kein Upload“ für alle Nutzer (CSP muss die Anbieter dauerhaft zulassen), Schlüssel im Browser, Drittlandübermittlung |

Empfehlung (nach dem obersten Ziel): Nur KI, die auf dem Rechner des Kunden läuft – die KI des Browsers (vorhanden) und auf Wunsch eine lokale KI auf demselben PC (z. B. Ollama, LM Studio unter localhost) als zusätzliche Wahl im Dialog „KI-Assistent“: aus als Voreinstellung, jederzeit abschaltbar, deutlich gekennzeichnet. KI-Server im Netz und Cloud-KI (ChatGPT, Claude, Gemini) passen nicht und werden nicht angebunden. **Entschieden und umgesetzt am 21.10.2026** (KI des Browsers und lokale KI; Cloud-KI und KI-Server im Netz nicht).

