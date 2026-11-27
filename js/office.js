// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Word (.docx), Excel (.xlsx) und OpenDocument (.odt, .ods) lesen – ohne Server und ohne Bibliothek: ZIP über DecompressionStream, XML mit kleinem eigenem Parser.
   Ergebnis: Bausteine für js/textpdf.js (Überschriften, Absätze mit Ausrichtung/fett, Listen, Tabellen, Bilder, Seitenumbrüche).
   Office.docx(bytes) → { blocks, page: { size: [w, h], margin } }   Office.xlsx(bytes) → { blocks }
   Nicht nachgebildet: Textfelder, Spalten, Schriftarten und -größen im Einzelnen, Formeln (es zählt der gespeicherte Wert). */
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
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      files.set(name, { method, csize, usize, off, locked: !!(flags & 1) });
      p += 46 + nlen + xlen + clen;
    }
    const get = async (name, limit = Infinity) => {   // limit: höchstens so viele Bytes auspacken (Schutz, falls das Verzeichnis eine falsche Größe angibt)
      const f = files.get(name); if (!f) return null;
      const lh = f.off, start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.locked) throw new Error('Das Archiv ist mit Kennwort verschlüsselt – bitte zuerst auspacken und die Dateien einzeln öffnen.');
      if (f.method === 0) return data;
      if (f.method !== 8) throw new Error('Nicht unterstützte Komprimierung in der Office-Datei.');
      const ds = new DecompressionStream('deflate-raw'), out = new Blob([data]).stream().pipeThrough(ds);
      if (limit === Infinity) return new Uint8Array(await new Response(out).arrayBuffer());
      const rd = out.getReader(), parts = []; let n = 0;
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        if ((n += value.length) > limit) { rd.cancel().catch(() => {}); throw Object.assign(new Error(), { tooBig: true }); }
        parts.push(value);
      }
      const r = new Uint8Array(n); let o = 0; for (const p of parts) { r.set(p, o); o += p.length; } return r;
    };
    const text = async name => { const b = await get(name); return b ? new TextDecoder().decode(b) : null; };
    return { files, get, text };
  }

  // ---------- ZIP und Comic-Archiv (CBZ): Dateien auspacken, die PDFMy öffnen kann – natürliche Reihenfolge (Seite 2 vor Seite 10) ----------
  // Grenzen gegen ZIP-Bomben: höchstens ARCHIVE_FILES Dateien und ARCHIVE_MB ausgepackt. Archive im Archiv, Systemdateien und
  // bei CBZ alles außer Bildern (z. B. ComicInfo.xml) bleiben liegen.
  const ARCHIVE_FILES = 2000, ARCHIVE_MB = 1500;
  const IMG_EXT = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif|psd)$/i;
  const OPEN_EXT = /\.(pdf|jpe?g|png|webp|bmp|gif|tiff?|heic|heif|psd|psb|txt|md|markdown|csv|docx|xlsx|doc|xls|odt|ods|odp|pptx|ppsx|potx|epub|rtf|o?xps|xml|eml|msg|html?|xhtml|mht|mhtml)$/i;
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', pdf: 'application/pdf' };
  function archiveList(z, comic) {
    const coll = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
    return [...z.files.entries()].filter(([n, f]) => !n.endsWith('/') && !/(^|\/)(__MACOSX\/|\.|thumbs\.db$|desktop\.ini$)/i.test(n) && (comic ? IMG_EXT : OPEN_EXT).test(n) && f.usize !== 0)
      .map(([n]) => n).sort(coll.compare);
  }
  async function archive(bytes, { comic = false } = {}) {
    const z = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)), names = archiveList(z, comic);
    if (names.length > ARCHIVE_FILES) throw new Error(`Das Archiv enthält ${names.length} Dateien – PDFMy öffnet höchstens ${ARCHIVE_FILES} auf einmal.`);
    const tooBig = () => new Error(`Ausgepackt wäre das Archiv größer als ${ARCHIVE_MB} MB – bitte zuerst auspacken und die Dateien einzeln öffnen.`);
    if (names.reduce((a, n) => a + z.files.get(n).usize, 0) > ARCHIVE_MB * 1e6) throw tooBig();
    const out = []; let left = ARCHIVE_MB * 1e6;
    for (const n of names) {
      let data; try { data = await z.get(n, left); } catch (e) { throw e.tooBig ? tooBig() : e; }
      if ((left -= data.length) < 0) throw tooBig();
      const base = n.split('/').pop(), ext = base.toLowerCase().split('.').pop();
      out.push({ name: base, path: n, data, type: MIME[ext] || '' });
    }
    return out;
  }

  // ---------- Photoshop (PSD/PSB): nur das gespeicherte Gesamtbild („Kompatibilität maximieren“), keine Ebenen ----------
  // Farbmodi Bitmap, Graustufen, Indiziert, RGB, CMYK, Duplex (als Graustufen); 8, 16 oder 32 Bit; roh oder PackBits (RLE).
  // Ergebnis: { width, height, rgba } – Transparenz ist im Gesamtbild schon auf Weiß verrechnet, Zusatzkanäle bleiben unbeachtet.
  const PSD_MAX_PX = 120e6;
  function psd(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 30 || dv.getUint32(0) !== 0x38425053) throw new Error('Keine gültige Photoshop-Datei.');
    const ver = dv.getUint16(4), big = ver === 2, nch = dv.getUint16(12), h = dv.getUint32(14), w = dv.getUint32(18), depth = dv.getUint16(22), mode = dv.getUint16(24);
    if (ver !== 1 && ver !== 2) throw new Error('Keine gültige Photoshop-Datei.');
    if (!w || !h || w * h > PSD_MAX_PX) throw new Error(`Das Photoshop-Bild ist mit ${w} × ${h} Pixeln zu groß für den Browser.`);
    if (![1, 8, 16, 32].includes(depth) || ![0, 1, 2, 3, 4, 8].includes(mode)) throw new Error('Dieser Photoshop-Farbmodus wird nicht unterstützt (z. B. Lab oder Mehrkanal) – bitte in Photoshop als RGB speichern.');
    let p = 26; const cmLen = dv.getUint32(p), palette = u8.subarray(p + 4, p + 4 + cmLen); p += 4 + cmLen;
    p += 4 + dv.getUint32(p);                                                                // Bildressourcen
    p += big ? 8 + Number(dv.getBigUint64(p)) : 4 + dv.getUint32(p);                         // Ebenen und Masken – übersprungen
    const comp = dv.getUint16(p); p += 2;
    if (comp > 1) throw new Error('Das Gesamtbild dieser Photoshop-Datei ist mit ZIP gepackt – bitte in Photoshop mit „Kompatibilität maximieren“ speichern oder als PNG/JPG exportieren.');
    const rowBytes = depth === 1 ? Math.ceil(w / 8) : w * depth / 8, use = Math.min(nch, mode === 4 ? 4 : mode === 3 ? 3 : 1);
    const plane = new Uint8Array(rowBytes * h), pdv = new DataView(plane.buffer), planes = [];
    let counts = null;
    if (comp === 1) { counts = p; p += nch * h * (big ? 4 : 2); }
    for (let c = 0; c < use; c++) {
      const out = new Uint8Array(w * h);
      if (comp === 0) plane.set(u8.subarray(p, p + rowBytes * h)), p += rowBytes * h;
      else for (let y = 0; y < h; y++) {
        const ci = counts + (c * h + y) * (big ? 4 : 2), n = big ? dv.getUint32(ci) : dv.getUint16(ci), end = p + n;
        let o = y * rowBytes; const stop = o + rowBytes;
        while (p < end && o < stop) {
          const k = u8[p] > 127 ? u8[p] - 256 : u8[p]; p++;
          if (k >= 0) { const m = Math.min(k + 1, stop - o); plane.set(u8.subarray(p, p + m), o); o += m; p += k + 1; }
          else if (k !== -128) { plane.fill(u8[p], o, Math.min(stop, o + 1 - k)); o += 1 - k; p++; }
        }
        p = end;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const r = y * rowBytes;
        out[y * w + x] = depth === 8 ? plane[r + x] : depth === 16 ? plane[r + 2 * x] : depth === 1 ? ((plane[r + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255)
          : Math.round(Math.min(1, Math.max(0, pdv.getFloat32(r + 4 * x))) ** (1 / 2.2) * 255)   // 32 Bit: lineare Gleitkommawerte;
      }
      planes.push(out);
    }
    if (planes.length < use) throw new Error('Das Gesamtbild der Photoshop-Datei ist unvollständig.');
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      let r, g, b;
      if (mode === 3 && use === 3) { r = planes[0][i]; g = planes[1][i]; b = planes[2][i]; }
      else if (mode === 4 && use === 4) { const k = planes[3][i] / 255; r = planes[0][i] * k; g = planes[1][i] * k; b = planes[2][i] * k; }   // PSD speichert CMYK invertiert (255 = keine Farbe)
      else if (mode === 2 && palette.length >= 768) { const v = planes[0][i]; r = palette[v]; g = palette[256 + v]; b = palette[512 + v]; }
      else r = g = b = planes[0][i];
      rgba[j] = r; rgba[j + 1] = g; rgba[j + 2] = b; rgba[j + 3] = 255;
    }
    return { width: w, height: h, rgba };
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
      } else if (m[6] && !/^\s+$/.test(m[6]) || (m[6] && /^(w:t|a:t|text:p|text:span|text:h|text:a)$/.test(top.name))) top.kids.push(unesc(m[6]));   // Leerzeichen-Läufe (Word, PowerPoint, Impress) erhalten
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
    /* Hauptschrift des Dokuments (app-v345): Standard-Absatzformat, sonst Dokumentvorgaben; Designschrift (minorHAnsi …) aus theme1.xml.
       Die App setzt damit eine laufweitengleiche Schrift ein (Arial → Liberation Sans, Calibri → Carlito-Art …) – Zeilen- und
       Seitenumbrüche wie im Original statt der breiteren DejaVu (Messung 24.11.2026: Protokoll 2 statt 1 Seite). */
    let font = '';
    if (sx) {
      const S = parseXml(sx), rf = rp => { const f = kid(rp, 'w:rFonts'); return !f ? '' : f.attrs['w:ascii'] || f.attrs['w:hAnsi'] || (f.attrs['w:asciiTheme'] || f.attrs['w:hAnsiTheme'] ? '@' + (f.attrs['w:asciiTheme'] || f.attrs['w:hAnsiTheme']) : ''); };
      const paras = all(S, 'w:style').filter(s => s.attrs['w:type'] === 'paragraph');
      const normal = paras.find(s => s.attrs['w:default'] === '1') || paras.find(s => /^(Normal|Standard)$/i.test(s.attrs['w:styleId'] || ''));
      const dd = all(S, 'w:docDefaults')[0];
      font = (normal && rf(kid(normal, 'w:rPr'))) || (dd && rf(kid(kid(dd, 'w:rPrDefault'), 'w:rPr'))) || '';
      // direkt formatierte Schrift (häufigste an den Textstellen) geht vor – viele Dokumente setzen die Schrift nicht über die Vorlage
      const cnt = new Map(); for (const m of docXml.matchAll(/<w:rFonts\b[^>]*\bw:ascii="([^"]+)"/g)) cnt.set(m[1], (cnt.get(m[1]) || 0) + 1);
      const top = [...cnt].sort((a, b) => b[1] - a[1])[0], runs = (docXml.match(/<w:r>|<w:r /g) || []).length;
      if (top && top[1] >= 3 && top[1] >= runs * 0.4) font = top[0];
      if (font.startsWith('@')) {
        const th = await z.text('word/theme/theme1.xml'), minor = /minor/i.test(font);
        const m = th && new RegExp(`<a:${minor ? 'minor' : 'major'}Font>\\s*<a:latin typeface="([^"]*)"`).exec(th);
        font = m ? m[1] : '';
      }
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
    const relsOf = async part => { const m = new Map(), x = await z.text(part.replace(/([^/]+)$/, '_rels/$1.rels')); if (x) for (const r of all(parseXml(x), 'Relationship')) m.set(r.attrs.Id, r.attrs.Target); return m; };
    let rels = await relsOf('word/document.xml');
    const counters = new Map(); let blocks = [];
    /* Fußnoten und Endnoten (app-v304): Verweis im Text als hochgestellte Zahl, der Wortlaut am Ende des Dokuments
       (Fußnoten unter „Fußnoten“, Endnoten unter „Endnoten“). Trennlinien-Einträge (separator) zählen nicht. */
    const notesOf = async part => {
      const m = new Map(), x = await z.text(part); if (!x) return m;
      for (const n of [...all(parseXml(x), 'w:footnote'), ...all(parseXml(x), 'w:endnote')]) {
        if (n.attrs['w:type'] && n.attrs['w:type'] !== 'normal') continue;
        const t = all(n, 'w:p').map(p => all(p, 'w:t').map(txt).join('')).join(' ').replace(/\s+/g, ' ').trim();
        if (t) m.set(n.attrs['w:id'], t);
      }
      return m;
    };
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', sup = n => String(n).split('').map(d => SUP[+d]).join('');
    const fnText = await notesOf('word/footnotes.xml'), enText = await notesOf('word/endnotes.xml');
    const fnUsed = [], enUsed = [];   // [Nummer, Text] in der Reihenfolge der Verweise
    const noteRef = (c, used, texts) => { const t = texts.get(c.attrs['w:id']); if (!t) return ''; used.push([used.length + 1, t]); return sup(used.length); };
    const boxes = [];   // Textfelder (Formen mit Text) eines Absatzes – nach dem Absatz ausgegeben, damit kein Text verloren geht
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
      let text = '', runs = 0, boldRuns = 0, fieldSkip = false; const extra = [], parts = []; let pageBreak = false;
      const field = instr => /\bNUMPAGES\b/.test(instr) ? '{NUMPAGES}' : /\bPAGE\b/.test(instr) ? '{PAGE}' : null;
      const walk = async el => {
        for (const k of els(el)) {
          if (k.name === 'w:r') {
            const rPr = kid(k, 'w:rPr'), hidden = on(kid(rPr, 'w:vanish')); if (hidden) continue;
            let t = '';
            for (const c of els(k)) {
              // Felder: Seitenzahl/Seitenanzahl als Platzhalter, zwischengespeichertes Ergebnis überspringen
              if (c.name === 'w:fldChar') { const ty = c.attrs['w:fldCharType']; if (ty === 'end') fieldSkip = false; continue; }
              if (c.name === 'w:instrText') { const fd = field(txt(c)); if (fd) { t += fd; fieldSkip = true; } continue; }
              if (fieldSkip) continue;
              if (c.name === 'w:t') t += txt(c);
              else if (c.name === 'w:tab') t += '\t';
              else if (c.name === 'w:br' || c.name === 'w:cr') { if (c.attrs['w:type'] === 'page') pageBreak = true; else t += '\n'; }
              else if (c.name === 'w:drawing' || c.name === 'w:pict' || c.name === 'mc:AlternateContent') {
                // Neuere Word-Fassungen legen Formen doppelt ab (mc:Choice für Word 2010+, mc:Fallback als VML) – nur eine Fassung nehmen
                const d = c.name === 'mc:AlternateContent' ? (kid(c, 'mc:Choice') || kid(c, 'mc:Fallback')) : c; if (!d) continue;
                const tb = all(d, 'w:txbxContent');
                if (tb.length) boxes.push(...tb); else { const im = await image(d); if (im) extra.push(im); }
              }
              else if (c.name === 'w:footnoteReference') t += noteRef(c, fnUsed, fnText);
              else if (c.name === 'w:endnoteReference') t += noteRef(c, enUsed, enText);
              else if (c.name === 'w:lastRenderedPageBreak') { /* nur Anzeige */ }
            }
            const bo = on(kid(rPr, 'w:b')) || !!st.bold, it = on(kid(rPr, 'w:i'));
            if (t.trim()) { runs++; if (bo) boldRuns++; }
            if (t) { const last = parts[parts.length - 1]; if (last && last.b === bo && last.i === it) last.t += t; else parts.push({ t, b: bo, i: it }); }
            text += t;
          } else if (k.name === 'w:fldSimple' && field(k.attrs['w:instr'] || '')) { const fd = field(k.attrs['w:instr']); text += fd; parts.push({ t: fd, b: false, i: false }); }
          else if (['w:hyperlink', 'w:smartTag', 'w:ins', 'w:sdt', 'w:sdtContent', 'w:fldSimple', 'w:customXml'].includes(k.name)) await walk(k);
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
        } else {
          // gemischte Schnitte (fett/kursiv innerhalb des Absatzes): Textstücke mitgeben
          const mixed = parts.some(x => x.i && x.t.trim()) || (boldRuns > 0 && boldRuns < runs);
          blocks.push({ type: 'p', text, align, bold: runs > 0 && boldRuns === runs, ...(mixed ? { runs: parts.map(x => ({ ...x, t: x.t.replace(/[ \u00a0]+\n/g, '\n') })) } : {}) });
        }
      } else if (!extra.length && !pageBreak) blocks.push({ type: 'gap' });   // leere Zeile im Dokument
      for (const x of extra) blocks.push({ ...x, align: align || 'left' });
      // Textfelder: Inhalt als eigene Absätze (verschachtelte Textfelder werden dabei ebenfalls aufgelöst)
      for (const box of boxes.splice(0)) for (const k of els(box)) { if (k.name === 'w:p') await para(k); else if (k.name === 'w:tbl') await table(k); }
      if (pageBreak) blocks.push({ type: 'pagebreak' });
    };
    const table = async t => {
      const rows = [], aligns = [];
      let head = false, firstBold = true;
      for (const tr of els(t).filter(k => k.name === 'w:tr')) {
        if (!rows.length && kid(kid(tr, 'w:trPr'), 'w:tblHeader')) head = true;
        const row = [], al = [];
        for (const tc of els(tr).filter(k => k.name === 'w:tc')) {
          const span = +(kid(kid(tc, 'w:tcPr'), 'w:gridSpan')?.attrs['w:val'] || 1);
          const ps = all(tc, 'w:p'), cell = ps.map(p => all(p, 'w:t').map(txt).join('')).join('\n').trim();
          const jc = kid(kid(ps[0], 'w:pPr'), 'w:jc')?.attrs['w:val'];   // Ausrichtung wie in Word
          // Kopfzeile auch erkennen, wenn sie nur fett formatiert ist (ohne „Überschrift wiederholen“)
          if (!rows.length) for (const r of all(tc, 'w:r')) if (all(r, 'w:t').map(txt).join('').trim() && !on(kid(kid(r, 'w:rPr'), 'w:b'))) firstBold = false;
          row.push(cell); al.push(jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left');
          for (let i = 1; i < span; i++) { row.push(''); al.push('left'); }
        }
        rows.push(row); aligns.push(al);
      }
      const n = Math.max(0, ...rows.map(r => r.length));
      // Spaltenbreiten aus dem Tabellenraster (Twips) als Anteile
      const grid = all(kid(t, 'w:tblGrid') || { kids: [] }, 'w:gridCol').map(g => +g.attrs['w:w'] || 0), gs = grid.reduce((a, b) => a + b, 0);
      const widths = grid.length === n && gs > 0 ? grid.map(w => w / gs) : null;
      if (n) blocks.push({ type: 'table', rows: rows.map(r => Array.from({ length: n }, (_, i) => r[i] ?? '')), head: head || (rows.length > 1 && firstBold && rows[0].some(Boolean)),
        widths, aligns: aligns.map(a => Array.from({ length: n }, (_, i) => a[i] || 'left')) });
    };
    /* Abschnitte (app-v304): Ein Abschnitt endet mit dem Absatz, der w:sectPr trägt; die Angaben gelten für alles davor.
       Mehrspaltiger Satz (w:cols, z. B. Vereinszeitung, Flyer) → cols je Baustein; Abschnittswechsel „nächste Seite“ (Voreinstellung
       in Word) → Seitenumbruch, „fortlaufend“ → keiner. */
    let secStart = 0;
    const endSection = (sp, last) => {
      const c = kid(sp, 'w:cols'), n = Math.max(1, Math.min(4, +(c?.attrs['w:num'] || 1) || 1)), gap = c?.attrs['w:space'] ? Math.max(6, Math.min(72, +c.attrs['w:space'] / 20)) : 36;
      if (n > 1) for (let i = secStart; i < blocks.length; i++) if (blocks[i].type !== 'pagebreak') { blocks[i].cols = n; blocks[i].colGap = gap; }
      secStart = blocks.length;
      const ty = kid(sp, 'w:type')?.attrs['w:val'] || 'nextPage';
      if (!last && ty !== 'continuous') blocks.push({ type: 'pagebreak' });
    };
    for (const k of els(body)) {
      if (k.name === 'w:p') { await para(k); const sp = kid(kid(k, 'w:pPr'), 'w:sectPr'); if (sp) endSection(sp, false); }
      else if (k.name === 'w:tbl') await table(k);
      else if (k.name === 'w:sdt') for (const c of els(kid(k, 'w:sdtContent') || { kids: [] })) { if (c.name === 'w:p') await para(c); else if (c.name === 'w:tbl') await table(c); }
    }
    if (kid(body, 'w:sectPr')) endSection(kid(body, 'w:sectPr'), true);
    for (const [head, used] of [['Fußnoten', fnUsed], ['Endnoten', enUsed]]) {
      if (!used.length) continue;
      blocks.push({ type: 'hr' }, { type: 'p', text: root.I18N?.t ? String(root.I18N.t(head)) : head, bold: true, small: true });   // Überschrift in der Oberflächensprache
      for (const [n, t] of used) blocks.push({ type: 'p', text: `${sup(n)} ${t}`, small: true, tight: true });
    }
    // Seitenformat aus dem letzten Abschnitt (Twips → pt)
    const sect = kid(body, 'w:sectPr'), sz = kid(sect, 'w:pgSz'), mar = kid(sect, 'w:pgMar');
    const tw = v => +v / 20;
    const page = { size: sz ? [tw(sz.attrs['w:w']), tw(sz.attrs['w:h'])] : null, margin: mar ? Math.max(28, Math.min(85, tw(mar.attrs['w:left']) || 56.7)) : null,
      top: mar ? Math.max(20, Math.min(200, Math.abs(tw(mar.attrs['w:top'])) || 56.7)) : null, bottom: mar ? Math.max(20, Math.min(200, Math.abs(tw(mar.attrs['w:bottom'])) || 56.7)) : null,
      headerY: mar?.attrs['w:header'] ? tw(mar.attrs['w:header']) : null, footerY: mar?.attrs['w:footer'] ? tw(mar.attrs['w:footer']) : null };
    // Kopf- und Fußzeile (Standard-Variante) mit eigenen Bildern; auf jeder Seite wiederholt (js/textpdf.js)
    const part = async (kind) => {
      const ref = els(sect || { kids: [] }).find(k => k.name === `w:${kind}Reference` && (k.attrs['w:type'] || 'default') === 'default');
      const target = ref && rels.get(ref.attrs['r:id']); if (!target) return null;
      const path = 'word/' + target.replace(/^\.?\//, ''), xml = await z.text(path); if (!xml) return null;
      const save = blocks, saveRels = rels; blocks = []; rels = await relsOf(path);
      try { for (const k of els(parseXml(xml).kids.find(x => typeof x === 'object') || { kids: [] })) { if (k.name === 'w:p') await para(k); else if (k.name === 'w:tbl') await table(k); } return blocks.filter(b => b.type !== 'gap' && b.type !== 'pagebreak'); }
      finally { blocks = save; rels = saveRels; }
    };
    const header = await part('header'), footer = await part('footer');
    if (header?.length) page.header = header;
    if (footer?.length) page.footer = footer;
    // aufeinanderfolgende Leerzeilen zusammenfassen, Leerzeilen am Ende weg
    const out = blocks.filter((b, i) => !(b.type === 'gap' && (i === 0 || blocks[i - 1].type === 'gap')));
    while (out.length && ['gap', 'pagebreak'].includes(out[out.length - 1].type)) out.pop();
    return { blocks: out, page, font };
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
        // Tausenderpunkt nur, wenn das Format ihn verlangt (#,##0 …) – wie Excel; „0.00“ und Standard zeigen 1222 statt 1.222 (Messung 24.11.2026)
        numStyle.push(code ? { dec, pct: /%/.test(code), cur: /€|EUR/.test(code), grp: /[#0],[#0]/.test(code.split(';')[0].replace(/"[^"]*"/g, '')) } : null);
        dateStyle.push(DATE_FMT.has(id) || (custom.has(id) && /(^|[^"\\])[dmy]{1,4}/i.test(custom.get(id).replace(/\[[^\]]*\]/g, '')) && !/^[#0.,%]+$/.test(custom.get(id)))); }
    }
    const rels = new Map(); const rx = await z.text('xl/_rels/workbook.xml.rels');
    if (rx) for (const r of all(parseXml(rx), 'Relationship')) rels.set(r.attrs.Id, r.attrs.Target);
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 10, useGrouping: false }), df = new Intl.DateTimeFormat(locale);   // Standardformat: ohne Tausenderpunkt (wie Excel/Calc)
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
            else if (ns && !Number.isNaN(num)) val = new Intl.NumberFormat(locale, { minimumFractionDigits: ns.dec, maximumFractionDigits: ns.dec, style: ns.pct ? 'percent' : 'decimal', useGrouping: ns.grp || ns.cur }).format(num) + (ns.cur ? ' €' : '');   // wie in Excel angezeigt
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
        styles.set(s.attrs['style:name'], { bold: tp?.attrs['fo:font-weight'] === 'bold', italic: tp?.attrs['fo:font-style'] === 'italic', align: pp?.attrs['fo:text-align'], parent: s.attrs['style:parent-style-name'], h: /^(Heading|Title)/.test(s.attrs['style:name'] || '') ? (+(/\d/.exec(s.attrs['style:name']) || [1])[0] || 1) : 0 });
      }
      for (const l of all(src, 'text:list-style')) { const first = els(l)[0]; lists.set(l.attrs['style:name'], first?.name === 'text:list-level-style-number'); }
    }
    const sty = name => { let s = styles.get(name), bold = false, italic = false, align = null, h = 0, n = 0; while (s && n++ < 5) { bold ||= s.bold; italic ||= s.italic; align ||= s.align; h ||= s.h; s = styles.get(s.parent); } return { bold, italic, align, h }; };
    return { z, doc, sty, lists, st };
  }
  // Text eines Absatzes (Leerzeichen-, Tab- und Zeilenumbruch-Elemente), Fettdruck aller Teile
  function odfText(el, sty) {
    let t = '', runs = 0, bold = 0; const parts = [];
    const add = (s, b, i) => { t += s; const last = parts[parts.length - 1]; if (last && last.b === b && last.i === i) last.t += s; else parts.push({ t: s, b, i }); };
    const walk = (e, b, i) => {
      for (const k of e.kids) {
        if (typeof k === 'string') { add(k, b, i); if (k.trim()) { runs++; if (b) bold++; } continue; }
        if (k.name === 'text:s') add(' '.repeat(+k.attrs['text:c'] || 1), b, i);
        else if (k.name === 'text:tab') add('\t', b, i);
        else if (k.name === 'text:line-break') add('\n', b, i);
        else if (k.name === 'text:note' || k.name === 'office:annotation') continue;
        else { const ss = k.name === 'text:span' ? sty(k.attrs['text:style-name']) : {}; walk(k, b || !!ss.bold, i || !!ss.italic); }
      }
    };
    const ps = sty(el.attrs['text:style-name']); walk(el, ps.bold, ps.italic);
    const mixed = parts.some(x => x.i && x.t.trim()) || (bold > 0 && bold < runs);
    return { text: t.replace(/\s+$/, ''), allBold: runs > 0 && bold === runs, runs: mixed ? parts : null };
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
      const { text, allBold, runs } = odfText(p, sty), s = sty(p.attrs['text:style-name']);
      for (const fr of all(p, 'draw:frame')) { const im = await image(fr); if (im) blocks.push({ ...im, align: s.align === 'center' ? 'center' : s.align === 'end' || s.align === 'right' ? 'right' : 'left' }); }
      if (!text.trim()) { if (!all(p, 'draw:frame').length) blocks.push({ type: 'gap' }); return; }
      if (p.name === 'text:h') blocks.push({ type: 'h', level: Math.min(6, +p.attrs['text:outline-level'] || 1), text });
      else if (extra.li) blocks.push({ type: 'li', ...extra.li, text });
      else if (s.h) blocks.push({ type: 'h', level: Math.min(6, s.h), text });
      else blocks.push({ type: 'p', text, bold: allBold, align: s.align === 'center' ? 'center' : s.align === 'end' || s.align === 'right' ? 'right' : null, ...(runs ? { runs } : {}) });
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


  /* Gemeinsamer Leser für (X)HTML – EPUB-Kapitel, gespeicherte Webseiten (.html) und MHTML (.mht/.mhtml):
     Überschriften, Absätze, Listen, Tabellen, Zitate, vorformatierter Text und Bilder → Blöcke für js/textpdf.js.
     Es wird nichts ausgeführt und nichts aus dem Netz geladen: Bilder nur aus der Datei selbst (EPUB/MHTML-Teil, data:-Adresse). */
  function htmlWalker(blocks, { shift = 0, loadImg = async () => null } = {}) {
    const stats = { remote: 0 };
    const textOf = el => {   // Text mit Zeilenumbrüchen (<br>) und ohne Skripte/Stile
      let s = ''; (function w(e) { for (const k of e.kids) { if (typeof k === 'string') s += k.replace(/\s+/g, ' '); else if (tag(k) === 'br') s += '\n'; else if (!['script', 'style', 'noscript', 'template'].includes(tag(k))) w(k); } })(el);
      return s.replace(/ ?\n ?/g, '\n').replace(/ {2,}/g, ' ').trim();
    };
    const find = (el, n) => { const out = []; (function w(e) { for (const k of els(e)) { if (tag(k) === n) out.push(k); w(k); } })(el); return out; };
    const BLOCK = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre', 'dl', 'section', 'article', 'figure', 'hr'];
    async function img(el, base) {
      const href = el.attrs.src || el.attrs['xlink:href'] || el.attrs.href; if (!href) return;
      let data = null;
      const m = /^data:image\/[\w.+-]+;base64,(.*)$/is.exec(href);
      if (m) { try { data = b64bytes(m[1]); } catch { return; } }
      else data = await loadImg(href, base);   // aus der Datei selbst (EPUB, MHTML-Teil – dort tragen Bilder oft ihre Web-Adresse)
      if (!data && /^https?:/i.test(href)) { stats.remote++; return; }   // nie nachladen (Leitplanke: kein Abruf fremder Adressen)
      if (!data) return;
      const mime = data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : null; if (!mime) return;
      // Größe aus dem Bild selbst (PNG: IHDR, JPEG: SOF), 96 dpi
      let w = 300, h = 200;
      if (mime === 'image/png' && data.length >= 24) { const dv = new DataView(data.buffer, data.byteOffset, data.length); w = Math.min(dv.getUint32(16), 20000); h = Math.min(dv.getUint32(20), 20000); }   // zu kurze Daten: Maße aus dem Bild selbst
      else for (let i = 2; i < data.length - 9;) { if (data[i] !== 0xff) break; const mk = data[i + 1], l = (data[i + 2] << 8) | data[i + 3]; if (mk >= 0xc0 && mk <= 0xc3) { h = (data[i + 5] << 8) | data[i + 6]; w = (data[i + 7] << 8) | data[i + 8]; break; } i += 2 + l; }
      blocks.push({ type: 'img', bytes: data, mime, w: w * 0.75, h: h * 0.75, align: 'center' });
    }
    const walk = async (el, depth = 0, base = '') => {
      for (const k of els(el)) {
        const t = tag(k);
        if (/^h[1-6]$/.test(t)) { const s = textOf(k); if (s) blocks.push({ type: 'h', level: Math.min(6, +t[1] + shift), text: s }); }
        else if (t === 'p') {
          for (const im of find(k, 'img')) await img(im, base);
          const s = textOf(k); if (s) blocks.push({ type: 'p', text: s, align: /center/.test(k.attrs.style || '') || /center/.test(k.attrs.class || '') || /center/i.test(k.attrs.align || '') ? 'center' : null });
        }
        else if (t === 'ul' || t === 'ol') { let n = 0; for (const li of els(k).filter(x => tag(x) === 'li')) { n++; const sub = els(li).filter(x => ['ul', 'ol'].includes(tag(x))); const clone = { ...li, kids: li.kids.filter(x => !sub.includes(x)) }; const s = textOf(clone); if (s) blocks.push({ type: 'li', ordered: t === 'ol', label: t === 'ol' ? n + '.' : '•', depth: Math.min(3, depth), text: s }); for (const sl of sub) await walk({ kids: [sl] }, depth + 1, base); } }
        else if (t === 'table') {
          const trs = []; (function w(e) { for (const c of els(e)) { const ct = tag(c); if (ct === 'tr') trs.push(c); else if (['thead', 'tbody', 'tfoot'].includes(ct)) w(c); } })(k);
          const cells = tr => els(tr).filter(c => ['td', 'th'].includes(tag(c)));
          // Layout-Tabelle (verschachtelt oder einspaltig, typisch für Newsletter und alte Webseiten): Zellen als normalen Inhalt lesen
          if (find(k, 'table').length || !trs.length || trs.reduce((a, r) => Math.max(a, cells(r).length), 0) === 1) { for (const tr of trs) for (const c of cells(tr)) await walk({ kids: [c] }, depth, base); continue; }
          for (const im of find(k, 'img')) await img(im, base);
          const rows = trs.map(tr => cells(tr).map(textOf)).filter(r => r.some(Boolean)), n = Math.max(0, ...rows.map(r => r.length));
          if (n) blocks.push({ type: 'table', rows: rows.map(r => Array.from({ length: n }, (_, i) => r[i] ?? '')), head: !!find(k, 'th').length });
        }
        else if (t === 'blockquote') { const s = textOf(k); if (s) blocks.push({ type: 'p', text: s }); }
        else if (t === 'pre') { const s = txt(k).replace(/\s+$/, ''); if (s) blocks.push({ type: 'p', text: s }); }
        else if (t === 'img' || t === 'image') await img(k, base);
        else if (t === 'hr') blocks.push({ type: 'gap' });
        else if (t === 'dl') { for (const d of els(k)) { const s = textOf(d); if (s) blocks.push(tag(d) === 'dt' ? { type: 'p', text: s, bold: true } : { type: 'p', text: s }); } }
        else if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'figure', 'figcaption', 'nav', 'span', 'a', 'svg', 'body', 'center', 'font', 'form', 'label', 'b', 'strong', 'i', 'em', 'u', 'small', 'big', 'td', 'th', 'tbody', 'tr', 'html'].includes(t)) {
          // Container mit direktem Text (ohne Absatz-Elemente) als eigener Absatz
          const direct = k.kids.filter(x => typeof x === 'string').join('').trim();
          if (direct && !els(k).some(x => BLOCK.includes(tag(x)))) { for (const im of find(k, 'img')) await img(im, base); const s = textOf(k); if (s) blocks.push({ type: 'p', text: s }); }
          else if (direct) {
            // gemischt: Text und Inline-Elemente zwischen Blöcken zu Absätzen zusammenfassen (z. B. „Text<br>Text<div>…</div>Text“)
            let run = [];
            const flush = async () => { if (!run.length) return; const box = { name: 'span', attrs: {}, kids: run }; run = []; for (const im of find(box, 'img')) await img(im, base); const s = textOf(box); if (s) blocks.push({ type: 'p', text: s }); };
            for (const c of k.kids) { if (typeof c === 'string' || !BLOCK.includes(tag(c)) && !['table', 'img'].includes(tag(c)) && !find(c, 'p').length && !find(c, 'div').length) run.push(c); else { await flush(); await walk({ kids: [c] }, depth, base); } }
            await flush();
          }
          else await walk(k, depth, base);
        }
      }
    };
    return { walk, textOf, find, stats };
  }
  const b64bytes = s => { s = s.replace(/[^A-Za-z0-9+/]/g, ''); if (typeof atob === 'function') { const b = atob(s.slice(0, s.length - (s.length % 4))), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; } return new Uint8Array(Buffer.from(s, 'base64')); };

  // HTML ist kein XML: leere Elemente ohne „/“, fehlende End-Tags, Attribute ohne Anführungszeichen. Kleiner, nachsichtiger Parser.
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen', 'basefont', 'frame']);
  const HTML_ENT = { nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€', copy: '©', reg: '®', trade: '™', ndash: '–', mdash: '—', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', hellip: '…', laquo: '«', raquo: '»', middot: '·', bull: '•', deg: '°', sect: '§', para: '¶', times: '×', divide: '÷', shy: '', eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', ccedil: 'ç', oacute: 'ó', ograve: 'ò', iacute: 'í', uacute: 'ú', ntilde: 'ñ', Eacute: 'É', oslash: 'ø', aring: 'å', aelig: 'æ', Oslash: 'Ø', Aring: 'Å', AElig: 'Æ', pound: '£', yen: '¥', cent: '¢', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', micro: 'µ', plusmn: '±', larr: '←', rarr: '→', ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '' };
  const hUnesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e) => { if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; } return HTML_ENT[e] ?? ENT[e.toLowerCase()] ?? m; });
  const CLOSES_P = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre', 'dl', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'hr', 'form', 'figure', 'main', 'address', 'fieldset']);
  function parseHtml(s) {
    const title = hUnesc((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(s)?.[1] || '').replace(/\s+/g, ' ').trim());
    s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template|textarea|select|head|svg|math|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, '');
    const rootEl = { name: '#root', attrs: {}, kids: [] }, stack = [rootEl], top = () => stack[stack.length - 1];
    const closeTo = n => { for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === n) { stack.length = i; return true; } return false; };
    const inScope = (n, stop) => { for (let i = stack.length - 1; i > 0; i--) { if (stack[i].name === n) return i; if (stop.includes(stack[i].name)) return -1; } return -1; };
    const re = /<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=\/><]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>|<![^>]*>|<\?[^>]*>|([^<]+)|</g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) { closeTo(m[1].toLowerCase()); continue; }
      if (m[2]) {
        const n = m[2].toLowerCase(), el = { name: n, attrs: {}, kids: [] };
        for (const a of (m[3] || '').matchAll(/([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) el.attrs[a[1].toLowerCase()] = hUnesc(a[2] ?? a[3] ?? a[4] ?? '');
        // fehlende End-Tags ergänzen, wie es Browser tun
        if (CLOSES_P.has(n) && inScope('p', ['div', 'td', 'th', 'li', 'blockquote', 'section', 'article']) > 0) closeTo('p');
        if (n === 'li') { const i = inScope('li', ['ul', 'ol']); if (i > 0) stack.length = i; }
        if (n === 'dt' || n === 'dd') { const i = Math.max(inScope('dt', ['dl']), inScope('dd', ['dl'])); if (i > 0) stack.length = i; }
        if (n === 'tr') { const i = inScope('tr', ['table']); if (i > 0) stack.length = i; }
        if (n === 'td' || n === 'th') { const i = Math.max(inScope('td', ['tr', 'table']), inScope('th', ['tr', 'table'])); if (i > 0) stack.length = i; }
        top().kids.push(el);
        if (!VOID.has(n)) stack.push(el);
        continue;
      }
      if (m[4] !== undefined) top().kids.push(hUnesc(m[4]));
    }
    return { root: rootEl, title };
  }
  /* Gespeicherte Webseite oder MHTML-Hauptteil → Blöcke. images: Map Adresse → Bytes (MHTML-Teile, Content-Location bzw. cid:) */
  async function html(src, { images = new Map(), name = '' } = {}) {
    const text = typeof src === 'string' ? src : htmlDecode(src);
    const { root: tree, title } = parseHtml(text), blocks = [];
    const body = (function f(e) { for (const k of els(e)) { if (k.name === 'body') return k; const r = f(k); if (r) return r; } return null; })(tree) || tree;
    const w = htmlWalker(blocks, {
      loadImg: async href => {
        const key = href.trim(), plain = key.replace(/^cid:/i, '');
        return images.get(key) || images.get('cid:' + plain) || images.get(plain) || [...images.entries()].find(([k]) => k.endsWith('/' + key.replace(/^\.?\//, '')))?.[1] || null;
      },
    });
    await w.walk({ kids: [body] });
    const out = blocks.filter((b, i) => !(b.type === 'gap' && (i === 0 || blocks[i - 1].type === 'gap')));
    while (out.length && out[out.length - 1].type === 'gap') out.pop();
    if (!out.some(b => b.type !== 'gap')) throw new Error('Die Webseite enthält keinen lesbaren Text.');
    if (title && !(out[0]?.type === 'h' && out[0].text === title)) out.unshift({ type: 'h', level: 1, text: title });
    return { blocks: out, page: null, title: title || name, remoteImages: w.stats.remote };
  }
  // Zeichensatz: BOM, <meta charset>, sonst UTF-8 (streng) und notfalls Windows-1252
  function htmlDecode(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 4096)), cs = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
    if (cs && !/^utf-?8$/i.test(cs)) { try { return new TextDecoder(cs).decode(u8); } catch { /* unbekannt */ } }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { return new TextDecoder('windows-1252').decode(u8); }
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
    const walker = htmlWalker(blocks, { shift: title ? 1 : 0, loadImg: async (href, base) => z.get(resolve(base, decodeURIComponent(href))) });
    for (const ref of find(opf, 'itemref')) {
      const it = items.get(ref.attrs.idref); if (!it || !/x?html/.test(it['media-type'] || 'xhtml')) continue;
      const path = resolve(opfPath, it.href), xml = await z.text(path); if (!xml) continue;
      const body = find(parseXml(xml), 'body')[0]; if (!body) continue;
      if (blocks.length > (title ? 1 : 0)) blocks.push({ type: 'pagebreak' });   // jedes Kapitel auf neuer Seite
      await walker.walk(body, 0, path);
    }
    const out = blocks.filter((b, i) => !(b.type === 'pagebreak' && blocks[i - 1]?.type === 'pagebreak'));
    if (out.length <= (title ? 1 : 0)) throw new Error('Das E-Book enthält keinen lesbaren Text (oder ist kopiergeschützt).');
    return { blocks: out, page: { size: [419.53, 595.28], margin: 42.5 }, title };   // A5 – handlich wie ein Buch
  }

  // ---------- RTF: nur der Text ----------
  function rtf(bytes) {
    const raw = new TextDecoder('latin1').decode(bytes);
    if (!raw.startsWith('{\\rtf')) throw new Error('Keine RTF-Datei.');
    const cp = /\\ansicpg(\d+)/.exec(raw)?.[1] || '1252';
    let dec; try { dec = new TextDecoder('windows-' + cp); } catch { dec = new TextDecoder('windows-1252'); }
    const SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|themedata|datastore|latentstyles|listtable|listoverridetable|rsidtbl|generator|xmlnstbl)$/;
    const stack = []; let skip = false, uc = 1, drop = 0, out = '', hexes = [];
    const flush = () => { if (hexes.length) { out += dec.decode(Uint8Array.from(hexes)); hexes = []; } };
    const re = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|\r|\n|([^\\{}\r\n]+)/g;
    let m, first = false;
    while ((m = re.exec(raw))) {
      if (m[5] === '{') { flush(); stack.push({ skip, uc }); first = true; continue; }
      if (m[5] === '}') { flush(); const s = stack.pop(); if (s) ({ skip, uc } = s); first = false; continue; }
      if (m[4] === '*') { skip = true; continue; }
      if (m[1]) {
        if (first && SKIP.test(m[1])) skip = true;
        first = false;
        if (skip) continue;
        const w = m[1], n = m[2] === undefined ? null : +m[2];
        if (w === 'uc') uc = n ?? 1;
        else if (w === 'u') { flush(); out += String.fromCharCode(n < 0 ? n + 65536 : n); drop = uc; }
        else if (w === 'par' || w === 'sect' || w === 'page') { flush(); out += '\n\n'; }
        else if (w === 'line' || w === 'row') { flush(); out += '\n'; }
        else if (w === 'tab' || w === 'cell') { flush(); out += '\t'; }
        else if (w === 'emdash' || w === 'endash') { flush(); out += w === 'emdash' ? '—' : '–'; }
        else if (w === 'lquote' || w === 'rquote') { flush(); out += w === 'lquote' ? '‘' : '’'; }
        else if (w === 'ldblquote' || w === 'rdblquote') { flush(); out += w === 'ldblquote' ? '“' : '”'; }
        continue;
      }
      first = false;
      if (skip) continue;
      if (m[3]) { if (drop > 0) { drop--; continue; } hexes.push(parseInt(m[3], 16)); continue; }
      if (m[4]) { if (drop > 0) { drop--; continue; } flush(); out += m[4] === '~' ? '\u00a0' : m[4] === '-' || m[4] === '_' ? '' : m[4]; continue; }
      if (m[6]) { flush(); let t = m[6]; if (drop > 0) { const d = Math.min(drop, t.length); t = t.slice(d); drop -= d; } out += t; }
    }
    flush();
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- XPS: Text mit Position und Bilder je Seite ----------
  async function xps(bytes) {
    const z = readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const names = [...z.files.keys()].filter(n => /\.fpage$/i.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!names.length) throw new Error('Keine XPS-Datei (keine Seiten gefunden).');
    const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
    const parseM = s => { const n = String(s || '').split(/[\s,]+/).map(Number); return n.length === 6 && n.every(Number.isFinite) ? n : null; };
    const pages = [];
    for (const name of names) {
      const root = parseXml(await z.text(name) || ''), fp = all(root, 'FixedPage')[0]; if (!fp) continue;
      const pg = { w: +fp.attrs.Width || 816, h: +fp.attrs.Height || 1056, texts: [], images: [] };
      const walk = async (el, M) => {
        for (const k of els(el)) {
          const own = parseM(k.attrs.RenderTransform) || parseM(els(k).find(c => /\.RenderTransform$/.test(tag(c)))?.kids?.map?.(x => x.attrs?.Matrix).find(Boolean));
          const T = own ? mul(own, M) : M, t = tag(k);
          if (t === 'glyphs' && k.attrs.UnicodeString) {
            const x = +k.attrs.OriginX || 0, y = +k.attrs.OriginY || 0, size = (+k.attrs.FontRenderingEmSize || 12) * Math.abs(T[3] || 1);
            pg.texts.push({ text: k.attrs.UnicodeString.replace(/^\{\}/, ''), x: x * T[0] + y * T[2] + T[4], y: x * T[1] + y * T[3] + T[5], size });
          } else if (t === 'imagebrush') {
            const v = String(k.attrs.Viewport || '').split(/[\s,]+/).map(Number), src = String(k.attrs.ImageSource || '').replace(/^\//, '');
            const data = src && (await z.get(src) || await z.get(decodeURI(src)));
            if (data && v.length === 4 && /\.(jpe?g|png)$/i.test(src)) pg.images.push({ data, jpg: /\.jpe?g$/i.test(src), x: v[0] * T[0] + v[1] * T[2] + T[4], y: v[0] * T[1] + v[1] * T[3] + T[5], w: v[2] * T[0], h: v[3] * T[3] });
          }
          await walk(k, T);
        }
      };
      await walk(fp, [1, 0, 0, 1, 0, 0]);
      pages.push(pg);
    }
    return pages;
  }
  /* ---------- Alte Office-Formate (97–2003) aus der OLE-Verbunddatei (js/email.js readCfb) ----------
     Word .doc: Text über die Stückliste (Clx/PlcPcd, MS-DOC 2.4.1) – Absätze, Zeilen- und Seitenumbrüche, Tabellen (Zellmarken),
     Feldergebnisse statt Feldcode. Seit app-v349 auch die Formatierung wie bei .docx: Überschriften (Formatvorlage bzw. Gliederungsebene),
     Listen mit Nummernformat (LST/LFO), fett/kursiv, Ausrichtung, Bilder im Text (PICF) und schwebend (OfficeArt), Kopf-/Fußzeile mit
     Seitenzahl, Seitenformat und Hauptschrift; seit app-v351 Fuß- und Endnoten. Nicht nachgebildet: Textfelder, Spalten.
     Excel .xls: BIFF8 (MS-XLS) – sichtbare Tabellenblätter mit Text, Zahlen, Datum (Zahlenformat), Wahrheitswerten und gespeicherten
     Formelergebnissen; ältere BIFF5-Dateien (Excel 95) mit Text in Windows-1252. Kennwortgeschützte Dateien werden erkannt. */
  const cfbOf = (bytes, what) => (root.Email || (typeof require === 'function' ? require('./email.js') : null)).readCfb(bytes, what);
  const cfbStream = (c, name) => { const e = c.dirs.find(d => d.type === 2 && d.name.toLowerCase() === name.toLowerCase()); return e ? c.stream(e) : null; };
  const cp1252 = b => new TextDecoder('windows-1252').decode(b);

  // Beschädigte Datei (Verweise ins Leere): verständliche Meldung statt „Offset is outside the bounds“
  function doc(bytes) {
    try { return docRead(bytes); } catch (e) { if (e instanceof RangeError) throw new Error('Die Word-Datei ist beschädigt – bitte in Word öffnen und neu speichern.'); throw e; }
  }
  function docRead(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const c = cfbOf(u8, 'Keine Word-Datei (.doc) – die Datei ist beschädigt oder hat ein anderes Format.');
    const wd = cfbStream(c, 'WordDocument'); if (!wd || wd.length < 0x1AA) throw new Error('Keine Word-Datei (.doc): Hauptteil „WordDocument“ fehlt.');
    const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
    if (dv.getUint16(0, true) !== 0xA5EC) throw new Error('Keine Word-Datei (.doc).');
    if (dv.getUint16(2, true) < 0xC1) throw new Error('Word-6/95-Dateien kann PDFMy nicht lesen – bitte in Word als .docx speichern.');
    const flags = dv.getUint16(0x0A, true);
    if (flags & 0x0100) throw new Error('Die Word-Datei ist mit Kennwort geschützt – bitte in Word ohne Kennwort speichern und erneut öffnen.');
    const tbl = cfbStream(c, flags & 0x0200 ? '1Table' : '0Table'); if (!tbl) throw new Error('Word-Datei unvollständig (Tabellenteil fehlt).');
    const data = cfbStream(c, 'data');
    const ccpText = dv.getInt32(0x4C, true), ccpFtn = dv.getInt32(0x50, true), ccpHdd = dv.getInt32(0x54, true);
    const fcLcb = i => [dv.getUint32(0x9A + i * 8, true), dv.getUint32(0x9E + i * 8, true)];   // FibRgFcLcb97
    const [fcClx, lcbClx] = fcLcb(33);
    if (!lcbClx || fcClx + lcbClx > tbl.length) throw new Error('Word-Datei unvollständig (Stückliste fehlt).');
    const tv = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
    let p = fcClx, plc = null;
    while (p < fcClx + lcbClx) {
      if (tbl[p] === 0x01) { p += 3 + tv.getUint16(p + 1, true); continue; }   // Prc (Formatänderungen) überspringen
      if (tbl[p] === 0x02) { plc = { at: p + 5, len: tv.getUint32(p + 1, true) }; break; }
      break;
    }
    if (!plc) throw new Error('Word-Datei unvollständig (Stückliste fehlt).');
    // Text aller Teile (Haupttext, Fußnoten, Kopf-/Fußzeilen) mit der Dateiposition (fc) jedes Zeichens – für die Formatierung
    // Teile in fester Folge (MS-DOC 2.3.1): Haupttext, Fußnoten, Kopf-/Fußzeilen, (Makro), Kommentare, Endnoten
    const ccpAtn = Math.max(0, dv.getInt32(0x5C, true)), ccpEdn = Math.max(0, dv.getInt32(0x60, true)), ednBase = ccpText + Math.max(0, ccpFtn) + Math.max(0, ccpHdd) + Math.max(0, dv.getInt32(0x58, true)) + ccpAtn;
    const total = ednBase + ccpEdn, n = (plc.len - 4) / 12, chars = [], fcs = [];
    for (let i = 0; i < n && chars.length < total; i++) {
      const cp0 = tv.getUint32(plc.at + i * 4, true), cp1 = tv.getUint32(plc.at + (i + 1) * 4, true), fc = tv.getUint32(plc.at + (n + 1) * 4 + i * 8 + 2, true);
      const len = Math.min(cp1 - cp0, total - chars.length); if (len <= 0) continue;
      if (fc & 0x40000000) { const o = (fc & 0x3FFFFFFF) / 2, s = cp1252(wd.subarray(o, o + len)); for (let k = 0; k < len; k++) { chars.push(s[k] ?? ''); fcs.push(o + k); } }
      else { const s = new TextDecoder('utf-16le').decode(wd.subarray(fc, fc + len * 2)); for (let k = 0; k < len; k++) { chars.push(s[k] ?? ''); fcs.push(fc + k * 2); } }
    }
    /* ---- Formatierung (MS-DOC 2.4.6): Absatz- und Zeicheneigenschaften aus den FKP-Seiten; bei Fehlern einfach ohne ---- */
    const sprms = (b, at, end, fn) => {   // Sprm-Liste durchgehen: fn(sprm, operandOffset)
      for (let q = at; q + 2 <= end; ) {
        const sp = b[q] | (b[q + 1] << 8), spra = sp >> 13; q += 2;
        let sz = [1, 1, 2, 4, 2, 2, 0, 3][spra];
        if (spra === 6) { if (sp === 0xD608) { sz = (b[q] | (b[q + 1] << 8)) + 1; } else if (sp === 0xC615 && b[q] === 255) { sz = 1 + b[q + 1] * 4 + 1; sz += b[q + sz - 1 + 1] * 3; } else sz = b[q] + 1; }
        fn(sp, q); q += sz;
      }
    };
    const fkpRuns = (i, chp) => {   // PlcBteChpx / PlcBtePapx → [{fc0, fc1, at, end}] mit Sprm-Bereich in wd
      const [fc, lcb] = fcLcb(i), out = []; if (!lcb || fc + lcb > tbl.length) return out;
      const m = (lcb - 4) / 8;
      for (let k = 0; k < m; k++) {
        const pn = tv.getUint32(fc + (m + 1) * 4 + k * 4, true) & 0x3FFFFF, base = pn * 512; if (base + 512 > wd.length) continue;
        const crun = wd[base + 511];
        for (let r = 0; r < crun; r++) {
          const fc0 = dv.getUint32(base + r * 4, true), fc1 = dv.getUint32(base + (r + 1) * 4, true);
          if (chp) { const o = wd[base + (crun + 1) * 4 + r] * 2; if (!o) { out.push({ fc0, fc1, at: 0, end: 0 }); continue; } const cb = wd[base + o]; out.push({ fc0, fc1, at: base + o + 1, end: base + o + 1 + cb }); }
          else { const o = wd[base + (crun + 1) * 4 + r * 13] * 2; if (!o) { out.push({ fc0, fc1, istd: 0, at: 0, end: 0 }); continue; } let cb = wd[base + o], q = base + o + 1; if (!cb) { cb = wd[q] * 2; q++; } else cb = cb * 2 - 1;
            out.push({ fc0, fc1, istd: dv.getUint16(q, true), at: q + 2, end: q + cb }); }
        }
      }
      return out.sort((a, b) => a.fc0 - b.fc0);
    };
    const find = (runs, fc) => { let lo = 0, hi = runs.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1, r = runs[m]; if (fc < r.fc0) hi = m - 1; else if (fc >= r.fc1) lo = m + 1; else return r; } return null; };
    let chpx = [], papx = [], sti = [], base = [], defFtc = -1, normFtc = -1;
    try { chpx = fkpRuns(12, true); papx = fkpRuns(13, false); } catch { chpx = []; papx = []; }
    // Formatvorlagen: eingebaute Kennung (sti: 1–9 Überschrift, 62 Titel, 74 Untertitel) und Basisvorlage
    try {
      const [fcS, lcbS] = fcLcb(1);
      if (lcbS && fcS + lcbS <= tbl.length) {
        const cbStshi = tv.getUint16(fcS, true), cstd = tv.getUint16(fcS + 2, true); if (cbStshi >= 18) defFtc = tv.getUint16(fcS + 2 + 12, true);
        let q = fcS + 2 + cbStshi;
        const cbBase = tv.getUint16(fcS + 4, true);
        for (let k = 0; k < cstd && q + 2 <= fcS + lcbS; k++) {
          const cb = tv.getUint16(q, true);
          if (cb >= 4) {
            sti[k] = tv.getUint16(q + 2, true) & 0x0FFF; base[k] = tv.getUint16(q + 4, true) >> 4;
            // Schrift der Vorlage „Standard“ (istd 0): Name überspringen, dann UPX Absatz (istd + Sprms) und UPX Zeichen
            if (k === 0 && (tv.getUint16(q + 4, true) & 0x0F) === 1) {
              let u = q + 2 + cbBase; u += 2 + (tv.getUint16(u, true) + 1) * 2;
              const cbP = tv.getUint16(u, true); u += 2 + cbP + (cbP & 1);
              const cbC = tv.getUint16(u, true); sprms(tbl, u + 2, u + 2 + cbC, (sp, o) => { if (sp === 0x4A4F) normFtc = tbl[o] | (tbl[o + 1] << 8); });
            }
          }
          q += 2 + cb;
        }
      }
    } catch { /* ohne Vorlagen */ }
    const headOf = istd => { for (let k = 0, s = istd; k < 6 && s != null && s !== 0x0FFF; k++, s = base[s]) { const t = sti[s]; if (t >= 1 && t <= 9) return t; if (t === 62) return 1; if (t === 74) return 2; } return 0; };
    // Listen: LST (Zahlenformat je Ebene) und LFO (ilfo → lsid)
    const lists = new Map(), lfo = [];
    try {
      const [fcL, lcbL] = fcLcb(73), [fcF, lcbF] = fcLcb(74);
      if (lcbL && fcL + lcbL <= tbl.length) {
        const cLst = tv.getUint16(fcL, true), lsts = []; for (let k = 0; k < cLst; k++) { const o = fcL + 2 + k * 28; lsts.push({ lsid: tv.getInt32(o, true), simple: tbl[o + 26] & 1 }); }
        let q = fcL + 2 + cLst * 28;
        for (const l of lsts) { const lv = []; for (let k = 0; k < (l.simple ? 1 : 9) && q + 28 <= tbl.length; k++) { lv.push({ start: tv.getInt32(q, true), nfc: tbl[q + 4] }); q += 28 + tbl[q + 25] + tbl[q + 24]; q += 2 + tv.getUint16(q, true) * 2; } lists.set(l.lsid, lv); }
      }
      if (lcbF && fcF + lcbF <= tbl.length) { const m = tv.getUint32(fcF, true); for (let k = 0; k < m && fcF + 4 + k * 16 + 4 <= tbl.length; k++) lfo.push(tv.getInt32(fcF + 4 + k * 16, true)); }
    } catch { /* ohne Listen */ }
    const parOf = fc => {   // Absatzeigenschaften für das Absatzende an Dateiposition fc
      const r = find(papx, fc), o = { h: 0, jc: null, ilfo: 0, ilvl: 0, pb: false }; if (!r) return o;
      o.h = headOf(r.istd);
      if (r.at) try { sprms(wd, r.at, r.end, (sp, q) => {
        if (sp === 0x2461 || sp === 0x2403) o.jc = wd[q]; else if (sp === 0x460B) o.ilfo = wd[q] | (wd[q + 1] << 8); else if (sp === 0x260A) o.ilvl = wd[q];
        else if (sp === 0x2640 && wd[q] < 9 && !o.h) o.h = wd[q] + 1; else if (sp === 0x2407) o.pb = wd[q] === 1;
      }); } catch { /* beschädigte Angaben: ohne */ }
      return o;
    };
    const chOf = fc => {   // Zeicheneigenschaften: fett, kursiv, Bild (Position im Data-Strom)
      const r = find(chpx, fc), o = { b: false, i: false, pic: -1, spec: false, ftc: -1 }; if (!r || !r.at) return o;
      try { sprms(wd, r.at, r.end, (sp, q) => {
        if (sp === 0x0835) o.b = wd[q] === 1 || wd[q] === 0x81; else if (sp === 0x0836) o.i = wd[q] === 1 || wd[q] === 0x81;
        else if (sp === 0x6A03) o.pic = dv.getInt32(q, true); else if (sp === 0x4A4F) o.ftc = wd[q] | (wd[q + 1] << 8); else if (sp === 0x0855) o.spec = wd[q] === 1;
      }); } catch { /* beschädigte Angaben: ohne */ }
      return o;
    };
    // Eingebettetes Bild (PICF im Data-Strom): PNG oder JPEG darin suchen, Größe aus dxaGoal/dyaGoal und Skalierung
    const picture = fc => {
      if (!data || fc < 0 || fc + 68 > data.length) return null;
      const pv = new DataView(data.buffer, data.byteOffset, data.byteLength), lcb = pv.getInt32(fc, true), end = Math.min(data.length, fc + Math.max(68, lcb));
      const w = pv.getInt16(fc + 28, true) * (pv.getUint16(fc + 32, true) || 1000) / 1000 / 20, h = pv.getInt16(fc + 30, true) * (pv.getUint16(fc + 34, true) || 1000) / 1000 / 20;
      const img = (src, a, b) => {
        for (let q = a; q + 8 < b; q++) {
          if (src[q] === 0x89 && src[q + 1] === 0x50 && src[q + 2] === 0x4E && src[q + 3] === 0x47) {
            for (let e = q + 8; e + 8 <= b; e++) if (src[e] === 0x49 && src[e + 1] === 0x45 && src[e + 2] === 0x4E && src[e + 3] === 0x44) return { type: 'img', bytes: src.slice(q, e + 8), mime: 'image/png', w: w > 0 ? w : 200, h: h > 0 ? h : 150 };
            return null;
          }
          if (src[q] === 0xFF && src[q + 1] === 0xD8 && src[q + 2] === 0xFF) {
            let e = b - 2; while (e > q && !(src[e] === 0xFF && src[e + 1] === 0xD9)) e--;
            return e > q ? { type: 'img', bytes: src.slice(q, e + 2), mime: 'image/jpeg', w: w > 0 ? w : 200, h: h > 0 ? h : 150 } : null;
          }
        }
        return null;
      };
      // Bild direkt im Data-Strom – oder (bei mehrfach verwendeten Bildern) nur ein Verweis OfficeArtFBSE (0xF007) auf den Hauptteil (foDelay)
      for (let q = fc + 68; q + 44 < end; q++) if (data[q + 2] === 0x07 && data[q + 3] === 0xF0 && (data[q] & 0x0F) === 2) {
        const len = pv.getUint32(q + 4, true), size = pv.getUint32(q + 28, true), delay = pv.getUint32(q + 36, true);
        if (len === 36 && delay && delay + size <= wd.length) { const r = img(wd, delay, delay + size); if (r) return r; }
      }
      return img(data, fc + 68, end);
    };
    /* Schwebende Bilder (Zeichen 0x08 im Haupttext): PlcSpaMom (Form-ID und Rechteck je Zeichenposition) → Form im OfficeArt-Teil
       (DggInfo) → Eigenschaft pib (Nummer im Bildspeicher) → OfficeArtFBSE → Bild im Hauptteil (foDelay) oder direkt dahinter */
    const floating = new Map();
    try {
      const [fcS, lcbS] = fcLcb(40), [fcD, lcbD] = fcLcb(50);
      if (lcbS >= 30 && lcbD && fcS + lcbS <= tbl.length && fcD + lcbD <= tbl.length) {
        const m = (lcbS - 4) / 30, spa = new Map();
        for (let k = 0; k < m; k++) { const o = fcS + (m + 1) * 4 + k * 26; spa.set(tv.getUint32(fcS + k * 4, true), { id: tv.getUint32(o, true), w: (tv.getInt32(o + 12, true) - tv.getInt32(o + 4, true)) / 20, h: (tv.getInt32(o + 16, true) - tv.getInt32(o + 8, true)) / 20 }); }
        const bse = [], pibOf = new Map();
        const walk = (a, b, depth) => {
          for (let q = a; q + 8 <= b && depth < 8; ) {
            if (tbl[q + 3] !== 0xF0) { q++; continue; }   // OfficeArtWordDrawing: 1 Byte dgglbl vor jeder Zeichnung
            const vi = tv.getUint16(q, true), rt = tv.getUint16(q + 2, true), len = tv.getUint32(q + 4, true), body = q + 8, end = Math.min(b, body + len);
            if ((vi & 0x0F) === 0x0F) {
              if (rt === 0xF004) {   // Form: FSP (Form-ID) und FOPT (Eigenschaften)
                let id = null, pib = null;
                for (let r = body; r + 8 <= end; ) { const t = tv.getUint16(r + 2, true), l = tv.getUint32(r + 4, true);
                  if (t === 0xF00A) id = tv.getUint32(r + 8, true);
                  if (t === 0xF00B) { const cnt = tv.getUint16(r, true) >> 4; for (let k = 0; k < cnt; k++) { const op = tv.getUint16(r + 8 + k * 6, true); if ((op & 0x3FFF) === 0x0104) pib = tv.getUint32(r + 10 + k * 6, true); } }
                  r += 8 + l; }
                if (id != null && pib) pibOf.set(id, pib);
              } else walk(body, end, depth + 1);
            } else if (rt === 0xF007) bse.push(q);
            q = body + len;
          }
        };
        walk(fcD, fcD + lcbD, 0);
        for (const [cp, a] of spa) {
          const pib = pibOf.get(a.id), q = pib && bse[pib - 1]; if (q == null) continue;
          const size = tv.getUint32(q + 28, true), delay = tv.getUint32(q + 36, true), cbName = tbl[q + 41];
          floating.set(cp, { w: a.w, h: a.h, src: delay !== 0xFFFFFFFF && delay + size <= wd.length ? [wd, delay, delay + size] : [tbl, q + 44 + cbName, Math.min(tbl.length, q + 8 + tv.getUint32(q + 4, true))] });
        }
      }
    } catch { /* ohne schwebende Bilder */ }
    const floatImg = cp => { const f = floating.get(cp); if (!f) return null; const [src, a, b] = f.src;
      for (let q = a; q + 8 < b; q++) {
        if (src[q] === 0x89 && src[q + 1] === 0x50 && src[q + 2] === 0x4E && src[q + 3] === 0x47) { for (let e = q + 8; e + 8 <= b; e++) if (src[e] === 0x49 && src[e + 1] === 0x45 && src[e + 2] === 0x4E && src[e + 3] === 0x44) return { type: 'img', bytes: src.slice(q, e + 8), mime: 'image/png', w: f.w > 0 ? f.w : 200, h: f.h > 0 ? f.h : 150 }; return null; }
        if (src[q] === 0xFF && src[q + 1] === 0xD8 && src[q + 2] === 0xFF) { let e = b - 2; while (e > q && !(src[e] === 0xFF && src[e + 1] === 0xD9)) e--; return e > q ? { type: 'img', bytes: src.slice(q, e + 2), mime: 'image/jpeg', w: f.w > 0 ? f.w : 200, h: f.h > 0 ? f.h : 150 } : null; }
      }
      return null; };
    const nfcLabel = (nfc, k) => nfc === 0 ? k + '.' : nfc === 4 ? String.fromCharCode(96 + ((k - 1) % 26) + 1) + ')' : nfc === 3 ? String.fromCharCode(64 + ((k - 1) % 26) + 1) + ')' : nfc === 2 ? ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][(k - 1) % 10] + '.' : nfc === 1 ? ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][(k - 1) % 10] + '.' : null;
    const counters = new Map();
    // Felder: Code (0x13 … 0x14) weg, Ergebnis (bis 0x15) behalten – Seitenzahl-Felder als {PAGE}/{NUMPAGES} (Kopf-/Fußzeile)
    /* Fuß- und Endnoten (wie bei .docx): Verweis im Text als hochgestellte Nummer, Notentexte am Ende unter „Fußnoten“ bzw. „Endnoten“ */
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', sup = k => String(k).split('').map(d => SUP[+d]).join('');
    const notes = { fn: { base: ccpText, refs: new Map(), txt: [], used: [] }, en: { base: ednBase, refs: new Map(), txt: [], used: [] } };
    try {
      for (const [kind, iRef, iTxt] of [['fn', 2, 3], ['en', 46, 47]]) {
        const [fr, lr] = fcLcb(iRef), [ft, lt] = fcLcb(iTxt), o = notes[kind];
        if (!lr || !lt || fr + lr > tbl.length || ft + lt > tbl.length) continue;
        const m = (lr - 4) / 6; for (let k = 0; k < m; k++) o.refs.set(tv.getUint32(fr + k * 4, true), k);
        for (let k = 0; k < lt / 4; k++) o.txt.push(tv.getUint32(ft + k * 4, true));
      }
    } catch { /* ohne Noten */ }
    const noteMark = cp => { for (const kind of ['fn', 'en']) { const o = notes[kind], k = o.refs.get(cp); if (k != null) { o.used.push(k); return sup(o.used.length); } } return null; };
    const story = (c0, c1) => {
      const out = []; const st = [];
      for (let k = c0; k < c1 && k < chars.length; k++) {
        const ch = chars[k], code = ch.charCodeAt(0);
        if (code === 0x13) { st.push({ res: false, code: '' }); continue; }
        if (code === 0x14) { if (st.length) st[st.length - 1].res = true; continue; }
        if (code === 0x15) { const f = st.pop(); if (f && st.every(s => s.res)) { const t = /\bNUMPAGES\b/.test(f.code) ? '{NUMPAGES}' : /\bPAGE\b/.test(f.code) ? '{PAGE}' : null; if (t) { while (out.length && out[out.length - 1].field === f) out.pop(); out.push({ ch: t, fc: fcs[k] }); } } continue; }
        if (st.length && !st[st.length - 1].res) { st[st.length - 1].code += ch; continue; }
        if (st.some(s => !s.res)) continue;
        const nm = ch === '\x02' && c0 === 0 && k < ccpText ? noteMark(k) : null;
        out.push({ ch: nm || ch, fc: fcs[k], cp: k, field: st[st.length - 1] });
      }
      return out;
    };
    // Bausteine aus einer Zeichenfolge: Absätze (\r), Zellen (\x07), Seitenumbruch (\x0c), Zeilenumbruch (\x0b), Bilder (0x01)
    const clean = s => s.replace(/\x0b/g, '\n').replace(/\x1e/g, '-').replace(/[\x1f\x01\x02\x05\x08]/g, '').replace(/\t/g, '    ').replace(/[  ]+\n/g, '\n').trim();
    const build = items => {
      const blocks = []; let row = [], rows = [], cols = 0, buf = [];
      const endTable = () => { if (row.length) rows.push(row); if (rows.length) { const w = rows.reduce((a, r) => Math.max(a, r.length), 0); blocks.push({ type: 'table', rows: rows.map(r => Array.from({ length: w }, (_, i) => r[i] ?? '')), head: rows.length > 1 }); } rows = []; row = []; cols = 0; };
      // Schwebende Bilder stehen hinter ihrem Absatz (wie bei .docx), Bilder im Text davor
      const para = (list, endFc) => { const after = []; para1(list, endFc, after); for (const im of after) blocks.push({ ...im, align: 'center' }); };
      const para1 = (list, endFc, after) => {
        if (rows.length || row.length) endTable();
        const imgs = []; for (const x of list) { if (x.ch === '\x01') { const f = chOf(x.fc); if (f.pic >= 0) { const im = picture(f.pic); if (im) imgs.push(im); } } else if (x.ch === '\x08' && x.cp < ccpText) { const im = floatImg(x.cp); if (im) after.push(im); } }
        const t = clean(list.map(x => x.ch).join('')); const pr = endFc != null ? parOf(endFc) : { h: 0 };
        if (pr.pb && blocks.length && blocks[blocks.length - 1].type !== 'pagebreak') blocks.push({ type: 'pagebreak' });   // „Seitenumbruch oberhalb“
        const align = pr.jc === 1 ? 'center' : pr.jc === 2 ? 'right' : null;
        for (const im of imgs) blocks.push({ ...im, align: align || 'left' });
        if (!t) return;
        if (pr.h) { blocks.push({ type: 'h', level: Math.min(6, pr.h), text: t }); return; }
        if (pr.ilfo > 0 && pr.ilfo <= lfo.length) {
          const lv = lists.get(lfo[pr.ilfo - 1])?.[Math.min(pr.ilvl, 8)] || { nfc: 23, start: 1 }, key = pr.ilfo + ':' + pr.ilvl;
          const k = counters.has(key) ? counters.get(key) + 1 : (lv.start || 1); counters.set(key, k);
          for (const [k2] of counters) if (k2.startsWith(pr.ilfo + ':') && +k2.split(':')[1] > pr.ilvl) counters.delete(k2);
          const label = nfcLabel(lv.nfc, k);
          blocks.push({ type: 'li', ordered: !!label, label: label || '•', depth: Math.min(3, pr.ilvl), text: t }); return;
        }
        // fett/kursiv: ganzer Absatz oder gemischte Stücke
        const parts = []; let boldN = 0, n = 0;
        for (const x of list) { if (x.ch === '\x01') continue; const f = chOf(x.fc), last = parts[parts.length - 1]; if (x.ch.trim()) { n++; if (f.b) boldN++; } if (last && last.b === f.b && last.i === f.i) last.t += x.ch; else parts.push({ t: x.ch, b: f.b, i: f.i }); }
        const mixed = parts.some(x => x.i && x.t.trim()) || (boldN > 0 && boldN < n);
        const runs = mixed ? parts.map(x => ({ ...x, t: clean(x.t.replace(/\r/g, '')) ? x.t.replace(/\x0b/g, '\n').replace(/\t/g, '    ').replace(/[\x1f\x01\x02\x05\x08]/g, '') : x.t.replace(/[\x1f\x01\x02\x05\x08\r]/g, '') })).filter(x => x.t) : null;
        blocks.push({ type: 'p', text: t, ...(align ? { align } : {}), ...(n > 0 && boldN === n ? { bold: true } : {}), ...(runs ? { runs } : {}) });
      };
      for (const x of items) {
        const ch = x.ch;
        // Absatzende mitten in einer Tabellenzeile: mehrere Absätze in einer Zelle (nur der letzte endet mit der Zellmarke)
        if (ch === '\r') { if (row.length) buf.push({ ch: '\n', fc: x.fc }); else { para(buf, x.fc); buf = []; } }
        else if (ch === '\x0c') { para(buf, null); buf = []; if (blocks.length && blocks[blocks.length - 1].type !== 'pagebreak') blocks.push({ type: 'pagebreak' }); }
        else if (ch === '\x07') {
          const t = clean(buf.map(y => y.ch).join('')); buf = [];
          if (!t && row.length && (!cols || row.length >= cols)) { if (!cols) cols = row.length; rows.push(row); row = []; }
          else row.push(t);
        } else buf.push(x);
      }
      para(buf, null); endTable();
      while (blocks.length && blocks[blocks.length - 1].type === 'pagebreak') blocks.pop();
      return blocks;
    };
    const blocks = build(story(0, ccpText));
    for (const [kind, head] of [['fn', 'Fußnoten'], ['en', 'Endnoten']]) {
      const o = notes[kind]; if (!o.used.length) continue;
      const items = o.used.map((k, i) => { const a = o.txt[k], b = o.txt[k + 1]; if (a == null || b == null) return null; const t = clean(story(o.base + a, o.base + b).map(x => x.ch).join('').replace(/\r/g, '\n')).replace(/\n+/g, ' ').trim(); return t ? `${sup(i + 1)} ${t}` : null; }).filter(Boolean);
      if (!items.length) continue;
      blocks.push({ type: 'hr' }, { type: 'p', text: root.I18N?.t ? String(root.I18N.t(head)) : head, bold: true, small: true });   // Überschrift in der Oberflächensprache
      for (const t of items) blocks.push({ type: 'p', text: t, small: true, tight: true });
    }
    if (!blocks.length) throw new Error('Die Word-Datei enthält keinen Text.');
    // Kopf- und Fußzeile des ersten Abschnitts (PlcfHdd: 6 Trenner-Teile, dann je Abschnitt gerade/ungerade Kopf, gerade/ungerade Fuß, erste Seite)
    const page = {};
    // Seitenformat und Ränder des ersten Abschnitts (PlcfSed → Sepx im Hauptteil; Twips → pt)
    try {
      const [fcSed, lcbSed] = fcLcb(6);
      if (lcbSed >= 16 && fcSed + lcbSed <= tbl.length) {
        const fcSepx = tv.getInt32(fcSed + 8 + 2, true);
        if (fcSepx > 0 && fcSepx + 2 <= wd.length) {
          const cb = dv.getUint16(fcSepx, true), sv = {};
          sprms(wd, fcSepx + 2, Math.min(wd.length, fcSepx + 2 + cb), (sp, q) => { if ([0xB01F, 0xB020, 0xB021, 0x9023, 0x9024, 0xB017, 0xB018].includes(sp)) sv[sp] = dv.getInt16(q, true); });
          const tw = v => v / 20;
          if (sv[0xB01F] > 0 && sv[0xB020] > 0) page.size = [tw(sv[0xB01F]), tw(sv[0xB020])];
          if (sv[0xB021] != null) page.margin = Math.max(28, Math.min(85, tw(sv[0xB021]) || 56.7));
          if (sv[0x9023] != null) page.top = Math.max(20, Math.min(200, Math.abs(tw(sv[0x9023])) || 56.7));
          if (sv[0x9024] != null) page.bottom = Math.max(20, Math.min(200, Math.abs(tw(sv[0x9024])) || 56.7));
          if (sv[0xB017] != null) page.headerY = tw(sv[0xB017]); if (sv[0xB018] != null) page.footerY = tw(sv[0xB018]);
        }
      }
    } catch { /* Standardseite */ }
    try {
      const [fcH, lcbH] = fcLcb(11);
      if (ccpHdd > 0 && lcbH >= 4 * 8 && fcH + lcbH <= tbl.length) {
        const m = lcbH / 4, cp = k => k < m ? tv.getUint32(fcH + k * 4, true) : null, h0 = ccpText + Math.max(0, ccpFtn);
        const part = k => { const a = cp(k), b = cp(k + 1); if (a == null || b == null || b <= a) return null; const bl = build(story(h0 + a, h0 + b)).filter(x => x.type !== 'pagebreak'); return bl.length ? bl : null; };
        const hd = part(7) || part(6), ft = part(9) || part(8);
        if (hd) page.header = hd; if (ft) page.footer = ft;
      }
    } catch { /* ohne Kopf-/Fußzeile */ }
    // Hauptschrift (wie bei .docx): direkt gesetzte Schrift der meisten Zeichen, sonst Standardschrift der Vorlagen – Namen aus SttbfFfn
    let font = null;
    try {
      const [fcF, lcbF] = fcLcb(15), names = [];
      if (lcbF && fcF + lcbF <= tbl.length) {
        let q = fcF; const cnt = tv.getUint16(q, true); q += 4;
        for (let k = 0; k < cnt && q < fcF + lcbF; k++) { const len = tbl[q] + 1; let nm = '', o = q + 40; while (o + 1 < q + len) { const ch = tv.getUint16(o, true); if (!ch) break; nm += String.fromCharCode(ch); o += 2; } names.push(nm); q += len; }
      }
      const cnt = new Map(); let all = 0;
      for (let k = 0; k < Math.min(ccpText, 20000); k += 7) { const ch = chars[k]; if (!ch || !ch.trim()) continue; all++; const f = chOf(fcs[k]).ftc; if (f >= 0) cnt.set(f, (cnt.get(f) || 0) + 1); }
      const top = [...cnt].sort((a, b) => b[1] - a[1])[0], ftc = top && top[1] >= all * 0.4 ? top[0] : normFtc >= 0 ? normFtc : defFtc;
      if (ftc >= 0 && names[ftc]) font = names[ftc];
    } catch { /* ohne Schrift */ }
    return { blocks, ...(Object.keys(page).length ? { page } : {}), ...(font ? { font } : {}) };
  }

  function xls(bytes, { locale = 'de-DE' } = {}) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const c = cfbOf(u8, 'Keine Excel-Datei (.xls) – die Datei ist beschädigt oder hat ein anderes Format.');
    const wb = cfbStream(c, 'workbook') || cfbStream(c, 'book'); if (!wb) throw new Error('Keine Excel-Datei (.xls): Arbeitsmappe fehlt.');   // BIFF8 bzw. BIFF5 (Namen ohne Groß-/Kleinschreibung)
    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const recs = at => { const out = []; for (let p = at; p + 4 <= wb.length; ) { const t = dv.getUint16(p, true), l = dv.getUint16(p + 2, true); out.push({ t, p: p + 4, l }); p += 4 + l; if (t === 0x000A) break; } return out; };
    const glob = recs(0); if (!glob.length || glob[0].t !== 0x0809) throw new Error('Keine Excel-Datei (.xls).');
    const biff8 = dv.getUint16(glob[0].p, true) === 0x0600;
    if (glob.some(r => r.t === 0x002F)) throw new Error('Die Excel-Datei ist mit Kennwort geschützt – bitte in Excel ohne Kennwort speichern und erneut öffnen.');
    // Zeichenketten: XLUnicodeString (cch 2 Byte bzw. 1 Byte, Flag fHighByte) – über CONTINUE-Grenzen nur im SST nötig
    const ustr = (p, cch16 = true) => {
      if (!biff8) { const n = cch16 ? dv.getUint16(p, true) : wb[p], o = p + (cch16 ? 2 : 1); return { s: cp1252(wb.subarray(o, o + n)), end: o + n }; }
      const n = cch16 ? dv.getUint16(p, true) : wb[p], f = wb[p + (cch16 ? 2 : 1)], o = p + (cch16 ? 3 : 2);
      return f & 1 ? { s: new TextDecoder('utf-16le').decode(wb.subarray(o, o + n * 2)), end: o + n * 2 } : { s: cp1252(wb.subarray(o, o + n)), end: o + n };
    };
    let date1904 = false; const fmts = new Map(), xfFmt = [], sheets = [], sst = [];
    for (let i = 0; i < glob.length; i++) {
      const r = glob[i];
      if (r.t === 0x0022) date1904 = dv.getUint16(r.p, true) === 1;
      else if (r.t === 0x041E && biff8) fmts.set(dv.getUint16(r.p, true), ustr(r.p + 2).s);
      else if (r.t === 0x00E0) xfFmt.push(dv.getUint16(r.p + 2, true));
      else if (r.t === 0x0085) sheets.push({ at: dv.getUint32(r.p, true), hidden: wb[r.p + 4] & 3, kind: wb[r.p + 5], name: ustr(r.p + 6, false).s });
      else if (r.t === 0x00FC && biff8) {
        // SST mit CONTINUE: Abschnitte; reißt eine Zeichenkette an einer Grenze, beginnt der nächste Abschnitt mit einem neuen Flag-Byte
        const segs = [[r.p + 8, r.p + r.l]]; for (let k = i + 1; k < glob.length && glob[k].t === 0x003C; k++) segs.push([glob[k].p, glob[k].p + glob[k].l]);
        const total = dv.getUint32(r.p + 4, true); let si = 0, p = segs[0][0];
        const need = n => { if (p + n > segs[si][1] && p >= segs[si][1] && si + 1 < segs.length) { si++; p = segs[si][0]; } };
        const skip = n => { while (n > 0 && si < segs.length) { const m = Math.min(n, segs[si][1] - p); p += m; n -= m; if (n > 0) { si++; if (si >= segs.length) break; p = segs[si][0]; } } };
        for (let s = 0; s < total && si < segs.length; s++) {
          need(3); if (p + 3 > segs[si][1]) break;
          const cch = dv.getUint16(p, true), f = wb[p + 2]; p += 3;
          const runs = f & 8 ? (need(2), p += 2, dv.getUint16(p - 2, true)) : 0, ext = f & 4 ? (need(4), p += 4, dv.getUint32(p - 4, true)) : 0;
          let str = '', left = cch, hi = f & 1;
          while (left > 0) {
            if (p >= segs[si][1]) { si++; if (si >= segs.length) break; p = segs[si][0]; hi = wb[p] & 1; p++; }
            const room = Math.floor((segs[si][1] - p) / (hi ? 2 : 1)), m = Math.min(left, room);
            if (m <= 0) { p = segs[si][1]; continue; }   // beschädigt: Rest dieses Abschnitts überspringen (sonst Endlosschleife)
            str += hi ? new TextDecoder('utf-16le').decode(wb.subarray(p, p + m * 2)) : cp1252(wb.subarray(p, p + m));
            p += m * (hi ? 2 : 1); left -= m;
          }
          skip(runs * 4 + ext); sst.push(str);
        }
      }
    }
    const DATE_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]), BUILTIN = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 7: '#,##0.00 €', 8: '#,##0.00 €' };
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 10, useGrouping: false }), df = new Intl.DateTimeFormat(locale);   // Standardformat: ohne Tausenderpunkt (wie Excel/Calc)
    const fmtNum = (num, xf) => {
      const id = xfFmt[xf] ?? 0, code = fmts.get(id) || BUILTIN[id] || '';
      const isDate = DATE_IDS.has(id) || (fmts.has(id) && /(^|[^"\\])[dmyj]{1,4}/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,%\s€]+$/.test(code));
      if (isDate && num > 0 && num < 2958466) return df.format(new Date(Math.round((num + (date1904 ? 1462 : 0) - 25569) * 864e5)));
      if (!code || code.toLowerCase() === 'general') return nf.format(num);
      const dec = (/0[.,](0+)/.exec(code.split(';')[0]) || [, ''])[1].length;
      return new Intl.NumberFormat(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec, style: /%/.test(code) ? 'percent' : 'decimal' }).format(num) + (/€|EUR/.test(code) ? ' €' : '');
    };
    const rk = v => { const b = new DataView(new ArrayBuffer(8)); let n; if (v & 2) n = v >> 2; else { b.setUint32(4, v & 0xFFFFFFFC, true); b.setUint32(0, 0, true); n = b.getFloat64(0, true); } return v & 1 ? n / 100 : n; };
    const blocks = [];
    for (const s of sheets) {
      if (s.hidden || s.kind !== 0 || s.at >= wb.length) continue;
      const grid = [], put = (r, col, v) => { if (r < 65536 && col < 256) (grid[r] ||= [])[col] = v; };
      let pendingStr = null;
      for (const r of recs(s.at)) {
        const row = () => dv.getUint16(r.p, true), col = () => dv.getUint16(r.p + 2, true), xf = () => dv.getUint16(r.p + 4, true);
        if (r.t === 0x00FD) put(row(), col(), sst[dv.getUint32(r.p + 6, true)] ?? '');
        else if (r.t === 0x0203) put(row(), col(), fmtNum(dv.getFloat64(r.p + 6, true), xf()));
        else if (r.t === 0x027E) put(row(), col(), fmtNum(rk(dv.getInt32(r.p + 6, true)), xf()));
        else if (r.t === 0x00BD) { const rr = row(), c0 = col(), c1 = dv.getUint16(r.p + r.l - 2, true); for (let k = 0; k <= c1 - c0 && k < (r.l - 6) / 6; k++) put(rr, c0 + k, fmtNum(rk(dv.getInt32(r.p + 4 + k * 6 + 2, true)), dv.getUint16(r.p + 4 + k * 6, true))); }
        else if (r.t === 0x0204) put(row(), col(), ustr(r.p + 6).s);
        else if (r.t === 0x00D6 && !biff8) put(row(), col(), ustr(r.p + 6).s);   // RSTRING (BIFF5)
        else if (r.t === 0x0205) { const v = wb[r.p + 6], err = wb[r.p + 7]; put(row(), col(), err ? '#FEHLER' : v ? 'WAHR' : 'FALSCH'); }
        else if (r.t === 0x0006) {   // Formel: gespeichertes Ergebnis
          const rr = row(), cc = col(), x = xf();
          if (dv.getUint16(r.p + 12, true) === 0xFFFF) { const k = wb[r.p + 6]; if (k === 0) pendingStr = [rr, cc]; else if (k === 1) put(rr, cc, wb[r.p + 8] ? 'WAHR' : 'FALSCH'); else if (k === 2) put(rr, cc, '#FEHLER'); }
          else put(rr, cc, fmtNum(dv.getFloat64(r.p + 6, true), x));
        } else if (r.t === 0x0207 && pendingStr) { put(pendingStr[0], pendingStr[1], ustr(r.p).s); pendingStr = null; }
      }
      const dense = grid.filter(Boolean).map(r => Array.from(r, x => x ?? ''));
      let n = Math.max(0, ...dense.map(r => r.length)); while (n > 0 && dense.every(r => !r[n - 1])) n--;
      let first = 0; while (first < n && dense.every(r => !r[first])) first++;
      const tbl = dense.map(r => Array.from({ length: n - first }, (_, i) => r[first + i] ?? '')).filter(r => r.some(Boolean));
      if (tbl.length) blocks.push({ type: 'h', level: 2, text: s.name }, { type: 'table', rows: tbl, head: true });
    }
    if (blocks.length === 2) blocks.shift();   // nur ein Blatt mit Werten: ohne Blattüberschrift
    if (!blocks.length) throw new Error('Die Excel-Datei enthält keine Werte.');
    return { blocks };
  }

  const api = { doc, xls, readZip, archive, archiveList, psd, parseXml, parseHtml, html, docx, xlsx, odt, ods, epub, rtf, xps };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Office = api;
})(typeof self !== 'undefined' ? self : this);
