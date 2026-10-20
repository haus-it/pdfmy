// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../js/journal.js');

const e1 = { id: 'a1', savedAt: '2026-10-14T09:00', date: '2026-10-07', sender: 'Stadtwerke; Musterstadt "GmbH"', type: 'Rechnung', subject: 'Strom\nOktober', deadline: '2026-10-28', amount: '1.520,24 EUR', file: 'Rechnung\\a.pdf', pages: 2, done: false, by: 'WM' };
const e2 = { id: 'b2', savedAt: '2026-10-15T08:00', date: '2026-10-05', sender: 'Amtsgericht Bielefeld', type: 'Ladung', deadline: '2026-10-16', file: 'Ladung\\b.pdf', done: false };

test('CSV: Excel-tauglich und verlustfrei zurücklesbar (Semikolon, Anführungszeichen, Zeilenumbruch)', () => {
  const csv = J.toCsv([e1, e2]);
  assert.ok(csv.startsWith('﻿ID;Eingang;Briefdatum;Absender'));
  const back = J.parseCsv(csv);
  assert.equal(back.length, 2);
  assert.equal(back[0].sender, 'Stadtwerke; Musterstadt "GmbH"');
  assert.equal(back[0].subject, 'Strom\nOktober');
  assert.equal(back[0].file, 'Rechnung\\a.pdf');
  assert.equal(back[0].pages, 2);
  assert.equal(back[1].done, false);
});

test('CSV mit Komma-Trennung und "ja" bei Erledigt wird gelesen', () => {
  const back = J.parseCsv('ID,Eingang,Frist,Erledigt\r\nx,2026-10-01,2026-10-20,ja\r\n');
  assert.equal(back[0].id, 'x'); assert.equal(back[0].deadline, '2026-10-20'); assert.equal(back[0].done, true);
});

test('Zusammenführen: gleiche ID einmal, "erledigt" bleibt erhalten, neueste zuerst', () => {
  const m = J.merge([e1, e2], [{ ...e1, done: true }]);
  assert.equal(m.length, 2);
  assert.equal(m.find(e => e.id === 'a1').done, true);
  assert.equal(m[0].id, 'b2');
});

test('Fristen: überfällig, dringend, später – erledigte ausgeblendet', () => {
  const list = J.deadlines([e1, e2, { id: 'c', deadline: '2026-10-10' }, { id: 'd', deadline: '2026-10-11', done: true }], new Date('2026-10-15T12:00:00Z'));
  assert.deepEqual(list.map(e => [e.id, e.state, e.days]), [['c', 'overdue', -5], ['b2', 'soon', 1], ['a1', 'later', 13]]);
});

test('Fristen rechnen mit dem lokalen Kalendertag (kurz nach Mitternacht)', () => {
  const list = J.deadlines([{ id: 'x', deadline: '2026-10-16' }], new Date(2026, 9, 15, 0, 30));
  assert.equal(list[0].days, 1);
});

test('Status und Zuständig: CSV-Rundlauf, ältere Dateien mit "Erledigt" werden übernommen', () => {
  const csv = J.toCsv([{ id: 'a', assignee: 'WM', status: 'bezahlt', upd: '2026-10-15 09:00' }, { id: 'b', status: 'in Arbeit' }]);
  const back = J.parseCsv(csv);
  assert.equal(back[0].status, 'bezahlt'); assert.equal(back[0].done, true); assert.equal(back[0].assignee, 'WM');
  assert.equal(back[1].status, 'in Arbeit'); assert.equal(back[1].done, false);
  assert.equal(J.parseCsv('ID;Erledigt\r\nx;ja\r\ny;\r\n').map(e => e.status).join(','), 'erledigt,offen');
});

test('Zusammenführen: die zuletzt geänderte Fassung gewinnt – auch "wieder offen"', () => {
  const team = [{ id: 'a', status: 'erledigt', upd: '2026-10-15 09:00' }];
  const local = [{ id: 'a', status: 'offen', assignee: 'AB', upd: '2026-10-15 10:30' }];
  const m = J.merge(team, local)[0];
  assert.equal(m.status, 'offen'); assert.equal(m.assignee, 'AB');
  assert.equal(J.merge(local, team)[0].status, 'offen');
});

test('Fristen: bezahlte Rechnungen erscheinen nicht mehr; Meine Post', () => {
  const list = [{ id: 'a', deadline: '2026-10-20', status: 'bezahlt' }, { id: 'b', deadline: '2026-10-20', status: 'in Arbeit', assignee: 'wm ' }];
  assert.deepEqual(J.deadlines(list, new Date(2026, 9, 15, 12)).map(e => e.id), ['b']);
  assert.equal(J.mine(list[1], 'WM'), true); assert.equal(J.mine(list[0], 'WM'), false);
});

test('Weiterleiten: E-Mail-Link mit Briefdaten und Ablagepfad', () => {
  const url = J.forwardMail({ type: 'Rechnung', sender: 'Stadtwerke', subject: 'Strom', deadline: '2026-10-28', amount: '1.520,24 EUR', file: 'Rechnung\\a.pdf' },
    { to: 'anna@mentor-group.de', note: 'Bitte zahlen.', from: 'WM', folder: 'Ablage' });
  assert.ok(url.startsWith('mailto:anna@mentor-group.de?subject='));
  const body = decodeURIComponent(url.split('&body=')[1]), subject = decodeURIComponent(url.split('subject=')[1].split('&')[0]);
  assert.equal(subject, 'Post für dich: Rechnung – Stadtwerke (Frist 28.10.2026)');
  assert.ok(body.startsWith('Bitte zahlen.\n\nRechnung von Stadtwerke\nBetreff: Strom'));
  assert.ok(body.includes('Ablage: Ablage' + String.fromCharCode(92) + 'Rechnung' + String.fromCharCode(92) + 'a.pdf'), body);
  assert.ok(body.endsWith('Viele Grüße\nWM'));
});


test('Steuerberater-Export: Monat nach Belegdatum, Typen, Sortierung', () => {
  const list = [
    { id: 1, date: '2026-09-28', type: 'Rechnung', sender: 'Zeta GmbH', file: 'Rechnung\\z.pdf' },
    { id: 2, date: '2026-09-03', type: 'Rechnung', sender: 'Alpha KG', file: 'Rechnung\\a.pdf' },
    { id: 3, date: '2026-10-01', type: 'Rechnung', sender: 'Oktober AG', file: 'Rechnung\\o.pdf' },
    { id: 4, date: '2026-09-10', type: 'Ladung', sender: 'Amtsgericht', file: 'Ladung\\l.pdf' },
    { id: 5, date: '', savedAt: '2026-09-15 08:00', type: 'Gutschrift', sender: 'Beta', file: 'Gutschrift\\b.pdf' },
    { id: 6, date: '2026-09-11', type: 'Rechnung', sender: 'Ohne Datei' },
  ];
  assert.deepEqual(J.taxSelect(list, '2026-09', J.TAX_TYPES).map(e => e.id), [2, 5, 1]);
  assert.deepEqual(J.taxSelect(list, '2026-09').map(e => e.id), [2, 4, 5, 1]);
});

test('Steuerberater-Export: Belegliste mit Excel-Betrag, DATEV-XML, eindeutige Namen', () => {
  assert.deepEqual(J.splitAmount('1.520,24 EUR'), { value: '1520,24', cur: 'EUR' });
  assert.deepEqual(J.splitAmount(''), { value: '', cur: '' });
  const csv = J.taxCsv([{ e: { date: '2026-09-03', type: 'Rechnung', sender: 'Alpha; KG', invoiceNo: 'R-1', amount: '1.520,24 EUR', status: 'bezahlt', savedAt: '2026-09-05 10:00', sha256: 'ab' }, zipName: 'a.pdf' }]);
  const row = csv.split('\r\n')[1];
  assert.equal(row, '1;03.09.2026;Rechnung;"Alpha; KG";R-1;;1520,24;EUR;;bezahlt;;05.09.2026;a.pdf;ab');
  const xml = J.datevXml(['a.pdf', 'R&D.pdf'], { description: 'Belege 09/2026', date: new Date(2026, 9, 15, 10, 0, 0) });
  assert.ok(xml.includes('xmlns="http://xml.datev.de/bedi/tps/document/v05.0"'));
  assert.ok(xml.includes('<extension xsi:type="File" name="R&amp;D.pdf"/>'));
  assert.ok(xml.includes('<date>2026-10-15T10:00:00</date>'));
  assert.deepEqual(J.zipNames(['Rechnung\\a.pdf', 'Gutschrift\\a.pdf', 'x\\A.pdf', 'b:c.pdf']), ['a.pdf', 'a (2).pdf', 'A (3).pdf', 'b_c.pdf']);
});

test('E-Mail-Entwurf (.eml) mit PDF-Anhang für Outlook', () => {
  assert.equal(J.b64(new TextEncoder().encode('Man')), 'TWFu');
  assert.equal(J.b64(new Uint8Array([0xff, 0xd8])), '/9g=');
  const pdf = new TextEncoder().encode('%PDF-1.7 Testinhalt');
  const eml = J.emlDraft({ subject: 'Rechnung – Stadtwerke', body: 'Grüße', attachments: [{ name: 'Brief ä.pdf', mime: 'application/pdf', bytes: pdf }], date: new Date(Date.UTC(2026, 9, 15)) });
  assert.match(eml, /^To: \r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\nX-Unsent: 1\r\n/);
  assert.ok(eml.includes('Content-Type: multipart/mixed; boundary="----=_PDFMy_'));
  assert.ok(eml.includes('Content-Disposition: attachment; filename="=?UTF-8?B?'));
  assert.ok(eml.includes(Buffer.from(pdf).toString('base64')));
  assert.ok(eml.includes(Buffer.from('Grüße').toString('base64')));
  assert.ok(eml.trimEnd().endsWith('--'));
  const subj = eml.match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)[1];
  assert.equal(Buffer.from(subj, 'base64').toString('utf8'), 'Rechnung – Stadtwerke');
});


test('Eingangsnummer: fortlaufend je Jahr, auch über das Team-Buch', () => {
  assert.equal(J.nextInNo([], 2026), '2026-0001');
  assert.equal(J.nextInNo([{ inNo: '2026-0041' }, { inNo: '2025-0900' }, { inNo: '' }], 2026), '2026-0042');
  assert.equal(J.nextInNo([{ inNo: '2026-0041' }], 2026, '2026-0050'), '2026-0051');   // lokal schon weiter vergeben
  assert.equal(J.nextInNo([{ inNo: '2025-0900' }], 2026), '2026-0001');               // neues Jahr beginnt bei 1
});


test('Aufbewahrungsfristen: Belege 8, Briefe 6, Bücher 10 Jahre ab Jahresende; Verträge nicht automatisch', () => {
  const d = new Date(2026, 9, 15);
  assert.deepEqual(J.retention({ type: 'Rechnung', date: '2017-05-02' }, d), { years: 8, kind: 'Buchungsbeleg', until: '2025-12-31', expired: true });
  assert.equal(J.retention({ type: 'Rechnung', date: '2018-05-02' }, d).expired, false);   // bis 31.12.2026
  assert.equal(J.retention({ type: 'Brief', date: '2019-12-31' }, d).expired, true);       // 6 Jahre → 31.12.2025
  assert.equal(J.retention({ type: 'Vertrag', date: '2001-01-01' }, d).expired, false);
  assert.equal(J.retention({ type: '', savedAt: '2014-03-01 10:00' }, d).expired, true);   // unbekannt: 10 Jahre
});


test('Wiedervorlage: fällige offene Briefe, erledigte nicht', () => {
  const d = new Date(2026, 9, 16);
  const r = J.resubmit([{ id: 'a', wv: '2026-10-16', status: 'offen' }, { id: 'b', wv: '2026-10-10', status: 'in Arbeit' }, { id: 'c', wv: '2026-10-20' }, { id: 'd', wv: '2026-10-01', status: 'erledigt' }], d);
  assert.deepEqual(r.map(e => e.id), ['b', 'a']);
});
