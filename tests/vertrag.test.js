// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Vertragsakte (Wettbewerbsanalyse Empfehlung 9): Laufzeit, Kündigungsfrist, Verlängerung erkennen und „kündigen bis“ berechnen.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/letter.js');
const HEUTE = '2026-11-19';

test('Monatsrechnung nach § 188 BGB', () => {
  assert.equal(L.plusMonate('2026-01-31', 1), '2026-02-28', 'kürzerer Monat: Monatsletzter');
  assert.equal(L.plusMonate('2026-02-28', 1), '2026-03-28', 'vorwärts ab Beginn bleibt der Tag');
  assert.equal(L.plusMonate('2026-12-31', -3, true), '2026-09-30', 'zurück vom Vertragsende am Monatsletzten: Monatsletzter');
  assert.equal(L.plusMonate('2026-03-15', 12), '2027-03-15');
});

test('Mindestlaufzeit mit automatischer Verlängerung und Frist zum Laufzeitende', () => {
  const c = L.contractTerms('Vertragsbeginn: 01.01.2026. Die Mindestvertragslaufzeit beträgt 24 Monate. Der Vertrag verlängert sich automatisch um jeweils 12 Monate, wenn er nicht mit einer Frist von 3 Monaten zum Ende der Laufzeit gekündigt wird.', HEUTE);
  assert.equal(c.ende, '2027-12-31'); assert.equal(c.naechstesEnde, '2027-12-31'); assert.equal(c.kuendigenBis, '2027-09-30');
  assert.equal(c.verlaengerung, 12); assert.deepEqual(c.frist, { n: 3, einheit: 'Monat', zum: '' }); assert.equal(c.verbraucherHinweis, true);
});

test('Ablauf schon vorbei: Ende rückt um die Verlängerung weiter (Versicherungsschein, Zahlwörter)', () => {
  const c = L.contractTerms('Versicherungsbeginn 15.03.2025, Ablauf 15.03.2026. Der Vertrag verlängert sich stillschweigend um ein Jahr. Kündigungsfrist: drei Monate vor Ablauf.', HEUTE);
  assert.equal(c.naechstesEnde, '2027-03-15'); assert.equal(c.kuendigenBis, '2026-12-15');
  // Kündigungstag schon verstrichen → das Jahr danach
  const spaet = L.contractTerms('Versicherungsbeginn 15.03.2025, Ablauf 15.03.2026. Der Vertrag verlängert sich stillschweigend um ein Jahr. Kündigungsfrist: drei Monate vor Ablauf.', '2026-12-20');
  assert.equal(spaet.naechstesEnde, '2028-03-15'); assert.equal(spaet.kuendigenBis, '2027-12-15');
});

test('Unbefristet mit Frist zum Monats- bzw. Quartalsende; Wochenfrist', () => {
  const m = L.contractTerms('Der Vertrag läuft auf unbestimmte Zeit und ist mit einer Frist von einem Monat zum Monatsende kündbar.', HEUTE);
  assert.equal(m.unbefristet, true); assert.equal(m.naechstesEnde, '2026-12-31'); assert.equal(m.kuendigenBis, '2026-11-30');
  const q = L.contractTerms('Das Mietverhältnis ist unbefristet. Kündigungsfrist von drei Monaten zum Quartalsende.', HEUTE);
  assert.equal(q.naechstesEnde, '2027-03-31'); assert.equal(q.kuendigenBis, '2026-12-31');
  const w = L.contractTerms('Laufzeit 12 Monate ab Vertragsbeginn 31.01.2026. Kündigungsfrist 4 Wochen.', HEUTE);
  assert.equal(w.ende, '2027-01-30'); assert.equal(w.kuendigenBis, '2027-01-02');
});

test('Kein Vertrag: nichts erkannt; Rechnung bleibt Rechnung', () => {
  assert.equal(L.contractTerms('Rechnung Nr. 4711, zahlbar bis 30.11.2026.', HEUTE), null);
  const t = 'Stadtwerke GmbH\nRechnung Nr. 4711\nGesamtbetrag 120,00 EUR\nZahlbar bis 30.11.2026';
  const m = L.analyzeLetter(t, t, ''); assert.equal(m.contract, undefined); assert.equal(m.deadline, '2026-11-30');
});

test('Briefanalyse, „Was will dieser Brief?“ und Kalender: kündigen bis, 14 Tage Vorwarnung', () => {
  const t = 'Stadtwerke Musterstadt GmbH\nPaderborn, den 05.01.2026\nVertragsbestätigung Strom\nSehr geehrte Frau Muster,\nVertragsbeginn: 01.01.2026. Die Mindestvertragslaufzeit beträgt 24 Monate. Der Vertrag verlängert sich automatisch um jeweils 12 Monate, wenn er nicht mit einer Frist von 3 Monaten zum Ende der Laufzeit gekündigt wird.';
  const m = L.analyzeLetter(t, t, '');
  assert.equal(m.type, 'Vertrag'); assert.equal(m.deadline, '2027-09-30');
  const todo = L.todoFor(m, HEUTE);
  assert.match(todo.text, /läuft bis 31\.12\.2027, verlängert sich sonst um 12 Monate – kündigen bis 30\.9\.2027/);
  assert.deepEqual(todo.actions, ['cal', 'fwd', 'file']);
  const ics = L.buildIcs(m, 'Vertrag.pdf', new Date('2026-11-19T10:00:00Z'));
  assert.match(ics, /SUMMARY:Kündigungsfrist: Vertrag/); assert.match(ics, /TRIGGER:-P14D/); assert.match(ics, /DTSTART;VALUE=DATE:20270930/);
});
