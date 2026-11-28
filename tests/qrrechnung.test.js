// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QR-Rechnung Schweiz (app-v367, js/qrrechnung.js): Prüfziffern, Regeln QR-IBAN/Referenz, QR-Inhalt nach IG 2.4, Zahlteil-PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../js/qrrechnung.js');

// Beispielwerte aus den Swiss Implementation Guidelines QR-bill (SIX)
const QR_IBAN = 'CH44 3199 9123 0008 8901 2', IBAN = 'CH58 0079 1123 0008 8901 2';
const QRR = '21 00000 00003 13947 14300 09017', SCOR = 'RF18 5390 0754 7034';
const basis = { konto: QR_IBAN, empfaenger: { name: 'Robert Schneider AG', strasse: 'Rue du Lac', nr: '1268', plz: '2501', ort: 'Biel', land: 'CH' },
  betrag: 1949.75, waehrung: 'CHF', zahler: { name: 'Pia-Maria Rutschmann-Schnyder', strasse: 'Grosse Marktgasse', nr: '28', plz: '9400', ort: 'Rorschach', land: 'CH' },
  referenz: QRR, mitteilung: 'Auftrag vom 15.06.2020' };

test('Prüfziffern: IBAN (CH/LI), QR-IBAN, QR-Referenz (Modulo 10), Creditor Reference (ISO 11649)', () => {
  assert.ok(Q.ibanOk(QR_IBAN) && Q.ibanOk(IBAN));
  assert.ok(!Q.ibanOk('CH44 3199 9123 0008 8901 3'), 'falsche Prüfziffer');
  assert.ok(!Q.ibanOk('DE89 3704 0044 0532 0130 00'), 'deutsche IBAN gehört nicht in eine QR-Rechnung');
  assert.ok(Q.istQrIban(QR_IBAN) && !Q.istQrIban(IBAN));
  assert.ok(Q.qrrOk(QRR) && !Q.qrrOk('21 00000 00003 13947 14300 09018'));
  assert.ok(Q.scorOk(SCOR) && !Q.scorOk('RF19 5390 0754 7034'));
  assert.ok(Q.qrrOk(Q.qrrAus('R-2026-0042')), 'aus einer Rechnungsnummer wird eine gültige QR-Referenz');
  assert.equal(Q.refAnzeige('QRR', QRR), '21 00000 00003 13947 14300 09017');
  assert.equal(Q.betragAnzeige(1949.75), '1 949.75');
});

test('Regeln: QR-IBAN nur mit QR-Referenz, normale IBAN nur mit RF oder ohne Referenz', () => {
  assert.deepEqual(Q.pruefe(basis), []);
  assert.ok(Q.pruefe({ ...basis, referenz: '' }).some(f => /QR-IBAN/.test(f)));
  assert.ok(Q.pruefe({ ...basis, konto: IBAN }).some(f => /nur mit einer QR-IBAN/.test(f)));
  assert.deepEqual(Q.pruefe({ ...basis, konto: IBAN, referenz: SCOR }), []);
  assert.deepEqual(Q.pruefe({ ...basis, konto: IBAN, referenz: '', betrag: '', zahler: null }), [], 'ohne Betrag und Zahler (zum Ausfüllen von Hand)');
  assert.ok(Q.pruefe({ ...basis, waehrung: 'USD' }).length);
  assert.ok(Q.pruefe({ ...basis, empfaenger: { ...basis.empfaenger, plz: '' } }).length);
});

test('QR-Inhalt nach IG 2.4: 31 Zeilen, strukturierte Adressen, Referenz ohne Leerzeichen, EPD am Ende', () => {
  const z = Q.inhalt(basis).split('\n');
  assert.equal(z.length, 31);
  assert.deepEqual(z.slice(0, 4), ['SPC', '0200', '1', 'CH4431999123000889012']);
  assert.deepEqual(z.slice(4, 11), ['S', 'Robert Schneider AG', 'Rue du Lac', '1268', '2501', 'Biel', 'CH']);
  assert.deepEqual(z.slice(11, 18), ['', '', '', '', '', '', ''], 'endgültiger Zahlungsempfänger leer');
  assert.deepEqual(z.slice(18, 20), ['1949.75', 'CHF']);
  assert.equal(z[20], 'S');
  assert.deepEqual(z.slice(27, 31), ['QRR', '210000000003139471430009017', 'Auftrag vom 15.06.2020', 'EPD']);
  const ohne = Q.inhalt({ ...basis, konto: IBAN, referenz: '', betrag: '', zahler: null }).split('\n');
  assert.equal(ohne.length, 31); assert.equal(ohne[18], ''); assert.equal(ohne[27], 'NON'); assert.equal(ohne[28], '');
});

test('Zahlteil als PDF: A4 mit Empfangsschein, Zahlteil und QR-Code', async () => {
  const L = require('../vendor/pdf-lib.min.js');
  const qrcode = require('../vendor/qrcode.js');
  const qr = t => { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; const q = qrcode(0, 'M'); q.addData(t, 'Byte'); q.make(); return q; };
  const bytes = await Q.pdf(L, basis, { qr, titel: 'Rechnung 2026-0042', text: 'Vielen Dank für Ihren Auftrag.' });
  const doc = await L.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
  assert.ok(Math.abs(w - 595.28) < 1 && Math.abs(h - 841.89) < 1);
  assert.ok(bytes.length > 3000);
  // Beschriftung in den vier erlaubten Sprachen (IG Kap. 3.4); unbekannte Sprache → Deutsch
  assert.deepEqual(Q.SPRACHEN, ['de', 'fr', 'it', 'en']);
  for (const sprache of ['fr', 'it', 'en', 'xx']) {
    const b = await Q.pdf(L, { ...basis, sprache }, { qr });
    assert.equal((await L.PDFDocument.load(b)).getPageCount(), 1);
  }
});
