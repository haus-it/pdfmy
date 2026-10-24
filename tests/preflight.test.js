// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Vorabprüfung (js/preflight.js): Profile beA, ePA, BITV, GoBD
const test = require('node:test'), assert = require('node:assert/strict');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
globalThis.BeaCheck = require('../js/bea.js');
globalThis.PdfACheck = require('../js/pdfacheck.js');
globalThis.A11yCheck = require('../js/a11ycheck.js');
const P = require('../js/preflight.js'), L = globalThis.PDFLib;

async function plainPdf({ js = false } = {}) {
  const d = await L.PDFDocument.create(), pg = d.addPage([595, 842]), f = await d.embedFont(L.StandardFonts.Helvetica);
  pg.drawText('Klageschrift', { x: 60, y: 760, size: 14, font: f });
  if (js) d.catalog.set(L.PDFName.of('OpenAction'), d.context.obj({ S: 'JavaScript', JS: L.PDFString.of('app.alert(1)') }));
  return d.save();
}
const titles = r => r.items.map(i => (i.ok === true ? '✓' : i.ok === false ? '✗' : 'i') + ' ' + i.title);

test('beA: einfache PDF mit gutem Dateinamen – Hinweis auf Standardschrift, keine Fehler; schlechter Name und JavaScript sind Fehler', async () => {
  const ok = await P.run('bea', await plainPdf(), { name: 'Klageschrift_Müller_2026.pdf', pages: 1, textPages: 1 });
  assert.equal(ok.ok, true, titles(ok).join('\n'));
  assert.ok(titles(ok).some(t => /^i .*Schrift/.test(t)), 'Hinweis: Helvetica nicht eingebettet');
  const bad = await P.run('bea', await plainPdf({ js: true }), { name: 'Klage (final).pdf', pages: 1, textPages: 1 });
  assert.equal(bad.ok, false);
  assert.ok(titles(bad).some(t => /^✗ .*JavaScript/.test(t)) && titles(bad).some(t => /^✗ Dateiname/.test(t)));
  assert.match(ok.facts.sha256, /^[0-9a-f]{64}$/);
});

test('ePA und GoBD verlangen PDF/A; BITV verlangt Tags', async () => {
  const pdf = await plainPdf();
  const epa = await P.run('epa', pdf, { title: '' });
  assert.equal(epa.ok, false);
  assert.ok(titles(epa).includes('✗ Als PDF/A gespeichert') && titles(epa).some(t => /^✓ Größe höchstens 25 MB/.test(t)) && titles(epa).some(t => /^i Titel/.test(t)));
  const gobd = await P.run('gobd', pdf, { pages: 2, textPages: 1, einvoice: true });
  assert.equal(gobd.ok, false);
  assert.ok(titles(gobd).some(t => /^i Maschinell auswertbar/.test(t)) && titles(gobd).includes('i E-Rechnung'));
  const bitv = await P.run('bitv', pdf, { pages: 1, textPages: 1 });
  assert.equal(bitv.ok, false);
  assert.ok(titles(bitv).some(t => /^✗ Getaggtes PDF/.test(t)));
});

test('PDF/A-Profil zeigt alle Prüfpunkte der PDF/A-Kurzprüfung einzeln', async () => {
  const pdf = await plainPdf(), r = await P.run('pdfa', pdf);
  const n = (await globalThis.PdfACheck.check(pdf)).items.length;
  assert.equal(r.items.length, n);
  assert.ok(titles(r).some(t => /^✗ Als PDF\/A gekennzeichnet/.test(t)) && titles(r).some(t => /Schriften eingebettet/.test(t)));
});

test('Bericht: Überschrift, Tabelle mit allen Prüfpunkten, Fingerabdruck und Grundlage', async () => {
  const r = await P.run('bea', await plainPdf(), { name: 'Klage.pdf' });
  const b = P.reportBlocks(r, { file: 'Klage.pdf', date: new Date(2026, 9, 23, 12, 0) });
  assert.equal(b[0].text, 'Vorabprüfung: beA / Gericht (ERVB 2025)');
  const t = b.find(x => x.type === 'table');
  assert.equal(t.rows.length, r.items.length + 1);
  assert.ok(b.some(x => x.text?.includes(r.facts.sha256)) && b.some(x => /ERVB 2025/.test(x.text || '')));
});
