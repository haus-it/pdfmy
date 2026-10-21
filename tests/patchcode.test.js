// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Patchcode-Trennblätter erkennen (js/patchcode.js) – nachgebildete Scans
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../js/patchcode.js');

// Seite in Graustufen: Papier 240, Rauschen, optional leicht schräg. dpi = Pixel je Zoll
function page({ dpi = 60, landscape = false, noise = 8, seed = 7 } = {}) {
  const W = Math.round((landscape ? 11.69 : 8.27) * dpi), H = Math.round((landscape ? 8.27 : 11.69) * dpi);
  const g = new Uint8Array(W * H).fill(240); let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return { W, H, g, dpi, rnd, noise };
}
function finish(p) { for (let i = 0; i < p.g.length; i++) p.g[i] = Math.max(0, Math.min(255, p.g[i] + (p.rnd() - 0.5) * 2 * p.noise)); return p; }
function rect(p, x, y, w, h, v = 25, skew = 0) {
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(p.H, y + h); yy++) {
    const dx = Math.round((yy - y) * skew);
    for (let xx = Math.max(0, Math.round(x + dx)); xx < Math.min(p.W, x + dx + w); xx++) p.g[yy * p.W + xx] = v;
  }
}
// Patchcode zeichnen: Balken senkrecht (wie im Einzug), schmal 0,08″, breit 0,2″, Abstand 0,2″
function patch(p, pattern, { horizontal = false, skew = 0, x0 } = {}) {
  const nw = 0.08 * p.dpi, ww = 0.2 * p.dpi, gap = 0.2 * p.dpi;
  let pos = x0 ?? (horizontal ? p.H : p.W) * 0.45;
  for (const c of pattern) {
    const w = c === 'W' ? ww : nw;
    if (horizontal) rect(p, p.W * 0.08, pos, p.W * 0.84, w); else rect(p, pos, p.H * 0.08, w, p.H * 0.84, 25, skew);
    pos += w + gap;
  }
  return p;
}
function text(p, lines = 40) {
  for (let l = 0; l < lines; l++) {
    const y = p.H * 0.08 + l * p.H * 0.021; let x = p.W * 0.1;
    while (x < p.W * 0.85) { const w = 3 + p.rnd() * p.W * 0.08; rect(p, x, y, w, p.dpi * 0.1, 40); x += w + p.dpi * 0.06; }
  }
  return p;
}

test('alle Patchcode-Typen werden erkannt', () => {
  for (const [pat, type] of Object.entries(P.TYPES)) {
    const p = finish(patch(page(), pat)), r = P.detect(p.g, p.W, p.H);
    assert.ok(r, 'nicht erkannt: ' + pat);
    assert.equal(r.type, type, pat);
  }
});

test('gedreht, quer, schräg, gering aufgelöst, verrauscht', () => {
  let p = finish(patch(page(), 'NNNW')); assert.equal(P.detect(p.g, p.W, p.H)?.type, 'T', 'um 180° gedreht');
  p = finish(patch(page({ landscape: true }), 'WNNN', { horizontal: true })); assert.equal(P.detect(p.g, p.W, p.H)?.type, 'T', 'Balken waagerecht');
  p = finish(patch(page(), 'WNNN', { skew: 0.02 })); assert.equal(P.detect(p.g, p.W, p.H)?.type, 'T', 'gut 1° schräg');
  p = finish(patch(page({ dpi: 40 }), 'WNNN')); assert.equal(P.detect(p.g, p.W, p.H)?.type, 'T', '40 dpi');
  p = finish(patch(page({ dpi: 100, noise: 20 }), 'WWNN')); assert.equal(P.detect(p.g, p.W, p.H)?.type, '3', 'starkes Rauschen');
  p = finish(patch(page(), 'WNNN', { x0: 30 })); assert.equal(P.detect(p.g, p.W, p.H)?.type, 'T', 'Balken am Rand');
});

test('normale Seiten sind keine Trennblätter', () => {
  const none = (name, p) => assert.equal(P.detect(p.g, p.W, p.H), null, name);
  none('leere Seite', finish(page()));
  none('Textseite', finish(text(page())));
  none('Textseite fein', finish(text(page({ dpi: 100 }), 60)));
  // Tabelle: vier gleich dünne Linien über die ganze Höhe
  let p = page(); for (let i = 0; i < 4; i++) rect(p, p.W * (0.1 + i * 0.25), p.H * 0.08, 2, p.H * 0.84); none('Tabellenlinien', finish(p));
  // Balkendiagramm: Balken mit unterschiedlicher Höhe (nicht über die Seite) und gleicher Breite
  p = page(); for (let i = 0; i < 4; i++) rect(p, p.W * (0.2 + i * 0.12), p.H * (0.3 + i * 0.1), p.W * 0.06, p.H * (0.5 - i * 0.1)); none('Balkendiagramm', finish(p));
  // Strichcode (viele Striche): mehr als vier Balken ohne freien Rand
  p = page(); let x = p.W * 0.3; for (let i = 0; i < 30; i++) { const w = i % 3 ? 2 : 5; rect(p, x, p.H * 0.4, w, p.H * 0.08); x += w + 3; } none('Strichcode', finish(p));
  // Patchcode-ähnliche Balken, aber nur kurz (Logo/Grafik oben)
  p = patch(page(), 'WNNN'); for (let y = 0; y < p.H; y++) if (y < p.H * 0.1 || y > p.H * 0.2) for (let x = 0; x < p.W; x++) p.g[y * p.W + x] = 240; none('kurze Balken', finish(p));
});

test('Text neben dem Patchcode stört nicht', () => {
  const p = page(); text(p, 40);
  for (let y = 0; y < p.H; y++) for (let x = Math.round(p.W * 0.42); x < p.W; x++) p.g[y * p.W + x] = 240;   // Text nur links
  patch(p, 'WNNN', { x0: p.W * 0.6 });
  assert.equal(P.detect(finish(p).g, p.W, p.H)?.type, 'T');
});
