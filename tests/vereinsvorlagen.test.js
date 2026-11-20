// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Vereinsvorlagen (app-v315): ausfüllbare Formulare; Rundlauf Vorlage → ausgefüllt zurück → eine Excel-Liste (v313).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js');
const V = require('../js/vereinsvorlagen.js'), F = require('../js/formdaten.js');
const v = { verein: 'SC Aleviten Paderborn e.V.', anschrift: 'Musterstraße 1\n33100 Paderborn', glaeubigerId: 'DE98ZZZ09999999999', beitraege: 'Erwachsene 60 €\nJugend 30 €', zweck: 'die Vereinszeitung', kontakt: 'info@beispiel.de' };

test('Mitgliedsantrag: Felder, SEPA-Wortlaut mit Vereinsname, Beiträge zum Ankreuzen, kein Doppelpunkt nach e.V.', async () => {
  const doc = await L.PDFDocument.load(await V.erzeugen(L, 'mitglied', v));
  const names = doc.getForm().getFields().map(f => f.getName());
  for (const n of ['Vorname', 'Nachname', 'Strasse', 'PLZ', 'Ort', 'E-Mail', 'IBAN', 'BIC', 'Kontoinhaber', 'Beitrag 1', 'Beitrag 2', 'Datenschutz']) assert.ok(names.includes(n), n);
  assert.equal(doc.getPageCount(), 1);
  assert.match(V.SEPA('X e.V.')[0], /^Ich ermächtige X e\.V\., Zahlungen von meinem Konto mittels Lastschrift einzuziehen\. Zugleich weise ich mein Kreditinstitut an, die von X e\.V\. auf mein Konto gezogenen Lastschriften einzulösen\.$/);
  assert.equal(V.SEPA('X')[1], 'Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen.');
  assert.ok(doc.getForm().getTextField('Vorname').isRequired());
  assert.equal(doc.getTitle(), 'Mitgliedsantrag – SC Aleviten Paderborn e.V.');
});

test('Foto- und Fahrt-Vorlage: als Muster gekennzeichnet, Felder vorhanden', async () => {
  const foto = await L.PDFDocument.load(await V.erzeugen(L, 'foto', v)), fahrt = await L.PDFDocument.load(await V.erzeugen(L, 'fahrt', v));
  assert.deepEqual(['Name', 'Website', 'Soziale Medien', 'Presse', 'Namensnennung'].filter(n => !foto.getForm().getFields().some(f => f.getName() === n)), []);
  assert.deepEqual(['Name des Kindes', 'Gesundheit', 'Notfallkontakt', 'Notfalltelefon', 'Schwimmen'].filter(n => !fahrt.getForm().getFields().some(f => f.getName() === n)), []);
  await assert.rejects(V.erzeugen(L, 'unbekannt', v), /Unbekannte Vorlage/);
});

test('Aufwandsentschädigung (v322): Freibeträge 2026, Erklärung, zwei Unterschriften, eine Seite', async () => {
  assert.deepEqual(V.PAUSCHALE, { jahr: 2026, uebungsleiter: 3300, ehrenamt: 960 });
  const doc = await L.PDFDocument.load(await V.erzeugen(L, 'pauschale', v)), names = doc.getForm().getFields().map(f => f.getName());
  for (const n of ['Vorname', 'Nachname', 'Steuer-ID', 'IBAN', 'Taetigkeit', 'Betrag', 'Uebungsleiterfreibetrag', 'Ehrenamtspauschale', 'Anderweitig genutzt', 'Engagierte Ort Datum', 'Verein Ort Datum']) assert.ok(names.includes(n), n);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getForm().getTextField('Steuer-ID').getMaxLength(), 11);
  for (const f of doc.getForm().getFields()) assert.ok(f.acroField.getWidgets()[0].getRectangle().y > 30, f.getName());
  const raw = Buffer.from(await V.erzeugen(L, 'pauschale', v)).toString('latin1');
  assert.doesNotMatch(raw, /\/JavaScript|\/JS\s/, 'keine Skripte');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /name="vvArt" value="pauschale"/);
});

test('Rundlauf: zwei Anträge ausgefüllt → eine Liste mit sprechenden Spalten', async () => {
  const fill = async (vor, nach, iban, jugend) => {
    const doc = await L.PDFDocument.load(await V.erzeugen(L, 'mitglied', v)), f = doc.getForm();
    f.getTextField('Vorname').setText(vor); f.getTextField('Nachname').setText(nach); f.getTextField('IBAN').setText(iban);
    if (jugend) f.getCheckBox('Beitrag 2').check(); else f.getCheckBox('Beitrag 1').check();
    return F.readValues(L, await doc.save({ updateFieldAppearances: false }));
  };
  const csv = F.collectCsv([{ file: 'a.pdf', fields: await fill('Ayşe', 'Yılmaz', 'DE02120300000000202051', true) }, { file: 'b.pdf', fields: await fill('Max', 'Muster', 'DE89370400440532013000', false) }]);
  const [head, a, b] = csv.slice(1).trim().split('\r\n');
  assert.match(head, /^Datei;Vorname;Nachname;Geburtsdatum;Strasse;PLZ;Ort;E-Mail;Telefon;Eintritt;Beitrag 1;Beitrag 2;Datenschutz;/);
  assert.match(a, /^a\.pdf;Ayşe;Yılmaz;/); assert.match(a, /;Nein;Ja;Nein;/); assert.match(b, /DE89370400440532013000/);
});

test('Oberfläche angebunden, Gläubiger-ID geprüft', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(html, /id="btnVV"/); assert.match(html, /<script src="js\/vereinsvorlagen\.js"><\/script>/);
  assert.match(src, /await Vereinsvorlagen\.erzeugen\(PDFLib, vvArt\(\), v, await zuwOpts\(\)\)/);
  assert.match(src, /QrStempel\.ibanValid\(v\.glaeubigerId\.slice\(0, 4\) \+ v\.glaeubigerId\.slice\(7\)\)/);
  const Q = require('../js/qrstempel.js'), id = 'DE98ZZZ09999999999';
  assert.equal(Q.ibanValid(id.slice(0, 4) + id.slice(7)), true);
  assert.equal(Q.ibanValid('DE99ZZZ09999999999'.slice(0, 4) + id.slice(7)), false);
});
