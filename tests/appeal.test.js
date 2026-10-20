// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Einspruchsfrist bei Bescheiden: 4 Tage Bekanntgabe (§ 122 AO), 1 Monat (§ 355 AO), Wochenende/Feiertag (§ 108 Abs. 3 AO)
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../js/letter.js');

test('Feiertage: Ostern und bewegliche Feiertage', () => {
  const h = L.holidays(2026);
  for (const d of ['2026-04-03', '2026-04-06', '2026-05-14', '2026-05-25', '2026-10-03', '2026-12-25']) assert.ok(h.has(d), d);
  assert.ok(L.holidays(2027).has('2027-03-26'), 'Karfreitag 2027');
});

test('Frist: einfacher Fall, Wochenende, Ostern, Monatsende, Schaltjahr', () => {
  assert.equal(L.appealDeadline('2026-10-16'), '2026-11-20');   // Fr + 4 = Di 20.10. → Fr 20.11.
  assert.equal(L.appealDeadline('2026-04-01'), '2026-05-07');   // Mi + 4 = Ostersonntag → Ostermontag → Di 7.4. → Do 7.5.
  assert.equal(L.appealDeadline('2026-01-27'), '2026-03-02');   // + 4 = Sa 31.1. → Mo 2.2. → Mo 2.3.
  assert.equal(L.appealDeadline('2025-12-27'), '2026-02-02');   // + 4 = Mi 31.12. → 31.1.2026 ist Sa → Mo 2.2.
  assert.equal(L.appealDeadline('2028-01-27'), '2028-02-29');   // + 4 = Mo 31.1. → Februar hat 29 Tage → Di 29.2.
  assert.equal(L.appealDeadline(''), '');
});

test('Rechtsbehelfsbelehrung erkennen (übliche Wortlaute)', () => {
  assert.equal(L.appealRule('Rechtsbehelfsbelehrung: Der Bescheid kann mit dem Einspruch angefochten werden. Die Frist für die Einlegung des Einspruchs beträgt einen Monat.'), 'einspruch');
  assert.equal(L.appealRule('Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe Widerspruch erhoben werden.'), 'widerspruch');
  assert.equal(L.appealRule('Ihr Einspruch vom 3. Mai ist eingegangen. Wir melden uns.'), '');
});

test('Briefanalyse: Steuerbescheid bekommt die Einspruchsfrist, Hinweiszeile nennt sie', () => {
  const text = 'Finanzamt Paderborn\nPaderborn, 16.10.2026\nBescheid für 2025 über Einkommensteuer\nFestgesetzt werden 1.234,00 €\nRechtsbehelfsbelehrung\nDer Bescheid kann mit dem Einspruch angefochten werden. Die Frist für die Einlegung des Einspruchs beträgt einen Monat.';
  const r = L.analyzeLetter(text, text, '');
  assert.equal(r.appealRule, 'einspruch');
  assert.equal(r.deadline, '2026-11-20');
  const t = L.todoFor({ ...r, appealRule: r.appealRule }, '2026-10-18');
  assert.match(t.text, /Einspruch bis 20\.11\.2026/);
});
