// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Eigene Felder (Mandant, Projekt …) im Posteingangsbuch
const test = require('node:test'), assert = require('node:assert/strict');
const J = require('../js/journal.js');

test('Feldnamen: säubern, Doppelte entfernen, höchstens 5', () => {
  assert.deepEqual(J.fieldNames([' Mandant ', 'Projekt', 'mandant', '', 'Kosten;stelle', 'A', 'B', 'C']), ['Mandant', 'Projekt', 'Kosten stelle', 'A', 'B']);
  assert.deepEqual(J.fieldNames(undefined), []);
});

test('Werte als Text und zurück (Excel-Spalte „Eigene Felder“)', () => {
  const t = J.fieldsText({ Mandant: 'Müller GmbH', Projekt: 'Neubau; Halle 2', Leer: '  ' });
  assert.equal(t, 'Mandant: Müller GmbH; Projekt: Neubau Halle 2');
  assert.deepEqual(J.fieldsParse(t), { Mandant: 'Müller GmbH', Projekt: 'Neubau Halle 2' });
  assert.deepEqual(J.fieldsParse(''), {});
  assert.deepEqual(J.fieldsParse('Zeit: 10:30'), { Zeit: '10:30' });   // Doppelpunkt im Wert bleibt
  const back = J.parseCsv(J.toCsv([{ id: 'a', fields: t, status: 'offen' }]));
  assert.equal(back[0].fields, t);
});

test('Vorschlag: gleiches Aktenzeichen vor gleichem Absender, neuester Eintrag', () => {
  const E = [
    { savedAt: '2026-10-01 09:00', sender: 'Stadtwerke', reference: '4711-22', fields: 'Mandant: Alt' },
    { savedAt: '2026-10-10 09:00', sender: 'Stadtwerke', fields: 'Mandant: Meier; Projekt: Haus' },
    { savedAt: '2026-10-11 09:00', sender: 'Finanzamt', fields: '' },
  ];
  assert.deepEqual(J.suggestFields(E, { sender: 'Stadtwerke' }), { Mandant: 'Meier', Projekt: 'Haus' });
  assert.deepEqual(J.suggestFields(E, { sender: 'Unbekannt', reference: '4711-22' }), { Mandant: 'Alt' });
  assert.deepEqual(J.suggestFields(E, { sender: 'Finanzamt' }), {});
});

test('Bisherige Werte je Feld, häufigste zuerst', () => {
  const E = [{ fields: 'Mandant: Meier' }, { fields: 'mandant: meier; Projekt: X' }, { fields: 'Mandant: Abel' }];
  assert.deepEqual(J.fieldValues(E, 'Mandant'), ['Meier', 'Abel']);
});
