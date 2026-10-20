// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const Office = require('../js/office.js');
const TP = require('../js/textpdf.js');
const T = require('../js/tools.js');

// ZIP wie aus Word/Excel: Einträge mit Deflate (Methode 8)
async function zipDeflate(files) {
  const enc = s => typeof s === 'string' ? new TextEncoder().encode(s) : s, parts = [], central = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const raw = enc(data), comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const nm = new TextEncoder().encode(name), crc = T.crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, comp); central.push(Buffer.concat([ch, nm])); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const p = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
const r = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
async function sampleDocx() {
  const body = [
    p(r('Angebot Nr. 4711'), '<w:pStyle w:val="berschrift1"/>'),
    p(r('Mentor GmbH · Paderborn'), '<w:jc w:val="center"/>'),
    p(r('Sehr geehrte Damen und Herren, ') + r('vielen Dank') + r(' für Ihre Anfrage &amp; Ihr Vertrauen.')),
    p(r('Wichtig:', '<w:b/>') + r(' bitte bis 15.11. bestätigen.', '<w:b/>')),
    p(r('Glasfaser'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    p(r('Cloud-Telefonie'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    p(r('Erster Schritt'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
    p(r('Zweiter Schritt'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
    `<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${p(r('Pos'))}</w:tc><w:tc>${p(r('Leistung'))}</w:tc><w:tc>${p(r('Preis'))}</w:tc></w:tr><w:tr><w:tc>${p(r('1'))}</w:tc><w:tc>${p(r('Einrichtung'))}</w:tc><w:tc>${p(r('99,00 €'))}</w:tc></w:tr></w:tbl>`,
    p('<w:r><w:drawing><wp:inline><wp:extent cx="1270000" cy="635000"/><a:graphic><a:graphicData><a:blip r:embed="rIdImg1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>', '<w:jc w:val="right"/>'),
    p(r('Versteckt', '<w:vanish/>') + r('Gelöscht?') + '<w:del><w:r><w:delText>weg</w:delText></w:r></w:del>'),
    p('<w:r><w:br w:type="page"/></w:r>'),
    p(r('Seite zwei') + '<w:r><w:tab/></w:r>' + r('mit Tab')),
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:left="1440" w:right="1440" w:top="1440" w:bottom="1440"/></w:sectPr>',
  ].join('');
  return zipDeflate({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    'word/styles.xml': `<w:styles ${W}><w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style></w:styles>`,
    'word/numbering.xml': `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg1" Type="image" Target="media/image1.png"/></Relationships>',
    'word/media/image1.png': PNG,
  });
}
const V = p => fs.readFileSync(path.join(__dirname, '..', 'vendor', p));
const fonts = { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf') };
const pdfText = bytes => { const f = path.join(os.tmpdir(), 'pdfmy-office.pdf'); fs.writeFileSync(f, bytes); return execFileSync('python', ['-I', '-c', 'import pypdf,sys;sys.stdout.reconfigure(encoding="utf-8");r=pypdf.PdfReader(sys.argv[1],strict=True);print(len(r.pages));print("\\n".join(p.extract_text() for p in r.pages))', f]).toString(); };

test('Word: Überschrift, Ausrichtung, fett, Listen, Tabelle, Bild, Seitenumbruch, Seitenformat', async () => {
  const { blocks, page } = await Office.docx(await sampleDocx());
  const kinds = blocks.map(b => b.type + (b.level || '') + (b.ordered ? 'o' : '') + (b.bold ? 'B' : '') + (b.align ? '@' + b.align : ''));
  assert.deepEqual(kinds, ['h1', 'p@center', 'p', 'pB', 'li', 'li', 'lio', 'lio', 'table', 'img@right', 'p', 'pagebreak', 'p']);
  assert.equal(blocks[2].text, 'Sehr geehrte Damen und Herren, vielen Dank für Ihre Anfrage & Ihr Vertrauen.');
  assert.deepEqual(blocks.filter(b => b.type === 'li').map(b => b.label), ['•', '•', '1.', '2.']);
  assert.deepEqual(blocks[8].rows, [['Pos', 'Leistung', 'Preis'], ['1', 'Einrichtung', '99,00 €']]); assert.equal(blocks[8].head, true);
  assert.equal(blocks[9].mime, 'image/png'); assert.equal(blocks[9].w, 100); assert.equal(blocks[9].h, 50);
  assert.equal(blocks[10].text, 'Gelöscht?');   // versteckter und gelöschter Text entfällt
  assert.equal(blocks[12].text, 'Seite zwei\tmit Tab');
  assert.deepEqual(page.size, [612, 792]); assert.equal(page.margin, 72);   // US-Letter aus der Datei
  const pdf = await TP.build(L, { blocks, page, title: 'angebot', fonts });
  const t = pdfText(pdf);
  assert.match(t, /^2\r?\n/);
  for (const w of ['Angebot Nr. 4711', 'Mentor GmbH', 'Wichtig:', 'Glasfaser', 'Erster Schritt', 'Einrichtung', '99,00 €', 'Seite zwei']) assert.ok(t.includes(w), w);
  const d = await L.PDFDocument.load(pdf); assert.deepEqual(Object.values(d.getPage(0).getSize()).map(Math.round), [612, 792]);
});

test('Excel: Text, Zahlen, Datum, mehrere Blätter', async () => {
  const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const x = await zipDeflate({
    'xl/workbook.xml': `<workbook ${S}><sheets><sheet name="Rechnungen" sheetId="1" r:id="rId1"/><sheet name="Leer" sheetId="2" r:id="rId2"/><sheet name="Geheim" sheetId="3" state="hidden" r:id="rId3"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst ${S}><si><t>Kunde</t></si><si><t>Betrag</t></si><si><t>Datum</t></si><si><r><t>Müller </t></r><r><t>GmbH</t></r></si></sst>`,
    'xl/styles.xml': `<styleSheet ${S}><numFmts><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="10"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${S}><sheetData><row r="1"><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row><row r="2"><c r="B2" t="s"><v>3</v></c><c r="C2" s="2"><v>1250.5</v></c><c r="E2" s="3"><v>0.19</v></c><c r="D2" s="1"><v>46325</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>Schmidt</t></is></c><c r="C3"><f>C2*2</f><v>2501</v></c></row></sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': `<worksheet ${S}><sheetData/></worksheet>`,
    'xl/worksheets/sheet3.xml': `<worksheet ${S}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>geheim</t></is></c></row></sheetData></worksheet>`,
  });
  const { blocks } = await Office.xlsx(x);
  assert.equal(blocks.length, 1);   // leeres und verstecktes Blatt entfallen, Überschrift nur bei mehreren Blättern
  assert.deepEqual(blocks[0].rows, [['Kunde', 'Betrag', 'Datum', ''], ['Müller GmbH', '1.250,50 €', '30.10.2026', '19,00 %'], ['Schmidt', '2.501', '', '']]);
});

test('Keine Office-Datei: verständlicher Fehler', async () => {
  await assert.rejects(Office.docx(new Uint8Array([1, 2, 3])), /Keine gültige Office-Datei/);
  await assert.rejects(Office.docx(await zipDeflate({ 'a.txt': 'x' })), /Keine Word-Datei/);
});
