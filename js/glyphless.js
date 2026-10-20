// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Unsichtbare Platzhalterschrift für die Textebene (wie „GlyphLessFont“ in Tesseract/OCRmyPDF): Jedes Zeichen (Unicode-BMP als CID,
   Identity-H) zeigt auf dieselbe leere Glyphe mit 500/1000 em Breite. So bleiben erkannte Texte in Chinesisch, Japanisch, Koreanisch
   u. a. durchsuchbar und kopierbar, ohne eine große Schrift einzubetten (wenige Hundert Byte). Für PDF/A-2b eingebettet, mit ToUnicode.
   Glyphless.embed(PDFLib, doc) → Ref des Type0-Fonts; Glyphless.hex(text) → Hex-String der CIDs (Zeichen außerhalb des BMP entfallen) */
(function (root) {
  'use strict';
  // Minimale TrueType-Datei: 2 Glyphen (.notdef, leer), Breite 500, unitsPerEm 1000
  function ttf() {
    const tables = {};
    const u16 = (a, v) => a.push((v >> 8) & 255, v & 255), s16 = (a, v) => u16(a, v & 0xffff), u32 = (a, v) => a.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
    let t;
    t = []; u32(t, 0x00010000); u32(t, 0x00010000); u32(t, 0); u32(t, 0x5F0F3CF5); u16(t, 0x000B); u16(t, 1000);
    for (let i = 0; i < 4; i++) u32(t, 0);   // created, modified
    s16(t, 0); s16(t, 0); s16(t, 500); s16(t, 1000); u16(t, 0); u16(t, 8); s16(t, 2); s16(t, 0); s16(t, 0); tables.head = t;
    t = []; u32(t, 0x00010000); s16(t, 1000); s16(t, 0); s16(t, 0); u16(t, 500); s16(t, 0); s16(t, 0); s16(t, 500); s16(t, 1); s16(t, 0); s16(t, 0);
    for (let i = 0; i < 5; i++) s16(t, 0); u16(t, 2); tables.hhea = t;
    t = []; u32(t, 0x00010000); u16(t, 2); for (let i = 0; i < 13; i++) u16(t, i === 0 ? 0 : i === 3 ? 0 : i === 4 ? 1 : i === 5 ? 1 : 0); tables.maxp = t.slice(0, 32);
    t = []; u16(t, 500); s16(t, 0); u16(t, 500); s16(t, 0); tables.hmtx = t;
    t = []; u16(t, 0); u16(t, 0); u16(t, 0); tables.loca = t;   // beide Glyphen leer (short-Format)
    tables.glyf = [0, 0];   // Mindestlänge
    // cmap Format 4: nur das Abschluss-Segment
    t = []; u16(t, 0); u16(t, 1); u16(t, 3); u16(t, 1); u32(t, 12);
    u16(t, 4); u16(t, 24); u16(t, 0); u16(t, 2); u16(t, 2); u16(t, 0); u16(t, 0); u16(t, 0xFFFF); u16(t, 0); u16(t, 0xFFFF); s16(t, 1); u16(t, 0); tables.cmap = t;
    t = []; u32(t, 0x00030000); for (let i = 0; i < 7; i++) u32(t, 0); tables.post = t;
    const name = 'GlyphLessFont', nm = []; u16(nm, 0); u16(nm, 2); u16(nm, 6 + 24);
    for (const id of [1, 6]) { u16(nm, 3); u16(nm, 1); u16(nm, 0x409); u16(nm, id); u16(nm, name.length * 2); u16(nm, id === 1 ? 0 : name.length * 2); }
    for (let k = 0; k < 2; k++) for (const ch of name) u16(nm, ch.charCodeAt(0));
    tables.name = nm;
    t = []; u16(t, 3); s16(t, 500); u16(t, 400); u16(t, 5); u16(t, 0); for (let i = 0; i < 10; i++) s16(t, 0); s16(t, 0);
    for (let i = 0; i < 10; i++) t.push(0); for (let i = 0; i < 4; i++) u32(t, 0); t.push(0, 0, 0, 0); u16(t, 0x40); u16(t, 0); u16(t, 0xFFFF);
    s16(t, 1000); s16(t, 0); s16(t, 0); u16(t, 1000); u16(t, 0); u32(t, 1); u32(t, 0); s16(t, 0); s16(t, 1000); u16(t, 0); u16(t, 0); u16(t, 0); tables['OS/2'] = t;
    const tags = Object.keys(tables).sort(), n = tags.length, out = [];
    u32(out, 0x00010000); u16(out, n); let es = 1, sr; while (es * 2 <= n) es *= 2; sr = es * 16; u16(out, sr); u16(out, Math.log2(es)); u16(out, n * 16 - sr);
    let off = 12 + n * 16; const body = [];
    for (const tag of tags) {
      const d = tables[tag].slice(); while (d.length % 4) d.push(0);
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum = (sum + ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3])) >>> 0;
      for (const ch of tag.padEnd(4)) out.push(ch.charCodeAt(0));
      u32(out, sum); u32(out, off); u32(out, tables[tag].length); off += d.length; body.push(...d);
    }
    const bytes = new Uint8Array([...out, ...body]);
    // checkSumAdjustment im head-Eintrag
    let sum = 0; for (let i = 0; i < bytes.length; i += 4) sum = (sum + ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | (bytes[i + 3] | 0))) >>> 0;
    const ho = tags.indexOf('head'), headOff = (bytes[12 + ho * 16 + 8] << 24 | bytes[12 + ho * 16 + 9] << 16 | bytes[12 + ho * 16 + 10] << 8 | bytes[12 + ho * 16 + 11]) >>> 0;
    const adj = (0xB1B0AFBA - sum) >>> 0; bytes[headOff + 8] = adj >>> 24; bytes[headOff + 9] = (adj >> 16) & 255; bytes[headOff + 10] = (adj >> 8) & 255; bytes[headOff + 11] = adj & 255;
    return bytes;
  }
  // ToUnicode: CID = Unicode (identisch); bfrange darf nur im letzten Byte variieren → 256 Bereiche, je Block höchstens 100
  function toUnicode() {
    const h = v => v.toString(16).toUpperCase().padStart(4, '0'), ranges = [];
    for (let hi = 0; hi < 256; hi++) { if (hi >= 0xD8 && hi <= 0xDF) continue; const a = hi << 8; ranges.push(`<${h(a)}> <${h(a + 255)}> <${h(a)}>`); }
    let s = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < ranges.length; i += 100) { const part = ranges.slice(i, i + 100); s += `${part.length} beginbfrange\n${part.join('\n')}\nendbfrange\n`; }
    return s + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  }
  function embed(L, doc) {
    const ctx = doc.context, N = L.PDFName.of;
    const file = ctx.register(ctx.flateStream(ttf()));
    const desc = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'GlyphLessFont', Flags: 5, FontBBox: [0, 0, 500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80, FontFile2: file }));
    const gid = new Uint8Array(65536 * 2); for (let i = 1; i < gid.length; i += 2) gid[i] = 1;   // jede CID → Glyphe 1
    const map = ctx.register(ctx.flateStream(gid));
    const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'GlyphLessFont', CIDSystemInfo: { Registry: L.PDFString.of('Adobe'), Ordering: L.PDFString.of('Identity'), Supplement: 0 }, FontDescriptor: desc, DW: 500, CIDToGIDMap: map }));
    const tu = ctx.register(ctx.flateStream(toUnicode()));
    return ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'GlyphLessFont', Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: tu }));
  }
  const hex = text => [...String(text)].map(c => c.codePointAt(0)).filter(c => c < 0x10000 && (c < 0xD800 || c > 0xDFFF)).map(c => c.toString(16).toUpperCase().padStart(4, '0')).join('');
  const api = { ttf, toUnicode, embed, hex };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Glyphless = api;
})(typeof self !== 'undefined' ? self : this);
