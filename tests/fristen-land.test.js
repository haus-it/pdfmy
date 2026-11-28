// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fristenrechner für Österreich und die Schweiz (app-v367): eigene Feiertage, Fristarten, Fristenstillstand – Deutschland unverändert.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/fristen.js');

test('Österreich: bundesweite Feiertage nach § 7 ARG, kein Karfreitag, keine deutschen Feiertage', () => {
  const h = F.holidays(2026, 'AT');
  assert.equal(h.size, 13);
  for (const d of ['2026-01-06', '2026-08-15', '2026-10-26', '2026-12-08', '2026-06-04']) assert.ok(h.has(d), d);   // 4.6.2026 = Fronleichnam
  assert.ok(!h.has('2026-04-03'), 'Karfreitag ist seit 2019 kein allgemeiner Feiertag');
  assert.ok(!h.has('2026-10-03'), 'Tag der Deutschen Einheit gilt nicht');
});

test('Österreich: Beschwerde gegen Bescheid 4 Wochen, Abgabenbescheid 1 Monat, Fristende am Feiertag verschoben', () => {
  assert.equal(F.berechne({ art: 'at_bescheid', datum: '2026-12-01', land: 'AT' }).ende, '2026-12-29');
  // 1 Monat ab 8.11.2026 → 8.12. (Mariä Empfängnis, Dienstag) → 9.12.
  const r = F.berechne({ art: 'at_abgaben', datum: '2026-11-08', land: 'AT' });
  assert.equal(r.ende, '2026-12-09');
  assert.ok(r.schritte.some(s => /§ 33 Abs. 2 AVG/.test(s)));
  assert.ok(r.hinweise.some(s => /Karfreitag/.test(s)));
  assert.deepEqual(F.artenFuer('AT').map(a => a.id).filter(id => !id.startsWith('at_')), ['eigen'], 'keine deutschen Fristarten in Österreich');
});

test('Schweiz: 30 Tage mit Fristenstillstand (Art. 145 ZPO), summarisches Verfahren ohne Stillstand', () => {
  const r = F.berechne({ art: 'ch_berufung', datum: '2026-07-01', land: 'CH' });
  assert.equal(r.ende, '2026-09-01');   // 13 Tage im Juli, 32 Tage Stillstand, 17 Tage ab 16.8.
  assert.ok(r.schritte.some(s => /Fristenstillstand: 32/.test(s)));
  assert.equal(F.berechne({ art: 'ch_summarisch', datum: '2026-07-20', land: 'CH' }).ende, '2026-07-30');
  // Zustellung im Stillstand: Frist beginnt nach dem 2. Januar
  assert.equal(F.berechne({ art: 'ch_berufung', datum: '2026-12-20', land: 'CH' }).ende, '2027-02-01');
  assert.ok(F.stillstand('2026-04-05') && F.stillstand('2026-12-31') && !F.stillstand('2026-08-16'));
  assert.ok(F.holidays(2026, 'CH').has('2026-08-01'));
});

test('Deutschland bleibt unverändert; Fristarten je Land getrennt', () => {
  assert.equal(F.berechne({ art: 'berufung', datum: '2026-11-02', land: 'NW' }).ende, '2026-12-02');
  assert.equal(F.staat('NW'), 'DE'); assert.equal(F.staat(''), 'DE'); assert.equal(F.staat('CH'), 'CH');
  assert.ok(F.artenFuer('NW').some(a => a.id === 'widerspruch'));
  assert.ok(!F.artenFuer('NW').some(a => a.id.startsWith('ch_') || a.id.startsWith('at_')));
});
