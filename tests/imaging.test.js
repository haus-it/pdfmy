// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.self = globalThis;
require('../js/imaging.js');
const I = globalThis.Imaging;

const W = 840, H = 1188;
function sheet(fn = () => [240, 240, 240]) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = (y * W + x) * 4, c = fn(x, y); d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255; }
  return d;
}
const disc = (d, cx, cy, r, c = [20, 20, 20]) => {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const j = (y * W + x) * 4; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; }
};
const px = (d, x, y) => [...d.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];

test('Lochung: zwei runde Flecken am Rand werden gefunden und gefüllt', () => {
  const d = sheet(); disc(d, 50, 450, 12); disc(d, 50, 770, 12);
  const holes = I.findHoles(d, W, H);
  assert.equal(holes.length, 2);
  assert.equal(I.fillHoles(d, W, H, holes), 2);
  assert.deepEqual(px(d, 50, 450), [240, 240, 240]);
});

test('Lochung: ein einzelner Punkt und Flecken in der Blattmitte bleiben', () => {
  const d = sheet(); disc(d, 50, 450, 12); disc(d, 420, 500, 12); disc(d, 420, 800, 12);
  assert.equal(I.findHoles(d, W, H).length, 0);
});

test('Lochung: ein Balken am Rand ist keine Lochung', () => {
  const d = sheet();
  for (const y0 of [400, 760]) for (let y = y0; y < y0 + 8; y++) for (let x = 30; x < 70; x++) { const j = (y * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = 20; }
  assert.equal(I.findHoles(d, W, H).length, 0);
});

test('Lochung: große Aufzählungspunkte mit Text daneben bleiben', () => {
  const d = sheet();
  for (const y0 of [450, 770]) { disc(d, 50, y0, 12); for (let y = y0 - 6; y < y0 + 6; y++) for (let x = 85; x < 600; x++) { const j = (y * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = 20; } }
  assert.equal(I.findHoles(d, W, H).length, 0);
});

test('Farbseite: Schatten verschwindet, das Logo behält seine Farbe', () => {
  const shade = x => 1 - 0.35 * x / W;
  const logo = (x, y) => x > 300 && x < 500 && y > 300 && y < 500;
  const d = sheet((x, y) => { const s = shade(x); return logo(x, y) ? [200 * s, 30 * s, 30 * s] : [245 * s, 245 * s, 245 * s]; });
  assert.equal(I.colorFlatten(d, W, H), true);
  const l = px(d, 40, 600)[0], r = px(d, 800, 600)[0];
  assert.ok(Math.abs(l - r) < 12, `links ${l}, rechts ${r}`);
  const [a, b] = px(d, 400, 400);
  assert.ok(a > 150 && b < 70, `Logo ${a}/${b}`);
});

test('Farbiges Papier wird nicht aufgehellt', () => {
  const d = sheet(() => [240, 220, 120]), vor = d.slice();
  assert.equal(I.colorFlatten(d, W, H), false);
  assert.deepEqual(d, vor);
});

test('Rand: schmaler grauer Streifen wird weiß, Inhalt bleibt', () => {
  const d = sheet((x, y) => y < 4 ? [120, 120, 120] : y === 300 && x > 100 && x < 700 ? [0, 0, 0] : [255, 255, 255]);
  assert.equal(I.cleanEdges(d, W, H), 1);
  assert.deepEqual(px(d, 400, 1), [255, 255, 255]);
  assert.deepEqual(px(d, 400, 300), [0, 0, 0]);
});

test('Rand: breiter oder farbiger Streifen gehört zum Dokument', () => {
  const breit = sheet((x, y) => y < 60 ? [60, 60, 60] : [255, 255, 255]);
  assert.equal(I.cleanEdges(breit, W, H), 0);
  const farbig = sheet((x, y) => y < 4 ? [200, 30, 30] : [255, 255, 255]);
  assert.equal(I.cleanEdges(farbig, W, H), 0);
});

test('Leerseite: weißes Blatt und durchscheinende Rückseite sind leer, helle oder farbige Grafik und kurzer Text nicht', () => {
  const blank = sheet(() => [245, 245, 242]);
  assert.equal(I.blankData(blank, W, H), true);
  const through = sheet((x, y) => (y % 40 < 2 && y > 300 && y < 900 && x > 100 && x < 700) || (x % 25 < 2 && y > 300 && y < 330) ? [150, 150, 150] : [245, 245, 242]);   // Rückseite scheint als dünne, blasse Striche durch
  assert.equal(I.blankData(through, W, H), true);
  const pastel = sheet((x, y) => x > 200 && x < 640 && y > 300 && y < 700 ? [150, 190, 235] : [255, 255, 255]);   // hellblaues Logo, nichts unter Grau 110
  assert.equal(I.blankData(pastel, W, H), false);
  const gray = sheet((x, y) => x > 200 && x < 640 && y > 300 && y < 700 ? [199, 199, 199] : [255, 255, 255]);   // dasselbe Logo im Modus Graustufen
  assert.equal(I.blankData(gray, W, H), false);
  const marker = sheet((x, y) => y > 500 && y < 520 && x > 100 && x < 600 ? [255, 240, 60] : [255, 255, 255]);    // Textmarker-Strich
  assert.equal(I.blankData(marker, W, H), false);
  const text = sheet(); for (let x = 150; x < 650; x += 30) disc(text, x, 600, 6);   // eine kurze Zeile
  assert.equal(I.blankData(text, W, H), false);
});
