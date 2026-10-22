// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/docdetect.js');

// Synthetisches Handyfoto: Blatt (Viereck) mit Schriftzeilen auf einem Untergrund, mit Licht, Schatten und Rauschen
function scene({ W = 480, H = 640, quad, bg = 'dark', light = 0, shadow = 0, seed = 7, text = true, hand = false }) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const Q = quad.map(([x, y]) => [x * W, y * H]);
  const inside = (x, y) => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const distOut = (x, y) => Math.min(...Q.map((a, i) => { const b = Q[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); }));
  const ys = Q.map(p => p[1]), top = Math.min(...ys), bot = Math.max(...ys);
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let cov = 0; for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) cov += inside(x + ox, y + oy) ? 0.25 : 0;
    const n = (rnd() - 0.5) * 10;
    let B;
    if (bg === 'dark') B = [62 + n, 52 + n, 48 + n];
    else if (bg === 'wood') { const st = Math.sin(x * 0.09 + Math.sin(y * 0.02) * 3) * 18; B = [188 + st + n, 146 + st + n, 104 + st * 0.6 + n]; }
    else if (bg === 'white') B = [226 + n, 226 + n, 222 + n];
    else B = [120 + n * 3, 118 + n * 3, 125 + n * 3];
    if (shadow && cov < 1) { const dd = distOut(x + 0.5, y + 0.5); if (dd < 10) B = B.map(v => v - shadow * (1 - dd / 10)); }
    const lf = 1 - light * (x / W * 0.6 + y / H * 0.4);
    let p = 246 * lf + n * 0.5;
    if (text && cov > 0) { const rel = (y - top) / (bot - top); if (rel > 0.15 && rel < 0.8 && (y % 14) < 3 && distOut(x, y) > W * 0.08 && ((x * 7 + y) % 23) > 4) p = 40; }
    let C = [p, p, p * 0.99];
    if (hand && cov > 0 && x < W * 0.33 && y > H * 0.82) C = [205, 160, 135];   // Daumen auf dem Blatt
    for (let k = 0; k < 3; k++) d[(y * W + x) * 4 + k] = B[k] * (1 - cov) + C[k] * cov;
    d[(y * W + x) * 4 + 3] = 255;
  }
  return { d, W, H };
}
const err = (a, b) => Math.max(...a.map(([x, y], i) => Math.hypot(x - b[i][0], y - b[i][1])));
const straight = [[0.15, 0.12], [0.85, 0.12], [0.85, 0.9], [0.15, 0.9]];
const persp = [[0.22, 0.14], [0.8, 0.1], [0.9, 0.92], [0.1, 0.88]];
const rot = (() => { const c = [0.5, 0.5], a = 22 * Math.PI / 180; return [[-0.27, -0.33], [0.27, -0.33], [0.27, 0.33], [-0.27, 0.33]].map(([x, y]) => [c[0] + (x * Math.cos(a) - y * Math.sin(a) * 0.75), c[1] + (x * Math.sin(a) / 0.75 + y * Math.cos(a))]); })();

const cases = [
  ['dunkler Untergrund', { quad: straight, bg: 'dark' }],
  ['Perspektive', { quad: persp, bg: 'dark' }],
  ['Holztisch, schräge Perspektive', { quad: persp, bg: 'wood' }],
  ['gedreht um 22°', { quad: rot, bg: 'gray' }],
  ['weißer Tisch mit leichtem Schatten', { quad: persp, bg: 'white', shadow: 14 }],
  ['ungleichmäßiges Licht', { quad: persp, bg: 'gray', light: 0.35 }],
  ['Daumen am Rand', { quad: straight, bg: 'wood', hand: true }],
  ['heller Untergrund ohne Schrift', { quad: persp, bg: 'white', shadow: 10, text: false }],
];
for (const [name, o] of cases) {
  test('Blatterkennung: ' + name, () => {
    const { d, W, H } = scene(o);
    const r = D.findDocument(d, W, H);
    assert.equal(r.found, true, `nicht gefunden (score ${r.score?.toFixed(2)})`);
    const e = err(D.order(r.corners), o.quad);
    assert.ok(e < 0.015, `Ecken weichen um ${(e * 100).toFixed(1)} % ab: ${JSON.stringify(r.corners.map(p => p.map(v => +v.toFixed(3))))}`);
  });
}

test('Blatterkennung: kein Blatt im Bild → nicht erkannt', () => {
  const { d, W, H } = scene({ quad: [[0.49, 0.49], [0.5, 0.49], [0.5, 0.5], [0.49, 0.5]], bg: 'wood', text: false });
  assert.equal(D.findDocument(d, W, H).found, false);
});

test('Nachführen mit bekannten Ecken (volle Auflösung)', () => {
  const { d, W, H } = scene({ W: 900, H: 1200, quad: persp, bg: 'wood' });
  const rough = persp.map(([x, y], i) => [x + (i % 2 ? 0.012 : -0.01), y + 0.01]);
  const r = D.findDocument(d, W, H, rough);
  assert.ok(err(r.corners, persp) < 0.006, 'Abweichung ' + err(r.corners, persp));
});

// Fotos auf dem Scannerglas (findPhoto): heller Deckel, Foto mit vielen Mitteltönen – auch in einer Ecke
function glass({ W = 413, H = 585, photo, letter = false }) {
  const d = new Uint8ClampedArray(W * H * 4); let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; let r = 246, g = 246, b = 243;
    if (photo && x >= photo[0] && x < photo[0] + photo[2] && y >= photo[1] && y < photo[1] + photo[3]) {   // Verlauf mit Struktur wie ein Foto
      const u = (x - photo[0]) / photo[2], v = (y - photo[1]) / photo[3];
      r = 60 + 140 * u + 30 * Math.sin(y / 7); g = 90 + 80 * v + 25 * Math.cos(x / 9); b = 150 - 90 * u + 20 * Math.sin((x + y) / 11);
    }
    if (letter && y > 80 && y < H - 60 && y % 14 < 3 && x > 40 && x < W - 40 && rnd() > 0.3) r = g = b = 30;   // Schriftzeilen
    if (letter && x > 300 && x < 370 && y > 30 && y < 60) { r = 190; g = 40; b = 40; }                         // kleines Logo
    d[o] = r + (rnd() - 0.5) * 6; d[o + 1] = g + (rnd() - 0.5) * 6; d[o + 2] = b + (rnd() - 0.5) * 6; d[o + 3] = 255;
  }
  return { d, W, H };
}

test('Foto in der Glasecke wird gefunden und als Foto erkannt', () => {
  const { d, W, H } = glass({ photo: [20, 20, 250, 167] }), r = D.findPhoto(d, W, H);
  assert.ok(r.found); assert.ok(r.photoLike);
  const xs = r.corners.map(p => p[0] * W), ys = r.corners.map(p => p[1] * H);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(w / h - 1.5) < 0.08, 'Seitenverhältnis ' + (w / h).toFixed(2));
});
test('Brief mit Schrift und Logo ist kein Foto', () => {
  const { d, W, H } = glass({ letter: true }), r = D.findPhoto(d, W, H);
  assert.equal(r.photoLike, false);
});
test('randloses Foto über die ganze Fläche ist ein Foto (ohne Zuschnitt)', () => {
  const { d, W, H } = glass({ photo: [0, 0, 413, 585] }), r = D.findPhoto(d, W, H);
  assert.equal(r.found, false); assert.ok(r.photoLike);
});
test('Dokument mit Bild und Text ist kein Foto', () => {
  const { d, W, H } = glass({ photo: [40, 40, 200, 140], letter: true }), r = D.findPhoto(d, W, H);
  assert.equal(r.photoLike, false);
});
