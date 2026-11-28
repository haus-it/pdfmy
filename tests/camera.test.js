// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
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

test('Licht: Spiegelung, zu dunkel, gleichmäßig hell', () => {
  const fill = (n, v) => Array(n).fill(v);
  const paper = [...fill(900, 210), ...fill(100, 40)];                  // Papier mit Schrift, normal belichtet
  assert.equal(C.lightIssue(C.lightStats(paper)), '');
  assert.equal(C.lightIssue(C.lightStats([...paper, ...fill(120, 255)])), 'glare');   // ausgebrannter Fleck
  assert.equal(C.lightIssue(C.lightStats([...fill(900, 252), ...fill(100, 30)])), '');  // ganzes Papier sehr hell: keine Spiegelung
  assert.equal(C.lightIssue(C.lightStats([...paper, ...fill(5, 255)])), '');          // einzelne helle Punkte zählen nicht
  assert.equal(C.lightIssue(C.lightStats(fill(500, 30))), 'dark');
  const s = C.lightStats([0, 10, 20, 255]);
  assert.equal(s.sat, 0.25); assert.equal(s.p50, 10); assert.equal(s.mean, 71.25);
});

test('Spiegelung entfernen: zweite Aufnahme ersetzt nur den Glanzfleck, Helligkeit angeglichen, Versatz gefunden (Meldung 2026-0016)', () => {
  const { glareMerge, bestShift } = require('../js/camera.js');
  const w = 200, h = 140, n = w * h;
  // Papier 200 mit Schriftzeilen (40); A: Glanz links, B: Glanz rechts, B etwas dunkler und um 2 px nach rechts versetzt
  const ink = (x, y) => y % 14 < 3 && x % 9 < 6;
  const bild = (glanzX, hell, dx) => { const d = new Uint8ClampedArray(n * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x - dx, inGlare = Math.hypot(x - glanzX, y - 70) < 30; let v = ink(sx, y) ? 40 : 200; v = Math.round(v * hell); if (inGlare) v = 255;
    const q = (y * w + x) * 4; d[q] = d[q + 1] = d[q + 2] = v; d[q + 3] = 255; } return d; };
  const a = bild(50, 1, 0), b0 = bild(150, 0.9, 0), b = bild(150, 0.9, 2);
  const L = d => { const l = new Uint8Array(n); for (let p = 0; p < n; p++) l[p] = d[p * 4]; return l; };
  const s = bestShift(L(a), L(b), w, h, 4);
  assert.deepEqual([s.dx, s.dy], [2, 0], 'Versatz der zweiten Aufnahme erkannt');
  const r = glareMerge(a, b0, w, h);
  assert.ok(r.glare > 0.05 && r.fixed > 0.05);
  assert.ok(Math.abs(r.k - 1 / 0.9) < 0.05, 'Helligkeit angeglichen');
  // im früheren Glanzfleck ist die Schrift wieder da, außerhalb bleibt A unverändert
  let dunkel = 0; for (let y = 50; y < 90; y++) for (let x = 35; x < 65; x++) if (r.data[(y * w + x) * 4] < 120) dunkel++;
  assert.ok(dunkel > 100, 'Schrift im Glanzfleck zurück');
  for (const [x, y] of [[120, 20], [180, 130], [5, 5]]) assert.ok(Math.abs(r.data[(y * w + x) * 4] - a[(y * w + x) * 4]) <= 1);
  // Glanz in beiden an derselben Stelle: A bleibt
  const r2 = glareMerge(a, bild(50, 1, 0), w, h);
  assert.equal(r2.data[(70 * w + 50) * 4], 255);
});
