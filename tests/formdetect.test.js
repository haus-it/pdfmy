// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/formdetect.js');

// Synthetisches Formular (150 dpi, A4-Ausschnitt): Beschriftungen als Wörter, Linien, Kasten und Ankreuzfelder als Pixel
function form() {
  const W = 1240, H = 900, g = new Uint8Array(W * H).fill(250), words = [];
  const rect = (x, y, w, h, v = 20) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = v; };
  const word = (t, x, y) => { words.push({ t, x: x / W, y: y / H, w: t.length * 11 / W, h: 22 / H }); rect(x, y + 4, t.length * 11, 14, 30); };   // Text als dunkler Block
  word('Name:', 100, 100); rect(180, 122, 500, 2);                       // Schreiblinie
  word('Datum:', 100, 170); rect(190, 192, 220, 2);
  word('Bemerkungen', 100, 240); rect(100, 270, 700, 2); rect(100, 340, 700, 2); rect(100, 270, 2, 72); rect(798, 270, 2, 72);   // Kasten
  rect(100, 420, 20, 2); rect(100, 438, 20, 2); rect(100, 420, 2, 20); rect(118, 420, 2, 20); word('Ja', 130, 418);       // Ankreuzfeld
  rect(200, 420, 20, 2); rect(200, 438, 20, 2); rect(200, 420, 2, 20); rect(218, 420, 2, 20); word('Nein', 230, 418);
  word('Überschrift', 100, 500); rect(100, 524, 140, 2);                    // unterstrichene Überschrift → kein Feld
  return { g, W, H, words };
}

test('Formularfelder: Linien, Kasten, Ankreuzfelder – mit Beschriftung', () => {
  const { g, W, H, words } = form();
  const f = F.detectFields(g, W, H, words);
  const names = f.map(x => `${x.type}:${x.name}`);
  assert.deepEqual(names, ['text:Name', 'text:Datum', 'text:Bemerkungen', 'check:Ja', 'check:Nein']);
  const box = f[2]; assert.ok(Math.abs(box.x - 104 / W) < 0.005 && Math.abs(box.h - 64 / H) < 0.01, JSON.stringify(box));
});

test('Leere Seite oder Fließtext → keine Felder', () => {
  const W = 600, H = 400, g = new Uint8Array(W * H).fill(250);
  assert.deepEqual(F.detectFields(g, W, H, []), []);
});
