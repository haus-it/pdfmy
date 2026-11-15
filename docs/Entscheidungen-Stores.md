# Entscheidungen für die Geschäftsführung – Stores und Verteilung

Stand 15.11.2026. Je Punkt: worum es geht, meine Empfehlung, was danach passiert. Ankreuzen genügt – den Rest erledige ich.

| # | Entscheidung | Empfehlung | Danach |
|---|---|---|---|
| 1 | **Firefox-Erweiterung hochladen** (Konto support@haus-it.de besteht) | ☐ Ja, sofort | Sie laden hoch (10 Min., `docs/Store-Einreichung.md` Nr. 1), ich trage den Link ein |
| 2 | **Edge- und Chrome-Store**: Konten der Mentor GmbH anlegen; Chrome kostet einmalig 5 US-Dollar | ☐ Ja | Sie legen die Konten an und laden hoch (je 20 Min.) |
| 3 | **Microsoft Partner Center** (Programm „Microsoft 365 und Copilot“) für Outlook, Word, Excel, PowerPoint und Teams | ☐ Ja, früh anstoßen (Firmenprüfung dauert) | Sie registrieren die Firma; danach Angebote einreichen (30 Min.) |
| 4 | **Nutzungsbedingungen veröffentlichen** – Microsoft AppSource und Teams verlangen eine Adresse dafür | ☑ **Erledigt 15.11.2026** (GF: „nicht als Entwurf“) – ohne anwaltliche Prüfung veröffentlicht | Seite https://pdfmy.de/nutzungsbedingungen.html (deutsch, Link in der Fußzeile in 40 Sprachen), im Teams-Manifest eingetragen; Nachweis `docs/Nutzungsbedingungen.md` |
| 5 | **Lizenz der Nextcloud-App** – der Nextcloud-App-Store nimmt nur Apps mit AGPL-kompatibler Lizenz | ☑ **Entschieden 15.11.2026: AGPL-3.0-or-later** für die Nextcloud-App (PDFMy bleibt PolyForm Noncommercial) | Umgesetzt (App 1.0.1, `info.xml` gegen das Schema des App-Stores geprüft, `.tar.gz` gebaut, Schlüssel und Zertifikatsanfrage erzeugt). **Sie:** Zertifikatsanfrage per Pull Request einreichen – Anleitung `docs/Store-Einreichung.md` Nr. 7 |
| 6 | **ONLYOFFICE-Marktplatz** – Aufnahme per Beitrag im GitHub-Projekt ONLYOFFICE/onlyoffice.github.io | ☐ Ja ☐ später | **Beitrag vorbereitet 15.11.2026** (`store/onlyoffice/marktplatz/`, Plugin 1.0.1 mit allen Marktplatz-Symbolen); Sie reichen ihn mit dem GitHub-Konto haus-it ein (Anleitung Nr. 6, ca. 10 Min.) |
| 7 | **OneDrive/SharePoint „Öffnen mit → PDFMy“** – braucht eine App-Registrierung in Microsoft Entra (Konto der Mentor GmbH oder je Kunde) | ☐ später, nach AppSource | – |
| 8 | **DATEV-Marktplatz** (Partnerschaft, Prüfung durch DATEV) und **Safari** (Apple-Entwicklerkonto, 99 US-Dollar/Jahr) | ☐ später | – |

**Was ohne Entscheidung schon fertig ist:** alle Pakete, Bilder und Texte (`store/`, `docs/Store-Einreichung.md`), die Manifeste sind von Microsofts Prüfer als gültig bestätigt, die Firefox-Erweiterung von Mozillas Prüfwerkzeug (0 Fehler, 0 Warnungen).

## Weitere Entscheidungen der Geschäftsführung (15.11.2026)

| Frage | Entscheidung |
|---|---|
| Nutzungsbedingungen: kommerzielle Nutzung von PDFMy ausdrücklich erlauben? | **Nein, so lassen.** Quellcode und Nutzung bleiben wie bisher geregelt. |
| Werbehinweis für Firmen und Behörden zentral abschaltbar? | **Nein, immer anzeigen.** |
| Supportzeitraum nach Cyberresilienz-Verordnung (ab 11.12.2027 Pflicht, mindestens 5 Jahre) | **Später entscheiden** – spätestens bis 11.12.2027. |
| Lizenz der Nextcloud-App | **AGPL-3.0-or-later** (siehe Nr. 5). |
