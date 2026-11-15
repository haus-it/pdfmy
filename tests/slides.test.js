// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PowerPoint (.pptx) und Impress (.odp) → PDF (js/slides.js): Platzhalter mit geerbter Lage und Schrift aus Layout/Master,
// Aufzählung (auch Wingdings), Tabelle, Bild mit Zuschnitt, Diagramm aus gespeicherten Werten, ausgeblendete Folie, Gruppe, ODP mit Liste und Form
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const Slides = require('../js/slides.js');
const T = require('../js/tools.js');

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
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = list => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, t]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${t}"/>`).join('')}</Relationships>`;
const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${x * 12700}" y="${y * 12700}"/><a:ext cx="${w * 12700}" cy="${h * 12700}"/></a:xfrm>`;
const tree = inner => `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:spTree></p:cSld>`;
const ph = (type, idx, inner, x) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="P"/><p:cNvSpPr/><p:nvPr><p:ph${type ? ` type="${type}"` : ''}${idx != null ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr>${x || ''}</p:spPr>${inner}</p:sp>`;
const body = paras => `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody>`;
const para = (t, ppr = '') => `<a:p>${ppr}<a:r><a:rPr lang="de-DE"/><a:t>${t}</a:t></a:r></a:p>`;

async function samplePptx() {
  const theme = `<a:theme ${NS} name="T"><a:themeElements><a:clrScheme name="C"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="F"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
  const master = `<p:sldMaster ${NS}>${tree(ph('title', null, body(para('')), xfrm(40, 20, 880, 80)) + ph('body', 1, body(para('')), xfrm(40, 120, 880, 380)) +
    `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Balken"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 520, 960, 20)}<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>`)}` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="•"/><a:defRPr sz="3200"/></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buFont typeface="Wingdings"/><a:buChar char="§"/><a:defRPr sz="2800"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const layout = `<p:sldLayout ${NS}>${tree(ph('title', null, body(para(''))) + ph('body', 1, body(para(''))))}</p:sldLayout>`;
  const s1 = `<p:sld ${NS}>${tree(ph('title', null, body(para('Quartalsbericht'))) + ph(null, 1, body(para('Umsatz gestiegen') + para('Neukunden', '<a:pPr lvl="1"/>'))))}</p:sld>`;
  const tbl = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="T"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${60 * 12700}" y="${150 * 12700}"/><a:ext cx="${400 * 12700}" cy="${100 * 12700}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="${200 * 12700}"/><a:gridCol w="${200 * 12700}"/></a:tblGrid>` +
    ['Region|Umsatz', 'Nord|1,2 Mio. €'].map(r => `<a:tr h="${50 * 12700}">${r.split('|').map(c => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${c}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`).join('')}</a:tr>`).join('') + `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="5" name="B"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="10000" r="10000"/><a:stretch/></p:blipFill><p:spPr>${xfrm(600, 150, 200, 200)}<a:prstGeom prst="rect"/></p:spPr></p:pic>`;
  const chart = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="D"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${60 * 12700}" y="${300 * 12700}"/><a:ext cx="${400 * 12700}" cy="${200 * 12700}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId3"/></a:graphicData></a:graphic></p:graphicFrame>`;
  const grp = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="7" name="G"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${500 * 12700}" y="${400 * 12700}"/><a:ext cx="${200 * 12700}" cy="${100 * 12700}"/><a:chOff x="0" y="0"/><a:chExt cx="${400 * 12700}" cy="${200 * 12700}"/></a:xfrm></p:grpSpPr>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="8" name="E"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(200, 0, 200, 200)}<a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="E3000F"/></a:solidFill></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1400" b="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Kreis</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>`;
  const s2 = `<p:sld ${NS}>${tree(ph('title', null, body(para('Zahlen'))) + tbl + pic + chart + grp)}</p:sld>`;
  const s3 = `<p:sld ${NS} show="0">${tree(ph('title', null, body(para('Geheim'))))}</p:sld>`;
  const chartXml = `<c:chartSpace ${NS}><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Umsatz je Quartal</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>` +
    `<c:ser><c:idx val="0"/><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Umsatz</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>1.1</c:v></c:pt><c:pt idx="1"><c:v>1.6</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  return zipDeflate({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'ppt/presentation.xml': `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'slide', 'slides/slide2.xml'], ['rId4', 'slide', 'slides/slide3.xml']]),
    'ppt/slideMasters/slideMaster1.xml': master,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([['rId1', 'theme', '../theme/theme1.xml']]),
    'ppt/theme/theme1.xml': theme,
    'ppt/slideLayouts/slideLayout1.xml': layout,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
    'ppt/slides/slide1.xml': s1, 'ppt/slides/slide2.xml': s2, 'ppt/slides/slide3.xml': s3,
    'ppt/slides/_rels/slide1.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]),
    'ppt/slides/_rels/slide2.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', '../media/image1.png'], ['rId3', 'chart', '../charts/chart1.xml']]),
    'ppt/slides/_rels/slide3.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]),
    'ppt/media/image1.png': PNG, 'ppt/charts/chart1.xml': chartXml,
  });
}
const F = { arial: 'fonts/metric/LiberationSans', times: 'fonts/metric/LiberationSerif', courier: 'fonts/metric/LiberationMono', calibri: 'fonts/metric/PDFMySansC', cambria: 'fonts/metric/Caladea' };
const D = { sans: ['DejaVuSans.ttf', 'dejavu/DejaVuSans-Bold.ttf', 'dejavu/DejaVuSans-Oblique.ttf', 'dejavu/DejaVuSans-BoldOblique.ttf'], serif: ['dejavu/DejaVuSerif.ttf', 'dejavu/DejaVuSerif-Bold.ttf', 'dejavu/DejaVuSerif-Italic.ttf', 'dejavu/DejaVuSerif-BoldItalic.ttf'], mono: ['dejavu/DejaVuSansMono.ttf', 'dejavu/DejaVuSansMono.ttf', 'dejavu/DejaVuSansMono.ttf', 'dejavu/DejaVuSansMono.ttf'] };
const font = async (fam, b, i) => fs.readFileSync(path.join(__dirname, '..', 'vendor', F[fam] ? F[fam] + '-' + (b && i ? 'BoldItalic' : b ? 'Bold' : i ? 'Italic' : 'Regular') + '.ttf' : D[fam][(b ? 1 : 0) + (i ? 2 : 0)]));

test('PowerPoint: Platzhalter erben Lage und Schrift, Aufzählung, Tabelle, Bild, Diagramm, Gruppe, ausgeblendete Folie', async () => {
  const m = await Slides.pptx(await samplePptx());
  assert.equal(Math.round(m.w), 960); assert.equal(Math.round(m.h), 540);
  assert.equal(m.slides.length, 2, 'ausgeblendete Folie weggelassen'); assert.equal(m.skipped.hidden, 1);
  const [s1, s2] = m.slides;
  // Master-Form (Balken) zuerst, dann die Platzhalter der Folie mit Lage aus dem Master
  assert.equal(s1.items[0].kind, 'shape'); assert.equal(Math.round(s1.items[0].y), 520);
  const title = s1.items.find(i => i.text?.paras[0].runs[0]?.t === 'Quartalsbericht');
  assert.deepEqual([title.x, title.y, title.w, title.h].map(Math.round), [40, 20, 880, 80], 'Lage vom Master');
  const tr = title.text.paras[0];
  assert.equal(tr.algn, 'ctr'); assert.equal(tr.runs[0].size, 44); assert.equal(tr.runs[0].face, 'Calibri Light');
  assert.deepEqual([tr.runs[0].color.r, tr.runs[0].color.g, tr.runs[0].color.b].map(v => Math.round(v * 255)), [0x1f, 0x49, 0x7d], 'Titelfarbe tx2');
  const bodyEl = s1.items.find(i => i.text?.paras[0].runs[0]?.t === 'Umsatz gestiegen');
  assert.equal(Math.round(bodyEl.y), 120, 'Inhalt über idx gefunden');
  assert.equal(bodyEl.text.paras[0].bullet.char, '•'); assert.equal(bodyEl.text.paras[0].runs[0].size, 32);
  assert.equal(bodyEl.text.paras[1].bullet.font, 'Wingdings'); assert.equal(bodyEl.text.paras[1].runs[0].size, 28); assert.equal(Math.round(bodyEl.text.paras[1].marL), 59);
  // Folie 2
  const tbl = s2.items.find(i => i.kind === 'table');
  assert.equal(tbl.table.rows.length, 2); assert.equal(tbl.table.rows[0].cells[0].header, true); assert.equal(tbl.table.rows[1].cells[1].text.paras[0].runs[0].t, '1,2 Mio. €');
  const img = s2.items.find(i => i.kind === 'image'); assert.deepEqual(img.image.crop, [0.1, 0, 0.1, 0]);
  const ch = s2.items.find(i => i.kind === 'chart'); assert.equal(ch.chart.title, 'Umsatz je Quartal'); assert.deepEqual(ch.chart.cats, ['Q1', 'Q2']); assert.deepEqual(ch.chart.series[0].vals, [1.1, 1.6]);
  const circle = s2.items.find(i => i.text?.paras[0].runs[0]?.t === 'Kreis');
  assert.deepEqual([circle.x, circle.y, circle.w, circle.h].map(Math.round), [600, 400, 100, 100], 'Gruppe umgerechnet');
  assert.deepEqual(Object.values(circle.text.paras[0].runs[0].color).slice(0, 3), [1, 1, 1], 'bg1 = weiß');
  // PDF
  const { bytes, missing } = await Slides.render(L, m, { fontkit, font, title: 'Test' });
  assert.equal(missing, 0);
  const pdf = await L.PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 960, height: 540 });
  const fonts = pdf.context.enumerateIndirectObjects().map(([, o]) => o instanceof L.PDFDict && o.get(L.PDFName.of('BaseFont'))?.toString()).filter(Boolean);
  assert.ok(fonts.some(f => /PDFMySansC/.test(f)), 'Calibri-kompatible Schrift eingebettet: ' + fonts.join(' '));
});

test('PowerPoint: kaputte Datei und Datei ohne Folien melden verständliche Fehler', async () => {
  await assert.rejects(Slides.pptx(await zipDeflate({ 'x.txt': 'a' })), /Keine PowerPoint-Datei/);
  await assert.rejects(Slides.pptx(await zipDeflate({ 'ppt/presentation.xml': `<p:presentation ${NS}><p:sldIdLst/></p:presentation>` })), /keine Folien/);
});

test('Impress (.odp): Seitengröße der Masterfolie, Titel, Liste mit Einzug, Form mit Füllung, Drehung', async () => {
  const O = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"';
  const styles = `<office:document-styles ${O}><office:automatic-styles><style:page-layout style:name="PM0"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"/></style:page-layout><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/></style:page-layout></office:automatic-styles>` +
    `<office:master-styles><style:master-page style:name="Std" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
  const content = `<office:document-content ${O}><office:automatic-styles>` +
    `<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#e3000f" draw:stroke="none" draw:textarea-vertical-align="middle"/></style:style>` +
    `<style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="32pt" fo:font-weight="bold"/></style:style>` +
    `<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="●"><style:list-level-properties text:space-before="0.3cm" text:min-label-width="0.9cm"/></text:list-level-style-bullet></text:list-style>` +
    `</office:automatic-styles><office:body><office:presentation><draw:page draw:name="S1" draw:master-page-name="Std">` +
    `<draw:frame svg:x="1cm" svg:y="1cm" svg:width="26cm" svg:height="2cm"><draw:text-box><text:p text:style-name="P1">Überblick</text:p></draw:text-box></draw:frame>` +
    `<draw:frame svg:x="1cm" svg:y="4cm" svg:width="20cm" svg:height="8cm"><draw:text-box><text:list text:style-name="L1"><text:list-item><text:p>Erster Punkt<text:s/>mit Leerzeichen</text:p></text:list-item></text:list></draw:text-box></draw:frame>` +
    `<draw:custom-shape draw:style-name="gr1" svg:width="4cm" svg:height="2cm" draw:transform="rotate (0.5235987756) translate (20cm 10cm)"><text:p>Form</text:p><draw:enhanced-geometry draw:type="ooxml-ellipse"/></draw:custom-shape>` +
    `</draw:page></office:presentation></office:body></office:document-content>`;
  const m = await Slides.odp(await zipDeflate({ mimetype: 'application/vnd.oasis.opendocument.presentation', 'content.xml': content, 'styles.xml': styles }));
  assert.equal(Math.round(m.w), Math.round(28 * 72 / 2.54)); assert.equal(Math.round(m.h), Math.round(15.75 * 72 / 2.54), 'Seitenlayout der Masterfolie, nicht das der Notizen');
  const [t, l, sh] = m.slides[0].items;
  assert.equal(t.text.paras[0].runs[0].t, 'Überblick'); assert.equal(t.text.paras[0].runs[0].size, 32); assert.equal(t.text.paras[0].runs[0].bold, true); assert.equal(t.text.paras[0].algn, 'ctr');
  const lp = l.text.paras[0];
  assert.equal(lp.runs.map(r => r.t).join(''), 'Erster Punkt mit Leerzeichen'); assert.equal(lp.bullet.char, '•');
  assert.equal(Math.round(lp.marL), Math.round(1.2 * 72 / 2.54)); assert.equal(Math.round(lp.indent), Math.round(-0.9 * 72 / 2.54));
  assert.equal(sh.kind, 'shape'); assert.match(sh.path, /^M.* C/, 'Ellipse aus „ooxml-ellipse“'); assert.equal(Math.round(sh.rot), -30); assert.equal(sh.text.anchor, 'ctr');
  const { bytes } = await Slides.render(L, m, { fontkit, font });
  assert.equal((await L.PDFDocument.load(bytes)).getPageCount(), 1);
});

test('Formen und Nummerierung', () => {
  assert.match(Slides.shapePath('roundRect', 100, 50), /^M/); assert.equal(Slides.shapePath('line', 10, 10), null);
  assert.equal(Slides.autoNum('arabicPeriod', 3), '3.'); assert.equal(Slides.autoNum('alphaLcParenR', 2), 'b)'); assert.equal(Slides.autoNum('romanUcPeriod', 4), 'IV.');
  assert.equal(Slides.family('Calibri Light'), 'calibri'); assert.equal(Slides.family('Times New Roman'), 'times'); assert.equal(Slides.family('Segoe UI'), 'calibri'); assert.equal(Slides.family('Helvetica'), 'arial');
});
