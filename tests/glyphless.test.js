// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const G = require('../js/glyphless.js');

test('Platzhalterschrift: gültige TrueType-Datei mit leerer Glyphe (Breite 500)', () => {
  const f = fontkit.create(Buffer.from(G.ttf()));
  assert.equal(f.unitsPerEm, 1000); assert.equal(f.numGlyphs, 2); assert.equal(f.getGlyph(1).advanceWidth, 500);
  assert.equal(G.hex('中A😀'), '4E2D0041');   // Zeichen außerhalb des BMP entfallen
});

test('Unsichtbarer CJK-Text ist auffindbar und kopierbar (pypdf strict)', async () => {
  const doc = await L.PDFDocument.create(), page = doc.addPage([595, 842]);
  const name = page.node.newFontDictionary('GLF', G.embed(L, doc));
  page.pushOperators(L.pushGraphicsState(), L.setTextRenderingMode(L.TextRenderingMode.Invisible), L.beginText(), L.setFontAndSize(name, 20),
    L.moveText(50, 700), L.showText(L.PDFHexString.of(G.hex('发票号码'))), L.endText(), L.beginText(), L.setFontAndSize(name, 20), L.moveText(50, 650), L.showText(L.PDFHexString.of(G.hex('한국어'))), L.endText(), L.popGraphicsState());
  const f = path.join(os.tmpdir(), 'pdfmy-glyphless.pdf'); fs.writeFileSync(f, await doc.save());
  const t = execFileSync('python', ['-I', '-c', 'import pypdf,sys;sys.stdout.reconfigure(encoding="utf-8");print(pypdf.PdfReader(sys.argv[1],strict=True).pages[0].extract_text())', f]).toString();
  assert.match(t, /发票号码/); assert.match(t, /한국어/);
});
