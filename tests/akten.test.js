// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// Akten (Mandanten-/Vorgangsakten) im Posteingangsbuch
const test = require('node:test'), assert = require('node:assert/strict');
const J = require('../js/journal.js');

const E = [
  { id: 'a', savedAt: '2026-10-01 09:00', date: '2026-09-30', sender: 'Amtsgericht Bielefeld', type: 'Ladung', reference: '343 F 1057/26', akte: 'Müller ./. Schmidt', deadline: '2026-11-05', status: 'offen', assignee: 'AB' },
  { id: 'b', savedAt: '2026-10-10 10:00', date: '2026-10-08', sender: 'RA Kanzlei Weber', type: 'Brief', reference: '343 F 1057/26', akte: 'Müller ./. Schmidt', status: 'erledigt', assignee: 'CD' },
  { id: 'c', savedAt: '2026-10-12 11:00', date: '2026-10-12', sender: 'Finanzamt Paderborn', type: 'Bescheid', akte: 'Meier – ESt 2025', deadline: '2026-11-16', status: 'offen' },
  { id: 'd', savedAt: '2026-10-13 12:00', date: '2026-10-13', sender: 'Stadtwerke', type: 'Rechnung', status: 'offen' },
];

test('Akten-Übersicht: Anzahl, offene, nächste Frist, Zuständige, Sortierung nach Frist', () => {
  const c = J.cases(E, '2026-10-18');
  assert.deepEqual(c.map(x => x.name), ['Müller ./. Schmidt', 'Meier – ESt 2025']);
  const m = c[0];
  assert.equal(m.count, 2); assert.equal(m.open, 1); assert.equal(m.next, '2026-11-05'); assert.equal(m.last, '2026-10-08');
  assert.deepEqual(m.people.sort(), ['AB', 'CD']);
});

test('Akte vorschlagen: gleiches Aktenzeichen, sonst gleicher Absender, sonst leer', () => {
  assert.equal(J.suggestCase(E, { reference: '343  F 1057/26', sender: 'Unbekannt' }), 'Müller ./. Schmidt');
  assert.equal(J.suggestCase(E, { sender: 'Finanzamt  Paderborn' }), 'Meier – ESt 2025');
  assert.equal(J.suggestCase(E, { sender: 'Stadtwerke' }), '');
});

test('CSV: Spalte „Akte“ hin und zurück', () => {
  const csv = J.toCsv(E), back = J.parseCsv(csv);
  assert.match(csv.split('\r\n')[0], /;Akte(;|$)/);
  assert.equal(back.find(e => e.id === 'c').akte, 'Meier – ESt 2025');
});
