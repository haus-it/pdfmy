# Browser-Prüfplan PDFMy

Stand 18.10.2026. Automatisch geprüft wird bisher **nur Chromium** (Chrome 155 / Edge 155, headless über CDP: Funktions-, Barrierefreiheits- und veraPDF-Tests). Alle anderen Browser sind **noch nicht geprüft**.

## Welche Browser müssen noch geprüft werden

| Browser | Engine | Anteil (DE, grob) | Status | Priorität |
|---|---|---|---|---|
| Chrome (Windows, Mac, Linux) | Chromium | hoch | automatisch geprüft | – |
| Edge (Windows) | Chromium | mittel | gleiche Engine wie Chrome, Stichprobe genügt | niedrig |
| **Safari (iPhone/iPad)** – auch Chrome/Firefox auf iOS (alle nutzen WebKit) | WebKit | hoch (Handy) | **offen** | **hoch** |
| **Safari (Mac)** | WebKit | mittel | **offen** | **hoch** |
| **Firefox (Windows, Mac, Linux)** | Gecko | mittel | **offen** | **hoch** |
| Chrome (Android) | Chromium | hoch (Handy) | Engine geprüft, Gerät (Kamera, Teilen, Installieren) offen | mittel |
| Samsung Internet (Android) | Chromium | mittel | offen | mittel |

## Was in den einzelnen Browsern anders ist (aus dem Code)

| Funktion in PDFMy | Schnittstelle | Chrome/Edge | Firefox | Safari Mac/iOS | Ausweichweg im Code |
|---|---|---|---|---|---|
| „In Originaldatei speichern“, Ordnerablage, „Zuletzt geöffnet“ | File System Access (`showSaveFilePicker`, `showOpenFilePicker`) | ja | nein | nein | normaler Download / Dateiauswahl – **prüfen** |
| PDFs per Doppelklick in der installierten App öffnen | `launchQueue` / file_handlers | ja | nein | nein | Öffnen über die App bzw. Browser-Erweiterung |
| „App herunterladen“ (Installieren) | `beforeinstallprompt` | ja | nein | nein (iOS: „Zum Home-Bildschirm“) | Hinweistext nötig – **prüfen**, ob der Knopf sinnvoll reagiert |
| Teilen | `navigator.share` mit Dateien | Android/ChromeOS, Windows teils | nein (Desktop) | ja | Download |
| Kamera-Scan | `getUserMedia` | ja | ja | ja (iOS: nur HTTPS, Rechte-Abfrage) | Dateiauswahl/Foto – **auf iPhone prüfen** |
| Vorlesen | `speechSynthesis` | ja | ja | ja (Stimmen unterschiedlich) | Hinweis |
| Texterkennung | WebAssembly (Tesseract, mit/ohne SIMD) | ja | ja | ab Safari 16.4 SIMD, sonst langsamer | automatische Wahl – **Geschwindigkeit iPhone prüfen** |
| Signieren/Prüfen | WebCrypto (`crypto.subtle`), RSA/ECDSA | ja | ja | ja | – **prüfen** (P-521, große Schlüssel) |
| Dialoge | `<dialog>.showModal()` | ja | ja | ab 15.4 | – |
| Layout | CSS `:has()`, `dvh`, `inert` | ja | ab 121/101/112 | ab 15.4/15.4/15.5 | ältere Geräte: Darstellung prüfen |
| Zwischenablage | `navigator.clipboard` | ja | teils (Lesen eingeschränkt) | teils | Fehlermeldung |
| Offline/App | Service Worker, IndexedDB | ja | ja | ja (iOS löscht Daten nach längerer Nichtnutzung) | Hinweis zur Datensicherung |
| Browser-Erweiterung | Chrome-Extension | Chrome/Edge | nein | nein | – (Seite nennt Chrome/Edge) |
| Scanner (pdfmy Scan) | `fetch` an 127.0.0.1 | ja | ja | Safari: lokale Adressen evtl. gesperrt | **auf dem Mac mit Safari prüfen** |

## Prüfliste je Browser (manuell oder automatisiert)

1. Öffnen (Datei wählen, Ziehen), Seiten anzeigen, Vorschau, großes PDF (100+ Seiten)
2. Texterkennung eines Scans, Briefdaten, Suchen & Ersetzen
3. „Text ändern“ (Doppelklick), Absatz, Fälschungsschutz
4. Unterschrift zeichnen/hochladen, Unterschriftsstellen, Ort/Datum
5. Formularfelder erkennen und ausfüllen
6. Speichern als PDF und PDF/A, digitale Signatur, Mitunterzeichnen
7. Kamera-Scan (Handy), Teilen, Installieren / Offline
8. Scanner über pdfmy Scan (Windows: Chrome/Edge/Firefox; Mac: Safari/Chrome; Linux: Firefox/Chrome)
9. Barrierefreiheit: Tastatur, Screenreader (VoiceOver auf Mac/iPhone, NVDA unter Windows mit Firefox)

## Empfehlung

- **Automatisieren:** WebKit (Safari-Engine) und Firefox lassen sich mit Playwright auf diesem Rechner testen; der WebKit-Browser ist bereits vorhanden, es fehlen das npm-Paket `playwright-core` und der Firefox-Testbrowser (Download nötig). Damit laufen die bestehenden Funktionstests in allen drei Engines.
- **Echte Geräte (nicht automatisierbar):** iPhone/iPad (Kamera, Teilen, Home-Bildschirm, Texterkennungs-Geschwindigkeit), Mac mit Safari (pdfmy Scan über 127.0.0.1), Android-Handy (Kamera, Installieren).
