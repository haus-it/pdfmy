// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const C = require('../js/pdfacheck.js');
const L = globalThis.PDFLib;
const byId = r => Object.fromEntries(r.items.map(x => [x.id, x.ok]));

test('Gewöhnliche PDF: keine Kennung, kein Farbprofil, Standardschrift nicht eingebettet, Skript', async () => {
  const d = await L.PDFDocument.create(), f = await d.embedFont(L.StandardFonts.Helvetica);
  const p = d.addPage([595, 842]); p.drawText('Hallo', { x: 50, y: 700, size: 12, font: f });
  d.catalog.set(L.PDFName.of('OpenAction'), d.context.obj({ S: 'JavaScript', JS: L.PDFString.of('app.alert(1)') }));
  const r = await C.check(await d.save());
  const k = byId(r);
  assert.equal(r.claim, null);
  assert.equal(k.claim, false); assert.equal(k.outputintent, false); assert.equal(k.fonts, false); assert.equal(k.js, false);
  assert.equal(k.encrypt, true); assert.equal(k.lzw, true);
  assert.match(r.items.find(x => x.id === 'fonts').detail, /Helvetica/);
});

test('Kennung und Farbprofil werden erkannt, versteckte Anmerkung fällt auf', async () => {
  const d = await L.PDFDocument.create(), p = d.addPage([595, 842]), ctx = d.context;
  const xmp = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="2" pdfaid:conformance="B"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  d.catalog.set(L.PDFName.of('Metadata'), ctx.register(ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })));
  const icc = ctx.register(ctx.stream(new Uint8Array(10), { N: 3 }));
  d.catalog.set(L.PDFName.of('OutputIntents'), ctx.obj([ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: L.PDFString.of('sRGB'), DestOutputProfile: icc })]));
  p.node.set(L.PDFName.of('Annots'), ctx.obj([ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10], F: 2 })]));
  const r = await C.check(await d.save()), k = byId(r);
  assert.equal(r.claim, 'PDF/A-2b');
  assert.equal(k.claim, true); assert.equal(k.outputintent, true); assert.equal(k.annots, false); assert.equal(k.js, true);
});

test('Beschädigte Datei: verständliche Meldung', async () => {
  const r = await C.check(new Uint8Array([1, 2, 3]));
  assert.equal(r.items[0].ok, false); assert.match(r.items[0].detail, /nicht öffnen/);
});
