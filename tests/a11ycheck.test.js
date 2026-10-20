// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const A = require('../js/a11ycheck.js');

test('Barrierefreiheit: einfaches PDF ohne Tags, Sprache, Titel → Mängel', async () => {
  const doc = await PDFLib.PDFDocument.create(); doc.addPage().drawText('Hallo', { x: 50, y: 700 });
  const r = await A.check(await doc.save(), { pages: 1, pagesWithText: 1 });
  const by = Object.fromEntries(r.map(x => [x.id, x.ok]));
  assert.equal(by.tagged, false); assert.equal(by.lang, false); assert.equal(by.title, false); assert.equal(by.text, true);
  assert.equal(by.fonts, false);   // Helvetica (Standardschrift) ist nicht eingebettet
});

test('Barrierefreiheit: Bild-PDF ohne Text wird erkannt', async () => {
  const doc = await PDFLib.PDFDocument.create(); doc.addPage();
  const r = await A.check(await doc.save(), { pages: 1, pagesWithText: 0 });
  assert.equal(r.find(x => x.id === 'text').ok, false);
});

test('Barrierefreiheit: PDFMy-PDF/A (zugleich PDF/UA) besteht', async t => {
  const f = path.join(os.tmpdir(), '..', 'claude');   // Prüfdatei aus dem Testlauf (falls vorhanden)
  const cand = ['2-pdfa-pro-funktionen.pdf', '7-pdfa-signiert.pdf'].map(n => process.env.PDFMY_ISO ? path.join(process.env.PDFMY_ISO, n) : '').filter(p => p && fs.existsSync(p));
  if (!cand.length) return t.skip('keine Prüfdatei (PDFMY_ISO nicht gesetzt)');
  for (const c of cand) {
    const r = await A.check(new Uint8Array(fs.readFileSync(c)), { pages: 1, pagesWithText: 1 });
    const bad = r.filter(x => x.ok === false);
    assert.deepEqual(bad, [], path.basename(c) + ': ' + JSON.stringify(bad));
  }
});
