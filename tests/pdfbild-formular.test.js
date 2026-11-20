// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Bilder in Formular-XObjects bearbeiten (app-v312, Wettbewerb Rang 3 „offen: Bilder in Formular-XObjects“): finden mit Formularmatrix,
// verschieben/ersetzen/löschen nur für diesen Aufruf (Kopie), mitbenutzte Formulare auf anderen Seiten bleiben, Begrenzungsrahmen wächst.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const L = require('../vendor/pdf-lib.min.js');
const B = require('../js/pdfbild.js');

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgb) {
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg}: ${a} ≠ ${b}`);
const nearRect = (r, e, msg) => ['x', 'y', 'w', 'h'].forEach(k => near(r[k], e[k], `${msg} ${k}`));

// Vorlage-Seite mit Bild → als Formular auf zwei Seiten (wie Druckertreiber/Word: ganzer Inhalt in einem Formular)
async function shared() {
  const doc = await L.PDFDocument.create(), tpl = doc.addPage([400, 400]);
  tpl.drawImage(await doc.embedPng(png(20, 10, [255, 0, 0])), { x: 50, y: 60, width: 200, height: 100 });
  const form = await doc.embedPage(tpl);
  const p1 = doc.addPage([600, 800]), p2 = doc.addPage([600, 800]);
  p1.drawPage(form, { x: 100, y: 200 });                  // Formular verschoben
  p2.drawPage(form, { x: 0, y: 0, xScale: 0.5, yScale: 0.5 });   // auf Seite 2 verkleinert
  doc.removePage(0);
  return L.PDFDocument.load(await doc.save());
}

test('Bild im Formular gefunden – Lage auf der Seite mit Formular-Aufruf verrechnet', async () => {
  const lib = await shared();
  const a = B.pageImages(L, lib.getPage(0)).imgs, b = B.pageImages(L, lib.getPage(1)).imgs;
  assert.equal(a.length, 1); assert.equal(b.length, 1);
  nearRect(a[0].rect, { x: 150, y: 260, w: 200, h: 100 }, 'Seite 1');
  nearRect(b[0].rect, { x: 25, y: 30, w: 100, h: 50 }, 'Seite 2 (halbe Größe)');
  assert.equal(a[0].path.length, 1, 'eine Formular-Ebene');
});

test('Verschieben im Formular: nur diese Seite ändert sich, Formular auf Seite 2 bleibt', async () => {
  const lib = await shared(), p1 = lib.getPage(0);
  const n = await B.editPage(L, lib, p1, [{ n: 0, to: { x: 400, y: 600, w: 150, h: 75 } }]);
  assert.equal(n, 1);
  const again = await L.PDFDocument.load(await lib.save());
  nearRect(B.pageImages(L, again.getPage(0)).imgs[0].rect, { x: 400, y: 600, w: 150, h: 75 }, 'Seite 1 neu');
  nearRect(B.pageImages(L, again.getPage(1)).imgs[0].rect, { x: 25, y: 30, w: 100, h: 50 }, 'Seite 2 unverändert');
  // Begrenzungsrahmen der Kopie umfasst die neue Lage (sonst würde das Bild abgeschnitten)
  const im = B.pageImages(L, again.getPage(0)).imgs[0], bb = im.path[0].form.bbox;
  const r = B.rectOf(im.local);
  assert.ok(bb[0] <= r.x + 0.01 && bb[1] <= r.y + 0.01 && bb[2] >= r.x + r.w - 0.01 && bb[3] >= r.y + r.h - 0.01, 'BBox erweitert: ' + bb.join(' '));
});

test('Löschen und Ersetzen im Formular', async () => {
  let lib = await shared();
  assert.equal(await B.editPage(L, lib, lib.getPage(0), [{ n: 0, del: true }]), 1);
  let again = await L.PDFDocument.load(await lib.save());
  assert.equal(B.pageImages(L, again.getPage(0)).imgs.length, 0, 'auf Seite 1 weg');
  assert.equal(B.pageImages(L, again.getPage(1)).imgs.length, 1, 'auf Seite 2 noch da');
  lib = await shared();
  await B.editPage(L, lib, lib.getPage(0), [{ n: 0, img: { bytes: png(10, 10, [0, 0, 255]), png: true } }]);
  again = await L.PDFDocument.load(await lib.save());
  const [im] = B.pageImages(L, again.getPage(0)).imgs;
  assert.match(im.name, /^PdfmyBild\d+$/, 'neues Bild in den Ressourcen der Formularkopie');
  nearRect(im.rect, { x: 200, y: 260, w: 100, h: 100 }, 'quadratisch eingepasst, mittig');
  assert.notEqual(B.pageImages(L, again.getPage(1)).imgs[0].name, im.name, 'Seite 2 behält das alte Bild');
});

test('Zwei Ebenen tief und Bild daneben auf der Seite: alles gefunden, gezielt geändert', async () => {
  const doc = await L.PDFDocument.create(), inner = doc.addPage([300, 300]);
  inner.drawImage(await doc.embedPng(png(10, 10, [0, 255, 0])), { x: 10, y: 20, width: 100, height: 50 });
  const f1 = await doc.embedPage(inner), mid = doc.addPage([500, 500]); mid.drawPage(f1, { x: 40, y: 40 });
  const f2 = await doc.embedPage(mid), page = doc.addPage([600, 800]);
  page.drawImage(await doc.embedPng(png(10, 10, [9, 9, 9])), { x: 500, y: 700, width: 20, height: 20 });
  page.drawPage(f2, { x: 100, y: 100 });
  doc.removePage(0); doc.removePage(0);
  const lib = await L.PDFDocument.load(await doc.save()), imgs = B.pageImages(L, lib.getPage(0)).imgs;
  assert.equal(imgs.length, 2);
  nearRect(imgs[1].rect, { x: 150, y: 160, w: 100, h: 50 }, 'zwei Formular-Ebenen');
  assert.equal(imgs[1].path.length, 2);
  await B.editPage(L, lib, lib.getPage(0), [{ n: 1, to: { x: 10, y: 10, w: 100, h: 50 } }, { n: 0, to: { x: 450, y: 650, w: 40, h: 40 } }]);
  const again = await L.PDFDocument.load(await lib.save()), after = B.pageImages(L, again.getPage(0)).imgs;
  nearRect(after[0].rect, { x: 450, y: 650, w: 40, h: 40 }, 'Bild auf der Seite');
  nearRect(after[1].rect, { x: 10, y: 10, w: 100, h: 50 }, 'Bild zwei Ebenen tief');
});

test('Formular, das sich selbst aufruft: keine Endlosschleife', () => {
  const ops = B.tokenize('/Fx Do');
  const self = { ops, matrix: [1, 0, 0, 1, 0, 0], isImage: () => false }; self.formOf = () => self;
  assert.deepEqual(B.images(ops, () => false, [1, 0, 0, 1, 0, 0], () => self), []);
});
