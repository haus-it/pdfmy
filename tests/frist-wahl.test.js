// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Meldung 2026-0011 (app-v357): selbst entscheiden, ob eine Frist in die Fristenliste kommt. Vorgabe ja; nein bei Lastschrift bzw. schon
// bezahlt (E-Rechnung: Zahlungsart 49/59, nichts mehr zu zahlen; Papier: Text) und für Dokumentarten, die der Nutzer abgewählt hat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Letter = require('../js/letter.js'), E = require('../js/einvoice.js'), J = require('../js/journal.js');
const src = fs.readFileSync(path.join(__dirname, 'einvoice.test.js'), 'utf8');
const grab = name => { const i = src.indexOf(`const ${name} = \``); return src.slice(src.indexOf('`', i) + 1, src.indexOf('`;', i)); };

test('Text: Lastschrift und schon bezahlt erkannt, Zahlungsaufforderung behält die Frist', () => {
  assert.equal(Letter.noDeadlineReason('Der Rechnungsbetrag wird am 05.12.2026 von Ihrem Konto abgebucht.'), 'Lastschrift');
  assert.equal(Letter.noDeadlineReason('Wir ziehen den Betrag per SEPA-Lastschrift ein.'), 'Lastschrift');
  assert.equal(Letter.noDeadlineReason('Zahlung im SEPA-Basislastschriftverfahren'), 'Lastschrift');
  assert.equal(Letter.noDeadlineReason('Informationen zum Lastschriftverfahren finden Sie auf unserer Website.'), '', 'bloße Erwähnung');
  assert.equal(Letter.noDeadlineReason('Zahlung per SEPA-Basis-Lastschrift. Mandatsreferenz M-4711'), 'Lastschrift');
  assert.equal(Letter.noDeadlineReason('Der Betrag wird mittels Lastschrift eingezogen.'), 'Lastschrift');
  assert.equal(Letter.noDeadlineReason('Die Rechnung ist bereits bezahlt. Vielen Dank.'), 'bezahlt');
  assert.equal(Letter.noDeadlineReason('Betrag dankend erhalten.'), 'bezahlt');
  // Zahlungsaufforderung gewinnt immer – lieber eine Frist zu viel als eine verpasste Zahlung
  assert.equal(Letter.noDeadlineReason('Bitte überweisen Sie den Betrag bis 10.12.2026. Alternativ per Lastschrift.'), '');
  assert.equal(Letter.noDeadlineReason('Zahlung per Lastschrift möglich. Zahlungsziel 14 Tage.'), '');
  assert.equal(Letter.noDeadlineReason('Zahlungserinnerung: Der Betrag wird abgebucht, sobald Sie das Mandat erteilen.'), '');
  assert.equal(Letter.noDeadlineReason('Rechnung Nr. 4711, zahlbar bis 01.12.2026'), '');
  assert.equal(Letter.noDeadlineReason(''), '');
});

test('E-Rechnung: Zahlungsart Lastschrift (59) und „nichts mehr zu zahlen“ werden erkannt', () => {
  const CII = grab('CII'), UBL = grab('UBL');
  assert.equal(E.parse(CII).debit, false, 'Überweisung (58)');
  assert.equal(E.parse(CII.replace('<ram:TypeCode>58</ram:TypeCode>', '<ram:TypeCode>59</ram:TypeCode>')).debit, true, 'CII 59');
  assert.equal(E.parse(UBL).debit, false);
  assert.equal(E.parse(UBL.replace('<cbc:PaymentMeansCode>58<', '<cbc:PaymentMeansCode>59<')).debit, true, 'UBL 59');
  assert.equal(E.parse(UBL).paid, false);
  assert.equal(E.parse(UBL.replace(/(<cbc:PayableAmount[^>]*>)[^<]*/, '$10.00')).paid, true, 'nichts mehr zu zahlen');
});

test('Fristenliste: abgewählte Einträge erscheinen nicht, bleiben aber im Posteingangsbuch (auch über die Team-Datei)', () => {
  const today = new Date(2026, 10, 27);
  const list = [{ id: 'a', deadline: '2026-11-30', type: 'Rechnung', status: 'offen' }, { id: 'b', deadline: '2026-11-29', type: 'Rechnung', status: 'offen', nofrist: '1' }];
  assert.deepEqual(J.deadlines(list, today).map(e => e.id), ['a']);
  const back = J.parseCsv(J.toCsv(list));
  const b = back.find(e => e.id === 'b');
  assert.equal(b.nofrist, '1', 'Spalte „Ohne Fristüberwachung“ in der CSV');
  assert.equal(b.deadline, '2026-11-29', 'das Datum bleibt erhalten');
  assert.deepEqual(J.deadlines(back, today).map(e => e.id), ['a']);
});
