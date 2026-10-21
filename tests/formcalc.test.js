// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Formular-Rechenfelder und Prüfungen (js/formcalc.js)
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../js/formcalc.js');

test('Zahlen lesen und anzeigen', () => {
  assert.equal(F.num('1.234,56 €'), 1234.56);
  assert.equal(F.num('1,234.56'), 1234.56);
  assert.equal(F.num('0,19'), 0.19);
  assert.equal(F.num('12,5'), 12.5);
  assert.equal(F.num('1.234'), 1234);
  assert.equal(F.num('12.5'), 12.5);
  assert.equal(F.num('-3'), -3);
  assert.equal(F.num(''), 0);
  assert.equal(F.num('abc'), 0);
  assert.equal(F.fmt(1234.5, 'amount'), '1.234,50 €');
  assert.equal(F.fmt(0.1 + 0.2, 'number'), '0,3');
});

test('Formeln: Feldnamen mit Leerzeichen, Klammern, Funktionen', () => {
  const names = ['Menge', 'Einzelpreis', 'Pos 1', 'Pos 2', 'Pos 10', 'Netto', 'MwSt'];
  const v = { 'Menge': '3', 'Einzelpreis': '12,50', 'Pos 1': '10', 'Pos 2': '5,5', 'Pos 10': '100', 'Netto': '200', 'MwSt': '38' };
  const calc = f => { const r = F.parse(f, names); assert.ok(!r.error, f + ': ' + r.error); return F.evaluate(r.ast, n => v[n]); };
  assert.equal(calc('Menge * Einzelpreis'), 37.5);
  assert.equal(calc('[Pos 1] + [Pos 2]'), 15.5);
  assert.equal(calc('Pos 10 - Pos 1'), 90);   // längster Name gewinnt
  assert.equal(calc('SUMME(Pos 1; Pos 2; Pos 10)'), 115.5);
  assert.equal(calc('Netto * 0,19'), 38);
  assert.equal(calc('(Netto + MwSt) / 2'), 119);
  assert.equal(calc('MAX(Pos 1; Pos 2)'), 10);
  assert.equal(calc('MITTELWERT(Pos 1; Pos 2)'), 7.75);
  assert.equal(calc('-Pos 1 + 4'), -6);
  assert.equal(calc('Menge / 0'), 0);   // keine Division durch null
  assert.deepEqual(F.parse('Menge * Einzelpreis', names).refs, ['Menge', 'Einzelpreis']);
  assert.match(F.parse('Menge * Rabatt', names).error, /Rabatt/);
  assert.match(F.parse('(Menge + 1', names).error, /Klammer/);
  assert.match(F.parse('', names).error, /leer/);
});

test('Rechenreihenfolge und Kreisbezug', () => {
  const c = { Brutto: { refs: ['Netto', 'MwSt'] }, MwSt: { refs: ['Netto'] }, Netto: { refs: ['Pos 1'] } };
  const o = F.order(c).order;
  assert.ok(o.indexOf('Netto') < o.indexOf('MwSt') && o.indexOf('MwSt') < o.indexOf('Brutto'));
  assert.ok(F.order({ A: { refs: ['B'] }, B: { refs: ['A'] } }).cycle);
});

test('Prüfungen: E-Mail, IBAN, PLZ, Datum, Pflichtfeld', () => {
  assert.equal(F.check('email', 'max@beispiel.de'), '');
  assert.match(F.check('email', 'max@'), /E-Mail/);
  assert.equal(F.check('iban', 'DE89 3704 0044 0532 0130 00'), '');
  assert.match(F.check('iban', 'DE89 3704 0044 0532 0130 01'), /IBAN/);
  assert.equal(F.check('plz', '33104'), '');
  assert.match(F.check('plz', '3310'), /Postleitzahl/);
  assert.equal(F.check('date', '29.02.2024'), '');
  assert.match(F.check('date', '30.02.2025'), /Datum/);
  assert.match(F.check('text', '', true), /Pflichtfeld/);
  assert.equal(F.check('email', '', false), '');
});

test('Acrobat-Skripte erzeugen und wieder lesen', () => {
  const r = F.parse('Menge * Einzelpreis', ['Menge', 'Einzelpreis']);
  const s = F.scripts('amount', 'Menge * Einzelpreis', r.ast);
  assert.match(s.C, /event\.value = /); assert.match(s.C, /getField\("Menge"\)/);
  assert.match(s.F, /AFNumber_Format\(2, 2/);
  assert.deepEqual(F.readScripts(s), { calc: 'Menge * Einzelpreis', kind: 'amount' });
  assert.equal(F.readScripts(F.scripts('iban')).kind, 'iban');
  assert.match(F.scripts('iban').V, /app\.alert/);
  // fremde Formulare (Acrobat-Standard)
  assert.equal(F.readScripts({ C: 'AFSimple_Calculate("SUM", new Array ("Pos1", "Pos2"));' }).calc, 'SUMME([Pos1]; [Pos2])');
  assert.equal(F.readScripts({ C: 'AFSimple_Calculate("PRD", ["A", "B"]);' }).calc, '[A] * [B]');
  assert.equal(F.readScripts({ F: 'AFNumber_Format(2, 0, 0, 0, "€", true);' }).kind, 'amount');
  // Das erzeugte Skript rechnet richtig (mit nachgebildeten Acrobat-Funktionen)
  const ev = { value: null }, fields = { Menge: '3', Einzelpreis: '12.5' };
  new Function('event', 'AFMakeNumber', 'getField', s.C.replace(/this\.getField/g, 'getField'))(ev, x => parseFloat(x), n => ({ value: fields[n] }));
  assert.equal(ev.value, 37.5);
  // IBAN-Prüfung im PDF-Skript
  const vs = F.scripts('iban').V; let alerted = '';
  const run = val => { const e = { value: val, rc: true }; new Function('event', 'app', vs)(e, { alert: m => { alerted = m; } }); return e.rc; };
  assert.equal(run('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(run('DE89 3704 0044 0532 0130 01'), false); assert.match(alerted, /IBAN/);
});
