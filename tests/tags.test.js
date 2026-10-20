// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Schlagwörter im Posteingangsbuch
const test = require('node:test'), assert = require('node:assert/strict');
const J = require('../js/journal.js');

test('Schlagwörter: trennen, säubern, Doppelte (Groß/klein) entfernen', () => {
  assert.deepEqual(J.tagList(' Steuer 2025,  Versicherung ; steuer 2025,, dringend '), ['Steuer 2025', 'Versicherung', 'dringend']);
  assert.deepEqual(J.tagList(''), []);
  assert.deepEqual(J.tagList(undefined), []);
});

test('Alle Schlagwörter mit Häufigkeit, häufigste zuerst', () => {
  const E = [{ tags: 'Steuer 2025, dringend' }, { tags: 'steuer 2025' }, { tags: 'Versicherung' }, {}];
  assert.deepEqual(J.allTags(E).map(t => `${t.tag}:${t.n}`), ['Steuer 2025:2', 'dringend:1', 'Versicherung:1']);
});

test('CSV: Spalte „Schlagwörter“ hin und zurück', () => {
  const back = J.parseCsv(J.toCsv([{ id: 'a', tags: 'Steuer 2025, dringend', status: 'offen' }]));
  assert.equal(back[0].tags, 'Steuer 2025, dringend');
});
