// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fristenrechner (js/fristen.js): Monatsende, Wochenende, landesweite Feiertage, Bekanntgabe nach der Vier-Tage-Regel, Vorfrist
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/fristen.js');
const ende = o => F.berechne(o).ende;

test('Monatsfrist endet am Monatsletzten, Samstag → Montag', () => {
  assert.equal(ende({ art: 'berufung', datum: '2026-01-30', land: 'NW' }), '2026-03-02');   // 28.2.2026 ist Samstag
});
test('Wochenfrist endet am gleichen Wochentag', () => {
  assert.equal(ende({ art: 'vu', datum: '2026-11-02', land: 'NW' }), '2026-11-16');
  assert.equal(ende({ art: 'kschg', datum: '2026-11-02', land: 'NW' }), '2026-11-23');
});
test('Feiertag am Ort des Gerichts verschiebt das Fristende', () => {
  assert.equal(ende({ art: 'berufung', datum: '2027-10-01', land: 'NW' }), '2027-11-02');   // Allerheiligen in NRW
  assert.equal(ende({ art: 'berufung', datum: '2027-10-01', land: 'BE' }), '2027-11-01');   // in Berlin kein Feiertag
  assert.equal(ende({ art: 'berufungbegr', datum: '2028-08-31', land: 'NI' }), '2028-11-01');   // Reformationstag in Niedersachsen
  assert.equal(ende({ art: 'berufungbegr', datum: '2028-08-31', land: 'BW' }), '2028-10-31');
});
test('Steuerbescheid: Bekanntgabe am vierten Tag, Frist und Vorfrist', () => {
  const r = F.berechne({ art: 'einspruchao', datum: '2026-11-02', land: 'NW', weg: 'post', vorfrist: 7 });
  assert.equal(r.beginn, '2026-11-06'); assert.equal(r.ende, '2026-12-07'); assert.equal(r.vorfrist, '2026-11-30');
});
test('Bekanntgabe am Sonntag verschiebt sich auf Montag (BFH IX R 68/98)', () => {
  const r = F.berechne({ art: 'einspruchao', datum: '2026-12-30', land: 'NW', weg: 'post' });
  assert.equal(r.beginn, '2027-01-04'); assert.equal(r.ende, '2027-02-04');
});
test('Zustellungsdatum bekannt: keine Vier-Tage-Regel', () => {
  assert.equal(F.berechne({ art: 'einspruchao', datum: '2026-11-02', land: 'NW', weg: 'datum' }).ende, '2026-12-02');
});
test('Vorfrist liegt nie auf Wochenende oder Feiertag, sondern davor', () => {
  const r = F.berechne({ art: 'eigen', n: 3, unit: 'wochen', datum: '2026-11-25', land: 'NW', vorfrist: 7 });   // Ende Mi 16.12., Vorfrist Mi 9.12.
  assert.equal(r.ende, '2026-12-16'); assert.equal(r.vorfrist, '2026-12-09');
  const s = F.berechne({ art: 'eigen', n: 2, unit: 'wochen', datum: '2026-12-21', land: 'NW', vorfrist: 5 });   // Ende Mo 4.1.2027 (Sa 2.1. → Mo), 5 Tage vorher = 30.12.
  assert.equal(s.ende, '2027-01-04'); assert.equal(s.vorfrist, '2026-12-30');
});
test('Feiertage: Buß- und Bettag nur in Sachsen, Frauentag in Berlin', () => {
  assert.equal(F.holidays(2026, 'SN').get('2026-11-18'), 'Buß- und Bettag');
  assert.equal(F.holidays(2026, 'NW').has('2026-11-18'), false);
  assert.equal(F.holidays(2026, 'BE').has('2026-03-08'), true);
  assert.equal(F.holidays(2026, '').get('2026-04-03'), 'Karfreitag');   // Ostern 5.4.2026
});
test('Ungültige Eingaben ergeben null', () => {
  assert.equal(F.berechne({ art: 'berufung', datum: '' }), null);
  assert.equal(F.berechne({ art: 'eigen', n: 0, unit: 'wochen', datum: '2026-11-02' }), null);
});
test('Kalenderdatei enthält Fristablauf und Vorfrist', () => {
  const r = F.berechne({ art: 'einspruchao', datum: '2026-11-02', land: 'NW', weg: 'post', vorfrist: 7 });
  const t = F.ics(r, 'Einspruch Steuerbescheid');
  assert.match(t, /DTSTART;VALUE=DATE:20261207/); assert.match(t, /DTSTART;VALUE=DATE:20261130/); assert.match(t, /FRISTABLAUF/);
});
