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
  const OPEN_EXT = /\.(pdf|jpe?g|png|webp|bmp|gif|tiff?|heic|heif|psd|psb|txt|md|markdown|csv|docx|xlsx|odt|ods|epub|rtf|o?xps|xml|eml|msg)$/i;
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
    const relsOf = async part => { const m = new Map(), x = await z.text(part.replace(/([^/]+)$/, '_rels/$1.rels')); if (x) for (const r of all(parseXml(x), 'Relationship')) m.set(r.attrs.Id, r.attrs.Target); return m; };
    let rels = await relsOf('word/document.xml');
    const counters = new Map(); let blocks = [];
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
              else if (c.name === 'w:drawing' || c.name === 'w:pict') { const im = await image(c); if (im) extra.push(im); }
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
    for (const k of els(body)) {
      if (k.name === 'w:p') await para(k);
      else if (k.name === 'w:tbl') await table(k);
      else if (k.name === 'w:sdt') for (const c of els(kid(k, 'w:sdtContent') || { kids: [] })) { if (c.name === 'w:p') await para(c); else if (c.name === 'w:tbl') await table(c); }
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
  const api = { readZip, archive, archiveList, psd, parseXml, docx, xlsx, odt, ods, epub, rtf, xps };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Office = api;
})(typeof self !== 'undefined' ? self : this);
