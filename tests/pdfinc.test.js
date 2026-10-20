// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Inkrementelles Speichern und Nachweis früherer Fassungen (js/pdfinc.js)
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Inc = require('../js/pdfinc.js');
const L = globalThis.PDFLib;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

async function original(objectStreams) {
  const d = await L.PDFDocument.create(), f = await d.embedFont(L.StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText('Vertrag', { x: 60, y: 780, size: 16, font: f }); d.addPage([595, 842]);
  await d.attach(new TextEncoder().encode('{"v":1}'), 'pdfmy-unterschriften.json', { mimeType: 'application/json' });
  return d.save({ useObjectStreams: objectStreams });
}
async function signOnce(orig, text) {
  const d = await Inc.load(orig), f = await d.embedFont(L.StandardFonts.Helvetica);
  d.getPages()[0].drawText(text, { x: 60, y: 200, size: 12, font: f });
  return Inc.save(orig, d);
}

for (const os of [true, false]) {
  test(`Anhängen statt Neuschreiben (${os ? 'Querverweis-Strom' : 'klassische Tabelle'}): Original bleibt vorn, Datei lesbar, Fassungen nachweisbar`, async () => {
    const v0 = await original(os);
    const v1 = await signOnce(v0, 'Unterschrift Max Müller'.replace('ü', 'ue'));
    const v2 = await signOnce(v1, 'Unterschrift Erika Meier');
    assert.ok(v1.length > v0.length && Buffer.from(v1.subarray(0, v0.length)).equals(Buffer.from(v0)));
    assert.ok(Buffer.from(v2.subarray(0, v1.length)).equals(Buffer.from(v1)));
    const back = await L.PDFDocument.load(v2);
    assert.equal(back.getPageCount(), 2);
    // neue Objekte dürfen keine Nummer der alten Fassung wiederverwenden (sonst überschreiben sie z. B. Objekt-Container)
    const nums = b => [...Buffer.from(b).toString('latin1').matchAll(/(?:^|\D)(\d+) 0 obj/g)].map(m => +m[1]);
    const maxOld = Math.max(...nums(v0)), fresh = nums(v1.subarray(v0.length)).filter(n => n > maxOld);
    assert.ok(fresh.length > 0 && Math.min(...fresh) > maxOld, 'neue Objekte oberhalb der alten Nummern');
    // die alte Seitenstruktur ist weiter erreichbar (Objekt-Container der alten Fassung nicht überschrieben)
    assert.equal(back.getPage(1).getWidth(), 595);
    const [a, b, c] = await Inc.contains(v2, [sha(v0), sha(v1), sha(v2)]);
    assert.equal(a, true); assert.equal(b, true); assert.equal(c, true);
    assert.deepEqual(await Inc.contains(v2, ['0'.repeat(64), '']), [false, false]);
  });
}

test('Neu geschriebene Datei: frühere Fassung nicht mehr nachweisbar; ohne Änderung bleibt die Datei gleich', async () => {
  const v0 = await original(true);
  const d = await L.PDFDocument.load(v0); d.getPages()[0].drawText('x', { x: 10, y: 10, size: 8 });
  const rewritten = await d.save();
  assert.deepEqual(await Inc.contains(rewritten, [sha(v0)]), [false]);
  const same = await Inc.save(v0, await Inc.load(v0));
  assert.equal(same, v0);
});

test('Neue Seite und neue Anlage werden angehängt und gelesen', async () => {
  const v0 = await original(true);
  const d = await Inc.load(v0);
  d.addPage([595, 842]);
  await d.attach(new TextEncoder().encode('{"v":1,"neu":true}'), 'protokoll.json', { mimeType: 'application/json' });
  const v1 = await Inc.save(v0, d);
  const back = await L.PDFDocument.load(v1);
  assert.equal(back.getPageCount(), 3);
  assert.equal((await Inc.contains(v1, [sha(v0)]))[0], true);
});
