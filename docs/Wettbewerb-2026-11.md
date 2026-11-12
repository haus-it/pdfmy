# PDFMy – Wettbewerbs- und Lückenanalyse (Stand 09.11.2026)

**Grundlage:** Repo-Stand `main` (app-v241): KONZEPT.md (Abschnitt 4 Leitplanken und alle Prüfungen bis 09.11.2026), CHANGELOG.md, tools/site/hilfe.html, tools/site/werkzeuge.json (38 Einstiegsseiten), index.html (35 Aufgaben-Kacheln `data-intent`), dazu Stichproben im Code (js/*.js). Wettbewerberangaben stammen aus Websuche am 09.11.2026. Viele Treffer sind Herstellerseiten oder Vergleichsportale. **Wo nur eine Sekundärquelle vorliegt, steht „(Sekundärquelle)“, und nichts davon ist im Produkt selbst getestet.**

**Methode:** Jede Aussage „PDFMy fehlt X“ wurde per grep in `js/`, `index.html`, `tools/site/` und den Konzeptdateien geprüft. Der Befund steht jeweils in der Zeile „Repo-Check“. Was in KONZEPT.md schon umgesetzt, verworfen oder „beobachten“ ist, wird nicht neu vorgeschlagen, sondern höchstens als „offen laut KONZEPT“ erwähnt.

**Leitplanken (Kurzform):** L1 alles bleibt auf dem Gerät · L2 kein Server, keine Cloud-KI · L3 kostenlos, ohne Konto, ohne Tracking · L4 einfach · L5 normgerecht und prüfbar (PDF/A, PDF/UA, ISO 27001/9001) · L6 wenig aktive Inhalte.

---

## 1. Kurzfazit: Wo PDFMy schon führt (mit Beleg)

| Bereich | PDFMy (Beleg im Repo) | Wettbewerb |
|---|---|---|
| **Kein Upload, und das ist prüfbar** | „Datenschutz selbst prüfen“: Verbindungen und gesendete Bytes live, Prüfsummenabgleich der laufenden Programmdateien gegen GitHub (hilfe.html, „Programmstand prüfen“; KONZEPT 21.10.2026 (2)) | iLovePDF, Smallpdf, Sejda und PDF24 online laden hoch. Acrobat-KI und PDF Spaces laufen in der Cloud ([Adobe Release Notes](https://helpx.adobe.com/uk/acrobat/desktop/whats-new/release-notes.html)). Der PDFgear-Chatbot nutzt die OpenAI-API ([pdfgear.com/chat-pdf](https://pdfgear.com/chat-pdf)). |
| **Ohne Limit, Konto und Abo** | hilfe.html FAQ „Was kostet PDFMy?“ | Sejda Desktop: 3 Aufgaben pro Tag, 50 MB, 200 Seiten ([sejda.com/desktop](https://www.sejda.com/desktop)). Smallpdf und iLovePDF haben Limits und Upsell. Acrobat, Foxit und Nitro kosten im Abo. |
| **Briefintelligenz** (Absender, Betrag, IBAN, Frist → Dateiname, Kalender, GiroCode, Posteingangsbuch, Akten, GoBD-Prüfprotokoll, Kontoauszug-Abgleich, DATEV) | hilfe.html „Briefe ablegen und Fristen“ | Kein Wettbewerber bietet das kostenlos und lokal. Acrobat bietet nur KI-Zusammenfassungen (Cloud, Abo). |
| **Signatur-Workflow ohne Server** (Reihenfolge, Vorlagen, Serienversand, Erinnern, Ablehnen, Kopie zur Kenntnis, Prüfprotokollseite mit SHA-256, Gesendet/Empfangen/Gelesen, Messenger-Lesebestätigung, Acrobat-Reader-kompatible Felder) | hilfe.html „Zur Unterschrift senden“, js/sigreq.js | DocuSign bietet das mit Server und Konto, Bulk Send erst im Tarif Business Pro ([DocuSign Features](https://www.docusign.com/products/electronic-signature/features), [erpresearch](https://www.erpresearch.com/erp-add-ons/esignature/docusign), Sekundärquelle). |
| **Digitale Signatur PAdES** mit .p12 oder Windows-Zertifikat bzw. Signaturkarte, RFC-3161-Zeitstempel, Mitunterzeichnen, Signaturprüfung | hilfe.html „Digitale Signatur“, CHANGELOG pdfmy Scan 1.8.0 | Bei Acrobat und Foxit im Abo. Kostenlose Web-Tools bieten das kaum. |
| **Vorabprüfung beA/ERV, ePA, BITV/PDF/UA, GoBD** mit „Automatisch beheben“ und Bericht | js/preflight.js, KONZEPT 23.10.2026 | Preflight gibt es sonst nur in Acrobat Pro ([mapsoft](https://mapsoft.com/posts/acrobat-standard-vs-pro.html), Sekundärquelle). |
| **PDF barrierefrei machen** (Auto-Tagging H1/H2, Listen, Tabellen, mit veraPDF und NVDA geprüft) | KONZEPT 23.10.2026, app-v184/185 | „Automatisch taggen“ gibt es in Acrobat Pro. Kostenlose Tools können es kaum. |
| **Scan-Kette** (eSCL/WSD ohne Treiber, Patchcode-Trennblätter, Duplex durch Wenden, Hot Folder im Browser, Kamera-Scan mit Entzerrung, Spiegelungs- und Schärfehinweis) | hilfe.html „Scannen“ | Acrobat erkennt keine Patchcodes (KONZEPT). Hot Folder bietet ABBYY nur unter Windows ([Sekundärquelle](https://aiproductivity.ai/vs/abbyy-finereader-vs-adobe-acrobat/)). |
| **E-Rechnung** lesen, prüfen (EN 16931) und schreiben (ZUGFeRD, XRechnung) | hilfe.html „E-Rechnung“ | Bei keinem genannten Wettbewerber ist das kostenlos und lokal (nicht systematisch geprüft). |
| **Formulare:** Felder erkennen, Rechenfelder, XFDF/FDF/CSV, Serienausfüllung, „Meine Angaben“ | hilfe.html „Formulare“, app-v220 | Datenzusammenführung gibt es nur in Acrobat Pro. Sejda hat sie kostenpflichtig und mit Upload (KONZEPT 04.11.2026). |
| **Lokale KI** (Browser-KI, Ollama, LM Studio), Übersetzen ohne Upload | hilfe.html „Zusammenfassen und fragen“ | **Kein Alleinstellungsmerkmal mehr:** Foxit 2026.2 bietet On-Device-KI über Foundry Local, allerdings im KI-Abo ([Foxit-Blog](https://www.foxit.com/blog/foxit-pdf-editor-2026-2-local-ai/), [PDF Association](https://pdfa.org/?p=236889)). |

**Gesamtbild:** Funktional ist PDFMy beim Büroalltag (Post, Ablage, Fristen, Kanzlei, E-Rechnung) **vorn**. Bei Datenschutz und Preis ist es **konkurrenzlos**. Bei Signatur-Workflows ohne Server ist es **einzigartig**. Die verbleibenden Lücken liegen weniger bei der Zahl der Funktionen als bei der **Qualität und Treue** (OCR, Office-Umwandlung, Bearbeiten von Objekten), bei der **Verteilung** (Stores, Firmen-Rollout, iOS) und bei einigen **Signatur-Feinheiten**.

---

## 2. Lücken, gereiht nach Nutzen × Machbarkeit unter den Leitplanken

Aufwand: **S** bis 2 Tage, **M** etwa 1–2 Wochen, **L** mehr als 2 Wochen oder mit Forschungsanteil.

### Rang 1: OCR-Genauigkeit messen und optional ein genaueres Modell anbieten
- **Wer hat es:** ABBYY FineReader gilt als Referenz. Der Hersteller nennt „99,8 %“ ohne unabhängigen Beleg ([ABBYY Vergleichsblatt](https://pdf.abbyy.com/media/y2xicorm/brochure-finereaderpdf-comparison-chart-en.pdf), Sekundärquelle [aiproductivity](https://aiproductivity.ai/tools/abbyy-finereader/)). PDF-XChange Plus wirbt mit einer „Enhanced OCR“, die genauer sein soll als die Standard-Engine ([pdf-xchange.com](https://www.pdf-xchange.com/product/pdf-xchange-editor/features-group/4/features)). Nitro und Foxit 2026.2 melden „sharper OCR“ ([PDF Association](https://pdfa.org/?p=236889)).
- **Repo-Check:** Tesseract (`js/app.js:1998`), `vendor/tesseract/lang/deu.traineddata.gz` mit 1,33 MB. Die Größe spricht für das schnelle LSTM-Modell (`tessdata_fast`). **Das ist eine Vermutung und nicht verifiziert.** In docs/ und tests/ gibt es **keine OCR-Genauigkeitsmessung** (grep nach Zeichenfehlerrate und Erkennungsrate: kein Treffer). Gemessen wurde bisher nur einmal die Wortquote bei verrauschten Handyfotos (CHANGELOG Zeile 1196: 80 % gegenüber 15–49 %).
- **Lokal umsetzbar:** (a) Ein Testkorpus mit 50–100 echten, geschwärzten Briefen aus Scanner und Handy, Zeichen- und Wortfehlerrate gegen eine Grundwahrheit. Als CI-Gate wie veraPDF (L5). (b) Die Einstellung „Genau“ lädt `tessdata_best` für Deutsch und Englisch (ca. 4–8 MB) einmalig von pdfmy.de. (c) Nachkorrektur mit einem lokalen Wörterbuch (Hunspell-de als statische Datei), besonders für Umlaute und ß.
- **Aufwand:** Messung S–M, Modell „Genau“ S, Wörterbuch-Korrektur M.
- **Leitplanken:** alle gewahrt, denn Modelle sind statische Dateien von pdfmy.de. L4: nur eine zusätzliche Auswahl mit „Automatisch“ als Voreinstellung.

### Rang 2: Word, Excel und PowerPoint → PDF mit höherer Treue, PowerPoint als Eingabe
- **Wer hat es:** iLovePDF, Smallpdf und PDF24 bieten „PowerPoint to PDF“ an ([iLovePDF-Werkzeugliste](https://ilovepdf.com/register), [PDF24 Creator](https://tools.pdf24.org/en/creator)), alle mit Upload bzw. als Windows-Desktop-Programm. Acrobat wandelt Office über die eigene Umwandlung.
- **Repo-Check:** Das `accept=` in index.html (Zeilen 1156 und 1332) enthält `.docx .xlsx .odt .ods .epub .rtf .xps`, aber **kein `.pptx`, `.odp`, `.doc`, `.xls` und kein `.html`**. In `js/office.js` fehlen Fußnoten (`footnote`: 0 Treffer), mehrspaltiger Satz (`w:cols`: 0), schwebende Bilder und Textfelder (`anchor` und `txbx`: 0) sowie Diagramme (`c:chart`: 0). KONZEPT 02.11.2026 sagt selbst, das Layout sei „kein Abbild des Originals“. Metrisch kompatible Schriften liegen schon in `vendor/fonts/metric` (Liberation, Caladea, PDFMySansC).
- **Lokal umsetzbar:** (a) PPTX und ODP einlesen: Folien als Seiten mit Textrahmen, Bildern und einfachen Formen (wie bei DOCX, eigener Parser). (b) DOCX ergänzen um Fußnoten, Spalten, verankerte Bilder und Textfelder sowie Diagramme als Platzhalterbild mit Hinweis. (c) Messung je Datei: visueller Vergleich PDFMy gegen LibreOffice und Word. Das Overlay-Vergleichswerkzeug existiert schon („Bild (Überlagerung)“) und taugt als Prüfwerkzeug. (d) Ist pdfmy Scan installiert, gibt es schon heute den Weg „Drucker PDFMy“ bzw. LibreOffice. Den sollte PDFMy bei schwierigen Dateien aktiv anbieten („Exakte Umwandlung mit Ihrem LibreOffice“), mit lokalem Aufruf `soffice --convert-to pdf` über pdfmy Scan.
- **Aufwand:** PPTX-Eingabe M–L, DOCX-Ausbau M–L, LibreOffice-Rückfall S–M.
- **Leitplanken:** gewahrt (lokal, keine neue Verbindung). L4: kein neuer Bedienschritt, die Datei einfach öffnen.

### Rang 3: Vorhandene Objekte bearbeiten (Bilder, Formen, Textblöcke verschieben und ersetzen)
- **Wer hat es:** Acrobat (Standard und Pro: „Edit text and images“, [mapsoft](https://mapsoft.com/posts/acrobat-standard-vs-pro.html)), Foxit, Nitro ([nitropdf.com/pro](https://www.nitropdf.com/pro/default.aspx)), PDF-XChange („Edit Content“, für Nicht-Text-Objekte nur mit Lizenz: [pdf-xchange.com](https://www.pdf-xchange.com/product/pdf-xchange-editor/features-group/4/features)), Sejda (Sekundärquelle).
- **Repo-Check:** „Text ändern“ mit Originalschrift und Absatzumbruch ist vorhanden. Für das Verschieben, Ersetzen, Löschen oder Skalieren *vorhandener* Bilder und Vektorobjekte gibt es keinen Treffer (grep nach „Bild ersetzen“, „Objekt bearbeiten“, „Bild verschieben“: 0).
- **Lokal umsetzbar:** Werkzeug „Objekt“: pdf.js liefert die Operatorliste. Damit lassen sich Bild-XObjects auf der Seite markieren und per Matrixänderung im Content-Stream mit pdf-lib verschieben, skalieren, löschen oder ersetzen. Textblöcke verschieben baut auf derselben Logik auf wie „Text ändern“.
- **Aufwand:** L.
- **Leitplanken:** gewahrt. L4: ein Werkzeug in der vorhandenen Leiste. Fälschungsschutz (docs/Faelschungsschutz.md) muss genauso greifen wie bei „Text ändern“.

### Rang 4: Signaturprüfung mit EU-Vertrauensliste und Langzeit-Signatur (PAdES B-LT/B-LTA)
- **Wer hat es:** Acrobat validiert gegen die EUTL und AATL und kann LTV-Daten einbetten. Für Foxit wird das Gleiche vermutet (nicht nachgeprüft).
- **Repo-Check:** `js/pdfverify.js:7` sagt selbst: „Vertrauensliste nicht geprüft – das wird ehrlich so angezeigt“. Nach „B-LT“ und „LTA“ gibt es keine Treffer. Vorhanden sind B-B und B-T (Zeitstempel).
- **Lokal umsetzbar:** (a) EUTL-Schnappschuss: Beim Build lädt der Build-Rechner die EU-Vertrauensliste mit den nationalen Listen, prüft die Signatur der Liste und legt die Liste als statische, signierte Datei auf pdfmy.de ab. Der Browser prüft dann offline, ob der Aussteller ein qualifizierter Vertrauensdiensteanbieter ist. So wird aus „gültig“ auch „qualifiziert (QES) laut EU-Liste“. (b) B-LT: pdfmy Scan holt OCSP- und CRL-Antworten wie heute den Zeitstempel und bettet sie per DSS ein. Übertragen wird nur die Seriennummer des Zertifikats, kein Dokument.
- **Aufwand:** EUTL M, B-LT/LTA M.
- **Leitplanken:** (a) gewahrt (statische Datei). (b) Für L1 und L2 gilt dieselbe Abwägung wie beim bereits entschiedenen Zeitstempel. Es geht nur ein Prüfwert an einen Dienst der Zertifizierungsstelle, nur auf Wunsch und nur über pdfmy Scan. **Vor dem Bau als eigene Prüfung in KONZEPT dokumentieren.**

### Rang 5: Verteilung – Android-App im Store, Browser-Erweiterung im Store, Firmen-Rollout
- **Wer hat es:** Smallpdf, Xodo und Nitro haben Apps für iOS und Android ([Smallpdf PDF Scanner](https://smallpdf.com/pdf-scanner), [Xodo/Capterra](https://www.capterra.com/p/210439/Xodo/), [Nitro im App Store](https://apps.apple.com/us/app/id6477621772)). Acrobat und PDF24 bieten Firmenpakete (MSI, Gruppenrichtlinien). Für PDF24 ist das nicht nachgeprüft.
- **Repo-Check:** Android ist „Vorbereitung (noch nicht veröffentlicht)“ (CHANGELOG 31.10.2026), offen laut KONZEPT sind Entwicklerkonto und Testgerät durch die GF. Die Erweiterung ist im Store nicht veröffentlicht (KONZEPT 08.11.2026, ISO-Maßnahme M9 „hoch“). Nach MSI, Intune, „stille Installation“ und ADMX gibt es keine Treffer, nur M9 erwähnt `ExtensionInstallForcelist`. iOS ist eine GF-Entscheidung.
- **Lokal umsetzbar:** (a) Play Store veröffentlichen (Auftrag GF liegt vor). (b) Chrome Web Store und Edge-Add-ons. (c) Für pdfmy Scan ein MSI- bzw. stilles Setup mit Schalter `/quiet` und dokumentierten Richtlinienschlüsseln (KI aus, Ablageordner, Sprache), dazu eine Seite „PDFMy in Firmen verteilen“. Das ist der Hebel für Kanzleien und den Mittelstand.
- **Aufwand:** Stores S–M (Hauptarbeit sind Konten und Prüfungen), MSI und Richtlinien M.
- **Leitplanken:** gewahrt. Für L3 bleibt das Konto ein Entwicklerkonto der Mentor GmbH, nicht des Nutzers.

### Rang 6: Feinheiten im Signatur-Workflow (Details in Abschnitt 3)
Parallele und gemischte Reihenfolge, Zugangscode je Unterzeichner, Anhänge vom Unterzeichner, bedingte und geprüfte Felder, Neuzuweisen bzw. Vertretung, Zurückziehen, Ablaufdatum, Kalendererinnerung für den Absender, Zahlungsaufforderung per GiroCode und ein signiertes Abschlusszertifikat. **Aufwand gesamt M.** Die Leitplanken sind gewahrt (siehe Abschnitt 3).

### Rang 7: Suche über viele Dokumente und Fragen an mehrere PDFs („Arbeitsraum“)
- **Wer hat es:** Acrobat PDF Spaces (Cloud, mit Agent, Podcasts und Teilen, [Business Wire 05/2026](https://www.businesswire.com/news/home/20260506452996/en/)), Foxit Workspace (lokal, im Abo: [Foxit-Blog](https://www.foxit.com/blog/foxit-pdf-editor-2026-2-local-ai/)).
- **Repo-Check:** Eine Volltextsuche über die Ablage gibt es (`js/pro.js:122`, „Volltextsuche über … PDF(s) der Ablage“). Fragen an mehrere Dokumente stehen in KONZEPT 22.10.2026 (3) auf „beobachten“, wegen der Speichergrenzen.
- **Lokal umsetzbar:** Die vorhandene Volltextsuche wird zum lokalen Mehrdokument-Kontext für die lokale KI (Ollama oder LM Studio): Top-k-Passagen aus dem Index, Antwort mit Fundstelle und Sprung ins Dokument. Mit der Browser-KI nur für kleine Mengen.
- **Aufwand:** M.
- **Leitplanken:** gewahrt (nur lokale KI). Laut KONZEPT „beobachten“. **Vorschlag: auf „prüfen“ hochstufen**, weil Foxit damit wirbt.

### Rang 8: Barrierefreiheit – Lesereihenfolge und Tags von Hand korrigieren
- **Wer hat es:** Acrobat Pro (Werkzeug „Lesereihenfolge“, Tag-Baum). Den Preflight für PDF/UA bietet nur Acrobat Pro ([mapsoft](https://mapsoft.com/posts/acrobat-standard-vs-pro.html), Sekundärquelle).
- **Repo-Check:** Auto-Tagging und Prüfung sind vorhanden (a11ycheck.js, preflight.js). Eine Oberfläche, mit der man Reihenfolge oder Tag-Art von Hand ändert, war nicht zu finden („Lesereihenfolge“ kommt nur in der Logik vor, nicht in einem Werkzeug). KONZEPT 23.10.2026 nennt die Grenze „komplexe Layouts werden vereinfacht“.
- **Lokal umsetzbar:** Overlay „Gliederung prüfen“: nummerierte Kästen je Block in Lesereihenfolge, per Ziehen umsortieren, per Rechtsklick die Art ändern (H1, H2, P, Liste, Tabelle, Artefakt). Danach entsteht der Strukturbaum neu.
- **Aufwand:** M–L.
- **Leitplanken:** gewahrt. Für L5 ist das ein Pluspunkt für BFSG- und BITV-Kunden (Behörden).

### Rang 9: Weitere Eingabeformate – HTML/MHTML, alte Office-Formate (.doc, .xls), DjVu
- **Wer hat es:** HTML-zu-PDF bieten Sejda und iLovePDF („Web to PDF“, mit Upload, Sekundärquellen), Acrobat (Webseite → PDF) und PDF24.
- **Repo-Check:** `accept=` ohne `.html`, `.mhtml`, `.doc`, `.xls`, `.djvu`. DjVu ist laut KONZEPT 02.11.2026 offen.
- **Lokal umsetzbar:** Eine gespeicherte .html- oder .mhtml-Datei wird in einem abgeschotteten iframe (sandbox, CSP ohne Netz) gerendert und über den vorhandenen Textsatz ausgegeben. **Eine URL abrufen geht nicht**, das verletzt die CSP und L2. Für .doc und .xls führt der Weg über die vorhandene Office-Anbindung (LibreOffice). DjVu: nur bei Nachfrage.
- **Aufwand:** HTML M, .doc/.xls über LibreOffice S, DjVu M.
- **Leitplanken:** gewahrt, solange keine URL abgerufen wird. **Eine URL nachzuladen verletzt die Leitplanke 2** und wird nicht empfohlen.

### Rang 10: Druckvorstufe – PDF/X und Prüfung auf Ausgabebedingungen
- **Wer hat es:** PDF24 Creator (Ausgabe als PDF/X, [Wikipedia](https://en.wikipedia.org/wiki/PDF24_Creator)), Acrobat Pro (Preflight PDF/X, PDF/E, PDF/VT, [mapsoft](https://mapsoft.com/posts/acrobat-standard-vs-pro.html)).
- **Repo-Check:** Nach „PDF/X“ gibt es keine Treffer. KONZEPT 01.11.2026 sagt ausdrücklich, Ansicht und Druck für Grafiker seien „kein Schwerpunkt – nicht versprechen“.
- **Bewertung:** kein Leitplankenverstoß, aber eine bewusste Schwerpunktentscheidung. **Nur als Prüfprofil „Druckerei (PDF/X-4, Kurzprüfung)“ in der vorhandenen Vorabprüfung** vorschlagen (Schriften eingebettet, keine RGB-Warnung als Fehler, TrimBox vorhanden). Das kostet wenig und wäre ehrlich als Kurzprüfung zu kennzeichnen. **Aufwand S–M.** Priorität niedrig.

### Weitere geprüfte Punkte (nicht empfohlen bzw. schon entschieden)
| Punkt | Befund |
|---|---|
| Cloud-KI (Acrobat AI Assistant, PDF Spaces, Podcast-Zusammenfassungen, Smallpdf Chat) | **verletzt Leitplanke** (L1, L2), schon verworfen am 21.10.2026 |
| Geteilte Spaces bzw. Links mit Leseverfolgung (Adobe: „track when recipients view“) | **verletzt Leitplanke** (L2, L3: Server und Tracking). Die Lesebestätigung mit Mitwirkung des Empfängers ist schon umgesetzt (22.10.2026). |
| Handschrifterkennung | KONZEPT „beobachten“ (kein brauchbares lokales Modell für Deutsch), nicht neu bewertet |
| Bearbeiten per Anweisung in natürlicher Sprache (Acrobat, Januar 2026, [Dataconomy](https://dataconomy.com/2026/01/22/adobe-acrobat-adds-conversational-ai-to-edit-pdfs-with-text-prompts/)) | KONZEPT „später prüfen, nur lokal“. Möglich als Erweiterung der Befehlssuche Strg+K, die über eine lokale KI eine Absicht auf bestehende Befehle abbildet. Gering riskant, Aufwand M. |
| REST-API und Pipelines wie Stirling-PDF ([Sekundärquelle](https://blog.elest.io/self-host-stirling-pdf-50-private-pdf-tools-on-your-server/)) | Server-API **verletzt Leitplanke** (L2). Ein visueller Workflow-Editor wurde verworfen (L4). Stapel-Vorlagen und Hot Folder decken den Bedarf lokal ab. On-Premises-Betrieb ist eine GF-Entscheidung (Lizenz, KONZEPT 01.11.2026). |
| Linearisieren | verworfen (app-v211) |
| Direkte Cloud-Anmeldung (Nextcloud, Google) | verworfen (23.10.2026) |
| iOS-App | GF-Entscheidung (24.10.2026) |
| Wasserzeichen entfernen | kein Treffer im Repo, geringer Nutzen und Missbrauchsrisiko → nicht empfohlen |
| Rechtschreibprüfung bei „Text ändern“ | kein Treffer im Repo. Lokal mit Hunspell als statischer Datei möglich, Aufwand S–M. Kann mit Rang 1(c) gebündelt werden. |

---

## 3. Signatur-Workflow nach DocuSign-Art: was ohne Server noch geht

**Schon vorhanden (Repo-Check: hilfe.html „Zur Unterschrift senden“, js/sigreq.js, js/pro.js:697):** feste Reihenfolge, Felder je Person (Unterschrift, Kürzel, Datum, Name, Text, Ankreuzfeld), Vorlagen, Serienversand aus CSV oder Outlook-Liste, Frist, „Erinnern“ mit Zähler und Vorschlag für den nächsten Schritt, Ablehnen mit Begründung, Kopie zur Kenntnis, geführtes Ausfüllen, Gesendet/Empfangen/Gelesen in der PDF, Messenger-Weg mit Lesebestätigung, inkrementelles Speichern und Prüfprotokollseite mit SHA-256 je Fassung, Sprachen, Unterschreiben auch in Acrobat Reader oder Vorschau, Outlook-Entwurf über pdfmy Scan.

**DocuSign-Funktionen** laut [docusign.com/products/electronic-signature/features](https://www.docusign.com/products/electronic-signature/features) und [DocuSign Success-Checkliste](https://success.docusign.com/feature-adoption/checklist/agreements-signed-faster-direct): Signing Order mit Verzögerungen, Bulk Send (bis 1000 pro Stunde, mit SMS, PIN oder ID-Prüfung je Unterzeichner), ID Verification (Ausweis, eID), Payments (Karte, Apple Pay, ACH), Web Forms, Vorlagen, Erinnerungen und Ablauf, Certificate of Completion. Die Angaben stammen von DocuSign selbst bzw. aus [erpresearch](https://www.erpresearch.com/erp-add-ons/esignature/docusign) (Sekundärquelle).

| DocuSign-Funktion | Stand PDFMy (Repo-Check) | Vorschlag ohne Server | Aufwand | Leitplanken |
|---|---|---|---|---|
| **Parallele bzw. gemischte Reihenfolge** (Stufe 1: A und B gleichzeitig, Stufe 2: C) | nur streng nacheinander (`sigreq.js:59` „Erste Person in der Reihenfolge, die noch nicht unterschrieben hat“) | „Stufe“ je Person. Personen derselben Stufe bekommen dieselbe Fassung gleichzeitig. Die Rückläufer führt der Absender in PDFMy zusammen: Jede Rücksendung trägt ihre Unterschrift als inkrementelle Ergänzung, PDFMy legt die Felder aus allen Rückläufern auf eine Fassung und vermerkt im Prüfprotokoll jede Einzel-Prüfsumme. Dann geht es weiter zur nächsten Stufe. | M | gewahrt. L4: Voreinstellung bleibt „nacheinander“. |
| **Zugangscode bzw. Identität** (SMS, PIN, Ausweis) | kein Treffer (grep in sigreq.js nach Passwort, Zugangscode, Verschlüsselung) | (a) **Zugangscode:** PDF je Person mit AES-256 verschlüsseln (vorhanden, js/pdfcrypt.js). Den Code teilt der Absender auf einem zweiten Weg mit (Telefon, SMS aus dem eigenen Handy). PDFMy erzeugt den Code und den Hinweistext. Das ersetzt die DocuSign-PIN, ohne Server. (b) **Stärkere Identität:** Unterzeichner signiert zusätzlich digital mit eigenem Zertifikat bzw. eigener Signaturkarte (vorhanden), im Protokoll als „mit Zertifikat von … bestätigt“. (c) Videoident, SMS-Versand durch PDFMy oder Ausweis-Prüfung durch einen Dienst | (a) S, (b) S | (a) und (b) gewahrt. **(c) verletzt Leitplanke** (L2, L3) |
| **eID (Online-Ausweis)** | – | Die AusweisApp läuft zwar lokal, braucht aber einen eID-Server des Diensteanbieters mit Berechtigungszertifikat | – | **verletzt Leitplanke** (L2), nicht empfohlen |
| **QES** | Fortgeschrittene Signatur und PAdES vorhanden. Mit einer **eigenen qualifizierten Signaturkarte** (z. B. eines Vertrauensdiensteanbieters) über den Windows-Zertifikatsspeicher ist eine QES schon heute technisch möglich (CHANGELOG pdfmy Scan 1.8.0). Die Prüfung, ob „qualifiziert“, fehlt (Rang 4). | (a) In der Hilfe ehrlich beschreiben: „Mit Ihrer eigenen QES-Karte signieren“. (b) Fernsignatur über einen VDA wie Skribble oder Yousign, die mit Videoident oder eID identifizieren ([skribble.com/identify](https://www.skribble.com/identify), [Yousign-QES-Changelog](https://developers.youtrust.com/changelog/qualified-electronic-signature-is-out)) | (a) S | (a) gewahrt. **(b) ist eine Entscheidung der Geschäftsführung** (Konto und Kosten beim VDA, Hash-Übergabe; KONZEPT 22.10.2026 (3)) |
| **Anhänge vom Unterzeichner** (z. B. Ausweiskopie, Nachweis) | kein Treffer („Anhang anfordern“: 0) | Feldart „Anlage anfordern“: Der Unterzeichner hängt eine Datei an. Diese wird als eingebettete Datei in die PDF geschrieben (Dateianhänge sind vorhanden), mit Prüfsumme im Protokoll. Hinweis: Das Ergebnis ist kein PDF/A-2, sondern höchstens PDF/A-3. | S–M | gewahrt. L5: Hinweis bei PDF/A und beA (keine Anhänge erlaubt). |
| **Bedingte Felder bzw. Pflichtprüfung** (Feld nur, wenn Häkchen gesetzt ist; Format-Prüfung) | Pflichtfelder und „noch fehlende Angaben“ vorhanden. Die Prüfung von E-Mail, IBAN und PLZ gibt es im Formular-Designer, im Signatur-Dialog laut Hilfe nicht (nicht tiefer geprüft). | Feldprüfungen aus formcalc.js im Signaturfeld-Dialog anbieten, dazu „nur wenn Feld X angehakt“ (in PDFMy ausgewertet, ohne PDF-Skript) | S–M | gewahrt. L6: keine Skripte in der PDF, Auswertung nur in PDFMy |
| **Neu zuweisen bzw. Vertretung** | Im Entwurf vorhanden („anderer Person zuordnen“, pro.js:549), nach dem Versand nicht | Knopf „Weitergeben an …“ beim Unterzeichner: Name und E-Mail eintragen, die Person wird im Protokoll ersetzt, der Absender ist in Kopie | S | gewahrt |
| **Zurückziehen bzw. Korrigieren** (void, correct) | kein Treffer | „Anfrage zurückziehen“: vorbereitete E-Mail an alle bisher Beteiligten, Eintrag „zurückgezogen“ im Posteingangsbuch und im Protokoll. Eine später eintreffende Fassung erkennt PDFMy an der Anfrage-ID und meldet „Diese Anfrage wurde zurückgezogen“, aber nur beim Absender. Beim Empfänger geht das ohne Server nicht. Das muss so in der Hilfe stehen. | S | gewahrt, mit ehrlicher Grenze |
| **Ablaufdatum** (Anfrage verfällt) | Frist vorhanden, kein Verfall | Ablaufdatum in der Anfrage (in der PDF eingebettet). Öffnet der Unterzeichner nach Ablauf, zeigt PDFMy „abgelaufen – beim Absender neu anfordern“. Das ist nur ein Hinweis, die PDF bleibt technisch unterschreibbar. | S | gewahrt |
| **Erinnerungen automatisch** | „Erinnern“ per Klick, tägliche Browser-Mitteilung | **.ics für den Absender:** Beim Senden bietet PDFMy „Erinnerungen in meinen Kalender“ an, also eine .ics mit 2–3 Terminen (z. B. +3 Tage, +7 Tage, Fristtag), jeweils mit VALARM und Text „Unterschrift von X nachfassen“. Die Bibliothek `Fristen.ics` (`pro.js:2996`) und `Letter.buildIcs` (`app.js:2340`) gibt es schon. Für sigreq gibt es heute keinen .ics-Aufruf (grep). **Für den Unterzeichner:** .ics „Bis 15.11. unterschreiben“ in der Anfrage-E-Mail als Anhang. | S | gewahrt (Datei, kein Dienst) |
| **Zahlung einziehen** (DocuSign Payments: Karte, Apple Pay) | GiroCode-Stempel vorhanden (app-v223) | „Zahlung anfordern“ im Signatur-Dialog: Betrag, IBAN und Verwendungszweck (Anfrage-ID) eintragen. PDFMy setzt einen GiroCode (EPC-QR) auf die Abschlussseite und in die Abschluss-E-Mail. Den Zahlungseingang erkennt der vorhandene Kontoauszug-Abgleich (CAMT/CSV) am Verwendungszweck. **Kartenzahlung über einen Zahlungsdienstleister** | S | GiroCode gewahrt. **Kartenzahlung verletzt Leitplanke** (L2, L3) |
| **Web Forms** (Formular-Link, aus dem ein Dokument entsteht) | Serienausfüllung und Formular-Designer vorhanden | „Formular-Link“: Ein Link pdfmy.de/#form=… würde die Felddefinition im #-Teil tragen. Die Antwort käme aber nur per E-Mail-Entwurf zurück, und das ist umständlich. **Empfehlung:** stattdessen ein ausfüllbares PDF mit „Ausgefüllt zurücksenden“ (ist praktisch schon vorhanden). Nicht weiter verfolgen. | – | Server-Formulare **verletzen die Leitplanke** (L2) |
| **Certificate of Completion** (Abschlusszertifikat, manipulationssicher) | Prüfprotokollseite vorhanden, aber nur angehängt und nicht versiegelt (pro.js:697–756, grep: keine Signatur des Protokolls) | Nach der letzten Unterschrift **digital versiegeln:** Hat der Absender ein Zertifikat (.p12 oder Windows), signiert PDFMy das Gesamtdokument samt Protokoll mit PAdES B-T. Ohne Zertifikat schlägt PDFMy einen Zeitstempel (RFC 3161 über pdfmy Scan) als „Dokumentzeitstempel“ vor. Dazu „Abschlussbericht separat als PDF/A“ für die Akte. | S–M | gewahrt (Zeitstempel überträgt nur den Hash, entschieden) |
| **Persönlich vor Ort unterschreiben** (In-Person Signing) | nicht als eigener Modus | „Hier am Gerät unterschreiben lassen“: Tablet weiterreichen, Vollbild-Signierfeld, danach Rückgabe mit PIN des Absenders. Im Protokoll steht „vor Ort, Gerät des Absenders“. | S | gewahrt |
| **CLM-Grundlagen** (Vertragsablage, Laufzeit, Kündigungsfrist, Verlängerung) | Posteingangsbuch, Akten, Fristen, Volltextsuche vorhanden | Dokumenttyp „Vertrag“ mit Feldern Laufzeit bis, Kündigungsfrist und automatische Verlängerung. Die Kündigungsfrist wird berechnet (fristen.js), als .ics und auf der Startseite angezeigt. Erkennung im Vertragstext über Regeln wie „Laufzeit“ oder „verlängert sich um“. | M | gewahrt |

**Ehrliche Grenze für die Hilfe:** Ohne Server weiß der Absender nur, was mit zurückkommenden Fassungen oder mit Rückmeldungen auf Wunsch des Empfängers bei ihm ankommt. Ein „live“-Status wie bei DocuSign ist ohne Tracking nicht möglich. Das ist schon heute so beschrieben und sollte als Vorteil („kein Tracking-Pixel“) stehen bleiben.

---

## 4. Schwächen bei der Qualität, nicht nur bei Funktionen

| Bereich | Was bekannt ist (Repo) | Risiko | Was gemessen werden muss (statt Vermutung) |
|---|---|---|---|
| **OCR-Genauigkeit** | Tesseract, Modellgröße spricht für `fast` (unverifiziert). Messung nur einmal bei verrauschten Handyfotos (80 % Wörter). Tabellen ohne Linien sind bekannt schwierig, dafür gibt es `Imaging.unline`. | Wettbewerber werben mit „besserer OCR“. ABBYY gilt als Referenz. Nutzer erleben OCR-Fehler direkt in Dateinamen und Briefdaten. | Korpus aus echten Briefen, Rechnungen mit Tabellen, Fax-TIFF und Handyfotos. Zeichen- und Wortfehlerrate je Modell (`fast`, `best`) und je Vorverarbeitung, Trefferquote der Briefdaten (Datum, Betrag, IBAN, Absender). Vergleich mit ABBYY oder Acrobat auf denselben Dateien, sofern eine Testlizenz verfügbar ist. |
| **Word, Excel und ODF → PDF** | eigene Satz-Engine, Wörter zu 99,2 % gleich (eine künstliche Datei), keine Fußnoten, Spalten, schwebenden Objekte oder Diagramme. Nur „gegen LibreOffice“ gemessen, „kein Vergleich mit Word selbst“ (KONZEPT 02.11.2026). | Hauptkritik an Konvertern ist Layouttreue. Fünf Seiten statt drei (PDFMy gegenüber LibreOffice) wirkt für Nutzer wie ein Fehler. | 20 reale Office-Dateien (Brief mit Briefkopf, Angebot mit Tabelle, Bericht mit Fußnoten, zweispaltiger Flyer, Excel mit mehreren Blättern und Druckbereich). Seitenzahl, Overlay-Abweichung (vorhandenes Vergleichswerkzeug) und Wortgleichheit gegen Word bzw. Excel als PDF. |
| **PDF → Word, Excel, PowerPoint** | Gliederung ist gut (in Word und LibreOffice geprüft). PPTX „in Microsoft PowerPoint selbst nicht geprüft“ (CHANGELOG Zeile 642). Vergleich mit Acrobat und PDF24 „offen (nicht installiert)“. | Unbekannt, ob PDFMy besser oder schlechter als der Wettbewerb ist | Dieselben 20 Dateien hin und zurück. Öffnen in Word, Excel und PowerPoint 365 (echte Installation). Blindbewertung gegen iLovePDF, Smallpdf und Acrobat (nur mit unkritischen Testdateien, weil diese Dienste hochladen). |
| **Geschwindigkeit** | Erster Besuch 3–7 s bis „bereit“, vor app-v241 gemessen auf pdfmy.de. app-v241 hat das Laden parallelisiert, eine neue Messung im Netz steht aus. 100 Scanseiten: 20,9 s öffnen, 28,4 s speichern (Server mit 8 Kernen). „Auf Handys deutlich langsamer, dort nicht gemessen.“ | Online-Tools wirken schneller, weil die Werkzeugseite sofort bereit ist | Erstbesuch und Wiederbesuch mit Lighthouse bzw. WebPageTest auf Mittelklasse-Android und 4G, nach app-v241. OCR je Seite auf Handy, Mittelklasse-PC und Server. KONZEPT nennt als offenen Schritt „Skripte bei Bedarf nachladen“. |
| **Mobil** | Android-App nicht veröffentlicht. Kamera-Verarbeitung im Hintergrund offen. iOS ohne Teilen-Ziel. Handy-Laufzeiten nicht gemessen. | Smallpdf, Xodo und Nitro sind mobil etabliert | Messung auf 2–3 echten Geräten (Speicherspitzen bei 30-seitigem Kamera-Scan, Absturzquote). TalkBack- und VoiceOver-Test der App-Oberfläche. |
| **Barrierefreiheit der App** | axe 0 Verstöße in 11 Ansichten, NVDA-Test der erzeugten PDFs (docs/ISO-Konformitaet.md) | Automatische Prüfungen finden etwa ein Drittel der WCAG-Probleme (Faustregel, nicht verifiziert). Die App-Oberfläche wurde mit einem Screenreader anscheinend nicht systematisch geprüft (nicht verifiziert). | Manueller Durchgang mit NVDA und TalkBack durch die 5 häufigsten Aufgaben (Öffnen, Zusammenfügen, Unterschreiben, Schwärzen, Speichern). Externe BITV-Prüfung, wenn Behörden Zielgruppe sind. |
| **Signatur-Interoperabilität** | OpenSSL-Prüfung, eigene Prüfung | Darstellung in Acrobat („gültig“ bzw. „Identität unbekannt“) ist für Nutzer entscheidend | Signierte Testdateien in Acrobat Reader, Foxit und mit dem EU-DSS-Validator prüfen (DSS lokal als Testwerkzeug, nicht im Produkt). |
| **Formulartreue** | Prüfrunden app-v202 bis v204, „Test auf echten Geräten steht noch aus“ (KONZEPT 21.10.2026 (2)) | Kommentare bei Borncity loben Formulartreue als Unterscheidungsmerkmal | Je 10 Behördenformulare (AcroForm, ohne XFA): ausfüllen, speichern, in Acrobat Reader und Vorschau am Mac öffnen. |

---

## 5. Top-10-Empfehlungen in Reihenfolge

1. **OCR-Messkorpus und CI-Gate aufbauen, Modus „Genau“ (`tessdata_best`) anbieten**, später lokale Wörterbuch-Korrektur. *S–M. Leitplanken gewahrt.* Grund: OCR ist die Grundlage der Alleinstellung „Briefintelligenz“. Ohne Zahlen lässt sich „besser als der Wettbewerb“ hier nicht belegen.
2. **Office-Treue: PPTX und ODP einlesen, DOCX mit Fußnoten, Spalten und schwebenden Bildern, bei schwierigen Dateien LibreOffice über pdfmy Scan anbieten**, dazu ein Messkorpus mit 20 Dateien. *M–L. Gewahrt.* Grund: Layouttreue ist die häufigste Konverter-Kritik, und PowerPoint → PDF fehlt ganz.
3. **Android-App veröffentlichen sowie die Erweiterung im Chrome Web Store und bei Edge-Add-ons** (offen bei der GF), dazu ein **MSI bzw. stilles Setup mit Richtlinienschlüsseln für Firmen**. *S–M. Gewahrt.* Grund: Reichweite und Vertrauen. ISO-Maßnahme M9 hat die Priorität „hoch“.
4. **Umgesetzt 09.11.2026 (app-v243), außer Kontoauszug-Abgleich der Zahlung:** **Signatur-Workflow ergänzen (Paket S):** .ics-Erinnerungen für Absender und Unterzeichner, Zugangscode per AES-256 je Person, „Zahlung anfordern“ per GiroCode mit Kontoauszug-Abgleich, Zurückziehen, Ablaufdatum, Weitergeben an Vertretung, Vor-Ort-Modus. *Zusammen etwa M. Gewahrt.* Grund: Der Abstand zu DocuSign schrumpft auf das, was ohne Server ohnehin unmöglich ist.
5. **Umgesetzt 09.11.2026 (app-v244):** **Abschlusszertifikat digital versiegeln** (PAdES mit dem Absender-Zertifikat oder Dokumentzeitstempel), Abschlussbericht separat als PDF/A. *S–M. Gewahrt.* Grund: Beweiswert des Prüfprotokolls, entspricht dem „Certificate of Completion“.
6. **Signaturprüfung gegen die EU-Vertrauensliste** (statischer, signierter Schnappschuss von pdfmy.de) **und PAdES B-LT/LTA** über pdfmy Scan. *M. EUTL gewahrt. B-LT nur nach eigener Leitplankenprüfung wie beim Zeitstempel.* Grund: „qualifiziert“ sicher anzeigen, und QES mit eigener Karte wird glaubwürdig. **QES über einen VDA bleibt eine Entscheidung der Geschäftsführung.**
7. **Teilweise umgesetzt 12.11.2026 (app-v246): Anhänge vom Unterzeichner. Offen: parallele bzw. stufenweise Reihenfolge.** **Parallele bzw. stufenweise Reihenfolge und Anhänge vom Unterzeichner.** *M. Gewahrt (Hinweis zu PDF/A-3 und beA).* Grund: Das sind die häufigsten Workflow-Fälle in Firmen (zwei Geschäftsführer gleichzeitig, Nachweis beifügen).
8. **Vorhandene Bilder und Objekte bearbeiten** (verschieben, skalieren, ersetzen, löschen). *L. Gewahrt, Fälschungsschutz muss greifen.* Grund: Das ist die letzte große Lücke beim Bearbeiten gegenüber Acrobat, Foxit, Nitro und PDF-XChange.
9. **Vertragsakte (CLM light):** Laufzeit, Kündigungsfrist und Verlängerung erkennen, berechnen und als .ics exportieren, dazu **Fragen an mehrere Dokumente über die vorhandene Volltextsuche und die lokale KI**. *M. Gewahrt.* Grund: Das baut auf vorhandenen Bausteinen auf und hält mit Foxit Workspace bzw. Acrobat Spaces mit, ohne Cloud.
10. **Lesereihenfolge und Tags von Hand korrigieren** für PDF/UA. *M–L. Gewahrt.* Grund: BFSG- und BITV-Kunden. Es schließt die zugegebene Grenze „komplexe Layouts werden vereinfacht“.

**Begleitend (ohne Rang, Messung statt Funktion):** Messung von Erstbesuch und Handy-Laufzeiten nach app-v241, Screenreader-Durchgang der App-Oberfläche, Signatur-Interoperabilität mit Acrobat, Foxit und dem EU-DSS-Validator, Formulartest auf echten Geräten.

**Ausdrücklich nicht empfohlen (verletzt Leitplanke):** Cloud-KI und Spaces mit Teilen und Leseverfolgung, Videoident, SMS-Versand oder eID über Dienste, Kartenzahlung über Zahlungsdienstleister, Web Forms über einen Server, Abruf von Webseiten per URL, REST-API und Server-Betrieb durch Mentor.

---

### Quellen (Wettbewerb)
- Adobe Acrobat Release Notes: https://helpx.adobe.com/uk/acrobat/desktop/whats-new/release-notes.html
- Adobe Productivity Agent und PDF Spaces (Business Wire, 05/2026): https://www.businesswire.com/news/home/20260506452996/en/
- Acrobat, Bearbeiten per Anweisung (Dataconomy, 01/2026): https://dataconomy.com/2026/01/22/adobe-acrobat-adds-conversational-ai-to-edit-pdfs-with-text-prompts/
- Acrobat Standard und Pro im Vergleich (Sekundärquelle): https://mapsoft.com/posts/acrobat-standard-vs-pro.html
- DocuSign eSignature Features: https://www.docusign.com/products/electronic-signature/features
- DocuSign Success-Checkliste: https://success.docusign.com/feature-adoption/checklist/agreements-signed-faster-direct
- DocuSign (Sekundärquelle, Tarife): https://www.erpresearch.com/erp-add-ons/esignature/docusign
- Foxit PDF Editor 2026.2 mit lokaler KI: https://www.foxit.com/blog/foxit-pdf-editor-2026-2-local-ai/ und https://pdfa.org/?p=236889
- PDF24 Creator: https://tools.pdf24.org/en/creator und https://en.wikipedia.org/wiki/PDF24_Creator
- iLovePDF-Werkzeugliste: https://ilovepdf.com/register
- Smallpdf PDF Scanner: https://smallpdf.com/pdf-scanner ; Tarifvergleich: https://smallpdf.com/blog/smallpdf-free-vs-pro-plan-comparison
- Sejda Desktop (Limits): https://www.sejda.com/desktop
- PDFgear Chatbot (OpenAI-API): https://pdfgear.com/chat-pdf
- PDF-XChange Editor Plus: https://www.pdf-xchange.com/product/pdf-xchange-editor/features-group/4/features
- Nitro PDF Pro: https://www.nitropdf.com/pro/default.aspx ; App Store: https://apps.apple.com/us/app/id6477621772
- Xodo (Capterra, Sekundärquelle): https://www.capterra.com/p/210439/Xodo/
- Stirling-PDF (Sekundärquelle): https://blog.elest.io/self-host-stirling-pdf-50-private-pdf-tools-on-your-server/
- ABBYY FineReader PDF 16 Vergleichsblatt: https://pdf.abbyy.com/media/y2xicorm/brochure-finereaderpdf-comparison-chart-en.pdf ; Sekundärquelle: https://aiproductivity.ai/vs/abbyy-finereader-vs-adobe-acrobat/
- Skribble Identifizierung und QES: https://www.skribble.com/identify ; https://www.skribble.com/en-eu/qes-software/
- Yousign QES: https://developers.youtrust.com/changelog/qualified-electronic-signature-is-out

**Hinweis zur Belastbarkeit:** Keine der Wettbewerbsangaben wurde im jeweiligen Produkt nachgetestet. Tarif- und Funktionszuordnungen ändern sich häufig. Vor einer öffentlichen Vergleichsaussage (z. B. auf pdfmy.de) jede Zeile an der Herstellerseite gegenprüfen (UWG § 6, vergleichende Werbung).
