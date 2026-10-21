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

## 1b. Öffentliche Web-Version pdfmy.de – Wettbewerb online

| | Smallpdf | iLovePDF | PDF24 Tools (online) | Adobe Acrobat online | Sejda | **pdfmy.de** |
|---|---|---|---|---|---|---|
| Dateien werden hochgeladen | ja | ja | ja | ja | ja | **nein, alles im Browser** |
| Kostenlos-Limits | wenige Aufgaben/Tag | Größen-/Stapel-Limits | kaum | Anmeldung nötig | 3 Aufgaben/Std., Größen-Limit | **keine** |
| Anmeldung / Werbung | Upsell | Werbung, Upsell | Werbung | Konto | Upsell | **keine** |
| Bedienkonzept | ein Werkzeug pro Seite: hochladen → warten → herunterladen | dito | dito | dito | dito | **ein Arbeitsplatz**: alles an derselben Datei, ohne Neu-Hochladen |
| OCR deutsch | Pro | Premium | ja | Pro | begrenzt | **ja, unbegrenzt** |
| Scan-Aufbereitung, Entzerren von Fotos | App | App | ja | App | nein | **ja** |
| Brief verstehen (Datum, Absender, Betrag, IBAN, Frist → Dateiname, Termin) | nein | nein | nein | KI (Pro) | nein | **ja, kostenlos** |
| Echtes Schwärzen | Pro | ja | ja | Pro | ja | **ja** |
| Formulare ausfüllen, unterschreiben | ja | ja | ja | ja | ja | **ja** |
| Komprimieren, Seiten organisieren, Bilder ↔ PDF, Seitenzahlen, Wasserzeichen, Passwort | ja | ja | ja | ja | ja | **ja** |
| PDF/A | Pro | ja | ja | Pro | ja | **ja (veraPDF-geprüft)** |
| Offline nutzbar / installierbar | Desktop-App kostenpflichtig | Desktop-App | Desktop-App | Desktop | Desktop-App | **ja, als App installierbar** |
| Office ↔ PDF (Word, Excel) | ja | ja | ja | ja | ja | nein (bräuchte Server-Konvertierung → bewusst nicht) |

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

### Vorschlag in Prüfung: KI nach eigener Wahl verbinden (ChatGPT, Claude, lokale KI)
Wunsch: Wer möchte, verbindet selbst eine KI – nur auf eigenen Wunsch, jederzeit ein- und ausschaltbar.

| Variante | Daten bleiben … | Passt zu den Leitplanken? |
|---|---|---|
| **KI des Browsers** (heute) | auf dem Gerät | ja |
| **Lokale KI auf dem eigenen PC** (z. B. Ollama, LM Studio – Adresse localhost) | auf dem eigenen Rechner | ja – Verbindung nur zum eigenen Rechner wie pdfmy Scan; keine Fremddienste, kein Konto |
| **KI-Server im eigenen Firmennetz** (selbst betrieben) | im Netz, aber nicht auf dem Rechner | nein – der Text verlässt den Rechner (oberstes Ziel, Punkt 1) |
| **Cloud-KI mit eigenem Schlüssel** (ChatGPT/OpenAI, Claude/Anthropic, Gemini) | **beim Anbieter, meist USA** | nein – verletzt Punkt 1, 2 und 3; schwächt das prüfbare Versprechen „kein Upload“ für alle Nutzer (CSP muss die Anbieter dauerhaft zulassen), Schlüssel im Browser, Drittlandübermittlung |

Empfehlung (nach dem obersten Ziel): Nur KI, die auf dem Rechner des Kunden läuft – die KI des Browsers (vorhanden) und auf Wunsch eine lokale KI auf demselben PC (z. B. Ollama, LM Studio unter localhost) als zusätzliche Wahl im Dialog „KI-Assistent“: aus als Voreinstellung, jederzeit abschaltbar, deutlich gekennzeichnet. KI-Server im Netz und Cloud-KI (ChatGPT, Claude, Gemini) passen nicht und werden nicht angebunden. Entscheidung durch die Geschäftsführung.

