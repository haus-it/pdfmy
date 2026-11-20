// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Rücklauf zusammenführen (app-v313): viele ausgefüllte Formulare (z. B. Mitgliedsanträge) → eine CSV-Tabelle für Excel.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js');
const F = require('../js/formdaten.js');

async function antrag(name, iban, jugend, beitrag) {
  const doc = await L.PDFDocument.create(), p = doc.addPage([595, 842]), form = doc.getForm();
  const t = (n, v, y) => { const f = form.createTextField(n); f.setText(v); f.addToPage(p, { x: 50, y, width: 300, height: 20 }); };
  t('Name', name, 700); t('IBAN', iban, 660);
  const c = form.createCheckBox('Jugendabteilung'); if (jugend) c.check(); c.addToPage(p, { x: 50, y: 620, width: 15, height: 15 });
  const d = form.createDropdown('Beitrag'); d.addOptions(['Erwachsene', 'Familie', 'Jugend']); if (beitrag) d.select(beitrag); d.addToPage(p, { x: 50, y: 580, width: 150, height: 20 });
  return doc.save();
}

test('Werte aus einer ausgefüllten PDF lesen', async () => {
  const v = await F.readValues(L, await antrag('Erika Muster', 'DE02120300000000202051', true, 'Familie'));
  assert.deepEqual(v, [{ name: 'Name', value: 'Erika Muster' }, { name: 'IBAN', value: 'DE02120300000000202051' }, { name: 'Jugendabteilung', value: true }, { name: 'Beitrag', value: 'Familie' }]);
});

test('Viele Anträge → eine Tabelle: Datei-Spalte, Feldnamen, Ja/Nein, Semikolon und Anführungszeichen, BOM', async () => {
  const recs = [
    { file: 'antrag-1.pdf', fields: await F.readValues(L, await antrag('Erika Muster', 'DE02120300000000202051', true, 'Familie')) },
    { file: 'antrag-2.pdf', fields: await F.readValues(L, await antrag('Max "Maxi" Mustermann; jun.', 'DE89370400440532013000', false, '')) },
  ];
  const csv = F.collectCsv(recs);
  assert.ok(csv.startsWith('﻿'), 'BOM für Excel');
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines[0], 'Datei;Name;IBAN;Jugendabteilung;Beitrag');
  assert.equal(lines[1], 'antrag-1.pdf;Erika Muster;DE02120300000000202051;Ja;Familie');
  assert.equal(lines[2], 'antrag-2.pdf;"Max ""Maxi"" Mustermann; jun.";DE89370400440532013000;Nein;');
});

test('Unterschiedliche Formulare: Spalten vereinigt, fehlende Felder leer', () => {
  const csv = F.collectCsv([{ file: 'a.pdf', fields: [{ name: 'Name', value: 'A' }] }, { file: 'b.pdf', fields: [{ name: 'Telefon', value: '123' }, { name: 'Name', value: 'B' }] }]);
  assert.deepEqual(csv.slice(1).trim().split('\r\n'), ['Datei;Name;Telefon', 'a.pdf;A;', 'b.pdf;B;123']);
});

test('Formel-Eingaben Dritter werden entschärft, Telefonnummern und Zahlen nicht', () => {
  const csv = F.collectCsv([{ file: 'x.pdf', fields: [{ name: 'A', value: '=HYPERLINK("http://x")' }, { name: 'B', value: '@SUM(1)' }, { name: 'Tel', value: '+49 5251 20208-11' }, { name: 'Betrag', value: '-12,50' }, { name: 'C', value: '-cmd' }] }]);
  assert.equal(csv.slice(1).trim().split('\r\n')[1], `x.pdf;"'=HYPERLINK(""http://x"")";'@SUM(1);+49 5251 20208-11;-12,50;'-cmd`);
});

test('PDF ohne Formular: leere Liste, kein Fehler; Oberfläche vorhanden', async () => {
  const doc = await L.PDFDocument.create(); doc.addPage();
  assert.deepEqual(await F.readValues(L, await doc.save()), []);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), pro = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(html, /id="fdCollect"/); assert.match(html, /id="fdCollectIn" hidden multiple accept="\.pdf/);
  assert.match(pro, /FormDaten\.collectCsv\(recs\)/);
});
