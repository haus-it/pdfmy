// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// beA-/ERVV-Prüfung (ERVB 2025): Dateinamen und PDF-Inhalte
const test = require('node:test'), assert = require('node:assert/strict');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Bea = require('../js/bea.js');
const L = globalThis.PDFLib;

test('Dateiname: zulässig, Fehler und Vorschlag', () => {
  assert.equal(Bea.checkName('Klageschrift_Müller-Lüdenscheidt_2026.pdf').ok, true);
  const r = Bea.checkName('Anlage K 1 (Kaufvertrag) v2.final.pdf');
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(t => /Leerzeichen/.test(t)) && r.issues.some(t => /Punkt/.test(t)) && r.issues.some(t => /Zeichen/.test(t)));
  assert.equal(r.suggestion, 'Anlage_K_1_Kaufvertrag_v2_final.pdf');
  assert.equal(Bea.checkName(r.suggestion).ok, true);
  assert.equal(Bea.safeName('Café Größe & Co. – Überweisung'), 'Cafe_Größe_und_Co_Überweisung');
  const long = 'x'.repeat(120) + '.pdf';
  assert.ok(Bea.checkName(long).issues.some(t => /Zu lang/.test(t)));
  assert.ok(Bea.checkName(long).suggestion.length <= 90);
});

async function pdfWith(fn) {
  const d = await L.PDFDocument.create(), f = await d.embedFont(L.StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText('Schriftsatz', { x: 60, y: 760, size: 14, font: f });
  if (fn) await fn(d);
  return d.save({ useObjectStreams: true });
}

test('PDF: saubere Datei besteht', async () => {
  const r = await Bea.checkPdf(await pdfWith(), { name: 'Schriftsatz.pdf' });
  assert.equal(r.ok, true, JSON.stringify(r.items.filter(i => i.level === 'fehler')));
  assert.ok(r.items.some(i => i.key === 'schriften' && i.level === 'hinweis'), 'Standardschrift ohne Einbettung → Hinweis');
});

test('PDF: JavaScript, Anhang, Startbefehl werden gefunden (auch in Objekt-Streams)', async () => {
  const js = await pdfWith(d => { d.catalog.set(L.PDFName.of('OpenAction'), d.context.obj({ S: 'JavaScript', JS: L.PDFString.of('app.alert(1)') })); });
  const r1 = await Bea.checkPdf(js); assert.equal(r1.ok, false); assert.ok(r1.items.some(i => i.key === 'js' && i.level === 'fehler'));
  const att = await pdfWith(async d => { await d.attach(new TextEncoder().encode('<x/>'), 'factur-x.xml', { mimeType: 'text/xml' }); });
  const r2 = await Bea.checkPdf(att); assert.equal(r2.ok, false); assert.ok(r2.items.some(i => i.key === 'anhang'));
  const launch = await pdfWith(d => { const pg = d.getPages()[0]; const a = d.context.register(d.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], A: d.context.obj({ S: 'Launch', F: L.PDFString.of('cmd.exe') }) })); pg.node.set(L.PDFName.of('Annots'), d.context.obj([a])); });
  const r3 = await Bea.checkPdf(launch); assert.equal(r3.ok, false); assert.ok(r3.items.some(i => i.key === 'launch'));
});

test('PDF: Sendung – Anzahl, Größe, doppelte Namen', () => {
  assert.equal(Bea.checkBatch([{ name: 'a.pdf', size: 10 }, { name: 'b.pdf', size: 10 }]).ok, true);
  assert.equal(Bea.checkBatch([{ name: 'A.pdf', size: 10 }, { name: 'a.pdf', size: 10 }]).ok, false);
  assert.equal(Bea.checkBatch([{ name: 'a.pdf', size: 201 * 1048576 }]).ok, false);
});
