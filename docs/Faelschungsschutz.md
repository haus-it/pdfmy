# Fälschungsschutz in PDFMy

Stand: 17.10.2026 · Verantwortlich: Mentor GmbH · Bezug: ISO 27001 (A.5.1, A.8.25), ISO 9001 (8.3)

> Keine Rechtsberatung. Die rechtliche Einordnung unten ist eine fachliche Einschätzung und sollte vor Veröffentlichung von Nutzungsbedingungen durch eine Anwältin oder einen Anwalt geprüft werden.

## 1. Ziel

PDFMy soll ehrliche Arbeit leicht machen (Briefe beantworten, Formulare ausfüllen, Schwärzen, Unterschreiben, Tippfehler in eigenen Dokumenten korrigieren) – aber **Betrügern die Arbeit nicht erleichtern**. Mit der originalgetreuen Funktion „Text ändern“ (gleiche Schrift, Farbe, Breite) ist das besonders wichtig.

## 2. Wovor wir uns schützen müssen (Bedrohungen)

| Ziel der Fälschung | typischer Zweck | Beispiele |
|---|---|---|
| Kontoauszug | Kredit, Wohnung, Visum, Einkommensnachweis | Saldo oder Gehaltseingang erhöhen |
| Einkommensnachweis | Kredit, Wohnung, Sozialleistung | Gehaltsabrechnung, Verdienstbescheinigung |
| Steuerbescheid und andere Bescheide | Kredit, Förderung, BAföG, Wohngeld | Einkommen oder Festsetzung ändern |
| Urkunden, Zeugnisse | Bewerbung, Behörden | Noten, Namen, Daten ändern |
| Ausweise, Aufenthaltstitel | Identitätsbetrug | Name, Geburtsdatum |
| Urteile, Beschlüsse, Mahn-/Vollstreckungsbescheide | Druck auf Dritte, Täuschung | Beträge, Fristen |
| Rechnungen, Quittungen, Belege | Spesen-, Vorsteuer-, Versicherungsbetrug | Beträge, Daten |
| SCHUFA-/Bonitätsauskunft, Mietschuldenfreiheit | Wohnung, Kredit | Score, Einträge |

## 3. Rechtlicher Rahmen (Einschätzung)

- **§ 267 StGB Urkundenfälschung**, **§ 269 StGB Fälschung beweiserheblicher Daten**, **§ 263 StGB Betrug** – Täter ist die Person, die fälscht. Ein allgemeines Werkzeug ist grundsätzlich eine „neutrale Handlung“.
- **§ 27 StGB Beihilfe**: Das Risiko steigt, wenn ein Anbieter das Fälschen erkennbar fördert, etwa durch Werbung („Kontoauszug ändern“, „Zeugnis anpassen“) oder Funktionen, die gezielt auf Täuschung zielen. → **Nie so werben**, Schutzfunktionen dokumentieren (dieses Dokument).
- **§ 275 StGB Vorbereitung der Fälschung amtlicher Ausweise** nennt ausdrücklich Computerprogramme, die ihrer Art nach zur Tat geeignet sind. PDFMy ist ein allgemeines PDF-Werkzeug; Ausweise sind trotzdem gesperrt, um jeden Anschein zu vermeiden.
- **§ 146 Abs. 4 AO, GoBD (Unveränderbarkeit, Nachvollziehbarkeit)**: Wer mit PDFMy steuerrelevante Belege ablegt, darf sie nicht unbemerkt verändern. → Änderungen sind sichtbar und in den Dokumenteigenschaften vermerkt; das Original bleibt unverändert (PDFMy schreibt immer eine neue Datei).
- **Kein Hosting**: PDFMy verarbeitet alles im Browser, wir sehen keine Inhalte (gut für Datenschutz, keine Haftung als Host). Folge: Der Schutz muss **in der App selbst** stecken.

## 4. Umgesetzte Maßnahmen (17.10.2026)

| Dokumentart (Erkennung) | „Text ändern“ / „Abdecken“ | weitere Werkzeuge |
|---|---|---|
| **Urkunden, Meister- und Gesellenbriefe, Zeugnisse, Ausweise, amtliche Bescheide (z. B. Steuer-, Renten-, Bewilligungsbescheid), Urteile, Beschlüsse, Mahn-/Vollstreckungsbescheide, notarielle Urkunden, Erbschein, Grundbuch** | **gesperrt** mit Erklärung | Schwärzen (sichtbar schwarz), Markieren, Notizen, Unterschrift bleiben möglich; hinzugefügter Text löst den Vermerk aus |
| **Kontoauszüge** (auch Folgeseiten im selben PDF) | erlaubt, aber **rot gestrichelt markiert** | Vermerk unten auf der Seite: „Seite nachträglich geändert (PDFMy, Datum) – kein Originalbeleg der Bank“ |
| **Nachweise**: Gehalts-/Entgeltabrechnung, Verdienst-/Arbeitgeberbescheinigung, SCHUFA/Bonität, Mietschuldenfreiheit, Versicherungsnachweis, Rechnung, Quittung, Beleg | erlaubt, aber **rot markiert** | Vermerk „… – kein Originaldokument des Ausstellers“ |
| **digital signierte PDFs** (jede Dokumentart) | vor der ersten Änderung einmal je Dokument **deutliche Warnung**: Signatur wird ungültig, neue Datei ohne gültige Signatur (Abbrechen vorausgewählt) | gilt auch für das Text-Werkzeug; Original bleibt gültig |
| alle Dokumente | Abdeckungen werden beim Speichern eingebrannt, der verdeckte Text wird aus der Textebene entfernt | Stichwort „nachträglich geändert (PDFMy)“ in Info und XMP, sobald Text ersetzt oder abgedeckt wurde |

Die Regeln gelten für „Text ändern“, „Abdecken“, das Text-Werkzeug und **Suchen & Ersetzen** (seit 17.10.2026: Urkunden/Bescheide werden übersprungen, Nachweise markiert).

Technik: `Letter.protectedKind()` (js/letter.js, Unit-Tests in tests/letter.test.js) wertet den Seitentext aus (PDF-Text oder OCR). Titel zählen nur am Zeilenanfang im Kopf der Seite, Aufzählungen nicht – ein Brief, der „eine Kopie des Steuerbescheids“ anfordert, bleibt bearbeitbar. Markierung und Vermerk werden **beim Speichern erzwungen** (`protMarkCanvas`, buildPdf), unabhängig davon, wie die Änderung entstanden ist; bei Scans mit Abdeckung wird dafür immer Text erkannt. Markierung und Vermerk sind Teil des Seitenbilds und lassen sich in PDFMy nicht entfernen.

Signierte PDFs: `d.signed` wird in `checkSignatures` (js/pro.js) gesetzt, sobald eine Signatur in der Datei steckt; `sigWarn()` (js/app.js) zeigt den Dialog `#sigWarnDlg` vor `editLineAt`, dem Abdecken- und dem Text-Werkzeug. Geprüft per Browsertest mit signiertem Test-PDF (echte Maus, Abbrechen/Escape/Trotzdem, PDF ohne Signatur) und axe-core hell/dunkel/mobil.

Geprüft: Browsertest (Kontoauszug markiert und mit Vermerk, Steuerbescheid gesperrt für „Text ändern“ und „Abdecken“ mit echter Maus), veraPDF PDF/A-2b und PDF/UA-1 PASS, axe-core 0 Verstöße.

## 5. Grenzen (ehrlich benannt)

- Erkennung über Text: Ungewöhnliche Layouts oder sehr schlechte Scans können unerkannt bleiben. Lieber einmal zu viel markieren als zu wenig – die Markierung schadet ehrlicher Nutzung nicht.
- PDFMy läuft im Browser; technisch versierte Personen können Code verändern oder andere Programme (Bildbearbeitung) nutzen. Der Schutz ist eine **Hürde und ein Signal**, kein absoluter Schutz – er verhindert, dass PDFMy das bequemste Fälschungswerkzeug ist.
- Kein Schutz für Dokumente, die als Bild ohne erkennbaren Text vorliegen und gar nicht abgedeckt werden.

## 6. Empfehlungen / offene Punkte

| Nr. | Maßnahme | Priorität |
|---|---|---|
| F1 | **Nutzungsbedingungen** mit Verbot missbräuchlicher Nutzung (Fälschung, Täuschung) auf pdfmy.de – Entwurf anwaltlich prüfen lassen – **Entwurf liegt vor (17.10.2026): docs/Nutzungsbedingungen-Entwurf.md**, noch nicht veröffentlicht | hoch |
| F2 | Werbung, Hilfe, Pressetexte: nie mit dem Ändern fremder Dokumente werben („Kontoauszug/Zeugnis ändern“) – nur „eigene Dokumente korrigieren“ | hoch (laufend) |
| F3 | ~~Digital signierte PDFs: vor „Text ändern“ deutlich warnen, dass die Signatur ungültig wird~~ – **erledigt 17.10.2026** (siehe Abschnitt 4) | erledigt |
| F4 | Optional: Herkunftsnachweis (C2PA/Content Credentials) für geänderte PDFs | niedrig |
| F5 | Erkennungsliste jährlich und nach Hinweisen von Nutzern erweitern; Fehlalarme über die Fehlermeldung (wumertens@mentor-group.de) sammeln | laufend |
