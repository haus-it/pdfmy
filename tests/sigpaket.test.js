// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Signatur-Paket (app-v243, js/sigreq.js): Ablauf, Vertretung, Zurückziehen, vor Ort, Zahlung, Kalender, Zugangscode
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../js/sigreq.js');

const base = (o = {}) => R.create({ title: 'Kaufvertrag', requester: { name: 'Anna', email: 'anna@firma.de' }, signers: [{ name: 'Max', email: 'max@x.de' }, { name: 'Eva', email: 'eva@x.de' }], ...o });

test('Ablaufdatum: Prüfung, abgelaufen nur solange offen, Hinweis im Mail-Text und im Rat', () => {
  const today = new Date('2026-11-10T12:00:00Z');
  assert.match(R.problems(base({ expires: '2026-11-01' }), today).join(), /Vergangenheit/);
  assert.match(R.problems(base({ expires: '2026-11-12', due: '2026-11-20' }), today).join(), /vor der Frist/);
  assert.deepEqual(R.problems(base({ expires: '2026-11-12' }), today), []);
  let r = base({ expires: '2026-11-12' });
  assert.equal(R.expired(r, today), false); assert.equal(R.expired(r, new Date('2026-11-12T20:00:00Z')), false); assert.equal(R.expired(r, new Date('2026-11-13T08:00:00Z')), true);
  assert.match(R.mail(r).body, /gilt bis 12\.11\.2026/);
  assert.match(R.advice(R.waiting(r, new Date('2026-11-14T08:00:00Z'))).text, /abgelaufen/);
  r = R.markSigned(R.markSigned(r, 0), 1);
  assert.equal(R.expired(r, new Date('2026-12-01T08:00:00Z')), false);   // abgeschlossen → nicht mehr „abgelaufen“
  assert.equal(R.parse(R.serialize({ ...base(), expires: 'morgen' })).expires, undefined);
});

test('Weitergeben an Vertretung: ersetzt die Person, behält die Felder, Protokoll und E-Mail mit Kopie an den Absender', () => {
  let r = base(); r.fields.push({ s: 0, t: 'sign', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 });
  r = R.delegate(r, 0, { name: 'Moritz Vertreter', email: 'Moritz@X.de', reason: 'Urlaub', at: '2026-11-10T09:00:00Z' });
  assert.equal(r.signers[0].email, 'moritz@x.de'); assert.deepEqual(r.signers[0].from, { name: 'Max', email: 'max@x.de' });
  assert.equal(r.fields[0].s, 0); assert.equal(R.next(r), 0);
  assert.deepEqual(r.log.at(-1), { at: '2026-11-10T09:00:00Z', what: 'weitergegeben', by: 'Max', to: 'Moritz Vertreter', reason: 'Urlaub' });
  const m = R.mail(r); assert.equal(m.to, 'moritz@x.de'); assert.equal(m.cc, 'anna@firma.de'); assert.match(m.body, /Max hat diese Anfrage an Sie weitergegeben\. Begründung: Urlaub/);
  const back = R.parse(R.serialize(r)); assert.equal(back.signers[0].from.name, 'Max');
  assert.ok(R.auditLines(r).some(([, t]) => /Vertretung für Max <max@x\.de> – Begründung: Urlaub/.test(t)));
  assert.ok(R.auditLines(r).some(([, t]) => /weitergegeben – Max → Moritz Vertreter/.test(t)));
  assert.throws(() => R.delegate(r, 0, { name: 'E', email: 'eva@x.de' }), /schon in der Reihenfolge/);
  assert.throws(() => R.delegate(r, 0, { name: '', email: 'kaputt' }), /Name und gültige E-Mail/);
  assert.throws(() => R.delegate(R.markSigned(r, 0), 0, { name: 'Z', email: 'z@x.de' }), /nicht mehr weitergeben/);
});

test('Zurückziehen: niemand mehr dran, Status im Protokoll, E-Mail an die Person, die das Dokument hat', () => {
  const r = R.withdraw(base(), { reason: 'Preis geändert', at: '2026-11-10T10:00:00Z' });
  assert.equal(R.next(r), -1); assert.equal(R.complete(r), false); assert.equal(R.waiting(r), null);
  assert.equal(R.parse(R.serialize(r)).withdrawn, '2026-11-10T10:00:00Z');
  assert.ok(R.auditLines(r).some(([, t]) => t === 'Status: zurückgezogen'));
  const m = R.withdrawMail({ title: 'Kaufvertrag', to: 'max@x.de', name: 'Max', from: 'Anna', reason: 'Preis geändert' });
  assert.equal(m.to, 'max@x.de'); assert.equal(m.subject, 'Zurückgezogen: Kaufvertrag'); assert.match(m.body, /Bitte nicht mehr unterschreiben/); assert.match(m.body, /Begründung: Preis geändert/);
});

test('Vor Ort: übergeben zählt als gesendet und empfangen, Unterschrift mit Vermerk im Protokoll', () => {
  let r = R.markHere(base(), 0, '2026-11-10T11:00:00Z');
  assert.equal(R.stage(r.signers[0]).key, 'empfangen');
  r = R.markSigned(r, 0, { hash: 'h1', here: true, at: '2026-11-10T11:05:00Z' });
  assert.equal(r.signers[0].here, true); assert.equal(r.log.at(-1).what, 'unterschrieben (vor Ort)');
  const lines = R.auditLines(r).map(([, t]) => t).join('\n');
  assert.match(lines, /Unterschrieben vor Ort auf dem Gerät des Absenders/); assert.match(lines, /vor Ort übergeben \(Gerät des Absenders\) – Max/);
});

test('Zahlung anfordern: säubern, Text in Anfrage und Abschluss-E-Mail, GiroCode-Zeile erst nach der letzten Unterschrift', () => {
  let r = base({ pay: { name: ' Mentor GmbH ', iban: 'de89 3704 0044 0532 0130 00', amount: 1234.5, purpose: 'Anzahlung Kaufvertrag' } });
  assert.deepEqual(r.pay, { name: 'Mentor GmbH', iban: 'DE89370400440532013000', amount: 1234.5, purpose: 'Anzahlung Kaufvertrag' });
  assert.match(R.mail(r).body, /Bitte überweisen Sie 1\.234,50 € an Mentor GmbH\.\nIBAN: DE89 3704 0044 0532 0130 00 · Verwendungszweck: Anzahlung Kaufvertrag/);
  assert.ok(!R.auditLines(r).some(([k]) => k === 'q'));
  r = R.markSigned(R.markSigned(r, 0), 1);
  assert.match(R.mail(r).body, /GiroCode steht auf der letzten Seite/);
  assert.ok(R.auditLines(r).some(([k]) => k === 'q'));
  assert.equal(base({ pay: { name: 'X', iban: 'DE89370400440532013000', amount: -5 } }).pay.amount, null);   // ungültiger Betrag → Banking-App fragt
  assert.match(R.problems(base({ pay: { iban: 'DE89370400440532013000' } })).join(), /fehlt der Empfänger/);
  assert.equal(R.parse(R.serialize(r)).pay.iban, 'DE89370400440532013000');
});

test('Kalender: Nachfassen nach 3 und 7 Tagen bis zur Frist, Fristtag, Ablauf; Unterzeichner mit Erinnerung am Vortag', () => {
  const today = new Date('2026-11-10T08:00:00Z'), at = new Date('2026-11-10T08:00:00Z');
  const s = R.senderIcs({ id: 'abc', title: 'Kaufvertrag; Halle', due: '2026-11-20', expires: '2026-11-30', name: 'Max' }, { today, at });
  assert.deepEqual([...s.matchAll(/DTSTART;VALUE=DATE:(\d+)/g)].map(m => m[1]), ['20261113', '20261117', '20261120', '20261130']);
  assert.match(s, /SUMMARY:Unterschrift nachfassen: Kaufvertrag\\; Halle/); assert.match(s, /TRIGGER:PT9H/); assert.match(s, /\r\nEND:VCALENDAR\r\n$/);
  assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 4);
  const short = R.senderIcs({ id: 'x', title: 'T', due: '2026-11-12' }, { today, at });
  assert.deepEqual([...short.matchAll(/DTSTART;VALUE=DATE:(\d+)/g)].map(m => m[1]), ['20261112']);   // Frist vor dem 3. Tag: nur der Fristtag
  assert.ok(s.split('\r\n').every(l => l.length <= 75));
  const r = base({ due: '2026-11-20' });
  const si = R.signerIcs(r, 0, { at }); assert.match(si, /DTSTART;VALUE=DATE:20261120/); assert.match(si, /TRIGGER:-PT15H/); assert.match(si, /UID:[a-z0-9]+-s0@pdfmy\.de/);
  assert.equal(R.signerIcs(base(), 0), '');
});

test('Zugangscode: 12 eindeutige Zeichen, Hinweis in der E-Mail, nie der Code selbst; Eingabe tolerant', () => {
  const c = R.newCode(); assert.match(c, /^[A-HJKMNP-Z2-9]{12}$/); assert.notEqual(c, R.newCode());
  assert.equal(R.codeFmt('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN'); assert.equal(R.codeNorm(' abcd-efgh jkmn '), 'ABCDEFGHJKMN');
  const r = base({ lock: true }), m = R.mail(r);
  assert.match(m.body, /Zugangscode geschützt/); assert.ok(!m.body.includes(c)); assert.equal(R.parse(R.serialize(r)).lock, true);
  assert.equal(R.parse(R.serialize({ ...base(), lock: 'ja' })).lock, undefined);
  assert.ok(R.auditLines(r).some(([, t]) => /Zugangscode: ja/.test(t)));
});
