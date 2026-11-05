// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QR-Code einfügen (js/qrstempel.js): GiroCode nach EPC069-12, Link/Text, Alt-Text, Vorschlag
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../js/qrstempel.js');
const Letter = require('../js/letter.js');

const IBAN = 'DE89 3704 0044 0532 0130 00';

test('Betrag lesen: deutsche und englische Schreibweise, leer, Unsinn', () => {
  assert.equal(Q.parseAmount('1.234,56'), 1234.56);
  assert.equal(Q.parseAmount('1234,5 €'), 1234.5);
  assert.equal(Q.parseAmount('99.90'), 99.9);
  assert.equal(Q.parseAmount('12'), 12);
  assert.equal(Q.parseAmount('1,234.56'), 1234.56);
  assert.equal(Q.parseAmount('1,000'), 1000);
  assert.equal(Q.parseAmount(''), null);
  assert.ok(Number.isNaN(Q.parseAmount('zwölf')));
  assert.ok(Number.isNaN(Q.parseAmount('1,2,3')));
});
test('GiroCode: vollständige Nutzdaten nach EPC Version 002', () => {
  const r = Q.epc({ name: 'Mentor GmbH', iban: IBAN, bic: 'cobadeffxxx', amount: '1.234,56', purpose: 'Rechnung 2026-117' });
  assert.equal(r.payload, 'BCD\n002\n1\nSCT\nCOBADEFFXXX\nMentor GmbH\nDE89370400440532013000\nEUR1234.56\n\n\nRechnung 2026-117');
  // PDFMy liest seinen eigenen GiroCode wieder (js/letter.js)
  const back = Letter.parsePaymentQr(r.payload);
  assert.equal(back.iban.replace(/\s/g, ''), 'DE89370400440532013000');
  assert.equal(back.purpose, 'Rechnung 2026-117');
});
test('GiroCode ohne Betrag und Zweck: Felder am Ende entfallen', () => {
  assert.equal(Q.epc({ name: 'A', iban: IBAN }).payload, 'BCD\n002\n1\nSCT\n\nA\nDE89370400440532013000');
  assert.equal(Q.epc({ name: 'A', iban: IBAN, amount: '5' }).payload, 'BCD\n002\n1\nSCT\n\nA\nDE89370400440532013000\nEUR5.00');
});
test('GiroCode: verständliche Fehler', () => {
  assert.throws(() => Q.epc({ iban: IBAN }), /Empfänger angeben/);
  assert.throws(() => Q.epc({ name: 'A', iban: 'DE89370400440532013001' }), /IBAN ist ungültig/);
  assert.throws(() => Q.epc({ name: 'A', iban: IBAN, bic: 'XYZ' }), /BIC ist ungültig/);
  assert.throws(() => Q.epc({ name: 'A', iban: IBAN, amount: '0' }), /zwischen 0,01/);
  assert.throws(() => Q.epc({ name: 'A', iban: IBAN, amount: 'viel' }), /als Zahl/);
  assert.throws(() => Q.epc({ name: 'A', iban: IBAN, purpose: 'x'.repeat(141) }), /140 Zeichen/);
  assert.throws(() => Q.epc({ name: 'x'.repeat(71), iban: IBAN }), /70 Zeichen/);
});
test('Link: www ergänzt https, leer und zu lang abgewiesen', () => {
  assert.equal(Q.link(' www.pdfmy.de ').payload, 'https://www.pdfmy.de');
  assert.equal(Q.link('Tisch 4').payload, 'Tisch 4');
  assert.throws(() => Q.link('  '), /Link oder Text/);
  assert.throws(() => Q.link('x'.repeat(1300)), /zu lang/);
});
test('Alt-Text und Vorschlag aus dem Dokument', () => {
  assert.equal(Q.alt('giro', { name: 'Mentor GmbH', iban: 'DE89370400440532013000', amount: 1234.5, purpose: 'Rechnung 7' }),
    'GiroCode: Überweisung an Mentor GmbH, IBAN DE89 3704 0044 0532 0130 00, 1.234,50 €, Rechnung 7');
  assert.equal(Q.alt('link', { text: 'https://pdfmy.de' }), 'QR-Code: https://pdfmy.de');
  assert.deepEqual(Q.prefill({ iban: 'DE89370400440532013000', amount: '1.190,00 EUR', invoiceNo: 'R-9' }, {}, 'Mentor GmbH'),
    { name: 'Mentor GmbH', iban: 'DE89 3704 0044 0532 0130 00', bic: '', amount: '1190,00', purpose: 'Rechnung R-9' });
  assert.equal(Q.prefill({}, { name: 'X', iban: 'DE00', bic: 'B' }).iban, 'DE00');
});
