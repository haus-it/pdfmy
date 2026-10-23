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
    { type: 'h', level: 1, text: 'Kündigung' },
    { type: 'p', text: 'Sehr geehrte Damen hiermit kündige ich die Wohnung zum 31.12.' },
    { type: 'p', text: 'Mit freundlichen Grüßen' },
  ]);
  // Tabelle mit rechtsbündigen Beträgen (unterschiedliche linke Kanten) und Fließtext darunter
  const T = [
    [W('Pos', 0.1, 0.30, 0.04), W('Bezeichnung', 0.2, 0.30, 0.15), W('Betrag', 0.75, 0.30, 0.08)],
    [W('1', 0.1, 0.32, 0.01), W('Grundgebühr', 0.2, 0.32, 0.14), W('12,50', 0.77, 0.32, 0.06)],
    [W('2', 0.1, 0.34, 0.01), W('Arbeitspreis', 0.2, 0.34, 0.11), W('Strom', 0.32, 0.34, 0.06), W('1.234,00', 0.74, 0.34, 0.09)],
    [W('Bitte', 0.1, 0.38), W('zahlen', 0.2, 0.38), W('Sie', 0.3, 0.38), W('bis', 0.4, 0.38), W('Monatsende.', 0.5, 0.38, 0.12)],
  ];
  assert.deepEqual(R.blocks(T), [
    { type: 'table', rows: [['Pos', 'Bezeichnung', 'Betrag'], ['1', 'Grundgebühr', '12,50'], ['2', 'Arbeitspreis Strom', '1.234,00']], widths: [0.137, 0.74, 0.123] },
    { type: 'p', text: 'Bitte zahlen Sie bis Monatsende.' },
  ]);
  // Scan: linksbündige Kopfzellen über rechtsbündigen Zahlen → eine Spalte; Linienreste „|“, „[“ weg; Soll/Haben bleiben getrennt
  const S = [
    [W('[Pos', 0.10, 0.50, 0.04), W('Text', 0.20, 0.50, 0.05), W('|', 0.45, 0.50, 0.005), W('Soll', 0.60, 0.50, 0.05), W('Haben]', 0.80, 0.50, 0.07)],
    [W('1', 0.16, 0.52, 0.01), W('Miete', 0.20, 0.52, 0.06), W('850,00', 0.62, 0.52, 0.07)],
    [W('2', 0.16, 0.54, 0.01), W('Gehalt', 0.20, 0.54, 0.07), W('2.400,00', 0.82, 0.54, 0.08)],
  ];
  assert.deepEqual(R.blocks(S)[0].rows, [['Pos', 'Text', 'Soll', 'Haben'], ['1', 'Miete', '850,00', ''], ['2', 'Gehalt', '', '2.400,00']]);
  assert.deepEqual(R.fromText('Erste Zei-\nle geht weiter\n\n• Punkt'), [{ type: 'p', text: 'Erste Zeile geht weiter' }, { type: 'li', text: '• Punkt' }]);
});
