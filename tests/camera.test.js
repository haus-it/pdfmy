// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/camera.js');

const page = [[0.2, 0.15], [0.8, 0.17], [0.82, 0.88], [0.18, 0.86]];
const det = (corners = page, extra = {}) => ({ found: true, corners, fill: 0.95, ...extra });
const shift = (c, d) => c.map(([x, y]) => [x + d, y + d]);

test('Plausibles Blatt: Fläche, Winkel, Füllgrad', () => {
  assert.equal(C.plausible(det()), true);
  assert.equal(C.plausible({ found: false, corners: page }), false);
  assert.equal(C.plausible(det([[0.45, 0.45], [0.55, 0.45], [0.55, 0.55], [0.45, 0.55]])), false);        // zu klein
  assert.equal(C.plausible(det(page, { fill: 0.5 })), false);                                              // unregelmäßiger Fleck
  assert.equal(C.plausible(det([[0.1, 0.1], [0.9, 0.1], [0.5, 0.2], [0.1, 0.9]])), false);                 // kein Rechteck
});

test('Auto-Auslöser: erst nach ruhiger Haltezeit, dann keine Doppelten', () => {
  const s = new C.AutoShutter({ steadyMs: 900, cooldownMs: 1200 });
  const fpA = new Uint8Array(256).fill(200), fpB = new Uint8Array(256).fill(120);
  assert.equal(s.update({ found: false, corners: page }, 0, null).state, 'search');
  assert.equal(s.update(det(), 100, fpA).state, 'hold');
  assert.equal(s.update(det(shift(page, 0.05)), 500, fpA).state, 'hold');           // Bewegung setzt die Haltezeit zurück
  assert.equal(s.update(det(shift(page, 0.05)), 1300, fpA).state, 'hold');
  assert.equal(s.update(det(shift(page, 0.051)), 1450, fpA).state, 'fire');         // 950 ms ruhig
  assert.equal(s.update(det(shift(page, 0.05)), 2000, fpA).state, 'wait');          // gleiches Blatt bleibt liegen
  assert.equal(s.update(det(shift(page, 0.05)), 5000, fpA).state, 'wait');          // auch nach langer Zeit keine zweite Aufnahme
  // neues Blatt (anderer Inhalt) → wieder bereit, nach Haltezeit nächste Aufnahme
  assert.equal(s.update(det(), 5100, fpB).state, 'hold');
  assert.equal(s.update(det(), 6100, fpB).state, 'fire');
});

test('Auto-Auslöser: Blatt kurz weg → nächstes Blatt wird aufgenommen, auch bei ähnlichem Inhalt', () => {
  const s = new C.AutoShutter({ steadyMs: 500, goneMs: 300 });
  const fp = new Uint8Array(256).fill(200);
  s.update(det(), 0, fp); assert.equal(s.update(det(), 600, fp).state, 'fire');
  assert.equal(s.update({ found: false, corners: page }, 700, null).state, 'wait');
  assert.equal(s.update({ found: false, corners: page }, 1100, null).state, 'search');
  assert.equal(s.update(det(), 1200, fp).state, 'hold');
  assert.equal(s.update(det(), 1800, fp).state, 'fire');
});

test('Ecken-Glättung: Zittern gedämpft, neues Blatt sofort übernommen', () => {
  const a = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
  const jitter = a.map(([x, y]) => [x + 0.01, y]);
  const s = C.smoothCorners(a, jitter);
  assert.ok(Math.abs(s[0][0] - 0.2045) < 1e-9);
  const jump = a.map(([x, y]) => [x + 0.2, y]);
  assert.deepEqual(C.smoothCorners(a, jump), jump);
  assert.deepEqual(C.smoothCorners(null, a), a);
});

test('Plausibel mit Kantenbestätigung (neue Blatterkennung)', () => {
  assert.equal(C.plausible({ found: true, corners: page, score: 0.9 }), true);
  assert.equal(C.plausible({ found: true, corners: page, score: 0.2, fill: 1 }), false);
});
