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

// Rückmeldung 20.11.2026: Rechnung gescannt, Briefkopf mit Firmenlogo fehlte bzw. war blass
test('Kleines Firmenlogo im Briefkopf macht die Seite zur Farbseite, Farbrauschen nicht', () => {
  const w = 400, h = 566, mk = fn => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y * w + x) * 4, c = fn(x, y); d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255; } return d; };
  const text = (x, y) => y > 150 && y < 500 && x > 40 && x < 360 && y % 12 < 2 ? [40, 40, 40] : [245, 245, 242];
  // Logo 22×8 mm (etwa 0,2 % der Seite) – lag unter der bisherigen 0,3-%-Schwelle
  assert.equal(I.colorfulData(mk((x, y) => x > 300 && x < 342 && y > 30 && y < 46 ? [40, 110, 200] : text(x, y)), w, h), true);
  let s = 3; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  assert.equal(I.colorfulData(mk((x, y) => rnd() < 0.002 ? [200, 60, 60] : text(x, y)), w, h), false, 'verstreute Farbpunkte (Rauschen) sind keine Farbseite');
  assert.equal(I.colorfulData(mk(text), w, h), false);
});

test('Farbseite: helles Logo bleibt farbig, graues Durchscheinen wird weiß', () => {
  const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.min(1, Math.max(0, (v - 30) / (190 - 30))) ** 1.3 * 255);
  const d = new Uint8ClampedArray([150, 190, 230, 255, 245, 200, 60, 255, 205, 205, 203, 255, 40, 40, 40, 255]);
  I.colorLut(d, lut);
  const ch = j => Math.max(d[j], d[j + 1], d[j + 2]) - Math.min(d[j], d[j + 1], d[j + 2]);
  assert.ok(ch(0) >= 60 && d[0] < 200, 'hellblaues Logo bleibt blau: ' + [...d.slice(0, 3)]);
  assert.ok(ch(4) >= 120, 'gelbes Logo bleibt gelb: ' + [...d.slice(4, 7)]);
  assert.deepEqual([...d.slice(8, 11)], [255, 255, 255], 'Durchscheinen wird weiß');
  assert.ok(d[12] < 30, 'Schrift bleibt dunkel');
});

// Meldung 2026-0013: Titelbild mit Fotos und QR-Code wurde als Brief „Papier weiß“ aufbereitet – Fotos ausgebleicht, QR-Code unlesbar
const noise = (x, y) => ((x * 73856093) ^ (y * 19349663)) % 23 - 11;
test('Bildseite: Titelbild mit großen Fotos und dunkles Plakat werden erkannt, Briefe nicht (Meldung 2026-0013)', () => {
  const photo = (x, y) => { const v = 60 + ((x * 3 + y * 2) % 160) + noise(x, y); return [v, Math.max(0, v - 30), Math.min(255, v + 25)]; };
  const cover = sheet((x, y) => y > 180 && y < 1000 ? photo(x, y) : [248, 248, 246]);
  assert.equal(I.pictorialData(cover, W, H), true, 'Titelbild');
  assert.equal(I.pictorialData(sheet((x, y) => x > 150 && x < 690 && y > 300 && y < 900 ? photo(x, y) : [25, 30, 60]), W, H), true, 'dunkles Plakat');
  // Brief: Zeilen dunkler Schrift, kleines Foto im Briefkopf, QR-Code unten – bleibt Dokument
  const letter = sheet((x, y) => x > 600 && x < 780 && y > 40 && y < 160 ? photo(x, y) : y > 300 && y < 1000 && y % 30 < 9 && x > 80 && x < 760 && (x >> 3) % 4 ? [30, 30, 30] : [240 + noise(x, y) % 4, 240, 238]);
  assert.equal(I.pictorialData(letter, W, H), false, 'Brief');
  assert.equal(I.pictorialData(sheet(() => [250, 235, 160]), W, H), false, 'farbiges Papier');
  assert.equal(I.pictorialData(sheet(), W, H), false, 'leere Seite');
  // Seite mit grauer Schattierung (Tabellenkopf über ein Drittel der Seite) bleibt Dokument
  assert.equal(I.pictorialData(sheet((x, y) => y < 400 ? [205, 205, 205] : [245, 245, 245]), W, H), false, 'Schattierung');
});

test('Digitale Grafik und Bildschirmfoto werden erkannt, Scans mit Rauschen nicht (Meldung 2026-0009)', () => {
  const grafik = sheet((x, y) => y < 120 ? [0, 90, 160] : (x - 300) ** 2 + (y - 500) ** 2 < 200 ** 2 ? [230, 120, 20] : x > 500 && y > 300 && y < 900 ? [60, 160, 80] : [255, 255, 255]);
  assert.equal(I.digitalData(grafik, W, H), true, 'Grafik mit Farbflächen');
  assert.equal(I.digitalData(sheet((x, y) => y < 50 ? [50, 50, 60] : y % 40 < 10 && x % 7 ? [20, 20, 20] : [240, 240, 240]), W, H), true, 'Bildschirmfoto');
  const scan = sheet((x, y) => { const v = (y % 40 < 10 && x % 7 ? 40 : 200) + noise(x, y); return [v, v, v + 2]; });
  assert.equal(I.digitalData(scan, W, H), false, 'Scan mit Rauschen');
  assert.equal(I.digitalData(sheet(() => [255, 255, 255]), W, H), false, 'weiße Seite: zu wenig Mitteltöne');
});
