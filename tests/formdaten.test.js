// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Formulardaten (js/formdaten.js): XFDF/FDF hin und zurück, CSV für Excel, Spalten zuordnen, Serien-Dateinamen
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/formdaten.js');

const fields = [
  { name: 'Name', kind: 'text', value: '' },
  { name: 'PLZ', kind: 'text', value: '' },
  { name: 'Text7', kind: 'text', value: '', tip: 'E-Mail' },
  { name: 'Mitglied', kind: 'check', value: false },
  { name: 'Anrede', kind: 'select', options: ['Frau', 'Herr', 'Divers'], value: '' },
  { name: 'Summe', kind: 'text', value: '', ro: true },
];

test('XFDF hin und zurück mit Sonderzeichen und Kontrollkästchen', () => {
  const x = D.toXfdf({ Name: 'Müller & Söhne <GmbH>', Mitglied: true, PLZ: '' }, 'antrag.pdf');
  assert.match(x, /<xfdf xmlns="http:\/\/ns.adobe.com\/xfdf\/"/);
  assert.deepEqual(D.parse(x, 'a.xfdf'), { Name: 'Müller & Söhne <GmbH>', Mitglied: 'Yes', PLZ: '' });
});
test('XFDF von Acrobat: verschachtelte Feldnamen und Mehrfachauswahl', () => {
  const x = '<?xml version="1.0"?><xfdf xmlns="http://ns.adobe.com/xfdf/"><fields><field name="adr"><field name="ort"><value>Paderborn</value></field></field><field name="l"><value>A</value><value>B</value></field><field name="leer"/></fields></xfdf>';
  assert.deepEqual(D.parseXfdf(x), { 'adr.ort': 'Paderborn', l: ['A', 'B'] });
});
test('FDF: Klammer-, Hex-, UTF-16- und Namenswerte', () => {
  const fdf = '%FDF-1.2\n1 0 obj<</FDF<</Fields[<</T(Name)/V(Meier \\(Kanzlei\\))>><</T<504C5A>/V(33098)>><</T(Mitglied)/V/Yes>><</T(Ort)/V(\xfe\xff\x00P\x00b)>>]>>>>endobj\ntrailer<</Root 1 0 R>>%%EOF';
  assert.deepEqual(D.parse(fdf), { Name: 'Meier (Kanzlei)', PLZ: '33098', Mitglied: 'Yes', Ort: 'Pb' });
});
test('CSV für Excel: BOM, Semikolon, Anführungszeichen, Ja/Nein', () => {
  const c = D.toCsv(fields.slice(0, 4), { Name: 'Meier; Anna', Mitglied: true });
  assert.equal(c, '﻿Name;PLZ;Text7;Mitglied\r\n"Meier; Anna";;;Ja\r\n');
});
test('Spalten zuordnen: exakt, ohne Groß/klein, über Kurzinfo; schreibgeschützte Felder nie', () => {
  const m = D.matchColumns(['name', 'Plz', 'E-Mail', 'Summe', 'Unbekannt'], fields);
  assert.deepEqual(m, [{ col: 0, field: 'Name' }, { col: 1, field: 'PLZ' }, { col: 2, field: 'Text7' }]);
});
test('Werte einer Zeile: Kontrollkästchen, Auswahl ohne Groß/klein, ungültige Auswahl gemeldet', () => {
  const map = D.matchColumns(['Name', 'Mitglied', 'Anrede'], fields);
  assert.deepEqual(D.rowValues(['A', 'x', 'frau'], map, fields), { values: { Name: 'A', Mitglied: true, Anrede: 'Frau' }, bad: [] });
  assert.deepEqual(D.rowValues(['B', 'nein', 'Dr.'], map, fields), { values: { Name: 'B', Mitglied: false }, bad: ['Anrede: „Dr.“'] });
});
test('Datensatz übernehmen meldet unbekannte Felder', () => {
  const r = D.applyRecord({ Name: 'X', Mitglied: 'Yes', Fremd: '1' }, fields);
  assert.deepEqual(r.values, { Name: 'X', Mitglied: true });
  assert.deepEqual(r.unknown, ['Fremd']);
});
test('Dateinamen für die Serienausfüllung', () => {
  assert.equal(D.fileName('Antrag', 2, 120, 'Müller/Meier: A*'), 'Antrag_003_Müller Meier A.pdf');
  assert.equal(D.fileName('Antrag', 0, 5, ''), 'Antrag_01.pdf');
});
test('Keine Formulardaten: verständlicher Fehler', () => {
  assert.throws(() => D.parse('hallo', 'x.txt'), /Keine XFDF-Datei/);
});
