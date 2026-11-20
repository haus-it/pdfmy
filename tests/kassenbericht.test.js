// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Kassenbericht für die Mitgliederversammlung (app-v316): Bank-Export/Kassenbuch → Bericht mit Bereichen, Abgleich, Prüfvermerk.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js');
const K = require('../js/kassenbericht.js'), { parseCsv } = require('../js/textpdf.js');

// Sparkasse CSV-CAMT (gekürzt): Auftragskonto, Buchungstag, Valutadatum, Buchungstext, Verwendungszweck, Begünstigter, IBAN, Betrag
const spk = ['"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"Betrag";"Waehrung"',
  '"DE02472501010000000001";"15.01.26";"15.01.26";"GUTSCHRIFT";"Mitgliedsbeitrag 2026";"Ayşe Yılmaz";"DE0212";"60,00";"EUR"',
  '"DE02472501010000000001";"20.01.26";"20.01.26";"LASTSCHRIFT";"Beitragsrechnung 2026";"Landessportbund NRW";"DE0399";"-245,50";"EUR"',
  '"DE02472501010000000001";"03.02.26";"03.02.26";"GUTSCHRIFT";"Spende Jugendarbeit";"Max Muster";"DE0411";"150,00";"EUR"',
  '"DE02472501010000000001";"28.02.26";"28.02.26";"ENTGELT";"Kontoführung";"";"";"-7,90";"EUR"',
  '"DE02472501010000000001";"10.06.26";"10.06.26";"GUTSCHRIFT";"Sommerfest Getränkeverkauf";"Kasse Sommerfest";"";"1.234,50";"EUR"'].join('\r\n');

test('Sparkasse-Export: Spalten erkannt, Vorzeichen, Kategorien und Bereiche vorgeschlagen', () => {
  const { buchungen, fehler } = K.ausTabelle(parseCsv(spk));
  assert.deepEqual(fehler, []); assert.equal(buchungen.length, 5);
  const [b1, b2, b3, b4, b5] = buchungen;
  assert.equal(b1.name, 'Ayşe Yılmaz'); assert.equal(b1.betrag, 60); assert.equal(b1.kategorie, 'Mitgliedsbeiträge'); assert.equal(b1.bereich, 'ideell');
  assert.equal(b2.betrag, -245.5); assert.equal(b2.kategorie, 'Verbandsbeiträge');
  assert.equal(b3.kategorie, 'Spenden'); assert.equal(b4.kategorie, 'Kontoführung und Bankgebühren');
  assert.equal(b5.betrag, 1234.5); assert.equal(b5.bereich, 'wgb'); assert.equal(b5.datum.getMonth(), 5);
});

test('ING-Export mit Vorspann und Saldo: Anfangs- und Endbestand aus der Bank, neueste oben', () => {
  const ing = ['Umsatzanzeige;Datei erstellt am: 05.01.2027', 'IBAN;DE12 5001 0517 0000 0000 00', 'Zeitraum;01.01.2026 - 31.12.2026', '',
    'Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung',
    '30.11.2026;30.11.2026;Stadt Paderborn;Gutschrift;Zuschuss Jugendfreizeit;2.390,00;EUR;500,00;EUR',
    '02.03.2026;02.03.2026;ARAG;Lastschrift;Sportversicherung;1.890,00;EUR;-110,00;EUR',
    '05.01.2026;05.01.2026;Zinsen;Abschluss;Habenzinsen;2.000,00;EUR;0,00;EUR',
    '04.01.2026;04.01.2026;Kreissportbund;Gutschrift;Ehrung Pokal Rückerstattung;2.000,00;EUR;50,00;EUR'].join('\n');
  const t = K.ausTabelle(parseCsv(ing));
  assert.equal(t.buchungen.length, 3, 'Nullbuchung übersprungen');
  assert.equal(t.anfang, 1950); assert.equal(t.ende, 2390);
  assert.equal(t.buchungen[0].datum.getDate(), 4); assert.equal(t.buchungen[2].kategorie, 'Zuschüsse und Fördermittel');
  const a = K.auswerten(t.buchungen, { anfang: t.anfang, kontostand: t.ende });
  assert.equal(a.ende, 2390); assert.equal(a.differenz, 0); assert.match(a.hinweise[0], /stimmt mit dem Kontostand überein/);
});

test('Eigenes Kassenbuch: Einnahme/Ausgabe, Kategorie und Bereich der Tabelle haben Vorrang; Freigrenze § 64 AO', () => {
  const rows = [['Datum', 'Text', 'Einnahme', 'Ausgabe', 'Kategorie', 'Bereich'],
    ['2026-05-01', 'Maifest Bier', '48.000,00', '', 'Maifest', 'wirtschaftlicher Geschäftsbetrieb'],
    ['2026-05-02', 'Maifest Einkauf', '', '12.000,00', 'Maifest', 'Wirtschaftlicher Geschäftsbetrieb'],
    ['2026-07-01', 'Platzmiete', '', '300,00', '', ''],
    ['2026-08-01', 'Unklar', '20,00', '', '', '']];
  const { buchungen } = K.ausTabelle(rows);
  assert.equal(buchungen[0].kategorie, 'Maifest'); assert.equal(buchungen[0].bereich, 'wgb'); assert.equal(buchungen[0].vorschlag, false);
  assert.equal(buchungen[1].betrag, -12000); assert.equal(buchungen[2].kategorie, 'Miete, Hallen und Nebenkosten');
  const a = K.auswerten(buchungen, { anfang: 1000, kontostand: 36000 });
  assert.equal(a.ende, 36720); assert.equal(a.differenz, -720);
  assert.equal(a.bereiche.wgb.ein, 48000); assert.equal(a.freigrenze, 50000);
  assert.ok(a.hinweise.some(h => /nahe an der Freigrenze von 50\.000,00 €/.test(h)));
  assert.ok(a.hinweise.some(h => /weicht um -720,00 € vom Kontostand ab/.test(h)));
  assert.ok(a.hinweise.some(h => /1 Buchung\(en\) sind keinem steuerlichen Bereich/.test(h)));
  assert.equal(K.freigrenze(2025), 45000); assert.equal(K.freigrenze(2026), 50000);
  assert.ok(K.auswerten([{ datum: new Date(2025, 3, 1), betrag: 46000, kategorie: 'Fest', bereich: 'wgb' }]).hinweise.some(h => /übersteigen die Freigrenze von 45\.000,00 €/.test(h)));
});

test('Korrektur-CSV wird wieder gelesen (Rundlauf), Formeln entschärft', () => {
  const { buchungen } = K.ausTabelle(parseCsv(spk));
  buchungen[4].kategorie = '=HYPERLINK("x")';
  const back = K.ausTabelle(parseCsv(K.toCsv(buchungen).slice(1))).buchungen;
  assert.equal(back.length, 5); assert.equal(back[1].betrag, -245.5); assert.equal(back[0].bereich, 'ideell'); assert.equal(back[0].vorschlag, false);
  assert.equal(back[4].kategorie, `'=HYPERLINK("x")`);
  assert.equal(K.zahl('12,50-'), -12.5); assert.equal(K.zahl('(7,90)'), -7.9); assert.equal(K.datum(46031).getUTCFullYear(), 2026);
});

test('PDF: Übersicht, Bereiche, Prüfvermerk, Buchungsliste über mehrere Seiten', async () => {
  const many = Array.from({ length: 90 }, (_, i) => ({ datum: new Date(2026, i % 12, 1 + (i % 27)), name: 'Mitglied ' + i, text: 'Mitgliedsbeitrag', betrag: 60, kategorie: 'Mitgliedsbeiträge', bereich: 'ideell', vorschlag: true }));
  const bytes = await K.erzeugen(L, { verein: 'TuS Musterdorf e.V.', kassenwart: 'Erika Muster', ort: 'Paderborn', buchungen: many, anfang: 100, kontostand: 5500 });
  const doc = await L.PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3); assert.equal(doc.getTitle(), 'Kassenbericht 2026 – TuS Musterdorf e.V.');
  const raw = Buffer.from(bytes).toString('latin1');
  assert.ok(raw.length > 3000);
});

test('Oberfläche angebunden', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(html, /id="btnKb"/); assert.match(html, /<script src="js\/kassenbericht\.js"><\/script>/);
  assert.match(src, /Kassenbericht\.ausTabelle\(rows \|\| await fdReadTable\(f\)\)/); assert.match(src, /Bank\.parseCamt\(/); assert.match(src, /await Kassenbericht\.erzeugen\(PDFLib,/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), /js\/kassenbericht\.js/);
});

test('Pauschalen je Person gegen den Freibetrag (v323): über, prüfen, nah; im PDF-Hinweis ohne Namen', async () => {
  const V = require('../js/vereinsvorlagen.js');
  assert.deepEqual(K.freibetrag(2026), { ul: V.PAUSCHALE.uebungsleiter, ea: V.PAUSCHALE.ehrenamt }, 'gleiche Werte wie die Vorlage');
  assert.deepEqual(K.freibetrag(2025), { ul: 3000, ea: 840 });
  const rows = [['Datum', 'Name', 'Verwendungszweck', 'Betrag']];
  for (let m = 1; m <= 12; m++) {
    rows.push([`28.${String(m).padStart(2, '0')}.2026`, 'Max Berg', 'Übungsleiterpauschale Jugend', '-290,00']);   // 3.480 € > 3.300 €
    rows.push([`28.${String(m).padStart(2, '0')}.2026`, 'Erika Kasse', 'Ehrenamtspauschale Kassenwartin', '-75,00']);   // 900 € = nah an 960 €
    rows.push([`28.${String(m).padStart(2, '0')}.2026`, 'Paul Platz', 'Aufwandsentschädigung', '-100,00']);   // 1.200 €, Art unklar
  }
  rows.push(['10.03.2026', 'Lena Lauf', 'Trainerpauschale', '-500,00']);   // 500 €, ok
  rows.push(['15.03.2026', 'Max Berg', 'Mitgliedsbeitrag zurück', '-10,00']);   // andere Kategorie
  const t = K.ausTabelle(rows), a = K.auswerten(t.buchungen);
  const by = Object.fromEntries(a.pauschalen.map(p => [p.name, p]));
  assert.equal(by['Max Berg'].summe, 3480); assert.equal(by['Max Berg'].art, 'ul'); assert.equal(by['Max Berg'].status, 'ueber');
  assert.equal(by['Erika Kasse'].art, 'ea'); assert.equal(by['Erika Kasse'].status, 'nah');
  assert.equal(by['Paul Platz'].art, 'offen'); assert.equal(by['Paul Platz'].status, 'pruefen');
  assert.equal(by['Lena Lauf'].status, 'ok');
  const h = a.hinweise.join('\n');
  assert.match(h, /Bei 1 Person\(en\) übersteigen .*3\.300,00 €.*960,00 €/);
  assert.match(h, /Bei 1 Person\(en\) liegen die Zahlungen über der Ehrenamtspauschale/);
  assert.doesNotMatch(h, /Max Berg|Erika|Paul Platz/, 'keine Namen im Bericht für alle Mitglieder');
  const pdf = Buffer.from(await K.erzeugen(L, { verein: 'TV Test', buchungen: t.buchungen })).toString('latin1');
  assert.ok(pdf.length > 1000);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(src, /const pp = a\.pauschalen\.filter\(p => p\.status !== 'ok'\);/, 'Namen nur in der App');
});
