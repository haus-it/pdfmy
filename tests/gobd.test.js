// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// GoBD: Siegel je Eintrag und Lücken in den Eingangsnummern
const test = require('node:test'), assert = require('node:assert/strict');
const J = require('../js/journal.js');
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');

test('Siegel: unveränderliche Angaben zählen, Status/Akte/Zuständig nicht', async () => {
  const e = { id: 'x1', savedAt: '2026-10-18 10:00', file: 'Rechnung\\a.pdf', sha256: 'ab12', date: '2026-10-16', sender: 'Stadtwerke', type: 'Rechnung', inNo: '2026-0007', status: 'offen', akte: 'A', assignee: 'AB' };
  const s = await sha(J.sealText(e));
  assert.equal(await sha(J.sealText({ ...e, status: 'bezahlt', akte: 'B', assignee: 'CD', wv: '2026-11-01' })), s);
  assert.notEqual(await sha(J.sealText({ ...e, sender: 'Andere GmbH' })), s);
  assert.notEqual(await sha(J.sealText({ ...e, sha256: 'ff00' })), s);
});

test('Eingangsnummern: Lücken je Jahr', () => {
  const E = ['2026-0001', '2026-0002', '2026-0004', '2026-0007', '2025-0001', '2025-0003'].map(inNo => ({ inNo }));
  assert.deepEqual(J.inNoGaps(E), ['2025-0002', '2026-0003', '2026-0005', '2026-0006']);
  assert.deepEqual(J.inNoGaps([{ inNo: '' }, {}]), []);
});

test('CSV: Version und Siegel bleiben erhalten', () => {
  const back = J.parseCsv(J.toCsv([{ id: 'a', ver: '3', seal: 'deadbeef', status: 'offen' }]));
  assert.equal(back[0].ver, '3'); assert.equal(back[0].seal, 'deadbeef');
});
