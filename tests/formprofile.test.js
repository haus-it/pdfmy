// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// „Meine Angaben“ (js/formprofile.js) und Lesemodus (js/reflow.js)
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../js/formprofile.js'), R = require('../js/reflow.js');

test('Feldbeschriftungen zuordnen', () => {
  const m = P.match;
  assert.equal(m('Vorname'), 'vorname');
  assert.equal(m('Nachname'), 'nachname');
  assert.equal(m('Name, Vorname'), 'name_vorname');
  assert.equal(m('Vor- und Nachname'), 'name');
  assert.equal(m('Straße, Hausnummer'), 'strasse_hnr');
  assert.equal(m('Straße'), 'strasse');
  assert.equal(m('PLZ, Ort'), 'plz_ort');
  assert.equal(m('Postleitzahl'), 'plz');
  assert.equal(m('Wohnort'), 'ort');
  assert.equal(m('Ort, Datum'), 'ort_datum');
  assert.equal(m('Geburtsdatum'), 'geburtsdatum');
  assert.equal(m('Geburtsort'), 'geburtsort');
  assert.equal(m('Geburtsname'), '');
  assert.equal(m('Name des Kindes'), '');
  assert.equal(m('IBAN'), 'iban');
  assert.equal(m('Name der Bank'), 'bank');
  assert.equal(m('Kontoinhaber'), 'kontoinhaber');
  assert.equal(m('Steuer-ID'), 'steuerid');
  assert.equal(m('E-Mail-Adresse'), 'email');
  assert.equal(m('Telefon (tagsüber)'), 'telefon');
  assert.equal(m('first_name'), 'vorname');
  assert.equal(m('ZIP code'), 'plz');
  assert.equal(m('Text12'), '');
  assert.equal(m('Bundesland'), '');
});

test('Formular mit Angaben füllen – nur leere Felder', () => {
  const prof = { vorname: 'Erika', nachname: 'Mustermann', strasse: 'Heidestraße', hausnr: '17', plz: '51147', ort: 'Köln', iban: 'DE02120300000000202051', anrede: 'Frau' };
  const fields = [
    { name: 'Vorname', kind: 'text', value: '' }, { name: 'Name', kind: 'text', value: '' },
    { name: 'Straße', kind: 'text', value: '' }, { name: 'Hausnr.', kind: 'text', value: '' },
    { name: 'PLZ', kind: 'text', value: '' }, { name: 'Ort', kind: 'text', value: 'Bonn' },
    { name: 'IBAN', kind: 'text', value: '', ro: true }, { name: 'Anrede', kind: 'select', options: ['Herr', 'Frau', 'Divers'], value: '' },
    { name: 'Ort, Datum', kind: 'text', value: '' }, { name: 'Text1', kind: 'text', value: '' },
  ];
  const { values, n } = P.fill(fields, prof, new Date(2026, 9, 22));
  assert.deepEqual(values, { Vorname: 'Erika', Name: 'Mustermann', 'Straße': 'Heidestraße', 'Hausnr.': '17', PLZ: '51147', Anrede: 'Frau', 'Ort, Datum': 'Köln, 22.10.2026' });
  assert.equal(n, 7);
  // ohne getrennte Felder: voller Name, Straße mit Hausnummer, Kurzinfo zählt vor Feldname
  const v2 = P.fill([{ name: 'Name', kind: 'text', value: '' }, { name: 'adr', tip: 'Straße und Hausnummer', kind: 'text', value: '' }], prof).values;
  assert.deepEqual(v2, { Name: 'Erika Mustermann', adr: 'Heidestraße 17' });
});

test('Angaben aus einem ausgefüllten Formular übernehmen', () => {
  const fields = [{ name: 'Vorname', value: '' }, { name: 'PLZ', value: '33098' }, { name: 'Name, Vorname', value: 'X, Y' }, { name: 'Bemerkung', value: 'egal' }];
  assert.deepEqual(P.learn(fields, { Vorname: 'Max' }), { vorname: 'Max', plz: '33098' });
});

test('Lesemodus: Absätze, Überschrift, Silbentrennung', () => {
  const W = (t, x, y, w = 0.1, h = 0.012) => ({ t, x, y, w, h });
  const lines = [
    [W('Kündigung', 0.1, 0.10, 0.3, 0.025)],
    [W('Sehr', 0.1, 0.15), W('geehrte', 0.2, 0.15), W('Damen', 0.4, 0.15, 0.4)],
    [W('hiermit', 0.1, 0.165), W('kündige', 0.2, 0.165), W('ich', 0.3, 0.165), W('die', 0.4, 0.165), W('Woh-', 0.5, 0.165, 0.4)],
    [W('nung', 0.1, 0.18), W('zum', 0.2, 0.18), W('31.12.', 0.3, 0.18, 0.1)],
    [W('Mit', 0.1, 0.23), W('freundlichen', 0.2, 0.23), W('Grüßen', 0.4, 0.23, 0.4)],
  ];
  assert.deepEqual(R.blocks(lines), [
    { type: 'h', text: 'Kündigung' },
    { type: 'p', text: 'Sehr geehrte Damen hiermit kündige ich die Wohnung zum 31.12.' },
    { type: 'p', text: 'Mit freundlichen Grüßen' },
  ]);
  assert.deepEqual(R.fromText('Erste Zei-\nle geht weiter\n\n• Punkt'), [{ type: 'p', text: 'Erste Zeile geht weiter' }, { type: 'li', text: '• Punkt' }]);
});
