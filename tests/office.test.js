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

const ODF = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
test('OpenDocument-Text: Überschrift, Ausrichtung, fett, Listen, Tabelle, Bild, Leerzeichen-Elemente', async () => {
  const content = `<office:document-content ${ODF}><office:automatic-styles>
    <style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/></style:style>
    <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
    <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style></office:automatic-styles>
    <office:body><office:text>
      <text:h text:outline-level="1">Vereinssatzung</text:h>
      <text:p text:style-name="P1">Fassung 2026</text:p>
      <text:p>Der Verein<text:s text:c="2"/>heißt<text:tab/>„Mentor e.&#x202F;V.“</text:p>
      <text:p><text:span text:style-name="T1">Alles fett</text:span></text:p>
      <text:list><text:list-item><text:p>Punkt A</text:p></text:list-item><text:list-item><text:p>Punkt B</text:p></text:list-item></text:list>
      <text:list text:style-name="L1"><text:list-item><text:p>Erstens</text:p></text:list-item></text:list>
      <table:table><table:table-header-rows><table:table-row><table:table-cell><text:p>Amt</text:p></table:table-cell><table:table-cell><text:p>Name</text:p></table:table-cell></table:table-row></table:table-header-rows>
        <table:table-row><table:table-cell><text:p>Vorsitz</text:p></table:table-cell><table:table-cell><text:p>Anna</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row></table:table>
      <text:p><draw:frame svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/logo.png"/></draw:frame></text:p>
    </office:text></office:body></office:document-content>`;
  const styles = `<office:document-styles ${ODF}><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-left="2.5cm"/></style:page-layout></office:automatic-styles></office:document-styles>`;
  const z = await zipDeflate({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': content, 'styles.xml': styles, 'Pictures/logo.png': PNG });
  const { blocks, page } = await Office.odt(z);
  assert.deepEqual(blocks.map(b => b.type + (b.level || '') + (b.ordered ? 'o' : '') + (b.bold ? 'B' : '') + (b.align && b.type === 'p' ? '@' + b.align : '')), ['h1', 'p@center', 'p', 'pB', 'li', 'li', 'lio', 'table', 'img']);
  assert.equal(blocks[2].text, 'Der Verein  heißt\t„Mentor e. V.“');
  assert.deepEqual(blocks[7].rows, [['Amt', 'Name'], ['Vorsitz', 'Anna']]); assert.equal(blocks[7].head, true);
  assert.equal(Math.round(blocks[8].w), 57); assert.equal(Math.round(page.size[0]), 595); assert.equal(Math.round(page.margin), 71);
  const pdf = await TP.build(L, { blocks, page, fonts });
  const t = pdfText(pdf); for (const w of ['Vereinssatzung', 'Fassung 2026', 'Punkt B', 'Erstens', 'Vorsitz']) assert.ok(t.includes(w), w);
});

test('OpenDocument-Tabelle: Werte, Währung, Prozent, Datum, wiederholte Zeilen/Spalten', async () => {
  const content = `<office:document-content ${ODF}><office:body><office:spreadsheet><table:table table:name="Kasse">
    <table:table-row><table:table-cell office:value-type="string"><text:p>Posten</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Betrag</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Anteil</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Datum</text:p></table:table-cell><table:table-cell table:number-columns-repeated="16380"/></table:table-row>
    <table:table-row><table:table-cell office:value-type="string"><text:p>Beitrag</text:p></table:table-cell><table:table-cell office:value-type="currency" office:value="1250.5"><text:p>1.250,50 €</text:p></table:table-cell><table:table-cell office:value-type="percentage" office:value="0.19"><text:p>19 %</text:p></table:table-cell><table:table-cell office:value-type="date" office:date-value="2026-10-21"><text:p>21.10.26</text:p></table:table-cell></table:table-row>
    <table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
  </table:table></office:spreadsheet></office:body></office:document-content>`;
  const z = await zipDeflate({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet', 'content.xml': content });
  const { blocks } = await Office.ods(z);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].rows, [['Posten', 'Betrag', 'Anteil', 'Datum'], ['Beitrag', '1.250,50 €', '19 %', '21.10.2026']]);
  await assert.rejects(Office.ods(await zipDeflate({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': content })), /Keine OpenDocument-Tabelle/);
});

test('EPUB: Titel, Kapitel mit Seitenwechsel, Überschriften, Absätze mit Zeilenumbruch, Liste, Tabelle, Bild', async () => {
  const x = (body, t = 'K') => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${t}</title><style>p{}</style></head><body>${body}</body></html>`;
  const z = await zipDeflate({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Vereinschronik</dc:title></metadata><manifest><item id="c1" href="text/kap1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/kap2.xhtml" media-type="application/xhtml+xml"/><item id="css" href="s.css" media-type="text/css"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
    'OEBPS/text/kap1.xhtml': x('<h1>Gründung</h1><p>Der Verein wurde<br/>1921 gegründet &amp; wuchs.</p><div><p>Im Container</p></div><ul><li>Fußball</li><li>Tennis<ul><li>Halle</li></ul></li></ul>'),
    'OEBPS/text/kap2.xhtml': x('<h2>Heute</h2><table><tr><th>Jahr</th><th>Mitglieder</th></tr><tr><td>2026</td><td>412</td></tr></table><p><img src="../img/logo.png" alt="Logo"/></p>'),
    'OEBPS/img/logo.png': PNG,
  });
  const { blocks, page, title } = await Office.epub(z);
  assert.equal(title, 'Vereinschronik');
  assert.deepEqual(blocks.map(b => b.type + (b.level || '') + (b.depth ? 'd' + b.depth : '')), ['h1', 'h2', 'p', 'p', 'li', 'li', 'lid1', 'pagebreak', 'h3', 'table', 'img']);
  assert.equal(blocks[2].text, 'Der Verein wurde\n1921 gegründet & wuchs.');
  assert.deepEqual(blocks[9].rows, [['Jahr', 'Mitglieder'], ['2026', '412']]);
  assert.equal(Math.round(page.size[0]), 420);   // A5
  const pdf = await TP.build(L, { blocks, page, fonts });
  const t = pdfText(pdf); for (const w of ['Vereinschronik', 'Gründung', 'Fußball', 'Halle', 'Mitglieder']) assert.ok(t.includes(w), w);
  await assert.rejects(Office.epub(await zipDeflate({ 'a.txt': 'x' })), /Keine EPUB-Datei/);
});

test('Word: Kopfzeile mit Logo, Fußzeile mit Seitenzahl auf jeder Seite, fett und kursiv im Satz', async () => {
  const body = p(r('Sehr geehrte ') + r('Frau Müller', '<w:b/>') + r(', das ist ') + r('wichtig', '<w:i/>') + r('.'))
    + p('<w:r><w:br w:type="page"/></w:r>') + p(r('Zweite Seite'))
    + '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2268" w:bottom="1701" w:left="1418" w:right="1134" w:header="709" w:footer="709"/></w:sectPr>';
  const hdr = `<w:hdr ${W}>${p(r('Mentor GmbH · Paderborn'), '<w:jc w:val="right"/>')}${p('<w:r><w:drawing><wp:inline><wp:extent cx="635000" cy="317500"/><a:graphic><a:graphicData><a:blip r:embed="rIdLogo"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')}</w:hdr>`;
  const ftr = `<w:ftr ${W}>${p(r('Seite ') + '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>' + r(' von ') + '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>9</w:t></w:r></w:fldSimple>', '<w:jc w:val="center"/>')}</w:ftr>`;
  const z = await zipDeflate({
    'word/document.xml': `<w:document ${W}><w:body>${body}</w:body></w:document>`,
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH" Type="header" Target="header1.xml"/><Relationship Id="rIdF" Type="footer" Target="footer1.xml"/></Relationships>',
    'word/header1.xml': hdr, 'word/footer1.xml': ftr,
    'word/_rels/header1.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="image" Target="media/logo.png"/></Relationships>',
    'word/media/logo.png': PNG,
  });
  const { blocks, page } = await Office.docx(z);
  assert.deepEqual(blocks[0].runs.map(x => x.t + (x.b ? '[b]' : '') + (x.i ? '[i]' : '')), ['Sehr geehrte ', 'Frau Müller[b]', ', das ist ', 'wichtig[i]', '.']);
  assert.equal(page.header.length, 2); assert.equal(page.header[1].type, 'img');
  assert.equal(page.footer[0].text, 'Seite {PAGE} von {NUMPAGES}');
  assert.equal(Math.round(page.top), 113); assert.equal(Math.round(page.bottom), 85);
  const pdf = await TP.build(L, { blocks, page, fonts: { ...fonts, italic: V('dejavu/DejaVuSans-Oblique.ttf'), boldItalic: V('dejavu/DejaVuSans-BoldOblique.ttf') } });
  const t = pdfText(pdf);
  assert.match(t, /^2\r?\n/);
  assert.equal((t.match(/Mentor GmbH · Paderborn/g) || []).length, 2, 'Kopfzeile auf beiden Seiten');
  assert.ok(t.includes('Seite 1 von 2') && t.includes('Seite 2 von 2'), 'Seitenzahlen: ' + t);
  assert.ok(/Sehr geehrte\s*Frau Müller\s*,\s*das ist\s*wichtig\s*\./.test(t), 'Satz vollständig');   // pypdf trennt beim Schnittwechsel
  const d = await L.PDFDocument.load(pdf);
  const fontsUsed = new Set(); for (const [, o] of d.context.enumerateIndirectObjects()) { const bf = o?.get?.(L.PDFName.of('BaseFont')); if (bf) fontsUsed.add(String(bf).replace(/^\/[A-Z]{6}\+/, '/')); }
  assert.ok([...fontsUsed].some(x => /Bold/.test(x)) && [...fontsUsed].some(x => /Oblique/.test(x)), 'fett und kursiv eingebettet: ' + [...fontsUsed]);
});
