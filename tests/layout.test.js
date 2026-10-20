// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Seitenformat und Bogenaufteilung (js/layout.js)
const test = require('node:test'), assert = require('node:assert/strict');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Layout = require('../js/layout.js');
const L = globalThis.PDFLib, N = L.PDFName.of;
const arr = (page, k) => page.node.lookup(N(k))?.asArray().map(v => v.asNumber());

async function sample(sizes, rot = []) {
  const d = await L.PDFDocument.create(), f = await d.embedFont(L.StandardFonts.Helvetica);
  sizes.forEach((s, i) => { const p = d.addPage(s); p.drawText('Seite ' + (i + 1), { x: 50, y: 50, size: 14, font: f }); if (rot[i]) p.setRotation(L.degrees(rot[i])); });
  return d;
}

test('Heftreihenfolge der Broschüre', () => {
  assert.deepEqual(Layout.bookletOrder(4), [[3, 0], [1, 2]]);
  assert.deepEqual(Layout.bookletOrder(8), [[7, 0], [1, 6], [5, 2], [3, 4]]);
  assert.deepEqual(Layout.bookletOrder(5), [[null, 0], [1, null], [null, 2], [3, 4]]);
  assert.deepEqual(Layout.bookletOrder(1), [[null, 0], [null, null]]);
});

test('Rand um den Inhalt bleibt innerhalb der Seite', () => {
  assert.deepEqual(Layout.padBox([100, 100, 200, 300], [0, 0, 595, 842], 10), [90, 90, 210, 310]);
  assert.deepEqual(Layout.padBox([5, 5, 590, 840], [0, 0, 595, 842], 10), [0, 0, 595, 842]);
  const c = [0, 0, 595, 842]; assert.equal(Layout.padBox([10, 10, 10.5, 10.5], c, 0), c);   // winzig → ganze Seite
});

test('Weiße Ränder entfernen setzt die CropBox', async () => {
  const d = await sample([[595.28, 841.89]]);
  Layout.fit(d, { trim: true, boxes: [[100, 200, 300, 400]], margin: 10 });
  assert.deepEqual(arr(d.getPage(0), 'CropBox'), [90, 190, 310, 410]);
  assert.deepEqual(arr(d.getPage(0), 'MediaBox'), [0, 0, 595.28, 841.89]);
});

test('Auf A4 bringen: Letter und A5 quer werden A4, Links wandern mit', async () => {
  const d = await sample([[612, 792], [595.28, 419.53], [595.28, 841.89]]);
  const p0 = d.getPage(0), link = d.context.register(d.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 612, 792] }));
  p0.node.set(N('Annots'), d.context.obj([link]));
  const before = d.getPage(2).node.get(N('Contents'));
  Layout.fit(d, { a4: true });
  assert.deepEqual(arr(p0, 'MediaBox'), [0, 0, 595.28, 841.89]);
  assert.deepEqual(arr(d.getPage(1), 'MediaBox'), [0, 0, 841.89, 595.28]);   // querformatig bleibt quer
  const r = d.context.lookup(link).lookup(N('Rect')).asArray().map(v => v.asNumber());
  assert.ok(Math.abs(r[2] - r[0] - 595.28) < 0.01, 'Link auf neue Breite skaliert');
  assert.ok(r[1] > 0 && Math.abs(r[1] - (841.89 - r[3])) < 0.01, 'Link senkrecht mittig');
  assert.equal(d.getPage(2).node.get(N('Contents')), before, 'A4-Seite bleibt unverändert');
  const bytes = await d.save(), back = await L.PDFDocument.load(bytes);
  assert.equal(back.getPageCount(), 3);
});

test('2 und 4 Seiten pro Blatt, Broschüre', async () => {
  const bytes = await (await sample([[595.28, 841.89], [595.28, 841.89], [595.28, 841.89], [612, 792], [595.28, 841.89]], [0, 90])).save();
  const two = await L.PDFDocument.load(await Layout.nup(bytes, 2));
  assert.equal(two.getPageCount(), 3);
  assert.deepEqual(arr(two.getPage(0), 'MediaBox'), [0, 0, 841.89, 595.28]);
  const four = await L.PDFDocument.load(await Layout.nup(bytes, 4));
  assert.equal(four.getPageCount(), 2);
  assert.deepEqual(arr(four.getPage(0), 'MediaBox'), [0, 0, 595.28, 841.89]);
  const bk = await L.PDFDocument.load(await Layout.booklet(bytes));
  assert.equal(bk.getPageCount(), 4);   // 5 Seiten → 8 → 2 Bogen à 2 Seiten
  assert.deepEqual(arr(bk.getPage(0), 'MediaBox'), [0, 0, 841.89, 595.28]);
});

test('Seiten halbieren: Querformat links/rechts, Hochformat bleibt, Drehung und Anmerkungen', async () => {
  const d = await sample([[842, 595], [595, 842], [595, 842]], [0, 0, 90]);
  // Link rechts auf Seite 1
  const link = d.context.register(d.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [600, 100, 700, 120] }));
  d.getPage(0).node.set(N('Annots'), d.context.obj([link]));
  const n = await Layout.halve(d, { dir: 'v', only: 'landscape' });
  assert.equal(n, 2);   // Seite 1 (quer) und Seite 3 (hoch, aber um 90° gedreht = quer angezeigt)
  assert.equal(d.getPageCount(), 5);
  assert.deepEqual(arr(d.getPage(0), 'MediaBox'), [0, 0, 421, 595]);
  assert.deepEqual(arr(d.getPage(1), 'MediaBox'), [421, 0, 842, 595]);
  assert.equal(d.getPage(0).node.lookup(N('Annots')), undefined);
  assert.equal(d.getPage(1).node.lookup(N('Annots')).size(), 1);
  assert.deepEqual(arr(d.getPage(2), 'MediaBox'), [0, 0, 595, 842]);   // Hochformat unverändert
  // 90° gedreht: links in der Anzeige = untere Hälfte der Originalseite
  assert.deepEqual(arr(d.getPage(3), 'MediaBox'), [0, 0, 595, 421]);
  assert.deepEqual(arr(d.getPage(4), 'MediaBox'), [0, 421, 595, 842]);
  assert.equal(d.getPage(4).getRotation().angle, 90);
  const bytes = await d.save(), again = await L.PDFDocument.load(bytes);
  assert.equal(again.getPageCount(), 5);
});

test('Seiten halbieren: oben/unten und rechts zuerst', async () => {
  const d = await sample([[595, 842]]);
  await Layout.halve(d, { dir: 'h', only: 'all' });
  assert.deepEqual(arr(d.getPage(0), 'MediaBox'), [0, 421, 595, 842]);
  assert.deepEqual(arr(d.getPage(1), 'MediaBox'), [0, 0, 595, 421]);
  const e = await sample([[842, 595]]);
  await Layout.halve(e, { rtl: true });
  assert.deepEqual(arr(e.getPage(0), 'MediaBox'), [421, 0, 842, 595]);
});
