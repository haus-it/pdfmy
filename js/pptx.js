// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PDF → PowerPoint (.pptx, Office Open XML, ISO/IEC 29500): je Seite eine Folie mit dem Seitenbild; darüber der Text als unsichtbare
   Textfelder an der Originalstelle (durchsuchbar, kopierbar, in PowerPoint sichtbar zu machen). Ohne Bibliothek, nutzt Tools.zip.
   Pptx.build(slides, { title, author }) – slides: [{ jpeg: Uint8Array, w, h (Punkt), lines: [{ t, x, y, w, h }] (0…1, y von oben) }] */
(function (root) {
  'use strict';
  const enc = s => new TextEncoder().encode(s), E = 12700;   // EMU je Punkt
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = list => X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
  const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const fill = c => `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>`;
  const THEME = X + `<a:theme ${NS} name="PDFMy"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>`
    + `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>`
    + `<a:fmtScheme name="Office"><a:fillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${'<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
  const CLRMAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

  function slideXml(s, cx, cy) {
    const sp = [];
    let id = 3;
    // Seitenbild über die ganze Folie
    sp.push(`<p:pic><p:nvPicPr><p:cNvPr id="2" name="Seite" descr="Seitenbild"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
    // Text: unsichtbar (Deckkraft 0) an der Originalstelle
    for (const l of s.lines || []) {
      const t = String(l.t || '').trim(); if (!t) continue;
      const x = Math.round(l.x * cx), y = Math.round(l.y * cy), w = Math.max(E, Math.round(l.w * cx)), h = Math.max(E, Math.round(l.h * cy));
      const sz = Math.max(100, Math.min(20000, Math.round(l.h * s.h * 0.85 * 100)));   // Hundertstel Punkt
      sp.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="${esc(s.lang || 'de-DE')}" sz="${sz}" dirty="0"><a:solidFill><a:srgbClr val="000000"><a:alpha val="0"/></a:srgbClr></a:solidFill></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></p:txBody></p:sp>`);
    }
    return X + `<p:sld ${NS}><p:cSld><p:spTree>${grp}${sp.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }

  function build(slides, { title = '', author = '' } = {}, date = new Date()) {
    if (!slides.length) throw new Error('Keine Seiten.');
    const W = slides[0].w, H = slides[0].h, cx = Math.max(914400, Math.round(W * E)), cy = Math.max(914400, Math.round(H * E));
    const n = slides.length, iso = date.toISOString().replace(/\.\d+Z$/, 'Z');
    const files = [
      { name: '[Content_Types].xml', data: enc(X + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>`
        + `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
        + `<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>`
        + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`
        + slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>') },
      { name: '_rels/.rels', data: enc(X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`) },
      { name: 'docProps/core.xml', data: enc(X + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`) },
      { name: 'docProps/app.xml', data: enc(X + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PDFMy (pdfmy.de)</Application><Slides>${n}</Slides></Properties>`) },
      { name: 'ppt/presentation.xml', data: enc(X + `<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`) },
      { name: 'ppt/_rels/presentation.xml.rels', data: enc(rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ['rId3', 'presProps', 'presProps.xml'], ['rId4', 'viewProps', 'viewProps.xml'], ['rId5', 'tableStyles', 'tableStyles.xml'], ...slides.map((_, i) => [`rId${10 + i}`, 'slide', `slides/slide${i + 1}.xml`])])) },
      { name: 'ppt/presProps.xml', data: enc(X + `<p:presentationPr ${NS}/>`) },
      { name: 'ppt/viewProps.xml', data: enc(X + `<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`) },
      { name: 'ppt/tableStyles.xml', data: enc(X + `<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`) },
      { name: 'ppt/theme/theme1.xml', data: enc(THEME) },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: enc(X + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap ${CLRMAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`) },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: enc(rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: enc(X + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Leer"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`) },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: enc(rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])) },
    ];
    slides.forEach((s, i) => {
      // abweichende Seitengröße: Bild in die Foliengröße einpassen (Seitenverhältnis bleibt durch Letterbox-Rand gewahrt)
      const k = Math.min(cx / (s.w * E), cy / (s.h * E)), iw = Math.round(s.w * E * k), ih = Math.round(s.h * E * k);
      let xml = slideXml(s, iw, ih);
      if (iw !== cx || ih !== cy) { const ox = Math.round((cx - iw) / 2), oy = Math.round((cy - ih) / 2); xml = xml.replace(/<a:off x="(\d+)" y="(\d+)"\/>/g, (m, a, b) => `<a:off x="${+a + ox}" y="${+b + oy}"/>`); }
      files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: enc(xml) });
      files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: enc(rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rIdImg', 'image', `../media/image${i + 1}.jpeg`]])) });
      files.push({ name: `ppt/media/image${i + 1}.jpeg`, data: s.jpeg });
    });
    return root.Tools.zip(files);
  }
  const api = { build };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Pptx = api;
})(typeof self !== 'undefined' ? self : this);
