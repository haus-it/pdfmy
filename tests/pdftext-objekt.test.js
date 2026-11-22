// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Text als Objekt (app-v335, letzte Bearbeiten-Lücke aus Rang 8): Textabschnitte BT … ET verschieben, skalieren, umfärben, löschen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const B = require('../js/pdfbild.js');
const near = (a, b, msg, eps = 0.5) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} ≠ ${b}`);
const dejavu = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'DejaVuSans.ttf'));

async function sample() {
  const doc = await L.PDFDocument.create(); doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]), f = await doc.embedFont(dejavu, { subset: true });
  page.drawText('Rechnung Nr. 4711', { x: 60, y: 760, size: 20, font: f });
  page.drawText('Betrag: 119,00 €', { x: 60, y: 700, size: 12, font: f, color: L.rgb(0, 0, 1) });
  page.drawRectangle({ x: 400, y: 740, width: 100, height: 50, color: L.rgb(1, 0, 0) });
  return { lib: await L.PDFDocument.load(await doc.save()), width: s => f.widthOfTextAtSize(s, 1) };
}

test('Textabschnitte finden: Umriss aus Schriftbreiten (Type0, W-Feld), Grafik und Text getrennt', async () => {
  const { lib, width } = await sample(), o = B.pageObjects(L, lib.getPage(0));
  assert.equal(o.txts.length, 2, 'zwei Textabschnitte'); assert.equal(o.vecs.length, 1, 'eine Grafik');
  const [a, b] = o.txts;
  near(a.rect.x, 60, 'x'); near(a.rect.w, width('Rechnung Nr. 4711') * 20, 'Breite aus der Schrift', 1);
  near(a.rect.y, 760 - 0.25 * 20, 'Unterlänge'); near(a.rect.h, 1.15 * 20, 'Höhe');
  near(b.rect.w, width('Betrag: 119,00 €') * 12, 'zweite Zeile', 1);
  assert.match(o.src.slice(a.start, a.end), /^BT[\s\S]*ET$/);
});

test('Textlauf nach ISO 32000-1 9.4: Td/TD/T*/Tm, TJ-Abstände, Tc/Tw/Tz, einfache Schrift mit Widths', () => {
  const fontOf = n => n === 'F1' ? { two: false, w: c => c === 32 ? 250 : 500 } : null;
  // Textzustand (Tc, Tw, Tz, Tr …) gehört zum Grafikzustand und gilt über BT … ET hinaus – darum je Abschnitt q … Q
  const ops = B.tokenize('BT /F1 10 Tf 100 200 Td (ab) Tj ET q BT /F1 10 Tf 2 Tc 20 Tw 50 Tz 1 0 0 1 0 0 Tm (a b) Tj ET Q BT /F1 10 Tf 0 0 Td [(a) -1000 (b)] TJ ET q BT /F1 10 Tf 3 Tr (unsichtbar) Tj ET Q q 2 0 0 2 0 0 cm BT /F1 10 Tf 12 TL 10 50 TD (x) Tj T* (xx) Tj ET Q');
  const t = B.texts(ops, undefined, null, fontOf);
  assert.equal(t.length, 4, 'unsichtbarer Text (Tr 3) fehlt');
  near(t[0].rect.x, 100, 'Td x', 0.01); near(t[0].rect.w, 10, '2 × 500/1000 × 10', 0.01);
  // (a b) mit Tc 2, Tw 20 (nur Leerzeichen), Tz 50: ((5+2) + (2.5+2+20) + (5+2)) × 0.5 = 19.25
  near(t[1].rect.w, 19.25, 'Tc/Tw/Tz', 0.01);
  near(t[2].rect.w, 20, 'TJ: −1000 schiebt um 1 em', 0.01);
  // „10 50 TD“ setzt TL = −50 (überschreibt 12): T* geht 50 nach OBEN (y 100); tiefster Punkt die erste Zeile; alles × 2 durch cm
  near(t[3].rect.x, 20, 'cm skaliert', 0.01); near(t[3].rect.y, (50 - 2.5) * 2, 'erste Zeile unten', 0.01); near(t[3].rect.h, (100 + 9 - 47.5) * 2, 'T* mit TL aus TD', 0.01);
  assert.deepEqual(B.strBytes({ t: 'str', v: '(a\\(\\101\\n)' }), [97, 40, 65, 10]);
  assert.deepEqual(B.strBytes({ t: 'hex', v: '<0041 0)' .replace(')', '>') }), [0, 65, 0]);
});

test('Text verschieben, umfärben, löschen: Rest der Seite byte-gleich, Text bleibt Text (durchsuchbar)', async () => {
  const { lib } = await sample(), page = lib.getPage(0), before = B.pageObjects(L, page);
  assert.equal(await B.editPage(L, lib, page, [{ n: 0, txt: true, to: { ...before.txts[0].rect, x: 200, y: 400 }, color: '#008000' }, { n: 1, txt: true, del: true }]), 2);
  const bytes = await lib.save(), after = B.pageObjects(L, (await L.PDFDocument.load(bytes)).getPage(0));
  assert.equal(after.txts.length, 1, 'zweite Zeile gelöscht');
  near(after.txts[0].rect.x, 200, 'x'); near(after.txts[0].rect.y, 400, 'y');
  assert.match(after.src, /q 1 0 0 1 140 -355 cm\n0 0\.50196 0 rg 0 0\.50196 0 RG\nBT/, 'Verschiebung und Farbe vor dem Textabschnitt');
  const rect = before.src.slice(before.vecs[0].start, before.vecs[0].end);
  assert.ok(after.src.includes(rect), 'Grafik unverändert');
  // Text bleibt Text: Glyphen-Zeichenkette unverändert im Inhalt
  const glyphs = before.src.slice(before.txts[0].start, before.txts[0].end).match(/<[0-9A-F]+> Tj/)[0];
  assert.ok(after.src.includes(glyphs), 'Zeichen unverändert');
});

test('Grenzen: Text über die ganze Seite nur über die Liste; unausgeglichene Markierung wird nicht angeboten', async () => {
  const doc = await L.PDFDocument.create(), p = doc.addPage([200, 200]), ctx = doc.context;
  const f = await doc.embedFont(L.StandardFonts.Helvetica); p.node.setFontDictionary(L.PDFName.of('F1'), f.ref);
  p.node.set(L.PDFName.of('Contents'), ctx.register(ctx.flateStream(B.toBytes('BT /F1 150 Tf 0 30 Td (WWW) Tj ET /P <</MCID 0>> BDC BT /F1 10 Tf 10 10 Td (a) Tj EMC ET'))));
  const o = B.pageObjects(L, (await L.PDFDocument.load(await doc.save())).getPage(0));
  assert.equal(o.txts.length, 1); assert.ok(o.txts[0].bg, 'seitenfüllend → bg');
});

test('App: Textabschnitte im Dialog (grün umrandet), Umfärben für Text und Grafik', () => {
  const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const pro = R('js/pro.js');
  assert.match(pro, /\.\.\.o\.txts\.map/, 'Texte in der Objektliste');
  assert.match(pro, /txt: o\.kind === 'txt'/);
  assert.match(pro, /#059669/);
});
