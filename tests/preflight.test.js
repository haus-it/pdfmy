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

test('Druckerei (PDF/X-4, Kurzprüfung): Schriften, Bildauflösung, Endformat, Beschnitt, Farbraum', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const fontkit = require('../vendor/fontkit.umd.min.js');
  // einfarbiges PNG in gewünschter Pixelgröße: die Pixelzahl steckt im Bild, die Platzierung bestimmt die dpi
  const raw = (w, h) => { const zlib = require('node:zlib'); const row = Buffer.alloc(1 + w * 3, 200); row[0] = 0; const data = Buffer.concat(Array.from({ length: h }, () => row));
    const chunk = (t, b) => { const len = Buffer.alloc(4); len.writeUInt32BE(b.length); const tb = Buffer.concat([Buffer.from(t), b]); const crc = Buffer.alloc(4); crc.writeUInt32BE(require('node:zlib').crc32 ? require('node:zlib').crc32(tb) : crc32(tb)); return Buffer.concat([len, tb, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(data)), chunk('IEND', Buffer.alloc(0))]); };
  function crc32(b) { let c, crc = 0xffffffff; for (const x of b) { c = (crc ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
  const MM = 72 / 25.4;
  // gut: eingebettete Schrift, Endformat A5 mit 3 mm Beschnitt, Bild 300 dpi
  const g = await L.PDFDocument.create(); g.registerFontkit(fontkit);
  const font = await g.embedFont(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'DejaVuSans.ttf')), { subset: true });
  const W = 148 * MM, H = 210 * MM, b = 3 * MM, pg = g.addPage([W + 2 * b, H + 2 * b]);
  pg.setTrimBox(b, b, W, H); pg.setBleedBox(0, 0, W + 2 * b, H + 2 * b);
  pg.drawText('Flyer', { x: 40, y: 400, size: 30, font });
  pg.drawImage(await g.embedPng(raw(300, 300)), { x: 40, y: 100, width: 72, height: 72 });   // 300 px auf 1 Zoll
  const good = await P.run('druck', await g.save(), { pages: 1, textPages: 1 });
  assert.equal(good.ok, true, titles(good).join('\n'));
  const t = titles(good);
  assert.ok(t.includes('✓ Alle Schriften eingebettet') && t.includes('✓ Endformat (TrimBox) angegeben') && t.includes('✓ Beschnitt (mind. 3 mm)') && t.includes('✓ Bildauflösung mind. 150 dpi'), t.join('\n'));
  assert.ok(t.some(x => /^i Farbraum/.test(x)), 'RGB nur als Hinweis');
  assert.ok(t.some(x => /^i Ausgabebedingung/.test(x)), 'fehlende PDF/X-Ausgabebedingung nur als Hinweis');
  // schlecht: Standardschrift nicht eingebettet, Bild 36 dpi, Endformat ragt hinaus
  const s = await L.PDFDocument.create(), sp = s.addPage([595, 842]);
  sp.drawText('Plakat', { x: 40, y: 700, size: 30, font: await s.embedFont(L.StandardFonts.Helvetica) });
  sp.drawImage(await s.embedPng(raw(100, 100)), { x: 40, y: 100, width: 200, height: 200 });
  sp.setTrimBox(-10, 0, 620, 842);
  const bad = await P.run('druck', await s.save(), { pages: 1, textPages: 1 });
  assert.equal(bad.ok, false);
  const tb = titles(bad);
  assert.ok(tb.includes('✗ Alle Schriften eingebettet') && tb.includes('✗ Bildauflösung mind. 150 dpi') && tb.includes('✗ Endformat liegt innerhalb der Seite'), tb.join('\n'));
  assert.match(bad.items.find(i => i.title === 'Bildauflösung mind. 150 dpi').detail, /36 dpi/);
  assert.ok(P.PROFILES.druck.label.includes('Kurzprüfung'), 'ehrlich als Kurzprüfung gekennzeichnet');
});
