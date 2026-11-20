// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Zuwendungsbestätigung (app-v314): amtlicher Wortlaut (BMF 07.11.2013, Anlage 3 und 14), Betrag in Buchstaben, Fristen § 63 Abs. 5 AO,
// Spenderliste → Einzel- bzw. Sammelbestätigung je Person.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../vendor/pdf-lib.min.js');
const Z = require('../js/zuwendung.js');

test('Betrag in Buchstaben', () => {
  const cases = { 1: 'ein Euro', 12: 'zwölf Euro', 21: 'einundzwanzig Euro', 100: 'einhundert Euro', 101: 'einhunderteins Euro', 150: 'einhundertfünfzig Euro', 1000: 'eintausend Euro', 1001: 'eintausendeins Euro', 1234.56: 'eintausendzweihundertvierunddreißig Euro sechsundfünfzig Cent', 101000: 'einhunderteintausend Euro', 1000000: 'eine Million Euro', 2500000: 'zwei Millionen fünfhunderttausend Euro', 0.99: 'neunundneunzig Cent', 30.5: 'dreißig Euro fünfzig Cent' };
  for (const [n, w] of Object.entries(cases)) assert.equal(Z.betragWorte(Number(n)), w, n);
});

test('Fristen nach § 63 Abs. 5 AO: Freistellungsbescheid 5 Jahre, § 60a-Feststellung 3 Jahre', () => {
  const am = new Date(2026, 0, 15);
  assert.equal(Z.fristOk('frei', '2021-03-01', am).ok, true);
  assert.equal(Z.fristOk('frei', '2020-12-31', am).ok, false);
  assert.equal(Z.fristOk('60a', '2023-02-01', am).ok, true);
  assert.equal(Z.fristOk('60a', '2022-12-01', am).ok, false);
  assert.match(Z.fristOk('60a', '2022-12-01', am).grund, /älter als 3 Jahre/);
  assert.equal(Z.fristOk('frei', '', am).ok, false);
});

test('Amtlicher Wortlaut unverändert (Anlage 3 und 14)', () => {
  assert.equal(Z.T.titel1, 'Bestätigung über Geldzuwendungen/Mitgliedsbeitrag');
  assert.equal(Z.T.titelS, 'Sammelbestätigung über Geldzuwendungen/Mitgliedsbeiträge');
  assert.equal(Z.T.untertitel, 'im Sinne des § 10b des Einkommensteuergesetzes an eine der in § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes bezeichneten Körperschaften, Personenvereinigungen oder Vermögensmassen');
  assert.equal(Z.T.mitglied, 'Es wird bestätigt, dass es sich nicht um einen Mitgliedsbeitrag handelt, dessen Abzug nach § 10b Abs. 1 des Einkommensteuergesetzes ausgeschlossen ist.');
  assert.equal(Z.T.h1, 'Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG, § 9 Nr. 5 GewStG).');
  assert.equal(Z.T.h2.map(p => p[0]).join(''), 'Diese Bestätigung wird nicht als Nachweis für die steuerliche Berücksichtigung der Zuwendung anerkannt, wenn das Datum des Freistellungsbescheides länger als 5 Jahre bzw. das Datum der Feststellung der Einhaltung der satzungsmäßigen Voraussetzungen nach § 60a Abs. 1 AO länger als 3 Jahre seit Ausstellung des Bescheides zurückliegt (§ 63 Abs. 5 AO).');
  assert.equal(Z.T.frei('Z', 'FA', 'ST', 'VOM', 'VZ').map(p => p[0]).join(''), 'Wir sind wegen Förderung (Angabe des begünstigten Zwecks/der begünstigten Zwecke) Z nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes FA StNr. ST , vom VOM für den letzten Veranlagungszeitraum VZ nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.');
  assert.equal(Z.T.keineWeiteren, 'Es wird bestätigt, dass über die in der Gesamtsumme enthaltenen Zuwendungen keine weiteren Bestätigungen, weder formelle Zuwendungsbestätigungen noch Beitragsquittungen oder Ähnliches ausgestellt wurden und werden.');
});

const verein = { aussteller: { name: 'SV Musterdorf e.V.', anschrift: 'Hauptstraße 1\n33100 Paderborn' }, art: 'frei', zwecke: 'des Sports', finanzamt: 'Paderborn', stnr: '339/5555/1234', bescheidVom: '2025-03-14', vz: '2023', ort: 'Paderborn' };

test('Einzelbestätigung: eine Seite A4, Text enthält Betrag in Ziffern und Buchstaben', async () => {
  const bytes = await Z.erzeugen(L, { ...verein, zuwendender: { name: 'Erika Muster', anschrift: 'Lindenweg 5' }, betrag: 150, datum: new Date(2025, 11, 3) });
  const doc = await L.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1); assert.equal(Math.round(doc.getPage(0).getWidth()), 595);
  assert.equal(doc.getTitle(), 'Bestätigung über Geldzuwendungen/Mitgliedsbeitrag');
});

test('Spenderliste: je Person gruppiert, eine Zuwendung = Einzel-, mehrere = Sammelbestätigung (2 Seiten)', async () => {
  const rows = [['Name', 'Straße', 'PLZ', 'Ort', 'Betrag', 'Datum', 'Verzicht', 'Art'],
    ['Erika Muster', 'Lindenweg 5', '33102', 'Paderborn', '150,00', '03.12.2025', '', ''],
    ['Max Mustermann', 'Am Bach 2', '33104', 'Paderborn', '60', '15.01.2025', 'nein', 'Mitgliedsbeitrag'],
    ['Max Mustermann', 'Am Bach 2', '33104', 'Paderborn', '1.045,50', '20.11.2025', 'ja', ''],
    ['', '', '', '', '', '', '', ''], ['Ohne Betrag', '', '', '', '', '', '', '']];
  const { personen, fehler } = Z.ausTabelle(rows);
  assert.equal(personen.length, 2); assert.deepEqual(fehler, ['Zeile 6: Name oder Betrag fehlt.']);
  assert.equal(personen[0].anschrift, 'Lindenweg 5\n33102 Paderborn');
  const max = personen[1]; assert.equal(max.zuwendungen.length, 2); assert.equal(max.zuwendungen[1].betrag, 1045.5);
  assert.equal(max.zuwendungen[0].art, 'mitglied'); assert.equal(max.zuwendungen[1].verzicht, true);
  const d1 = Z.fuerPerson(verein, personen[0]), d2 = Z.fuerPerson(verein, max);
  assert.equal(d1.betrag, 150); assert.equal(d2.zuwendungen.length, 2);
  assert.equal((await L.PDFDocument.load(await Z.erzeugen(L, d2))).getPageCount(), 2);
  assert.deepEqual(Z.ausTabelle([['Notiz', 'Telefon'], ['A', '5']]).fehler, ['Die Tabelle braucht mindestens die Spalten „Name“ und „Betrag“.']);
});

test('Unicode-Namen mit eingebetteter Schrift (Şahin, Yılmaz, Łukasz); Oberfläche angebunden', async () => {
  const fs = require('node:fs'), path = require('node:path'), fontkit = require('../vendor/fontkit.umd.min.js');
  const regular = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'DejaVuSans.ttf')), bold = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'dejavu', 'DejaVuSans-Bold.ttf'));
  const bytes = await Z.erzeugen(L, { ...verein, zuwendender: { name: 'Ayşe Yılmaz-Şahin, Łukasz Nowak', anschrift: 'Straße 1' }, betrag: 25, datum: new Date(2025, 5, 1) }, { fontkit, regular, bold });
  assert.equal((await L.PDFDocument.load(bytes)).getPageCount(), 1);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  new (require('node:vm').Script)(src);
  assert.match(html, /id="btnZuw"/); assert.match(html, /<script src="js\/zuwendung\.js"><\/script>/);
  assert.match(src, /await Zuwendung\.erzeugen\(PDFLib, d, await zuwOpts\(\)\)/);
  assert.match(src, /Zuwendung\.fristOk\(zuwArt\(\), \$\('#zuwVom'\)\.value\)/);
});
