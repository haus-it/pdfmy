// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Word 97–2003 (.doc), app-v349: Formatierung wie bei .docx. Messkorpus: die 10 Word-Dokumente aus tests/office-korpus, mit LibreOffice
// als „MS Word 97“ gespeichert (tests/office-korpus/doc97), plus 11-kopf.doc (Kopf-/Fußzeile mit Seitenzahl, Seitenumbruch vor Absatz).
// Vorher (app-v348): nur Text und Tabellen – 54 Überschriften, 37 Aufzählungspunkte, Fettdruck, 2 Bilder, Kopf-/Fußzeilen und die
// Hauptschrift gingen verloren. Jetzt stimmen Bausteine, Schrift und Seitenzahl mit der .docx-Fassung überein.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Office = require('../js/office.js'), L = require('../vendor/pdf-lib.min.js'), fontkit = require('../vendor/fontkit.umd.min.js'), TP = require('../js/textpdf.js');
const K = path.join(__dirname, 'office-korpus'), D = path.join(K, 'doc97');
const V = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', f));
const fonts = { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf'), italic: V('dejavu/DejaVuSans-Oblique.ttf'), boldItalic: V('dejavu/DejaVuSans-BoldOblique.ttf') };
const sig = r => r.blocks.map(b => b.type === 'h' ? 'h' + b.level : b.type === 'li' ? 'li' + (b.ordered ? 'o' : 'u') + (b.depth || 0) : b.type === 'img' ? 'img:' + b.mime : b.type === 'p' ? 'p' + (b.bold ? 'B' : '') + (b.runs ? 'R' : '') : b.type);
const words = r => r.blocks.map(b => b.text || (b.rows || []).flat().join(' ')).join(' ').split(/\s+/).filter(Boolean);

test('.doc wie .docx: Überschriften, Aufzählungen, Fett/Kursiv, Tabellen, Bilder, Hauptschrift – alle 10 Korpusdateien', async () => {
  const files = fs.readdirSync(D).filter(f => /^\d\d-.*\.doc$/.test(f) && fs.existsSync(path.join(K, f + 'x')));
  assert.equal(files.length, 10);
  for (const f of files) {
    const x = await Office.docx(new Uint8Array(fs.readFileSync(path.join(K, f + 'x')))), d = Office.doc(new Uint8Array(fs.readFileSync(path.join(D, f))));
    assert.deepEqual(sig(d), sig(x), f + ': Bausteine');
    assert.deepEqual(words(d), words(x), f + ': Wortlaut');
    assert.match(d.font, /Liberation Sans/, f + ': Hauptschrift');
  }
});

test('.doc: Bilder (eingebettet und schwebend), Listen mit Nummern, fett/kursiv im Satz wie .docx', async () => {
  const nl = Office.doc(new Uint8Array(fs.readFileSync(path.join(D, '08-newsletter.doc'))));
  const imgs = nl.blocks.filter(b => b.type === 'img');
  assert.equal(imgs.length, 2, 'Logo im Text und schwebendes Bild');
  for (const im of imgs) { assert.equal(im.mime, 'image/png'); assert.deepEqual([...im.bytes.slice(0, 4)], [0x89, 0x50, 0x4E, 0x47]); assert.ok(im.w > 100 && im.h > 40, `${im.w}×${im.h}`); }
  const br = Office.doc(new Uint8Array(fs.readFileSync(path.join(D, '03-bericht.doc')))), pr = Office.doc(new Uint8Array(fs.readFileSync(path.join(D, '04-protokoll.doc'))));
  assert.ok(pr.blocks.some(b => b.type === 'li' && b.ordered && b.label === '1.') && pr.blocks.some(b => b.label === '8.'), 'nummerierte Liste');
  assert.ok(br.blocks.some(b => b.type === 'li' && !b.ordered && b.label === '•'), 'Aufzählung');
  const rs = r => r.blocks.filter(b => b.runs).map(b => b.runs.filter(x => x.t.trim()).map(x => x.t.trim() + (x.b ? '[b]' : '') + (x.i ? '[i]' : '')));
  for (const f of ['01-brief.doc', '04-protokoll.doc', '10-sonderzeichen.doc']) {
    const d = rs(Office.doc(new Uint8Array(fs.readFileSync(path.join(D, f))))), x = rs(await Office.docx(new Uint8Array(fs.readFileSync(path.join(K, f + 'x')))));
    assert.ok(d.length > 0, f + ': gemischte Schnitte'); assert.deepEqual(d, x, f + ': fett/kursiv mitten im Satz');
  }
});

test('.doc: Kopf- und Fußzeile mit Seitenzahl, Seitenumbruch vor Absatz, Seitenformat', async () => {
  const r = Office.doc(new Uint8Array(fs.readFileSync(path.join(D, '11-kopf.doc'))));
  assert.deepEqual(r.blocks.map(b => b.type), ['p', 'pagebreak', 'p']);
  assert.equal(r.page.header[0].text, 'Mentor GmbH · Paderborn');
  assert.equal(r.page.footer[0].text, 'Seite {PAGE} von {NUMPAGES}');
  assert.deepEqual(r.page.size.map(Math.round), [595, 842]);
  const pdf = await TP.build(L, { blocks: r.blocks, page: r.page, fonts }), d = await L.PDFDocument.load(pdf);
  assert.equal(d.getPageCount(), 2);
});

test('.doc: Seitenzahl wie bei .docx (DejaVu), alte Dateien ohne Formatangaben gehen weiter', async () => {
  for (const f of ['03-bericht.doc', '07-vertrag.doc', '04-protokoll.doc']) {
    const n = async r => (await L.PDFDocument.load(await TP.build(L, { blocks: r.blocks, page: r.page, fonts }))).getPageCount();
    assert.equal(await n(Office.doc(new Uint8Array(fs.readFileSync(path.join(D, f))))), await n(await Office.docx(new Uint8Array(fs.readFileSync(path.join(K, f + 'x'))))), f);
  }
});

test('.doc: beschädigte Dateien ergeben eine verständliche Meldung, nie einen technischen Fehler', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let opened = 0;
  for (const f of fs.readdirSync(D)) {
    const b = fs.readFileSync(path.join(D, f));
    for (let k = 0; k < 30; k++) {
      const c = new Uint8Array(b); for (let i = 0; i < 30; i++) c[Math.floor(rnd() * c.length)] = Math.floor(rnd() * 256);
      try { Office.doc(c); opened++; } catch (e) { assert.match(e.message, /Word|Text|Kennwort/, f + ': ' + e.message); }
    }
  }
  assert.ok(opened > 100, 'leicht beschädigte Dateien öffnen trotzdem: ' + opened);
});

test('.doc: Fuß- und Endnoten wie bei .docx – Nummer im Text, Notentexte am Ende (app-v351)', async () => {
  const d = Office.doc(new Uint8Array(fs.readFileSync(path.join(D, '12-fussnoten.doc'))));
  const x = await Office.docx(new Uint8Array(fs.readFileSync(path.join(D, '12-fussnoten.docx'))));
  const s = r => r.blocks.map(b => b.type + ':' + (b.text || ''));
  assert.deepEqual(s(d), s(x));
  assert.equal(d.blocks[0].text, 'Der Anspruch ergibt sich aus § 280 BGB¹ und ist fällig.');
  assert.ok(d.blocks.some(b => b.text === '¹ Palandt, BGB, 85. Aufl., § 280 Rn. 12.' && b.small), 'Fußnotentext klein am Ende');
  assert.ok(d.blocks.some(b => b.text === 'Endnoten'), 'Endnoten getrennt');
});
