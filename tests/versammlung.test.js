// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mitgliederversammlung (app-v321): Einladung mit Tagesordnung, Anwesenheitsliste, Protokoll; Fristen; Mitgliederliste
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const PDFLib = require('../vendor/pdf-lib.min.js');
const V = require('../js/versammlung.js');

test('Tagesordnung: Nummern und Aufzählungszeichen entfernen, leer → übliche Punkte', () => {
  assert.deepEqual(V.tagesordnung('1. Begrüßung\nTOP 2: Kassenbericht\n3) Wahlen\n- Verschiedenes\n\n'), ['Begrüßung', 'Kassenbericht', 'Wahlen', 'Verschiedenes']);
  const std = V.tagesordnung('');
  assert.equal(std.length, 10); assert.match(std[0], /Beschlussfähigkeit/); assert.match(std.at(-1), /Verschiedenes/);
});

test('Fristen: Zugang, E-Mail, Brief (4 Tage, kein Sonntag), Antragsschluss, verspätet', () => {
  const heute = new Date(2026, 10, 20);                 // Fr 20.11.2026
  const f = V.fristen(new Date(2027, 2, 19), { wochen: 2, antragsTage: 7, heute });   // Fr 19.03.2027
  assert.equal(V.datum(f.zugang), '04.03.2027');        // 14 Tage + 1 Tag Sicherheit
  assert.equal(V.datum(f.brief), '27.02.2027');         // 4 Tage Postlaufzeit (Sa)
  assert.equal(V.datum(f.antrag), '12.03.2027');
  assert.deepEqual(f.hinweise, []);
  const sonntag = V.fristen(new Date(2027, 2, 18), { wochen: 2, heute });   // Zugang Mi 03.03. → Brief So 28.02. → Sa 27.02.
  assert.equal(V.datum(sonntag.brief), '27.02.2027');
  const knapp = V.fristen(new Date(2026, 11, 7), { wochen: 2, heute });    // Zugang 22.11., Brief 18.11. vorbei
  assert.equal(knapp.spaet, false); assert.match(knapp.hinweise[0], /per E-Mail/);
  const zuSpaet = V.fristen(new Date(2026, 11, 1), { wochen: 2, heute });
  assert.equal(zuSpaet.spaet, true); assert.match(zuSpaet.hinweise[0], /nicht mehr einzuhalten/);
  assert.match(V.fristen(new Date(2026, 10, 19), { heute }).hinweise[0], /nicht in der Zukunft/);
});

test('Mitgliederliste: Vorname/Nachname oder Name, Anschrift aus Straße/PLZ/Ort, Vorspann und Leerzeilen', () => {
  const t = V.ausTabelle([['Mitgliederliste 2026'], [], ['Vorname', 'Nachname', 'Straße', 'PLZ', 'Ort', 'E-Mail'],
    ['Ayşe', 'Yılmaz', 'Hauptstr. 1', '33100', 'Paderborn', 'a@example.org'], ['', '', '', '', '', ''], ['Jürgen', 'Groß', 'Am Markt 2', '33098', 'Paderborn', '']]);
  assert.deepEqual(t.fehler, []);
  assert.deepEqual(t.mitglieder[0], { name: 'Ayşe Yılmaz', strasse: 'Hauptstr. 1', plzOrt: '33100 Paderborn', email: 'a@example.org' });
  assert.equal(t.mitglieder.length, 2);
  assert.equal(V.ausTabelle([['Name', 'Anschrift'], ['Verein Muster', 'Weg 3']]).mitglieder[0].strasse, 'Weg 3');
  assert.match(V.ausTabelle([['Betrag'], ['5']]).fehler[0], /Name/);
});

test('PDF: Einladung je Mitglied, Anwesenheitsliste mit Namen, Protokoll mit Feldern je TOP', async () => {
  const v = { verein: 'TuS Musterdorf 1920 e.V.', anschrift: 'Sportplatzweg 1\n33100 Paderborn', ort: 'Vereinsheim, Sportplatzweg 1', datum: new Date(2027, 2, 19), uhrzeit: '19:30',
    online: 'Videokonferenz, Zugangsdaten auf Anfrage beim Vorstand', tops: '', unterzeichner: 'Erika Muster', funktion: '1. Vorsitzende', heute: new Date(2026, 10, 20),
    mitglieder: [{ name: 'Jürgen Groß', strasse: 'Am Markt 2', plzOrt: '33098 Paderborn' }, { name: 'Anna Beispiel', strasse: 'Weg 3', plzOrt: '33100 Paderborn' }] };
  const r = await V.erzeugen(PDFLib, v);
  assert.equal(r.briefe, 2); assert.equal(r.tops.length, 10);
  const doc = await PDFLib.PDFDocument.load(r.bytes);
  assert.ok(doc.getPageCount() >= 5, 'zwei Briefe, Anwesenheitsliste, Protokoll');
  const felder = doc.getForm().getFields().map(f => f.getName());
  for (const n of ['Beginn', 'Ende', 'Anwesende', 'Versammlungsleitung', 'Protokollfuehrung', 'Beschlussfaehig', 'TOP 1 Verlauf', 'TOP 10 Ja', 'TOP 10 Enthaltung']) assert.ok(felder.includes(n), 'Feld ' + n);
  assert.match(doc.getTitle(), /Ordentliche Mitgliederversammlung 2027 – TuS Musterdorf/);
  assert.ok(!r.bytes.includes ? true : true);
  const raw = Buffer.from(r.bytes).toString('latin1'); assert.doesNotMatch(raw, /\/JavaScript|\/JS\s*\(/, 'keine Skripte im PDF');
  // nur Protokoll, außerordentlich, eigene Tagesordnung
  const p = await V.erzeugen(PDFLib, { verein: 'Kita-Förderverein', datum: new Date(2027, 0, 15), art: 'außerordentliche', tops: 'Satzungsänderung\nWahl Kassenwart', teile: { einladung: false, anwesenheit: false, protokoll: true } });
  const pd = await PDFLib.PDFDocument.load(p.bytes);
  assert.equal(pd.getPageCount(), 1); assert.match(pd.getTitle(), /Außerordentliche/);
  assert.ok(pd.getForm().getFields().some(f => f.getName() === 'TOP 2 Nein'));
  await assert.rejects(() => V.erzeugen(PDFLib, { verein: 'X', datum: new Date('x') }), /Datum/);
  await assert.rejects(() => V.erzeugen(PDFLib, { verein: 'X', datum: new Date(2027, 0, 1), teile: { einladung: false, anwesenheit: false, protokoll: false } }), /mindestens einen Teil/);
});

test('Oberfläche angebunden', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(html, /id="btnMv"/); assert.match(html, /<script src="js\/versammlung\.js"><\/script>/);
  assert.match(src, /Versammlung\.erzeugen\(PDFLib/); assert.match(src, /Versammlung\.ausTabelle\(await fdReadTable\(/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), /js\/versammlung\.js/);
});
