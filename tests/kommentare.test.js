// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Antworten und Status bei Kommentaren (js/kommentare.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/kommentare.js');

const now = new Date(Date.UTC(2026, 10, 5, 9, 30, 0));

test('Antwort anhängen, leere Antwort ignorieren', () => {
  const a = {};
  assert.equal(K.reply(a, '   ', 'WM', now), null);
  const r = K.reply(a, ' Passt so. ', ' WM ', now);
  assert.deepEqual(r, { text: 'Passt so.', by: 'WM', at: '05.11.2026', t: '2026-11-05T09:30:00.000Z' });
  assert.equal(a.replies.length, 1);
  assert.ok(K.hasThread(a));
  assert.deepEqual(K.replyLines(a), ['↳ WM: Passt so.']);
});
test('Status setzen und zurücksetzen, unbekannter Status wird abgewiesen', () => {
  const a = {};
  K.setState(a, 'Completed', 'Anna', now);
  assert.equal(a.state, 'Completed'); assert.equal(K.label(a.state), 'Erledigt'); assert.equal(a.stateBy, 'Anna');
  assert.deepEqual(K.plain(a, ''), ['Status: Erledigt (Anna)']);
  K.setState(a, '', 'Anna', now);
  assert.equal(a.state, undefined); assert.equal(K.hasThread(a), false); assert.equal(K.label(a.state), 'Offen');
  assert.throws(() => K.setState(a, 'Unsinn'), /Unbekannter Status/);
});
test('PDF-Datum hin und zurück, auch mit Zeitzone wie von Acrobat', () => {
  assert.equal(K.pdfDate('2026-11-05T09:30:00.000Z'), 'D:20261105093000Z');
  assert.equal(K.parsePdfDate('D:20261105093000Z').toISOString(), '2026-11-05T09:30:00.000Z');
  assert.equal(K.parsePdfDate("D:20261105103000+01'00'").toISOString(), '2026-11-05T09:30:00.000Z');
  assert.equal(K.parsePdfDate('D:2026').toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(K.parsePdfDate('Unsinn'), null);
});
test('Verläufe aus fremder PDF: Antworten nach Zeit, jüngster Review-Status zählt, Marked übergangen', () => {
  const m = K.threads([
    { irt: '12 0 R', contents: 'Zweite', by: 'B', m: 'D:20261105100000Z' },
    { irt: '12 0 R', contents: 'Erste', by: 'A', m: 'D:20261105090000Z' },
    { irt: '12 0 R', stateModel: 'Review', state: 'Accepted', by: 'A', m: 'D:20261105091000Z' },
    { irt: '12 0 R', stateModel: 'Review', state: 'Completed', by: 'B', m: 'D:20261105110000Z' },
    { irt: '12 0 R', stateModel: 'Marked', state: 'Marked', by: 'C', m: 'D:20261105120000Z' },
    { irt: '20 0 R', contents: '   ', by: 'X' },
    { irt: '30 0 R', stateModel: 'Review', state: 'Rejected', m: 'D:20261105090000Z' },
    { irt: '30 0 R', stateModel: 'Review', state: 'None', m: 'D:20261105100000Z' },
  ]);
  assert.deepEqual([...m.keys()], ['12 0 R']);
  const th = m.get('12 0 R');
  assert.deepEqual(th.replies.map(r => r.text), ['Erste', 'Zweite']);
  assert.equal(th.state, 'Completed'); assert.equal(th.stateBy, 'B');
  assert.equal(th.replies[0].at, '05.11.2026');
});
test('Kommentare anderer Programme aus pdf.js: Verlauf, Status, ausgeblendete und Links übergangen', () => {
  const r = K.fromPdfJs([
    { id: '10R', subtype: 'Text', contentsObj: { str: 'Bitte  prüfen' }, titleObj: { str: 'Anna' }, modificationDate: 'D:20261104090000Z' },
    { id: '11R', subtype: 'Text', inReplyTo: '10R', contentsObj: { str: 'Erledigt' }, titleObj: { str: 'Bernd' }, modificationDate: 'D:20261104100000Z' },
    { id: '12R', subtype: 'Text', inReplyTo: '10R', stateModel: 'Review', state: 'Completed', titleObj: { str: 'Bernd' }, modificationDate: 'D:20261104110000Z', annotationFlags: 30 },
    { id: '13R', subtype: 'Popup' }, { id: '14R', subtype: 'Link' }, { id: '15R', subtype: 'Widget' },
    { id: '16R', subtype: 'Square', annotationFlags: 2 },
    { id: '17R', subtype: 'FreeText', contentsObj: { str: 'Hinweis' } },
    { id: '18R', subtype: 'Squarish' },
  ]);
  assert.deepEqual(r.map(x => x.id), ['10R', '17R', '18R']);
  assert.equal(r[0].label, 'Notiz'); assert.equal(r[0].text, 'Bitte prüfen'); assert.equal(r[0].by, 'Anna'); assert.equal(r[0].at, '04.11.2026');
  assert.deepEqual(r[0].replies.map(x => x.text), ['Erledigt']); assert.equal(r[0].state, 'Completed');
  assert.equal(r[1].label, 'Textkommentar'); assert.deepEqual(r[1].replies, []); assert.equal(r[2].label, 'Kommentar');
  assert.deepEqual(K.fromPdfJs(null), []);
});
test('Klartext für die Zwischenablage', () => {
  const a = { replies: [{ text: 'Ok', by: 'WM', at: '05.11.2026' }], state: 'Rejected' };
  assert.deepEqual(K.plain(a), ['    ↳ 05.11.2026 · WM: Ok', '    Status: Abgelehnt']);
});
