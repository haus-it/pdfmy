// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Vorhandene Bilder in PDF-Seiten bearbeiten (Wettbewerbsanalyse Rang 8): verschieben, skalieren, ersetzen, löschen – im Seiteninhalt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const L = require('../vendor/pdf-lib.min.js');
const B = require('../js/pdfbild.js');

// kleines PNG (einfarbig) ohne Bibliothek
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgb) {
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

async function sample() {
  const doc = await L.PDFDocument.create(), page = doc.addPage([600, 800]);
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  page.drawText('Text bleibt (Klammer) erhalten', { x: 50, y: 750, size: 14, font });
  page.drawImage(await doc.embedPng(png(20, 10, [255, 0, 0])), { x: 100, y: 500, width: 200, height: 100 });
  page.drawImage(await doc.embedPng(png(10, 10, [0, 0, 255])), { x: 350, y: 100, width: 50, height: 50 });
  return L.PDFDocument.load(await doc.save());
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} ≠ ${b}`);

test('Bilder finden: Umriss je Bild aus q/cm/Q, Text und Inline-Bilder stören nicht', async () => {
  const lib = await sample(), { imgs } = B.pageImages(L, lib.getPage(0));
  assert.equal(imgs.length, 2);
  assert.deepEqual(imgs[0].rect, { x: 100, y: 500, w: 200, h: 100 });
  assert.deepEqual(imgs[1].rect, { x: 350, y: 100, w: 50, h: 50 });
  // Zerlegen: Zeichenketten mit Klammern/Escapes, Hex direkt vor >>, Kommentare, Inline-Bild mit Binärdaten
  const src = '% Kommentar\nq 1 0 0 1 5 5 cm BT (a\\) (b) c) Tj ET /P <</MCID 0 /X <41>>> BDC BI /W 1 /H 1 ID \x00EI\xff EI Q q 10 0 0 20 1 2 cm /Im1 Do Q EMC';
  const ops = B.tokenize(src);
  assert.deepEqual(ops.map(o => o.op), ['q', 'cm', 'BT', 'Tj', 'ET', 'BDC', 'BI', 'Q', 'q', 'cm', 'Do', 'Q', 'EMC']);
  const im = B.images(ops, n => n === 'Im1');
  assert.equal(im.length, 1); assert.deepEqual(im[0].rect, { x: 1, y: 2, w: 10, h: 20 });
  assert.equal(src.slice(im[0].start, im[0].end), '/Im1 Do');
  assert.throws(() => B.tokenize('(offen'), /nicht abgeschlossen/);
});

test('Verschieben und skalieren: neue Lage exakt, auch bei gedrehtem Bild', async () => {
  const lib = await sample(), page = lib.getPage(0);
  assert.equal(await B.editPage(L, lib, page, [{ n: 0, to: { x: 50, y: 300, w: 100, h: 50 } }]), 1);
  const again = await L.PDFDocument.load(await lib.save()), { imgs, src } = B.pageImages(L, again.getPage(0));
  const r = imgs[0].rect; near(r.x, 50, 'x'); near(r.y, 300, 'y'); near(r.w, 100, 'w'); near(r.h, 50, 'h');
  assert.deepEqual(imgs[1].rect, { x: 350, y: 100, w: 50, h: 50 }, 'anderes Bild unverändert');
  assert.match(src, /BT\s[\s\S]*<5465787420[0-9A-F]+> Tj[\s\S]*ET/, 'Text bleibt im Inhalt');
  // gedrehtes Bild (90°): Matrix mit b/c ≠ 0
  const m = [0, 100, -50, 0, 300, 200], from = B.rectOf(m), to = { x: 10, y: 20, w: from.w * 2, h: from.h * 2 };
  const T = B.placement(m, from, to, 0), r2 = B.rectOf(B.mul(T, m));
  near(r2.x, 10, 'x'); near(r2.y, 20, 'y'); near(r2.w, 100, 'w'); near(r2.h, 200, 'h');
});

test('Ersetzen: neues Bild eingepasst (Seitenverhältnis bleibt), Löschen entfernt nur dieses Bild', async () => {
  const lib = await sample(), page = lib.getPage(0);
  assert.equal(await B.editPage(L, lib, page, [{ n: 0, img: { bytes: png(10, 10, [0, 128, 0]), png: true } }, { n: 1, del: true }]), 2);
  const again = await L.PDFDocument.load(await lib.save()), { imgs } = B.pageImages(L, again.getPage(0));
  assert.equal(imgs.length, 1, 'gelöschtes Bild fehlt');
  // quadratisches Bild im Rahmen 200 × 100: 100 × 100, waagerecht mittig
  const r = imgs[0].rect; near(r.x, 150, 'x'); near(r.y, 500, 'y'); near(r.w, 100, 'w'); near(r.h, 100, 'h');
  assert.match(imgs[0].name, /^PdfmyBild/);
  // Seitenverhältnis-Rechnung allgemein
  const T = B.placement([200, 0, 0, 100, 0, 0], { x: 0, y: 0, w: 200, h: 100 }, { x: 0, y: 0, w: 200, h: 100 }, 4), r3 = B.rectOf(B.mul(T, [200, 0, 0, 100, 0, 0]));
  near(r3.w, 200, 'breit'); near(r3.h, 50, 'flach'); near(r3.y, 25, 'mittig');
});

test('Unsinnige Änderungen werden ignoriert; Seite ohne Bilder bleibt unverändert', async () => {
  const lib = await sample(), page = lib.getPage(0), before = B.pageImages(L, page).src;
  assert.equal(await B.editPage(L, lib, page, [{ n: 7, del: true }, { n: 0, to: { x: 0, y: 0, w: 0, h: 0 } }]), 0);
  assert.equal(B.pageImages(L, page).src, before);
  assert.equal(B.placement([0, 0, 0, 0, 0, 0], { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }), null, 'nicht umkehrbar');
});

test('App: Dialog „Bilder bearbeiten“ eingebunden, Fälschungsschutz und Signaturwarnung greifen', () => {
  const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const html = R('index.html'), pro = R('js/pro.js'), sw = R('sw.js');
  assert.match(html, /<script src="js\/pdfbild\.js"><\/script>/); assert.match(sw, /'js\/pdfbild\.js'/);
  assert.match(html, /<dialog id="biDlg"/);
  assert.match(pro, /pdfPages\.map\(pageProt\)\.find\(Boolean\)/, 'Urkunden und Belege: keine Bildänderung');
  assert.match(pro, /d\.imgOrig = \{ base: d\.base, filled: d\.filled, js: d\.js \}/, 'zurück zu den ursprünglichen Bildern');
  assert.match(pro, /sigWarn\(p, \(\) => imageEdit\(\)\)/, 'signierte PDF: erst warnen');
});
