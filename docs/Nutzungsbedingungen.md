# Nutzungsbedingungen PDFMy – Nachweis

**Veröffentlicht am 15.11.2026:** https://pdfmy.de/nutzungsbedingungen.html (Entscheidung GF: „nicht als Entwurf“).

- **Maßgeblicher Wortlaut:** die Seite selbst. Quelle ist `tools/build-web.js` (Abschnitt „Nutzungsbedingungen“, Konstante `TERMS_DATE`). Dieses Dokument enthält den Text bewusst nicht noch einmal, damit es keine zweite, abweichende Fassung gibt.
- **Sprache:** nur deutsch, ohne Sprachwahl (wie die anderen Rechtstexte). Der Link „Nutzungsbedingungen“ in der Fußzeile von pdfmy.de und in der Hilfe ist in allen 40 Sprachen übersetzt.
- **Eingebunden:**
  - Fußzeile der App (am Handy ausgeblendet wie Hilfe und Presse),
  - Hilfe → Datenschutz und Sicherheit,
  - Service Worker (offline verfügbar),
  - Teams-Manifest (`termsOfUseUrl`, vorher Impressum).
- **Anwaltliche Prüfung:** nicht erfolgt. Der Entwurf vom 17.10.2026 war dafür vorgesehen; die GF hat am 15.11.2026 die Veröffentlichung ohne Prüfung entschieden. Eine spätere Prüfung bleibt empfohlen. Bei Änderungen `TERMS_DATE` anpassen und hier eintragen.

## Entscheidungen zu den offenen Punkten des Entwurfs (15.11.2026)

| Stelle | Entscheidung |
|---|---|
| Stand | 15.11.2026 |
| § 1 Bestandteile | ergänzt um die Add-ins und Erweiterungen für Microsoft 365, Teams, Thunderbird, LibreOffice, Nextcloud und ONLYOFFICE |
| § 2 Abs. 3 kostenpflichtige Angebote | Satz ergänzt: Für künftige kostenpflichtige Leistungen gelten gesonderte Bedingungen, die vor einer Buchung mitgeteilt werden |
| § 4 Abs. 2 Hinweise an Behörden | „im gesetzlich zulässigen Rahmen“ ergänzt (Abstimmung mit dem Datenschutz) |
| § 7 Abs. 2 Haftung | statt vollständigem Ausschluss leichter Fahrlässigkeit die übliche AGB-feste Fassung (§ 309 Nr. 7, § 307 BGB): Haftung bei Verletzung wesentlicher Pflichten, begrenzt auf den vorhersehbaren, typischen Schaden. Gesetzliche Erleichterungen für unentgeltliche Leistungen bleiben unberührt |
| § 7 Abs. 3 erkannte Inhalte, Wirksamkeit | als Leistungsbeschreibung formuliert („Hilfen, deren Richtigkeit wir nicht zusichern“) mit Vorbehalt „Absatz 1 bleibt unberührt“ |
| § 8 Lizenzen | öffentlich verlinkt: GitHub `haus-it/pdfmy`, Ordner `vendor/licenses`; Quellcode-Lizenz PolyForm Noncommercial 1.0.0 genannt |
| § 9 Hinweis bei Änderungen | kein eigener Hinweis in der App; Datum „Stand“ auf der Seite |
| § 10 Kontakt | E-Mail-Adresse aus dem Impressum (`tools/site.json` → `operator.email`) und „Mehr → Problem melden“ |
| Einbeziehung | Link in Fußzeile und Hilfe, keine Zustimmung per Klick (es gibt kein Konto) |

## Noch offen (für eine spätere anwaltliche Prüfung)

1. Einbeziehung ohne Klick-Zustimmung bei einer App ohne Konto.
2. Anwendbarkeit der §§ 327 ff. BGB (digitale Produkte) bei unentgeltlicher Bereitstellung ohne Datenhingabe.
3. § 275 StGB: Reicht die Sperre für Ausweise?
4. § 36 VSBG: Angabe zur Verbraucherschlichtung (gleich wie im Impressum).
