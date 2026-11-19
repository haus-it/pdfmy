# Update-Strategie PDFMy

| | |
|---|---|
| **Gültig ab** | 01.12.2026 |
| **Fassung** | 1.0 vom 19.11.2026 |
| **Herausgeber** | Mentor GmbH, Paderborn – Geschäftsführung |
| **Verantwortlich für die Umsetzung** | Entwicklung PDFMy |
| **Überprüfung** | jährlich, zusätzlich nach jedem schweren Vorfall (Abschnitt 10) |
| **Normbezug** | ISO/IEC 27001:2022 A.5.24–A.5.28, A.8.8, A.8.25, A.8.29, A.8.32 · ISO 9001:2015 8.5.6, 8.6, 8.7, 10.2 · Vorbereitung auf den Cyber Resilience Act (Verordnung (EU) 2024/2847) |

Diese Strategie legt fest, wie neue Fassungen von PDFMy entstehen, geprüft, freigegeben, verteilt und bei Bedarf zurückgenommen werden. Sie gilt für alle Bestandteile und für alle Wege, auf denen Nutzer sie erhalten. Sie ersetzt die bisher nur im Code und in `KONZEPT.md` beschriebenen Einzelregeln und fasst sie verbindlich zusammen.

## 1. Ziele

1. **Sicher:** Eine Fassung erreicht Nutzer nur geprüft und signiert. Bekannte Sicherheitslücken werden in festen Fristen geschlossen.
2. **Verlässlich:** Ein Update unterbricht niemanden bei der Arbeit, und jede Fassung lässt sich in Minuten zurücknehmen.
3. **Nachvollziehbar:** Jede Veröffentlichung ist protokolliert, mit Prüfsummen belegt und auf GitHub nachlesbar.
4. **Einfach für Nutzer und Betreiber:** Updates kommen von selbst. Wer PDFMy auf einem eigenen Server betreibt, wählt zwischen „sofort“ und „erst nach einer Bewährungszeit“.
5. **Ohne Tracking:** Die Update-Wege übertragen keine Kennung und keine Nutzungsdaten (Leitplanke 3, `KONZEPT.md` Abschnitt 4).

## 2. Geltungsbereich und Versionsnummern

| Bestandteil | Versionsnummer | Verteilung |
|---|---|---|
| Web-App (pdfmy.de, installierte App) | `app-vNNN`, ausgeliefert als `pdfmy-JJJJMMTTHHMM-vNNN` | Service Worker im Browser |
| PDFMy auf dem eigenen Server | `pdfmy-selfhost-JJJJMMTTHHMM-vNNN` (gleiche Nummer wie die Web-App) | Kanäle „aktuell“ und „stabil“ (Abschnitt 5.2) |
| pdfmy Scan (Windows, Mac, Linux) | Semantische Versionierung `MAJOR.MINOR.PATCH` | Selbst-Update mit gestufter Freigabe, Pakete .deb/.rpm/Arch |
| Browser-Erweiterung (Chrome, Edge, Firefox) | Semantische Versionierung | Chrome Web Store, Edge-Add-ons, Firefox-Add-ons |
| Erweiterungen für Microsoft 365, Teams, Thunderbird, LibreOffice, Nextcloud, ONLYOFFICE | Semantische Versionierung | Download auf pdfmy.de bzw. Verteilung durch die IT |

Die Nummer `NNN` der Web-App steigt mit jeder Veröffentlichung um eins und fällt nie. Bei pdfmy Scan und den Erweiterungen bedeutet ein neuer MAJOR-Stand eine nicht abwärtsverträgliche Änderung; sie wird nach Abschnitt 9 angekündigt.

## 3. Arten von Fassungen

| Art | Inhalt | Zeitpunkt | Kanal „stabil“ (eigene Server) |
|---|---|---|---|
| **Regulär** | neue Funktionen, Verbesserungen | im Freigabefenster (Abschnitt 4) | nach 7 Tagen ohne Rücknahme |
| **Wartung** | Fehlerbehebungen ohne neue Funktion | im Freigabefenster | nach 7 Tagen ohne Rücknahme |
| **Sicherheit** | Schließen einer Sicherheitslücke | sofort, auch außerhalb des Fensters und in der Ruhezeit | **sofort** (`deploy.ps1 -Sicherheit`) |
| **Notfall-Rücknahme** | Rückkehr zur vorigen Fassung | sofort | zurückgenommene Fassung wird nie „stabil“ |

Eine Sicherheitsfassung enthält nur die Behebung und das dafür Nötige, keine neuen Funktionen.

## 4. Rhythmus, Freigabefenster und Ruhezeiten

- **Freigabefenster:** Montag bis Donnerstag, 8 bis 16 Uhr (deutsche Zeit). Dann ist jemand erreichbar, falls eine Rücknahme nötig wird.
- **Nicht veröffentlicht wird** am Freitag nach 12 Uhr, am Wochenende, an bundesweiten Feiertagen und am Tag davor.
- **Ruhezeit:** 20.12. bis 06.01. Es gibt nur Sicherheitsfassungen.
- **Häufigkeit:** nach Bedarf, höchstens eine reguläre Fassung pro Tag. Kleine Änderungen werden gebündelt. Mindestens einmal im Monat erscheint eine Fassung mit aktualisierten Bibliotheken, sofern es dort Sicherheitskorrekturen gibt (Abschnitt 8).
- **Abweichungen** vom Fenster gibt es nur für Sicherheitsfassungen und Rücknahmen. Sie werden im Release-Protokoll begründet.

## 5. Verteilung

### 5.1 Web-App (pdfmy.de)

- Der Service Worker lädt bei einer neuen Fassung nur geänderte Dateien (Prüfsumme je Datei, `pruefsummen.json`). Die neue Fassung gilt beim nächsten Öffnen. Eine laufende Bearbeitung wird nie unterbrochen.
- Die App funktioniert offline weiter. Ein Update ist nie Voraussetzung für die Arbeit.

### 5.2 PDFMy auf dem eigenen Server

- Jede Fassung erscheint als Paket nur mit der App (ohne Website, Impressum oder Zählseiten von pdfmy.de) unter `https://pdfmy.de/selfhost/`.
- **Kanal „aktuell“:** jede veröffentlichte Fassung sofort.
- **Kanal „stabil“ (Standard):** die neueste Fassung, die seit **7 Tagen** auf pdfmy.de läuft und nicht zurückgenommen wurde. Sicherheitsfassungen sind sofort „stabil“.
- Der Aktualisierer (`pdfmy-selfhost.sh` für Linux, `pdfmy-selfhost.ps1` für Windows/IIS) prüft täglich zwischen 3 und 6 Uhr, mit einer zufälligen Minute, damit nicht alle Server gleichzeitig anfragen. Installiert wird nur eine Fassung, die alle drei Bedingungen erfüllt: gültige Signatur, passende Prüfsumme, höhere Nummer als die vorhandene. Ein Rückschritt durch Wiedereinspielen einer alten Versionsdatei ist damit ausgeschlossen.
- Der Wechsel erfolgt ohne Ausfallzeit, durch zwei Umbenennungen. Die vorige Fassung bleibt für `zurueck` erhalten. Eigene Dateien des Betreibers bleiben erhalten.
- Betreiber können einen eigenen Spiegel im Intranet nutzen (`PDFMY_QUELLE` bzw. `-Quelle`). Auch dort prüft der Aktualisierer die Signatur der Mentor GmbH.
- Der Betrieb auf einem eigenen Server richtet sich nach den Lizenzbedingungen auf GitHub ([LICENSE](https://github.com/haus-it/pdfmy/blob/main/LICENSE)). Darauf weisen Firmen-Seite, Paket und Aktualisierer hin.

### 5.3 pdfmy Scan

- **Gestufte Freigabe:** zuerst 10 % der Installationen (`deploy.ps1 -ScanRollout 10`), nach 48 Stunden ohne auffällige Fehlerberichte 50 %, nach weiteren 48 Stunden 100 %. Sicherheitsfassungen gehen sofort an 100 %.
- Windows-Fassungen sind per Authenticode signiert (Mentor GmbH). Mac- und Linux-Fassungen sind mit RSA-3072 signiert. pdfmy Scan installiert nur signierte Fassungen mit höherer Version.
- Installationen für alle Benutzer (Firmen) aktualisieren sich nicht selbst; die IT verteilt sie. Die aktuelle Version steht maschinenlesbar in `/download/version.json`.

### 5.4 Browser-Erweiterung und Store-Fassungen

- Store-Fassungen durchlaufen die Prüfung des jeweiligen Stores. Die Dauer liegt nicht bei uns. Eine Sicherheitsfassung wird mit Hinweis auf Dringlichkeit eingereicht.
- Die Erweiterung enthält keine Logik, die ein Update der Web-App voraussetzt. Web-App und Erweiterung bleiben über mindestens zwei Erweiterungsfassungen hinweg verträglich.

## 6. Qualitätstore (Freigabekriterien)

Eine Fassung wird nur veröffentlicht, wenn alle Punkte erfüllt sind. `tools/deploy.ps1` erzwingt die Punkte 1 bis 4 technisch:

1. **Test-Gate:** alle automatischen Tests bestanden (`npm test`, keine Fehlschläge).
2. **Probelauf:** die fertige Website im echten Browser geprüft (`tools/smoke.js`: Start ohne Skriptfehler, PDF öffnen und erzeugen, PDF/A, Vorabprüfung, Handyansicht, Service Worker).
3. **Signaturen:** pdfmy Scan für Windows gültig signiert. Versionsdateien für eigene Server und Mac/Linux-Updates signiert. Fehlt ein Schlüssel, bricht der Build ab.
4. **Versionen stimmig:** Programm- und Webseitenversion von pdfmy Scan stimmen überein. Andernfalls bricht der Build ab.
5. **Hilfe und Sprachen:** Hilfe aktualisiert und vollständig in allen 40 Sprachen. Der Wörterbuchtest ist Teil des Test-Gates.
6. **Nachweise:** Eintrag in `CHANGELOG.md`; bei Normbezug ein Nachtrag in `docs/ISO-Konformitaet.md`.
7. **Neue Funktionen:** vor dem Bau gegen die Leitplanken (`KONZEPT.md` Abschnitt 4) geprüft. Änderungen an der Oberfläche zusätzlich auf Barrierefreiheit (WCAG 2.1 AA).
8. **Vier-Augen-Prinzip** bei sicherheitsrelevanten Änderungen: Signatur, Verschlüsselung, Schwärzen, Update-Wege, Content-Security-Policy, Umgang mit Schlüsseln. Bestätigung durch die Geschäftsführung oder eine benannte zweite Person, vermerkt im Commit.

## 7. Integrität und Schlüssel

- Zu jeder Veröffentlichung gibt es eine Prüfsummenliste aller ausgelieferten Dateien (`pruefsummen.txt`, SHA-256). Ihr Fingerabdruck steht im Release-Protokoll `docs/RELEASES.md` auf GitHub.
- **Update-Schlüssel** (RSA-3072, `tools/signing/unix-update.pem`): nur auf dem Build-Rechner, nie im Git, nie per E-Mail. Er ist offline gesichert, mit zwei Kopien an getrennten Orten. Signaturen für eigene Server tragen ein eigenes Präfix (`pdfmy-selfhost-v1`) und lassen sich nicht für einen anderen Zweck verwenden.
- **Schlüsselwechsel:** geplant spätestens alle 3 Jahre, sofort bei Verdacht auf Kompromittierung. Für den Übergang veröffentlichen wir eine Fassung der Aktualisierer, die beiden Schlüsseln vertraut. Der alte Schlüssel wird nach 90 Tagen entfernt.
- **Code-Signatur Windows** (Microsoft Artifact Signing): Zugang nur für die Entwicklung. Neu signiert wird nur, wenn sich das Programm ändert.

## 8. Sicherheitsupdates

| Schweregrad (CVSS 3.1/4.0) | Frist ab Bekanntwerden bis zur veröffentlichten Behebung |
|---|---|
| Kritisch (9,0–10,0) oder aktiv ausgenutzt | 72 Stunden, Ziel 24 Stunden |
| Hoch (7,0–8,9) | 7 Tage |
| Mittel (4,0–6,9) | 30 Tage |
| Niedrig (< 4,0) | nächste reguläre Fassung |

- **Meldungen** kommen über `security.txt` (RFC 9116) und die Seite „Sicherheit und Compliance“. Eingangsbestätigung binnen 2 Werktagen, erste Bewertung binnen 5 Werktagen.
- **Bibliotheken:** Die Software-Stückliste (`pdfmy-sbom.cdx.json`) wird mindestens monatlich und vor jeder regulären Fassung gegen bekannte Schwachstellen geprüft. Treffer werden nach dieser Tabelle behandelt.
- **Veröffentlichung:** mit `deploy.ps1 -Sicherheit`. Eigene Server erhalten die Fassung damit sofort in beiden Kanälen; pdfmy Scan sofort mit 100 %.
- **Information:** Hinweis im `CHANGELOG.md` und als Sicherheitshinweis auf GitHub (Security Advisory), sobald die Behebung verfügbar ist. Einzelheiten zur Ausnutzung erst, wenn die Mehrzahl der Installationen aktualisiert ist, spätestens nach 30 Tagen.
- **Cyber Resilience Act:** Ab Geltung der Meldepflichten werden aktiv ausgenutzte Schwachstellen und schwere Vorfälle fristgerecht gemeldet. Die Umsetzung im Einzelnen (Meldestelle, Fristen, Unterstützungszeitraum) wird vor dem Stichtag rechtlich geprüft und in dieser Strategie ergänzt.

## 9. Verträglichkeit, Unterstützungszeitraum, Abkündigung

- **Browser:** jeweils die zwei neuesten Hauptversionen von Chrome, Edge, Firefox und Safari.
- **pdfmy Scan:** die aktuelle Fassung und die vorige MINOR-Fassung. Ältere Fassungen funktionieren weiter, Fehlerbehebungen gibt es aber nur in der aktuellen.
- **Eigene Server:** unterstützt werden Fassungen der letzten 90 Tage. Ältere Fassungen erhalten keine Sicherheitsbehebung, sondern das Update auf die aktuelle.
- **Abkündigung:** Was Betreiber oder die IT betrifft, wird **mindestens 30 Tage vorher** angekündigt, eine nicht abwärtsverträgliche Änderung **90 Tage vorher**. Das gilt z. B. für Richtlinien, Netzwerkfreigaben, Aufrufparameter, Dateiformate von Ablage und Einstellungen, den Wegfall eines Betriebssystems und den Wechsel des Update-Schlüssels. Die Ankündigung erfolgt im `CHANGELOG.md`, auf der Firmen-Seite und auf GitHub.
- **Daten der Nutzer** (Einstellungen, Posteingangsbuch, Vorlagen im Browser) werden bei Updates übernommen. Ein neues Datenformat liest immer auch das vorige.

## 10. Rücknahme und Vorfälle

- **Auslöser:**
  - Probelauf nach dem Hochladen schlägt fehl;
  - gehäufte Fehlerberichte zur neuen Fassung (mehr als drei unabhängige Meldungen zum selben Fehler binnen 24 Stunden);
  - Datenverlust oder fehlerhafte PDFs;
  - Hinweis auf eine Sicherheitslücke durch die Fassung.
- **Ablauf:**
  1. `deploy.ps1 -Rollback` stellt binnen 15 Minuten die vorige Fassung her (die letzten 5 Fassungen sind aufbewahrt).
  2. Die zurückgenommene Fassung wird für eigene Server gesperrt und erreicht den Kanal „stabil“ nie.
  3. Danach gilt „vorwärts beheben“: Eine neue Fassung mit höherer Nummer behebt den Fehler. Eigene Server, die die zurückgenommene Fassung schon haben (Kanal „aktuell“), erhalten so die Behebung.
- **Nachbereitung:** Jeder Vorfall mit Rücknahme erhält binnen 5 Werktagen eine kurze Ursachenanalyse und, wo möglich, einen Regressionstest, der den Fehler künftig im Test-Gate abfängt (ISO 9001 10.2). Ablage im `CHANGELOG.md` bzw. in `docs/ISO-Konformitaet.md`.

## 11. Kommunikation

| Was | Wo |
|---|---|
| Jede Veröffentlichung | `docs/RELEASES.md` (automatisch: Datum, Stand, Tests, Prüfsummen-Fingerabdruck), `CHANGELOG.md` |
| Neue Funktionen für Nutzer | Hilfe (40 Sprachen) |
| Hinweise für IT und Betreiber | Firmen-Seite (`firmen.html`), Sicherheit und Compliance (`sicherheit.html`) |
| Sicherheitshinweise | GitHub Security Advisories, `CHANGELOG.md` |
| Abkündigungen | `CHANGELOG.md`, Firmen-Seite, GitHub – mit Frist nach Abschnitt 9 |

## 12. Kennzahlen

Monatlich ausgewertet und bei der jährlichen Überprüfung bewertet:

| Kennzahl | Ziel |
|---|---|
| Anteil Fassungen mit Rücknahme (Change Failure Rate) | unter 5 % |
| Zeit von der Entscheidung zur Rücknahme bis zur wiederhergestellten Fassung | unter 15 Minuten |
| Einhaltung der Fristen für Sicherheitsupdates (Abschnitt 8) | 100 % |
| Veröffentlichungen außerhalb des Freigabefensters ohne Sicherheitsgrund | 0 |
| Fassungen mit vollständiger Hilfe in 40 Sprachen | 100 % |

## 13. Rollen

| Rolle | Aufgaben |
|---|---|
| **Geschäftsführung** | erlässt und ändert diese Strategie; entscheidet über Ausnahmen und Lizenzfragen; zweite Person beim Vier-Augen-Prinzip |
| **Entwicklung** | baut, prüft, veröffentlicht, nimmt zurück; führt Release-Protokoll, Changelog und Nachweise; prüft Bibliotheken |
| **Informationssicherheit / Datenschutz** | bewertet Sicherheitsmeldungen und Schweregrad; prüft Änderungen an Update-Wegen und Schlüsseln |

## 14. Ausnahmen

Abweichungen von dieser Strategie sind nur mit Zustimmung der Geschäftsführung zulässig. Sie werden mit Begründung im Release-Protokoll vermerkt. Sicherheitsfassungen und Rücknahmen gelten nicht als Abweichung.

## 15. Umsetzung bis 01.12.2026

| Punkt | Stand 19.11.2026 |
|---|---|
| Test-Gate, Probelauf, Release-Protokoll, Rückweg | vorhanden |
| Gestufte Freigabe pdfmy Scan | vorhanden (`-ScanRollout`) |
| Kanäle „aktuell“/„stabil“ für eigene Server, signierte Versionsdatei, Aktualisierer Linux/Windows | umgesetzt (app-v292) |
| Sicherheitsfassung sofort in allen Kanälen (`-Sicherheit`) | umgesetzt (app-v292) |
| Rücknahme sperrt Fassung für „stabil“ | umgesetzt (app-v292) |
| Freigabefenster und Ruhezeit technisch prüfen (Warnung in `deploy.ps1`) | umgesetzt (app-v292) |
| Offline-Sicherung des Update-Schlüssels (zwei Kopien) | **offen – Geschäftsführung** |
| Monatliche Prüfung der SBOM auf Schwachstellen | **offen – Entwicklung, Termin einplanen** |
| GitHub Security Advisories aktivieren | **offen – Geschäftsführung (Konto haus-it)** |
| Benennung der zweiten Person für das Vier-Augen-Prinzip | **offen – Geschäftsführung** |
| Tägliche Betriebsprüfung der Live-Website (`tools/betrieb.js`: Integrität gegen das Release-Protokoll, Signaturen, Zertifikat, security.txt, Probelauf) | Prüfung umgesetzt (app-v295); **tägliche Ausführung als geplante Aufgabe – Freigabe Geschäftsführung** |
