# mentor PDF – Bedienungsanleitung

Briefe einscannen, als **durchsuchbares PDF (PDF/A)** ablegen und bei Bedarf bearbeiten. Alles läuft lokal auf dem PC.
Es gibt keinen Upload, keine Cloud und kein Abo. Nach dem ersten Start funktioniert die App auch offline.

## 1. Einrichten (einmalig)
1. Den Ordner `ADOBE` an einen festen Ort kopieren, z. B. `C:\Programme\mentor PDF`.
2. **`install.bat`** doppelklicken. Danach liegen die Verknüpfungen **„mentor PDF“** und **„Brief scannen“** auf dem Desktop und im Startmenü.
3. „mentor PDF“ starten. Die App öffnet sich als eigenes Fenster in Microsoft Edge.
   - *Optional:* Im Edge-Menü **„Apps → mentor PDF installieren“** wählen. Danach öffnen sich PDFs per Rechtsklick → „Öffnen mit“ direkt in der App.
4. Unter **Einstellungen** einmal prüfen:
   - **Eigener Firmenname:** Voreingestellt ist „mentor“, damit ihr als Empfänger nie als Absender erkannt werdet.
   - **Ablageordner:** Am besten einen mit SharePoint oder OneDrive synchronisierten Ordner wählen. Dann landen die PDFs automatisch im DMS bzw. in SharePoint.

> Voraussetzung: Windows 10/11 mit Microsoft Edge oder Google Chrome. Andere Browser können Dateien nur herunterladen und keine Ordner überwachen.

## 2. Brief hereinholen
| Weg | So geht’s |
|---|---|
| **Multifunktionsgerät / Netzwerkscanner** | Das Gerät scannt in einen Ordner. In der App einmal **„Scan-Ordner verbinden“** klicken und diesen Ordner wählen. Jeder neue Scan erscheint dann nach etwa 2 Sekunden automatisch. |
| **USB-Scanner** | Verknüpfung **„Brief scannen“** (oder `scan.bat`) starten. Der Windows-Scandialog öffnet sich, die Seiten landen in `Scan-Eingang`. Diesen Ordner als Scan-Ordner verbinden. |
| **Datei** | Auf **„Dateien öffnen“** klicken oder PDF/JPG/PNG ins Fenster ziehen. Mehrere PDFs werden dabei zusammengeführt. |
| **Handy/Tablet** | **„Foto aufnehmen“**: Das Blatt wird automatisch erkannt, zugeschnitten und entzerrt. |

Automatisch passiert danach:
- Der Scan wird **aufbereitet**: Das Papier wird weiß, die Schrift kräftig.
- Schräge Scans werden **gerade gerichtet**, kopfüber oder quer eingelegte Seiten **gedreht**.
- Die **deutsche Texterkennung (OCR)** läuft.
- Die **Briefdaten** werden ausgefüllt: Datum, Typ, Absender, Betreff, Frist, Betrag, IBAN, Rechnungs-, Kunden- und Aktenzeichen.

Die Briefdaten bitte kurz prüfen, denn die Erkennung ist eine Hilfe und kann falsch liegen. Jedes Feld lässt sich überschreiben.

## 3. Bearbeiten
| Werkzeug | Zweck |
|---|---|
| **Text** | Auf die Seite klicken und schreiben, z. B. „Eingang 14.10.2026 – geprüft, KSt 4711“. Doppelklick bearbeitet den Text. |
| **Markieren** | Gelben Textmarker aufziehen. |
| **Abdecken** | Weißes Feld aufziehen. Damit wird Inhalt entfernt, z. B. um Text zu ersetzen: abdecken und neuen Text darüber schreiben. |
| **Schwärzen** | Echtes Schwärzen. Der verdeckte Text wird auch aus der Textebene **entfernt**, nicht nur übermalt. So lassen sich Kopien sicher weitergeben. |
| **Unterschrift** | Einmal zeichnen, dann auf die Seite klicken. Die Unterschrift lässt sich verschieben und über die Ecke in der Größe ändern. |
| **Zuschneiden** | Blattecken setzen. Die Perspektive wird entzerrt (für Fotos). |
| ⟲ ⟳ / Scan-Modus | Seite drehen. Aufbereitung wählen: Dokument, Schwarzweiß (kleinste Datei), Graustufen oder Farbe. |
| Seitenleiste | Seiten per Drag & Drop sortieren, mit × löschen, mit ✂ als „Brief endet hier“ markieren. |

Tastatur: **Strg+S** speichert, **Strg+Z** macht rückgängig, **Entf** löscht das gewählte Element, **Bild↑/Bild↓** blättert.

## 4. Speichern & Ablegen
- **PDF speichern** erzeugt ein durchsuchbares PDF mit Dateinamen nach dem Schema `Datum_Typ_Absender_Betreff.pdf`, z. B.
  `2026-10-07_Rechnung_Stadtwerke Musterstadt GmbH_Nr. 2026-48213 — Stromlieferung September 2026.pdf`.
- Ist ein **Ablageordner** gewählt, speichert die App ohne Dialog direkt dort. Standard ist ein Unterordner je **Dokumenttyp** (`Rechnung\…`); optional kommt ein Unterordner je **Jahr** dazu.
- **Frist:** Mit **„Termin“** entsteht ein Kalendereintrag (.ics) mit Erinnerung 3 Tage vorher. Ein Doppelklick übernimmt ihn in Outlook. Beim Ablegen in den Ablageordner wird der Termin automatisch daneben gelegt.
- **PDF/A-2b** (Standard) ist das Archivformat für die revisionssichere Ablage. Seiten werden dabei als Bild mit unsichtbarer Textebene gespeichert. Für eine Weitergabe mit Original-Vektorinhalt (z. B. ein PDF bearbeiten, das ihr per E-Mail bekommen habt) PDF/A in den Einstellungen ausschalten.
- **Leere Seiten** werden beim Speichern automatisch weggelassen.

### Mehrere Briefe auf einmal (Stapel)
Zwischen die Briefe je ein **leeres Blatt** legen und alles in einem Durchgang scannen. Alternativ in der Seitenleiste mit ✂ markieren, wo ein Brief endet.
Dann **„Stapel trennen“** klicken. Jeder Brief wird einzeln erkannt, benannt und im Ablageordner abgelegt.

## 5. Datenschutz
- Dokumente verlassen den PC nie. OCR, Analyse und PDF-Erzeugung laufen im Browser.
- Der mitgelieferte Mini-Server (`start.ps1`) ist nur unter `localhost` erreichbar und liefert ausschließlich die App-Dateien aus.
- Die Unterschrift wird nur gespeichert, wenn „Unterschrift merken“ aktiv ist, und dann nur im Browser dieses PCs.

## 6. Probleme lösen
| Problem | Lösung |
|---|---|
| App startet nicht | `start.bat` direkt ausführen und die Meldung im Fenster lesen. Port 8765 muss frei sein. |
| „Scan-Ordner“ / „Ablageordner“ fehlt | Edge oder Chrome verwenden. Die Ordner-Freigabe muss nach jedem Neustart der App einmal bestätigt werden. |
| Texterkennung schlecht | Mit 300 dpi scannen, Modus „Dokument“, dann **OCR neu**. Handyfotos bei gutem Licht und auf dunklem Untergrund aufnehmen. |
| Briefdaten falsch | Felder einfach überschreiben. Der Dateiname passt sich automatisch an. |
| Scanner nicht gefunden (`scan.bat`) | Der Scanner muss in Windows unter „Drucker & Scanner“ eingerichtet sein (WIA-Treiber des Herstellers). |

## Neu in Version 1.1
- **Scanner/Multifunktionsgerät:** „Scan to Folder“ in einen Ordner, pdfmy übernimmt jeden Scan automatisch. Die Einrichtung macht `scanordner-einrichten.ps1`, die Anleitung steht unter https://pdfmy.de/scanner.html. Der Ordner wird gemerkt, nach einem Neustart genügt ein Klick.
- **Mehrseitige Scan-PDFs** laufen durch die volle Scan-Aufbereitung: gerade richten, kopfüber gescannte Seiten drehen, Leerseiten entfernen, Farbe automatisch erkennen.
- **Kompakt-Speicherung (MRC wie bei ABBYY/Acrobat):** Die Schrift wird als scharfe 1-Bit-Ebene gespeichert, der Hintergrund nur bei Bedarf. Typisch sind 15–45 KB pro Seite statt 150–500 KB, PDF/A-konform.
- **Bedienung:** aufgeräumte Kopfzeile mit Mehr-Menü, Werkzeug-Optionen nur im passenden Moment, „Speichern unter …“, Hilfe mit Tastenkürzeln (Taste `?`).
- **Neue Werkzeuge:** Stempel mit Datum („Eingegangen“, „Bezahlt“ …), Freihand-Stift, Drucken (Strg+P), Teilen, Wiederherstellen (Strg+Y), Suchtreffer-Markierung auch in normalen PDFs.

## Neu in Version 1.2 – Pro-Funktionen
- **Ablegen & nächster** (Strg+Enter): Ein Klick legt den Brief mit erkanntem Namen als PDF/A in die Ablage, trägt ihn ins Posteingangsbuch ein und beginnt den nächsten. Mit pdfmy Scan öffnet sich gleich wieder der Scan-Dialog.
- **Posteingangsbuch & Fristen:** Jeder abgelegte Brief wird automatisch eingetragen (Eingang, Absender, Typ, Betreff, Frist, Betrag, Aktenzeichen, Datei, „Abgelegt von“). Das Buch ist durchsuchbar und filterbar, erledigte Briefe lassen sich abhaken, und jeder Brief öffnet sich direkt aus dem Buch. Die Startseite zeigt die nächsten Fristen, überfällige rot.
  Mit Ablageordner wird das Buch dort als **`Posteingangsbuch.csv`** geführt. Die Datei öffnet sich in Excel, und liegt die Ablage in SharePoint oder OneDrive, arbeitet das **ganze Team im selben Buch**.
- **Notizen** (Werkzeug „Notiz“): gelbe Kommentarzettel mit Datum und Kürzel. Sie werden mitgespeichert und gedruckt, PDF/A-konform.
- **Kopf-/Fußzeile und Bates-Nummerierung** (Speichern → „Seitenzahlen, Kopf-/Fußzeile, Bates …“) mit Platzhaltern `{seite} {seiten} {datum} {datei} {bates}`. Die Bates-Nummer zählt beim nächsten Dokument automatisch weiter, z. B. für Akten, Gericht und Prüfungen.
- **Lesezeichen:** Beim Zusammenfügen bekommt jede Datei bzw. jeder Brief (✂) ein Lesezeichen mit Typ, Absender und Betreff.
- **PDF in Word** (.docx) aus Scans und PDFs.
- **Dokumente vergleichen:** Zwei Fassungen werden gegenübergestellt, Änderungen sind farbig markiert, „Nächste Änderung“ springt weiter. Das geht auch bei Scans (per Texterkennung).
- **Stapelverarbeitung:** Viele Dateien auf einmal durchlaufen OCR, Briefdaten, PDF/A und Benennung und werden abgelegt und eingetragen.
- **Einstellungen:** „Ihr Name oder Kürzel“ erscheint im Posteingangsbuch und auf Notizen.

## Neu in Version 1.3 – aus dem Wettbewerbsvergleich
- **E-Rechnungen (ZUGFeRD, Factur-X, XRechnung CII/UBL):** Die Daten kommen verbindlich aus dem XML, auch reine `.xml`-Dateien lassen sich öffnen. Beim Ablegen werden das Original-XML (GoBD) und bei ZUGFeRD die unveränderte Originaldatei gespeichert.
- **GiroCode:** Bei Rechnungen mit IBAN und Betrag erscheint ein QR-Code für die Banking-App.
- **Archivsuche:** Das Posteingangsbuch durchsucht auch den Text aller PDFs im Ablageordner, auch von Kollegen abgelegte. Treffer werden markiert.
- **Dubletten-Warnung:** Bevor ein bereits abgelegter Brief noch einmal abgelegt wird, fragt das Programm nach. Die Stapelverarbeitung überspringt Dubletten.
- **Lernende Ablage:** Korrigiert man den Typ eines Absenders, gilt die Korrektur beim nächsten Brief automatisch, mit Ablageordner teamweit (`pdfmy-Regeln.json`).
- **Schwärzen-Vorschläge:** Werkzeug „Schwärzen“ → „Persönliche Daten finden“ markiert IBAN, E-Mail, Telefon, Steuer-ID, Geburtsdatum und SV-Nummer.
- **Revisionssicherheit:** Jede abgelegte Datei bekommt eine SHA-256-Prüfsumme im Posteingangsbuch. „Unverändert? Prüfen“ kontrolliert die Ablage.
- **Interne Version:** heißt jetzt „PDFMy – powered by Mentor Group“.

## Neu in Version 1.4 – Teamarbeit im Posteingangsbuch
- **Status je Brief:** offen → in Arbeit → bezahlt / erledigt, direkt in der Tabelle umstellbar. Bezahlte und erledigte Briefe verschwinden aus den Fristen.
- **Zuständig:** Den Namen oder das Kürzel kann man schon beim Scannen (Briefdaten → „Zuständig“) oder später in der Tabelle setzen.
- **Meine Post:** Der Filter und der Link auf der Startseite zeigen alle offenen Briefe, für die man selbst zuständig ist. Dafür das eigene Kürzel unter Einstellungen eintragen.
- **Weiterleiten:** Setzt den Kollegen als zuständig (Status „in Arbeit“) und öffnet eine fertige E-Mail mit allen Briefdaten, Frist und Ablagepfad. E-Mail-Adressen merkt sich das Team in `pdfmy-Team.json` im Ablageordner.
- **Neues Design:** ruhige, einheitliche Oberfläche im Mentor-Group-CI mit Lucide-Symbolen (lokal unter `vendor/lucide`, Sprite per `node tools/icons.js`). pdfmy.de heißt jetzt „PDFMy – powered by Mentor Group“.
- **Befehlssuche (Strg+K):** jede Funktion per Stichwort finden, z. B. „schwärzen“, „Word“ oder „Fristen“.
- **Schnellere Texterkennung:** Bis zu 3 Seiten werden gleichzeitig erkannt, mehrseitige Scans sind etwa doppelt so schnell.
- **Stapel ohne Trennblatt:** „Stapel trennen“ erkennt neue Briefe auch am Inhalt (Anrede, Datum, neuer Absender, „Seite 1 von“). Die Trennstellen werden zur Kontrolle mit ✂ markiert.
- **Belege für den Steuerberater (DATEV):** Unter „Mehr“, als Kachel oder im Posteingangsbuch: Man wählt einen Monat und die Belegarten (Rechnungen, Gutschriften und Bescheide sind vorausgewählt). Heraus kommt eine ZIP-Datei mit allen PDFs (E-Rechnungen mit Original-XML), der Belegliste `Belegliste_JJJJ_MM.csv` für Excel (Belegdatum, Absender, Rechnungs-Nr., Betrag, Status, Prüfsumme) und der DATEV-Importdatei `document.xml` (XML-Schnittstelle online, Belegbilder). Optional öffnet sich eine fertige E-Mail an die Steuerberatung, die ZIP-Datei hängt man selbst an.
- **Updates:** Neue Versionen werden automatisch erkannt (alle 10 Minuten, beim Zurückkehren zum Tab und wenn die Verbindung wieder da ist). Ist gerade kein Dokument offen, wechselt PDFMy sofort auf die neue Version, sonst erscheint unten rechts „Neue Version: jetzt neu laden“. „Mehr → Updates suchen“ prüft auf Knopfdruck und zeigt den installierten Stand. Die Hilfe zeigt den Stand ebenfalls an.
- **Mit dem Handy scannen:** Über die Kachel „Mit dem Handy scannen“ oder „Mehr → Mit Kamera scannen“ öffnet sich die Kamera mit Live-Blatterkennung (grüner Rahmen). Liegt das Blatt kurz ruhig, nimmt PDFMy es automatisch auf (Fortschrittsring am Auslöser), schneidet es zu und entzerrt es. Danach einfach das nächste Blatt hinlegen, das gleiche Blatt wird nie doppelt aufgenommen. Seiten in der Leiste antippen verwirft sie. „Fertig“ übernimmt alle Seiten mit Texterkennung und Briefdaten. Der Automatik-Schalter und das Licht (falls vorhanden) sitzen oben, verwackelte Bilder werden nicht automatisch aufgenommen. Ohne Kamerazugriff öffnet sich die normale Fotoauswahl.
- **Teilen** (Knopf „Teilen“ oben, auch im Posteingangsbuch): Auf dem Handy öffnet sich das Teilen-Menü des Systems mit WhatsApp, Telegram, Webex, Signal, E-Mail, Google Drive und „In Dateien sichern“. Am PC kommt das Windows-Teilen (Outlook, Teams, WhatsApp, Telegram, Webex, je nach Installation). Dazu gibt es **„E-Mail mit Anhang (Outlook)“**: Es wird eine .eml-Datei erzeugt, die sich in Outlook als neue Nachricht mit dem PDF als Anhang öffnet.
- **Handy (Android und iPhone):** Speichern läuft über das Teilen-Menü, „Ablegen & nächster“ funktioniert auch ohne Ablageordner. Speicher- und Rechenlast sind an Handys angepasst. Zum Startbildschirm hinzugefügt, läuft PDFMy als App „PDFMy“ im Vollbild.
- **Beidseitig scannen (pdfmy Scan 1.3.0):** Auch bei Scannern mit Windows-Treiber (WIA), z. B. **Epson DS-730N** mit Epson Scan 2, erscheint jetzt „Beidseitig“. PDFMy merkt sich die Wahl. Leere Rückseiten werden automatisch entfernt, und „Stapel trennen“ trennt bei beidseitigen Scans nur an ganz leeren Trennblättern (Vorder- und Rückseite leer). Netzwerkscanner ohne Treiber (eSCL/AirScan) konnten das schon vorher.
- **Versionen immer sichtbar:** Unten rechts in der Statuszeile steht der PDFMy-Stand und die installierte pdfmy-Scan-Version (mit Hinweis, wenn ein Update bereitsteht; ein Klick sucht nach Updates). pdfmy Scan zeigt seine Version im Symbol unten rechts in der Taskleiste (Tooltip und Menü) und steht in Windows unter **Einstellungen → Apps → Installierte Apps** als „pdfmy Scan 1.3.1“, von dort lässt es sich auch deinstallieren.
- **pdfmy Scan 1.3.1:** Das Update über eine laufende ältere Version ist zuverlässig. Vorher konnte sich die frisch installierte Kopie gleich wieder beenden. Klappt das Kopieren nicht, erscheint eine Meldung, statt dass das Programm still scheitert.
- **pdfmy Scan 1.3.2:** Für beidseitiges Scannen mit Windows-Treibern gibt es jetzt eine Rückfallkette (beidseitig als JPEG, dann im Standardformat, notfalls einseitig mit Hinweis „nur Vorderseiten“). Einseitiges Scannen ändert wie in 1.2.0 nichts an der Einzugs-Einstellung. Die Fähigkeiten-Abfrage gibt die Geräteverbindung sofort wieder frei, und Einzugsscanner ohne Glas (z. B. DS-730N) werden nicht mehr erfolglos „auf dem Glas“ versucht.
- **pdfmy Scan 1.4.0 – beidseitig über TWAIN:** Manche WIA-Treiber lehnen beidseitiges Scannen grundsätzlich ab (Epson DS-730N mit Epson Scan 2: alle Varianten mit 0x80070057). pdfmy Scan nutzt bei „Beidseitig“ deshalb zuerst die TWAIN-Schnittstelle des Herstellers (ohne dessen Dialog). Gibt es keinen passenden TWAIN-Treiber, folgt die WIA-Rückfallkette. pdfmy Scan läuft dafür als 32-Bit-Programm. Für den Support schreibt `pdfmy-Scan.exe --twain-test` den TWAIN-Manager und die gefundenen Quellen ins Protokoll.
- **Problem melden (Fehlerbericht per E-Mail):** Über „Mehr → Problem melden“, im Fehlerfenster und im Protokoll-Fenster des Scanners lässt sich ein Fehlerbericht an **wumertens@mentor-group.de** senden (Adresse in `js/config.js` → `supportMail`). Er enthält die Versionen, das Protokoll von pdfmy Scan, die letzten Meldungen und Programmfehler, aber keine Dokumente. Am PC öffnet sich eine Outlook-Nachricht mit dem Protokoll als Anhang, alternativ das Standard-Mailprogramm (dann liegt das vollständige Protokoll in der Zwischenablage).
- **Updates für pdfmy Scan (ab 1.4.1):** PDFMy zeigt bei einer veralteten Version einen Hinweis „pdfmy Scan X ist verfügbar – Jetzt aktualisieren“. pdfmy Scan prüft außerdem selbst kurz nach dem Start und dann alle 6 Stunden `pdfmy.de/download/version.json` und bietet das Update unten rechts in der Taskleiste mit einem Klick an. Es lädt die neue Version herunter, die sich dann selbst installiert. Im Tray-Menü gibt es zusätzlich „Nach Updates suchen“.
- **Gleichzeitiges Arbeiten:** Jede Änderung trägt einen Zeitstempel. Arbeiten mehrere Kollegen im selben Buch, gilt die zuletzt gemachte Änderung.

## Design
- **Interne Version „mentor PDF“** im Mentor-Group-CI: Mentor-Blau `#4A5280`, Logo, Archivo (breit/kursiv) und Source Sans 3. Die Schriften liegen lokal unter `vendor/fonts`, es gibt keine Google-Verbindung. Gesteuert über `theme: 'mentor'` in `js/config.js`.
- **pdfmy.de** bleibt neutral. Der Web-Build ersetzt `js/config.js` und lässt Mentor-Schriften, Logo und Symbole weg.
- **https://pdfmy.de/mentor/**: die Mentor-Version für das Team. Sie ist per Passwort geschützt (Benutzer `mentor`) und für Suchmaschinen gesperrt. Ein neues Passwort setzt man mit `tools\mentor-passwort.ps1` und veröffentlicht es dann mit `tools\deploy.ps1`.

## Öffentliche Web-Version pdfmy.de
- **Live:** https://pdfmy.de. Dieselbe App mit neutralem Branding „pdfmy“, Startseite mit Aufgaben-Kacheln, Impressum und Datenschutzerklärung.
- **Neue Version veröffentlichen:** `tools\deploy.ps1` baut nach `dist\pdfmy.de` und lädt nur geänderte Dateien per SFTP hoch. Mit `-DryRun` wird nur angezeigt, was sich ändern würde.
- **Zugang:** Der IONOS-SFTP-Benutzer ist auf `/public/pdfmy` beschränkt. Das Passwort liegt DPAPI-verschlüsselt in `.deploy\credential.xml` und ist nur mit diesem Windows-Konto lesbar. Neu hinterlegen mit `tools\deploy-setup.ps1`.
- **Impressum/Betreiber** stehen in `tools\site.json`. Der Build bricht ab, wenn Pflichtangaben fehlen.
- **Server-Konfiguration** (`.htaccess`, wird beim Build erzeugt): HTTPS- und www-Weiterleitung, CSP, HSTS, korrekte MIME-Typen für WebAssembly und OCR-Daten, Sperre interner Dateien.

## Normen und Qualität (ISO)
- **Barrierefrei:** Jedes PDF/A ist zugleich PDF/UA-1 (ISO 14289-1): getaggte Textebene in Lesereihenfolge, Unterschrift mit Alternativtext, Seitenelemente als Artefakt. Geprüft mit veraPDF.
- **Nachweis:** `docs/ISO-Konformitaet.md` beschreibt PDF/A (ISO 19005-2), PDF (ISO 32000), ISO 27001 und ISO 9001, dazu Prüfergebnisse und einen Maßnahmenplan.
- **Änderungen:** `CHANGELOG.md`. **Veröffentlichungen:** `docs/RELEASES.md`, wird automatisch geschrieben.
- **Freigabe:** `tools\deploy.ps1` veröffentlicht nur, wenn alle Tests bestehen.

## Für die IT
- **Aufbau:** `index.html` + `js/app.js` (Oberfläche, PDF-Erzeugung), `js/letter.js` (Briefanalyse), `js/imaging.js` (Bildverarbeitung), `js/journal.js` (Posteingangsbuch als CSV, Fristen), `js/pro.js` (Posteingangsbuch-Fenster, Ablegen & nächster, Vergleich, Stapel).
  `vendor/` enthält die festen Versionen von pdf-lib 1.17.1, fontkit 1.1.1, pdf.js 3.11.174, Tesseract.js 5.1.1 mit deutschen Sprachdaten, die Schrift DejaVu Sans und ein sRGB-ICC-Profil. Lizenzen liegen in `vendor/licenses`.
- **Tests:** `node --test "tests/*.test.js"` (Briefanalyse, Dateiname, IBAN-Prüfung, Kalendereintrag, Posteingangsbuch/Fristen, Word-Export, Vergleich, Bates).
- **PDF/A:** Die erzeugten Dateien wurden mit veraPDF 1.30 gegen PDF/A-2b geprüft (PASS).
- **Verteilung:** Den Ordner auf die PCs kopieren und `install.bat` ausführen. Es sind keine Adminrechte und keine Installation von Laufzeiten nötig.
- `beispiel/` enthält künstlich erzeugte Testbriefe (schief, kopfüber, Handyfoto, Leerseite) zum Ausprobieren.
