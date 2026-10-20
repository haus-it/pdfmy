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

### Bewusst nicht umgesetzt
- **KI-Zusammenfassung:** Ein lokales Sprachmodell wäre mehrere GB groß. Ein Cloud-Modell widerspräche dem Datenschutz-Ziel. Die Schlüsseldaten decken den praktischen Bedarf ab (Was? Wie viel? Bis wann? Wohin zahlen?).
- **Freies Umschreiben von Originaltext** wie in Acrobat (Absatzumbruch, Schrift erkennen): Bei gescannten Briefen gibt es keinen editierbaren Text. Für gelegentliche Korrekturen reicht „Abdecken + Text“.
- **Direkter SharePoint-Upload per API:** Er bräuchte eine Azure-App-Registrierung samt Anmeldung. Der synchronisierte Ordner erreicht dasselbe ohne Konfiguration.
