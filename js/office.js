// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Word (.docx), Excel (.xlsx) und OpenDocument (.odt, .ods) lesen – ohne Server und ohne Bibliothek: ZIP über DecompressionStream, XML mit kleinem eigenem Parser.
   Ergebnis: Bausteine für js/textpdf.js (Überschriften, Absätze mit Ausrichtung/fett, Listen, Tabellen, Bilder, Seitenumbrüche).
   Office.docx(bytes) → { blocks, page: { size: [w, h], margin } }   Office.xlsx(bytes) → { blocks }
   Nicht nachgebildet: Kopf-/Fußzeilen, Textfelder, Spalten, Schriftarten und -größen im Einzelnen, Formeln (es zählt der gespeicherte Wert). */
(function (root) {
  'use strict';

  // ---------- ZIP lesen (zentrales Verzeichnis; Methode 0 = gespeichert, 8 = Deflate) ----------
  function readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), files = new Map();
    let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Keine gültige Office-Datei (ZIP-Verzeichnis fehlt).');
    let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      files.set(name, { method, csize, off });
      p += 46 + nlen + xlen + clen;
    }
    const get = async name => {
      const f = files.get(name); if (!f) return null;
      const lh = f.off, start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method !== 8) throw new Error('Nicht unterstützte Komprimierung in der Office-Datei.');
      const ds = new DecompressionStream('deflate-raw'), out = new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(out).arrayBuffer());
    };
    const text = async name => { const b = await get(name); return b ? new TextDecoder().decode(b) : null; };
    return { files, get, text };
  }

  // ---------- XML: kleiner Parser (Elemente, Attribute, Text) ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);
  function parseXml(s) {
    const rootEl = { name: '#root', attrs: {}, kids: [] }, stack = [rootEl];
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(s))) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) top.kids.push(m[1]);
      else if (m[2]) { if (stack.length > 1) stack.pop(); }
      else if (m[3]) {
        const el = { name: m[3], attrs: {}, kids: [] };
        for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[a[1]] = unesc(a[2] ?? a[3]);
        top.kids.push(el); if (!m[5]) stack.push(el);
      } else if (m[6] && !/^\s+$/.test(m[6]) || (m[6] && top.name === 'w:t')) top.kids.push(unesc(m[6]));
    }
    return rootEl;
  }
  const els = el => el.kids.filter(k => typeof k === 'object');
  const kid = (el, name) => el && els(el).find(k => k.name === name);
  const all = (el, name, out = []) => { for (const k of els(el)) { if (k.name === name) out.push(k); else all(k, name, out); } return out; };
  const txt = el => el.kids.map(k => typeof k === 'string' ? k : txt(k)).join('');
  const on = el => !!el && !['0', 'false', 'off'].includes(el.attrs['w:val']);   // <w:b/> oder <w:b w:val="1"/>

  // ---------- Word ----------
  async function docx(bytes) {
    const z = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const docXml = await z.text('word/document.xml'); if (!docXml) throw new Error('Keine Word-Datei (word/document.xml fehlt).');
    const doc = parseXml(docXml), body = all(doc, 'w:body')[0];
    // Formatvorlagen: Überschrift-Ebene aus dem eingebauten Namen („heading 1“, „Title“) oder der Gliederungsebene
    const styles = new Map();
    const sx = await z.text('word/styles.xml');
    if (sx) for (const s of all(parseXml(sx), 'w:style')) {
      const name = (kid(s, 'w:name')?.attrs['w:val'] || '').toLowerCase(), ol = kid(kid(s, 'w:pPr'), 'w:outlineLvl')?.attrs['w:val'];
      const h = /^heading (\d)$/.exec(name)?.[1] || (name === 'title' ? '1' : name === 'subtitle' ? '2' : ol != null ? String(+ol + 1) : null);
      styles.set(s.attrs['w:styleId'], { h: h ? Math.min(6, +h) : 0, bold: on(kid(kid(s, 'w:rPr'), 'w:b')), list: /list/.test(name) });
    }
    // Nummerierung: numId → Ebene → Format (bullet = Aufzählung)
    const nums = new Map(), abs = new Map();
    const nx = await z.text('word/numbering.xml');
    if (nx) {
      const N = parseXml(nx);
      for (const a of all(N, 'w:abstractNum')) abs.set(a.attrs['w:abstractNumId'], new Map(all(a, 'w:lvl').map(l => [l.attrs['w:ilvl'], kid(l, 'w:numFmt')?.attrs['w:val'] || 'decimal'])));
      for (const n of all(N, 'w:num')) nums.set(n.attrs['w:numId'], abs.get(kid(n, 'w:abstractNumId')?.attrs['w:val']));
    }
    // Bilder: Beziehungen rId → Datei
    const rels = new Map();
    const rx = await z.text('word/_rels/document.xml.rels');
    if (rx) for (const r of all(parseXml(rx), 'Relationship')) rels.set(r.attrs.Id, r.attrs.Target);
    const counters = new Map(), blocks = [];
    const image = async d => {
      const blip = all(d, 'a:blip')[0], ext = all(d, 'wp:extent')[0], id = blip?.attrs['r:embed'], target = id && rels.get(id);
      if (!target) return null;
      const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, ''), data = await z.get(path.replace(/\/[^/]+\/\.\.\//g, '/'));
      if (!data) return null;
      const mime = data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : null;
      const w = ext ? +ext.attrs.cx / 12700 : 200, h = ext ? +ext.attrs.cy / 12700 : 150;   // EMU → pt
      return mime ? { type: 'img', bytes: data, mime, w, h } : { type: 'p', text: '[Bild]' };
    };
    // Absatz → Text (+ Bilder/Seitenumbruch als eigene Bausteine)
    const para = async p => {
      const pPr = kid(p, 'w:pPr'), st = styles.get(kid(pPr, 'w:pStyle')?.attrs['w:val']) || { h: 0 };
      const jc = kid(pPr, 'w:jc')?.attrs['w:val'], align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : null;
      let text = '', runs = 0, boldRuns = 0; const extra = []; let pageBreak = false;
      const walk = async el => {
        for (const k of els(el)) {
          if (k.name === 'w:r') {
            const rPr = kid(k, 'w:rPr'), hidden = on(kid(rPr, 'w:vanish')); if (hidden) continue;
            let t = '';
            for (const c of els(k)) {
              if (c.name === 'w:t') t += txt(c);
              else if (c.name === 'w:tab') t += '\t';
              else if (c.name === 'w:br' || c.name === 'w:cr') { if (c.attrs['w:type'] === 'page') pageBreak = true; else t += '\n'; }
              else if (c.name === 'w:drawing' || c.name === 'w:pict') { const im = await image(c); if (im) extra.push(im); }
              else if (c.name === 'w:lastRenderedPageBreak') { /* nur Anzeige */ }
            }
            if (t.trim()) { runs++; if (on(kid(rPr, 'w:b')) || st.bold) boldRuns++; }
            text += t;
          } else if (['w:hyperlink', 'w:smartTag', 'w:ins', 'w:sdt', 'w:sdtContent', 'w:fldSimple', 'w:customXml'].includes(k.name)) await walk(k);
          else if (k.name === 'w:del') continue;
        }
      };
      await walk(p);
      if (kid(pPr, 'w:pageBreakBefore')) blocks.push({ type: 'pagebreak' });
      text = text.replace(/[ \u00a0]+\n/g, '\n').replace(/\s+$/, '');
      const numPr = kid(pPr, 'w:numPr'), numId = kid(numPr, 'w:numId')?.attrs['w:val'], ilvl = kid(numPr, 'w:ilvl')?.attrs['w:val'] || '0';
      if (text.trim()) {
        if (st.h) blocks.push({ type: 'h', level: st.h, text });
        else if (numId && numId !== '0') {
          const fmt = nums.get(numId)?.get(ilvl) || 'bullet', key = numId + ':' + ilvl, ord = fmt !== 'bullet' && fmt !== 'none';
          const n = (counters.get(key) || 0) + 1; counters.set(key, n);
          for (const [k2] of counters) if (k2.startsWith(numId + ':') && +k2.split(':')[1] > +ilvl) counters.delete(k2);   // Unterebenen neu zählen
          blocks.push({ type: 'li', ordered: ord, label: ord ? (fmt.includes('Letter') ? String.fromCharCode(96 + ((n - 1) % 26) + 1) + ')' : fmt.includes('Roman') ? ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][(n - 1) % 10] + '.' : n + '.') : '•', depth: Math.min(3, +ilvl), text });
        } else blocks.push({ type: 'p', text, align, bold: runs > 0 && boldRuns === runs });
      } else if (!extra.length && !pageBreak) blocks.push({ type: 'gap' });   // leere Zeile im Dokument
      for (const x of extra) blocks.push({ ...x, align: align || 'left' });
      if (pageBreak) blocks.push({ type: 'pagebreak' });
    };
    const table = async t => {
      const rows = [];
      let head = false;
      for (const tr of els(t).filter(k => k.name === 'w:tr')) {
        if (!rows.length && kid(kid(tr, 'w:trPr'), 'w:tblHeader')) head = true;
        const row = [];
        for (const tc of els(tr).filter(k => k.name === 'w:tc')) {
          const span = +(kid(kid(tc, 'w:tcPr'), 'w:gridSpan')?.attrs['w:val'] || 1);
          const cell = all(tc, 'w:p').map(p => all(p, 'w:t').map(txt).join('')).join('\n').trim();
          row.push(cell); for (let i = 1; i < span; i++) row.push('');
        }
        rows.push(row);
      }
      const n = Math.max(0, ...rows.map(r => r.length));
      if (n) blocks.push({ type: 'table', rows: rows.map(r => Array.from({ length: n }, (_, i) => r[i] ?? '')), head });
    };
    for (const k of els(body)) {
      if (k.name === 'w:p') await para(k);
      else if (k.name === 'w:tbl') await table(k);
      else if (k.name === 'w:sdt') for (const c of els(kid(k, 'w:sdtContent') || { kids: [] })) { if (c.name === 'w:p') await para(c); else if (c.name === 'w:tbl') await table(c); }
    }
    // Seitenformat aus dem letzten Abschnitt (Twips → pt)
    const sect = kid(body, 'w:sectPr'), sz = kid(sect, 'w:pgSz'), mar = kid(sect, 'w:pgMar');
    const page = { size: sz ? [+sz.attrs['w:w'] / 20, +sz.attrs['w:h'] / 20] : null, margin: mar ? Math.max(28, Math.min(85, +mar.attrs['w:left'] / 20 || 56.7)) : null };
    // aufeinanderfolgende Leerzeilen zusammenfassen, Leerzeilen am Ende weg
    const out = blocks.filter((b, i) => !(b.type === 'gap' && (i === 0 || blocks[i - 1].type === 'gap')));
    while (out.length && ['gap', 'pagebreak'].includes(out[out.length - 1].type)) out.pop();
    return { blocks: out, page };
  }

  // ---------- Excel ----------
  const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const DATE_FMT = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
  async function xlsx(bytes, { locale = 'de-DE' } = {}) {
    const z = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const wb = await z.text('xl/workbook.xml'); if (!wb) throw new Error('Keine Excel-Datei (xl/workbook.xml fehlt).');
    const sharedXml = await z.text('xl/sharedStrings.xml'), shared = sharedXml ? all(parseXml(sharedXml), 'si').map(si => all(si, 't').map(txt).join('')) : [];
    // Datumsformate erkennen (eingebaute und eigene Formate mit d/m/y)
    const dateStyle = [], numStyle = [];   // je Zellformat: Datum? Nachkommastellen/Prozent/Währung
    const stx = await z.text('xl/styles.xml');
    if (stx) {
      const S = parseXml(stx), custom = new Map(all(S, 'numFmt').map(f => [+f.attrs.numFmtId, f.attrs.formatCode || '']));
      const xfs = kid(all(S, 'cellXfs')[0] || { kids: [] }, 'xf') ? els(all(S, 'cellXfs')[0]).filter(x => x.name === 'xf') : [];
      for (const xf of xfs) {
        const id = +xf.attrs.numFmtId, code = custom.get(id) || ({ 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%' })[id] || '';
        const dec = (/0[.,](0+)/.exec(code.split(';')[0]) || [, ''])[1].length;
        numStyle.push(code ? { dec, pct: /%/.test(code), cur: /€|EUR/.test(code) } : null);
        dateStyle.push(DATE_FMT.has(id) || (custom.has(id) && /(^|[^"\\])[dmy]{1,4}/i.test(custom.get(id).replace(/\[[^\]]*\]/g, '')) && !/^[#0.,%]+$/.test(custom.get(id)))); }
    }
    const rels = new Map(); const rx = await z.text('xl/_rels/workbook.xml.rels');
    if (rx) for (const r of all(parseXml(rx), 'Relationship')) rels.set(r.attrs.Id, r.attrs.Target);
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 10 }), df = new Intl.DateTimeFormat(locale);
    const blocks = [], sheets = all(parseXml(wb), 'sheet').filter(s => s.attrs.state !== 'hidden');
    for (const s of sheets) {
      const target = rels.get(s.attrs['r:id']); if (!target) continue;
      const xml = await z.text(target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')); if (!xml) continue;
      const rows = [];
      for (const r of all(parseXml(xml), 'row')) {
        const ri = +r.attrs.r - 1 || rows.length, row = [];
        for (const c of els(r).filter(k => k.name === 'c')) {
          const t = c.attrs.t, v = kid(c, 'v'), raw = v ? txt(v) : '';
          let val = '';
          if (t === 's') val = shared[+raw] ?? '';
          else if (t === 'inlineStr') val = all(c, 't').map(txt).join('');
          else if (t === 'b') val = raw === '1' ? 'WAHR' : 'FALSCH';
          else if (t === 'str' || t === 'e') val = raw;
          else if (raw !== '') {
            const num = +raw, si = +c.attrs.s || 0, ns = numStyle[si];
            if (dateStyle[si] && num > 0 && num < 2958466) val = df.format(new Date(Math.round((num - 25569) * 864e5)));
            else if (ns && !Number.isNaN(num)) val = new Intl.NumberFormat(locale, { minimumFractionDigits: ns.dec, maximumFractionDigits: ns.dec, style: ns.pct ? 'percent' : 'decimal' }).format(num) + (ns.cur ? ' €' : '');   // wie in Excel angezeigt
            else val = nf.format(num);
          }
          row[c.attrs.r ? colIdx(c.attrs.r) : row.length] = val;
        }
        rows[ri] = row;
      }
      const dense = rows.filter(Boolean).map(r => Array.from(r, x => x ?? ''));
      // leere Spalten am Rand weglassen
      let n = Math.max(0, ...dense.map(r => r.length)); while (n > 0 && dense.every(r => !r[n - 1])) n--;
      let first = 0; while (first < n && dense.every(r => !r[first])) first++;
      const tbl = dense.map(r => Array.from({ length: n - first }, (_, i) => r[first + i] ?? '')).filter(r => r.some(Boolean));
      if (!tbl.length) continue;
      blocks.push({ type: 'h', level: 2, text: s.attrs.name }, { type: 'table', rows: tbl, head: true });
    }
    if (blocks.length === 2) blocks.shift();   // nur ein Blatt mit Werten: ohne Blattüberschrift
    if (!blocks.length) throw new Error('Die Excel-Datei enthält keine Werte.');
    return { blocks };
  }


  // ---------- OpenDocument (LibreOffice/OpenOffice): .odt Text, .ods Tabelle ----------
  const len = v => { const m = /^([\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(v || '').trim()); if (!m) return 0; return +m[1] * ({ cm: 28.3465, mm: 2.83465, in: 72, pt: 1, pc: 12, px: 0.75 }[m[2] || 'pt']); };
  async function odfParts(bytes, want) {
    const z = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const mt = (await z.text('mimetype') || '').trim(), xml = await z.text('content.xml');
    if (!xml || !mt.startsWith('application/vnd.oasis.opendocument.' + want)) throw new Error(want === 'text' ? 'Keine OpenDocument-Textdatei (.odt).' : 'Keine OpenDocument-Tabelle (.ods).');
    const doc = parseXml(xml), st = await z.text('styles.xml');
    // Absatz-/Zeichenformate: fett, Ausrichtung, Überschrift; Listenformate: nummeriert?
    const styles = new Map(), lists = new Map();
    for (const src of [doc, st ? parseXml(st) : null].filter(Boolean)) {
      for (const s of all(src, 'style:style')) {
        const tp = kid(s, 'style:text-properties'), pp = kid(s, 'style:paragraph-properties');
        styles.set(s.attrs['style:name'], { bold: tp?.attrs['fo:font-weight'] === 'bold', align: pp?.attrs['fo:text-align'], parent: s.attrs['style:parent-style-name'], h: /^(Heading|Title)/.test(s.attrs['style:name'] || '') ? (+(/\d/.exec(s.attrs['style:name']) || [1])[0] || 1) : 0 });
      }
      for (const l of all(src, 'text:list-style')) { const first = els(l)[0]; lists.set(l.attrs['style:name'], first?.name === 'text:list-level-style-number'); }
    }
    const sty = name => { let s = styles.get(name), bold = false, align = null, h = 0, n = 0; while (s && n++ < 5) { bold ||= s.bold; align ||= s.align; h ||= s.h; s = styles.get(s.parent); } return { bold, align, h }; };
    return { z, doc, sty, lists, st };
  }
  // Text eines Absatzes (Leerzeichen-, Tab- und Zeilenumbruch-Elemente), Fettdruck aller Teile
  function odfText(el, sty) {
    let t = '', runs = 0, bold = 0;
    const walk = (e, b) => {
      for (const k of e.kids) {
        if (typeof k === 'string') { t += k; if (k.trim()) { runs++; if (b) bold++; } continue; }
        if (k.name === 'text:s') t += ' '.repeat(+k.attrs['text:c'] || 1);
        else if (k.name === 'text:tab') t += '\t';
        else if (k.name === 'text:line-break') t += '\n';
        else if (k.name === 'text:note' || k.name === 'office:annotation') continue;
        else walk(k, b || (k.name === 'text:span' && sty(k.attrs['text:style-name']).bold));
      }
    };
    walk(el, sty(el.attrs['text:style-name']).bold);
    return { text: t.replace(/\s+$/, ''), allBold: runs > 0 && bold === runs };
  }
  async function odt(bytes) {
    const { z, doc, sty, lists, st } = await odfParts(bytes, 'text'), blocks = [], body = all(doc, 'office:text')[0];
    const image = async fr => {
      const im = kid(fr, 'draw:image'), href = im?.attrs['xlink:href']; if (!href || /^https?:/.test(href)) return null;
      const data = await z.get(href.replace(/^\.\//, '')); if (!data) return null;
      const mime = data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : null;
      return mime ? { type: 'img', bytes: data, mime, w: len(fr.attrs['svg:width']) || 200, h: len(fr.attrs['svg:height']) || 150 } : { type: 'p', text: '[Bild]' };
    };
    const para = async (p, extra = {}) => {
      const { text, allBold } = odfText(p, sty), s = sty(p.attrs['text:style-name']);
      for (const fr of all(p, 'draw:frame')) { const im = await image(fr); if (im) blocks.push({ ...im, align: s.align === 'center' ? 'center' : s.align === 'end' || s.align === 'right' ? 'right' : 'left' }); }
      if (!text.trim()) { if (!all(p, 'draw:frame').length) blocks.push({ type: 'gap' }); return; }
      if (p.name === 'text:h') blocks.push({ type: 'h', level: Math.min(6, +p.attrs['text:outline-level'] || 1), text });
      else if (extra.li) blocks.push({ type: 'li', ...extra.li, text });
      else if (s.h) blocks.push({ type: 'h', level: Math.min(6, s.h), text });
      else blocks.push({ type: 'p', text, bold: allBold, align: s.align === 'center' ? 'center' : s.align === 'end' || s.align === 'right' ? 'right' : null });
    };
    const list = async (l, depth = 0, ordered = null) => {
      const ord = ordered ?? lists.get(l.attrs['text:style-name']) ?? false; let n = 0;
      for (const it of els(l).filter(k => k.name === 'text:list-item')) {
        n++;
        for (const c of els(it)) {
          if (c.name === 'text:p' || c.name === 'text:h') await para(c, { li: { ordered: ord, label: ord ? n + '.' : '•', depth: Math.min(3, depth) } });
          else if (c.name === 'text:list') await list(c, depth + 1, ord);
        }
      }
    };
    const table = t => {
      const rows = [];
      for (const tr of all(t, 'table:table-row')) {
        const row = [];
        for (const tc of els(tr).filter(k => k.name === 'table:table-cell' || k.name === 'table:covered-table-cell')) {
          const v = all(tc, 'text:p').map(p => odfText(p, sty).text).join('\n').trim(), rep = Math.min(50, +tc.attrs['table:number-columns-repeated'] || 1);
          for (let i = 0; i < rep; i++) row.push(v);
        }
        rows.push(row);
      }
      let n = Math.max(0, ...rows.map(r => r.length)); while (n > 0 && rows.every(r => !r[n - 1])) n--;
      if (n) blocks.push({ type: 'table', rows: rows.filter(r => r.some(Boolean)).map(r => Array.from({ length: n }, (_, i) => r[i] ?? '')), head: !!all(t, 'table:table-header-rows').length });
    };
    const walk = async el => {
      for (const k of els(el)) {
        if (k.name === 'text:p' || k.name === 'text:h') await para(k);
        else if (k.name === 'text:list') await list(k);
        else if (k.name === 'table:table') table(k);
        else if (k.name === 'text:section' || k.name === 'text:soft-page-break') await walk(k);
      }
    };
    await walk(body);
    // Seitenformat aus styles.xml
    let page = { size: null, margin: null };
    if (st) { const pl = all(parseXml(st), 'style:page-layout-properties')[0]; if (pl) page = { size: [len(pl.attrs['fo:page-width']), len(pl.attrs['fo:page-height'])].every(v => v > 100) ? [len(pl.attrs['fo:page-width']), len(pl.attrs['fo:page-height'])] : null, margin: len(pl.attrs['fo:margin-left']) ? Math.max(28, Math.min(85, len(pl.attrs['fo:margin-left']))) : null }; }
    const out = blocks.filter((b, i) => !(b.type === 'gap' && (i === 0 || blocks[i - 1].type === 'gap')));
    while (out.length && out[out.length - 1].type === 'gap') out.pop();
    return { blocks: out, page };
  }
  async function ods(bytes, { locale = 'de-DE' } = {}) {
    const { doc } = await odfParts(bytes, 'spreadsheet'), blocks = [];
    const nf = (v, t) => { const n = +v; if (Number.isNaN(n)) return v; return t === 'percentage' ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(n) : t === 'currency' ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €' : new Intl.NumberFormat(locale, { maximumFractionDigits: 10 }).format(n); };
    for (const t of all(doc, 'table:table')) {
      const rows = [];
      for (const tr of all(t, 'table:table-row')) {
        const row = [];
        for (const tc of els(tr).filter(k => k.name === 'table:table-cell' || k.name === 'table:covered-table-cell')) {
          const vt = tc.attrs['office:value-type'], txt0 = all(tc, 'text:p').map(txt).join('\n');
          const v = vt === 'date' && tc.attrs['office:date-value'] ? new Intl.DateTimeFormat(locale).format(new Date(tc.attrs['office:date-value'])) : ['float', 'percentage', 'currency'].includes(vt) && tc.attrs['office:value'] != null ? nf(tc.attrs['office:value'], vt) : txt0;
          const rep = Math.min(100, +tc.attrs['table:number-columns-repeated'] || 1);   // leere Restspalten werden oft tausendfach wiederholt
          for (let i = 0; i < rep; i++) row.push(v);
        }
        const rrep = Math.min(row.some(Boolean) ? 100 : 1, +tr.attrs['table:number-rows-repeated'] || 1);
        for (let i = 0; i < rrep; i++) rows.push(row);
      }
      let n = Math.max(0, ...rows.map(r => r.length)); while (n > 0 && rows.every(r => !r[n - 1])) n--;
      const tbl = rows.map(r => Array.from({ length: n }, (_, i) => r[i] ?? '')).filter(r => r.some(Boolean));
      if (tbl.length) blocks.push({ type: 'h', level: 2, text: t.attrs['table:name'] || '' }, { type: 'table', rows: tbl, head: true });
    }
    if (blocks.length === 2) blocks.shift();
    if (!blocks.length) throw new Error('Die Tabelle enthält keine Werte.');
    return { blocks };
  }


  // ---------- EPUB (E-Books): container.xml → OPF → Lesereihenfolge (spine) → XHTML-Kapitel ----------
  const resolve = (base, href) => { const parts = (base.replace(/[^/]*$/, '') + href.split('#')[0]).split('/'), out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); } return out.join('/'); };
  const tag = el => (el.name || '').replace(/^[^:]+:/, '').toLowerCase();
  async function epub(bytes) {
    const z = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const cont = await z.text('META-INF/container.xml'); if (!cont) throw new Error('Keine EPUB-Datei (META-INF/container.xml fehlt).');
    const opfPath = all(parseXml(cont), 'rootfile')[0]?.attrs['full-path']; if (!opfPath) throw new Error('EPUB ohne Inhaltsverzeichnis (OPF).');
    const opf = parseXml(await z.text(opfPath) || ''), find = (el, n) => { const out = []; (function w(e) { for (const k of els(e)) { if (tag(k) === n) out.push(k); w(k); } })(el); return out; };
    const items = new Map(find(opf, 'item').map(i => [i.attrs.id, i.attrs]));
    const title = find(opf, 'title')[0] ? txt(find(opf, 'title')[0]).trim() : '';
    const blocks = [];
    if (title) blocks.push({ type: 'h', level: 1, text: title });
    const textOf = el => {   // Text mit Zeilenumbrüchen (<br>) und ohne Skripte/Stile
      let s = ''; (function w(e) { for (const k of e.kids) { if (typeof k === 'string') s += k.replace(/\s+/g, ' '); else if (tag(k) === 'br') s += '\n'; else if (!['script', 'style'].includes(tag(k))) w(k); } })(el);
      return s.replace(/ ?\n ?/g, '\n').replace(/ {2,}/g, ' ').trim();
    };
    for (const ref of find(opf, 'itemref')) {
      const it = items.get(ref.attrs.idref); if (!it || !/x?html/.test(it['media-type'] || 'xhtml')) continue;
      const path = resolve(opfPath, it.href), xml = await z.text(path); if (!xml) continue;
      const body = find(parseXml(xml), 'body')[0]; if (!body) continue;
      if (blocks.length > (title ? 1 : 0)) blocks.push({ type: 'pagebreak' });   // jedes Kapitel auf neuer Seite
      const walk = async (el, depth = 0, ordered = false) => {
        for (const k of els(el)) {
          const t = tag(k);
          if (/^h[1-6]$/.test(t)) { const s = textOf(k); if (s) blocks.push({ type: 'h', level: Math.min(6, +t[1] + (title ? 1 : 0)), text: s }); }
          else if (t === 'p') {
            for (const im of find(k, 'img')) await img(im, path);
            const s = textOf(k); if (s) blocks.push({ type: 'p', text: s, align: /center/.test(k.attrs.style || '') || /center/.test(k.attrs.class || '') ? 'center' : null });
          }
          else if (t === 'ul' || t === 'ol') { let n = 0; for (const li of els(k).filter(x => tag(x) === 'li')) { n++; const sub = els(li).filter(x => ['ul', 'ol'].includes(tag(x))); const clone = { ...li, kids: li.kids.filter(x => !sub.includes(x)) }; const s = textOf(clone); if (s) blocks.push({ type: 'li', ordered: t === 'ol', label: t === 'ol' ? n + '.' : '•', depth: Math.min(3, depth), text: s }); for (const sl of sub) await walk({ kids: [sl] }, depth + 1); } }
          else if (t === 'table') { const rows = find(k, 'tr').map(tr => els(tr).filter(c => ['td', 'th'].includes(tag(c))).map(textOf)); const n = Math.max(0, ...rows.map(r => r.length)); if (n) blocks.push({ type: 'table', rows: rows.map(r => Array.from({ length: n }, (_, i) => r[i] ?? '')), head: !!find(k, 'th').length }); }
          else if (t === 'blockquote') { const s = textOf(k); if (s) blocks.push({ type: 'p', text: s }); }
          else if (t === 'pre') { const s = txt(k).replace(/\s+$/, ''); if (s) blocks.push({ type: 'p', text: s }); }
          else if (t === 'img' || t === 'image') await img(k, path);
          else if (t === 'hr') blocks.push({ type: 'gap' });
          else if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'figure', 'nav', 'span', 'a', 'svg', 'body'].includes(t)) {
            // Container mit direktem Text (ohne Absatz-Elemente) als eigener Absatz
            const direct = k.kids.filter(x => typeof x === 'string').join('').trim();
            if (direct && !els(k).some(x => ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table'].includes(tag(x)))) { const s = textOf(k); if (s) blocks.push({ type: 'p', text: s }); }
            else await walk(k, depth);
          }
        }
      };
      await walk(body);
    }
    async function img(el, base) {
      const href = el.attrs.src || el.attrs['xlink:href'] || el.attrs.href; if (!href || /^(https?:|data:)/.test(href)) return;
      const data = await z.get(resolve(base, decodeURIComponent(href))); if (!data) return;
      const mime = data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : null; if (!mime) return;
      // Größe aus dem Bild selbst (PNG: IHDR, JPEG: SOF), 96 dpi
      let w = 300, h = 200;
      if (mime === 'image/png') { const dv = new DataView(data.buffer, data.byteOffset); w = dv.getUint32(16); h = dv.getUint32(20); }
      else for (let i = 2; i < data.length - 9;) { if (data[i] !== 0xff) break; const m = data[i + 1], l = (data[i + 2] << 8) | data[i + 3]; if (m >= 0xc0 && m <= 0xc3) { h = (data[i + 5] << 8) | data[i + 6]; w = (data[i + 7] << 8) | data[i + 8]; break; } i += 2 + l; }
      blocks.push({ type: 'img', bytes: data, mime, w: w * 0.75, h: h * 0.75, align: 'center' });
    }
    const out = blocks.filter((b, i) => !(b.type === 'pagebreak' && blocks[i - 1]?.type === 'pagebreak'));
    if (out.length <= (title ? 1 : 0)) throw new Error('Das E-Book enthält keinen lesbaren Text (oder ist kopiergeschützt).');
    return { blocks: out, page: { size: [419.53, 595.28], margin: 42.5 }, title };   // A5 – handlich wie ein Buch
  }

  const api = { readZip, parseXml, docx, xlsx, odt, ods, epub };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Office = api;
})(typeof self !== 'undefined' ? self : this);
