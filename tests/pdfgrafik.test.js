// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Vorhandene Vektorgrafiken bearbeiten (app-v333, Wettbewerbsanalyse Rang 8, letzte Lücke): Logos, Formen, Linien verschieben, skalieren, löschen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js');
const B = require('../js/pdfbild.js');
const near = (a, b, msg, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} ≠ ${b}`);

// Seite mit Text, Logo (reiner Grafik-Block mit innerem cm), Tabellenlinien (einzelne Pfade), Beschneidung und Hintergrund
const CONTENT = [
  '1 1 1 rg 0 0 600 800 re f',                                          // Hintergrund (ganze Seite)
  'BT /F1 12 Tf 50 750 Td (Text bleibt) Tj ET',
  'q 1 0 0 1 400 700 cm 0 0 1 rg 0 0 m 50 0 l 25 40 l h f q 2 0 0 2 0 0 cm 1 0 0 rg 0 0 10 10 re f Q Q',   // Logo: 50 × 40 bei (400,700)
  '0 0 0 RG 2 w 50 600 m 550 600 l S',                                  // Tabellenlinie waagerecht
  '50 580 m 550 580 l S',                                               // zweite Linie
  'q 100 100 200 200 re W n 0 1 0 rg 0 0 600 800 re f Q',               // Beschneidung: Block mit sichtbarem Pfad, Umriss zu groß, aber angeboten
  '/Art BMC 10 10 m 20 20 l S EMC',                                     // markierter Pfad (Artefakt)
  'q /P <</MCID 0>> BDC 0 0 1 RG 300 300 m 310 310 l S Q EMC'           // Block mit unausgeglichener Markierung → nicht als Block
].join('\n');

async function sample() {
  const doc = await L.PDFDocument.create(), page = doc.addPage([600, 800]);
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  page.node.setFontDictionary(L.PDFName.of('F1'), font.ref);
  page.node.set(L.PDFName.of('Contents'), doc.context.register(doc.context.flateStream(B.toBytes(CONTENT))));
  return L.PDFDocument.load(await doc.save());
}

test('Grafiken finden: Logo-Block als ein Objekt, Linien einzeln, Beschneidung und „n“ nie, Hintergrund markiert', async () => {
  const lib = await sample(), { vecs, src } = B.pageObjects(L, lib.getPage(0));
  const logo = vecs.find(v => v.paths === 2);
  assert.ok(logo, 'Logo als Block mit zwei Pfaden');
  near(logo.rect.x, 400, 'x'); near(logo.rect.y, 700, 'y'); near(logo.rect.w, 50, 'w'); near(logo.rect.h, 40, 'h');
  assert.match(src.slice(logo.start, logo.end), /^q 1 0 0 1 400 700 cm[\s\S]*Q Q$/);
  const lines = vecs.filter(v => Math.abs(v.rect.w - 502) < 0.01);   // 500 + Strichstärke 2
  assert.equal(lines.length, 2, 'zwei Tabellenlinien');
  near(lines[0].rect.y, 599, 'Linie mit halber Strichstärke'); near(lines[0].rect.h, 2, 'Höhe = Strichstärke');
  const bg = vecs.filter(v => v.bg);
  assert.ok(bg.length >= 1 && bg.every(v => v.rect.w >= 500), 'Hintergrund als bg');
  assert.ok(vecs.every(v => !/\bW n\b/.test(src.slice(v.start, v.end)) || src.slice(v.start, v.start + 1) === 'q'), 'Beschneidungspfad nie allein');
  // unausgeglichene Markierung: Block nicht als Ganzes, der Pfad darin einzeln
  const inner = vecs.find(v => Math.abs(v.rect.x - 299) < 0.01);   // Strichstärke 2 gilt weiter (oben gesetzt)
  assert.ok(inner && /^300 300 m/.test(src.slice(inner.start, inner.end)), 'Pfad im Block mit BDC einzeln');
  // Text gehört nie zu einer Grafik
  assert.ok(vecs.every(v => !/\bBT\b/.test(src.slice(v.start, v.end))));
});

test('Logo verschieben und verkleinern: neue Lage exakt, Text und andere Grafiken Byte für Byte gleich', async () => {
  const lib = await sample(), page = lib.getPage(0), before = B.pageObjects(L, page), logoN = before.vecs.find(v => v.paths === 2).n;
  assert.equal(await B.editPage(L, lib, page, [{ n: logoN, vec: true, to: { x: 100, y: 100, w: 25, h: 20 } }]), 1);
  const again = await L.PDFDocument.load(await lib.save()), after = B.pageObjects(L, again.getPage(0));
  const logo = after.vecs.find(v => v.paths === 2);
  near(logo.rect.x, 100, 'x'); near(logo.rect.y, 100, 'y'); near(logo.rect.w, 25, 'w'); near(logo.rect.h, 20, 'h');
  assert.ok(after.src.includes('BT /F1 12 Tf 50 750 Td (Text bleibt) Tj ET'), 'Text unverändert');
  assert.ok(after.src.includes('0 0 0 RG 2 w 50 600 m 550 600 l S'), 'Linie unverändert');
  assert.equal(after.vecs.length, before.vecs.length, 'gleich viele Grafiken');
});

test('Linie löschen: nur diese verschwindet; Bild- und Grafik-Änderungen zusammen', async () => {
  const doc = await L.PDFDocument.create(), page0 = doc.addPage([600, 800]);
  page0.drawRectangle({ x: 50, y: 50, width: 100, height: 60, color: L.rgb(1, 0, 0) });
  page0.drawLine({ start: { x: 50, y: 400 }, end: { x: 500, y: 400 }, thickness: 1 });
  const lib = await L.PDFDocument.load(await doc.save()), page = lib.getPage(0), { vecs } = B.pageObjects(L, page);
  assert.equal(vecs.length, 2, 'Rechteck und Linie aus pdf-lib');
  const line = vecs.find(v => v.rect.w > 400), rect = vecs.find(v => v !== line);
  assert.equal(await B.editPage(L, lib, page, [{ n: line.n, vec: true, del: true }, { n: rect.n, vec: true, to: { x: 300, y: 300, w: 200, h: 120 } }]), 2);
  const again = await L.PDFDocument.load(await lib.save()), after = B.pageObjects(L, again.getPage(0));
  assert.equal(after.vecs.length, 1, 'Linie weg');
  near(after.vecs[0].rect.x, 300, 'x'); near(after.vecs[0].rect.w, 200, 'w'); near(after.vecs[0].rect.h, 120, 'h');
  // Ersatzbild für Grafik wird ignoriert (nur Bilder lassen sich ersetzen)
  assert.equal(await B.editPage(L, again, again.getPage(0), [{ n: 9, vec: true, del: true }]), 0);
});

test('Grafik in einem Formular-XObject: Kopie geändert, Begrenzungsrahmen wächst mit, Original für andere Aufrufe bleibt', async () => {
  const doc = await L.PDFDocument.create(), p = doc.addPage([600, 800]), ctx = doc.context;
  const form = ctx.flateStream(B.toBytes('0 0 1 rg 10 10 80 30 re f'), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 50] });
  const ref = ctx.register(form);
  const name = String(p.node.newXObject('Fm', ref)).slice(1);
  p.node.set(L.PDFName.of('Contents'), ctx.register(ctx.flateStream(B.toBytes(`q 1 0 0 1 100 600 cm /${name} Do Q q 1 0 0 1 300 600 cm /${name} Do Q`))));
  const lib = await L.PDFDocument.load(await doc.save()), page = lib.getPage(0), { vecs } = B.pageObjects(L, page);
  assert.equal(vecs.length, 2, 'beide Aufrufe');
  near(vecs[0].rect.x, 110, 'x'); near(vecs[0].rect.y, 610, 'y');
  assert.equal(await B.editPage(L, lib, page, [{ n: 0, vec: true, to: { x: 110, y: 300, w: 80, h: 30 } }]), 1);
  const again = await L.PDFDocument.load(await lib.save()), after = B.pageObjects(L, again.getPage(0)).vecs;
  const moved = after.find(v => v.rect.y < 400), kept = after.find(v => v.rect.x > 250);
  assert.ok(moved && kept, 'eine verschoben, eine unverändert');
  near(moved.rect.y, 300, 'y'); near(kept.rect.x, 310, 'anderer Aufruf'); near(kept.rect.y, 610, 'anderer Aufruf y');
});

test('Grenzen: Inline-Bild, Schattierung und Text machen einen Block unrein; sehr viele Pfade werden gedeckelt', () => {
  const ops = B.tokenize('q 0 0 m 10 10 l S BT (x) Tj ET Q q 0 0 10 10 re f /Sh1 sh Q q 0 0 10 10 re f BI /W 1 /H 1 ID \x00 EI Q');
  const v = B.graphics(ops, () => false);
  assert.equal(v.length, 3, 'nur die drei einzelnen Pfade');
  assert.ok(v.every(x => x.paths === 1));
  const many = B.tokenize(Array.from({ length: 2500 }, (_, k) => `${k} 0 m ${k} 10 l S`).join('\n'));
  assert.equal(B.graphics(many, () => false).length, 2000);
});

test('App: Dialog bietet Grafiken an (Liste, Klick wählt kleinstes Objekt, Ersetzen nur für Bilder)', () => {
  const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const pro = R('js/pro.js'), html = R('index.html');
  assert.match(pro, /PdfBild\.pageObjects\(PDFLib, again\.getPage\(0\)\)/);
  assert.match(pro, /vec: o\.kind === 'vec'/, 'Änderungen mit Art');
  assert.match(pro, /\$\('#biRep'\)\.disabled = sel < 0 \|\| obj\(sel\)\.kind === 'vec'/);
  assert.match(html, /Bilder und Grafiken bearbeiten/);
});
