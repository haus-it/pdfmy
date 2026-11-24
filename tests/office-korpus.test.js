// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Office-Messkorpus (app-v345, Wettbewerbsanalyse Rang 2c): 10 Word-Dokumente und 3 Excel-Mappen (fiktive Bürodokumente), Seitenzahl
// gegen LibreOffice als Referenz (tests/office-korpus/soll.json). Messung 24.11.2026: alle Wörter kommen an; vorher wichen Word-Seiten
// wegen der breiteren DejaVu ab (Protokoll 2 statt 1) und Excel zeigte im Standardformat Tausenderpunkte (1.222 statt 1222).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), K = path.join(__dirname, 'office-korpus');
const L = require('../vendor/pdf-lib.min.js'), fontkit = require('../vendor/fontkit.umd.min.js'), Office = require('../js/office.js'), TP = require('../js/textpdf.js');
const V = f => fs.readFileSync(path.join(ROOT, 'vendor', f));
const fonts = { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf'), italic: V('dejavu/DejaVuSans-Oblique.ttf'), boldItalic: V('dejavu/DejaVuSans-BoldOblique.ttf') };
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const TF = (0, eval)('(' + APP.match(/const TEXT_FONTS = (\{[\s\S]*?\n\});/)[1] + ')');
const famOf = (0, eval)('(' + APP.match(/function officeFontFamily\(name\) \{[\s\S]*?\n\}/)[0] + ')');
const soll = JSON.parse(fs.readFileSync(path.join(K, 'soll.json'), 'utf8')).seiten;

// Umwandlung wie in der App (js/app.js importOffice)
async function umwandeln(f) {
  const b = new Uint8Array(fs.readFileSync(path.join(K, f)));
  const r = f.endsWith('.docx') ? await Office.docx(b) : await Office.xlsx(b, { locale: 'de-DE' });
  const fam = famOf(r.font), ff = fam ? { regular: V(TF[fam][0]), bold: V(TF[fam][1]), italic: V(TF[fam][2]), boldItalic: V(TF[fam][3]), fallback: fonts.regular } : {};
  return { r, fam, pdf: await TP.build(L, { blocks: r.blocks, page: r.page, title: f, fonts: { ...fonts, ...ff } }) };
}

test('Word: Seitenzahl wie LibreOffice, laufweitengleiche Schrift (Arial → Liberation Sans)', { timeout: 180000 }, async () => {
  const abw = [];
  for (const f of fs.readdirSync(K).filter(f => f.endsWith('.docx'))) {
    const { r, fam, pdf } = await umwandeln(f), n = (await L.PDFDocument.load(pdf)).getPageCount();
    assert.match(r.font, /Liberation Sans/, f + ': Hauptschrift erkannt');
    assert.equal(fam, 'arial', f);
    if (n !== soll[f.replace(/\.\w+$/, '')]) abw.push(`${f}: ${n} statt ${soll[f.replace(/\.\w+$/, '')]}`);
  }
  assert.deepEqual(abw, [], 'Seitenzahlen');
});

test('Excel: Standardformat ohne Tausenderpunkt, Format mit Gruppierung mit; alle Blätter', { timeout: 60000 }, async () => {
  const { r } = await umwandeln('13-breit.xlsx');
  const t = r.blocks.find(b => b.type === 'table');
  assert.deepEqual(t.rows[1].slice(0, 3), ['Januar', '1222', '2222'], 'wie Excel: 1222, nicht 1.222');
  const p = await umwandeln('12-preisliste.xlsx');
  assert.deepEqual(p.r.blocks.filter(b => b.type === 'h').map(b => b.text), ['Heizung', 'Sanitär', 'Elektro']);
  assert.equal((await L.PDFDocument.load(p.pdf)).getPageCount(), soll['12-preisliste']);
});

test('Ersatzschrift: Zeichen, die der Laufweitenschrift fehlen (☐ ☑), kommen aus DejaVu statt „?“', { timeout: 60000 }, async () => {
  const { pdf } = await umwandeln('09-formular.docx'), d = await L.PDFDocument.load(pdf);
  const names = []; for (const [, o] of d.context.enumerateIndirectObjects()) { const bf = o?.get?.(L.PDFName.of('BaseFont')); if (bf) names.push(String(bf).replace(/^\/[A-Z]{6}\+/, '')); }
  assert.ok(names.some(n => /Liberation/.test(n)), 'Liberation eingebettet: ' + names);
  assert.ok(names.some(n => /DejaVu/.test(n)), 'DejaVu als Ersatz eingebettet: ' + names);
  // Schriftfamilien-Zuordnung
  assert.equal(famOf('Calibri'), 'calibri'); assert.equal(famOf('Times New Roman'), 'times'); assert.equal(famOf('Cambria Math'), 'cambria');
  assert.equal(famOf('Courier New'), 'courier'); assert.equal(famOf('Comic Sans MS'), null);
});
