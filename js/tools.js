// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Werkzeuge ohne DOM: ZIP-Archiv, Seitenbereiche, Größenangaben. Läuft im Browser und in Node-Tests. */
(function (root) {
  'use strict';

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ZIP ohne Kompression (JPG/PDF sind bereits komprimiert). files: [{name, data: Uint8Array}] */
  function zip(files, date = new Date()) {
    const enc = new TextEncoder();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const locals = [], centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8-Namen
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      locals.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      if (f.mode) { ch.setUint16(4, (3 << 8) | 20, true); ch.setUint32(38, (f.mode << 16) >>> 0, true); }   // Unix-Rechte (z. B. 0o100755: am Mac ausführbar)
      centrals.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = centrals.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((s, a) => s + a.length, 0));
    let p = 0; for (const a of parts) { out.set(a, p); p += a.length; }
    return out;
  }

  /* "1-3, 5, 8-" → [0,1,2,4,7,8,…] (0-basiert, sortiert, ohne Doppelte). Ungültig → null */
  function parseRange(text, count) {
    const s = String(text || '').replace(/\s+/g, '');
    if (!s) return null;
    const out = new Set();
    for (const part of s.split(/[,;]/)) {
      if (!part) continue;
      const m = part.match(/^(\d*)(?:(-)(\d*))?$/);
      if (!m) return null;
      let a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : count) : a;
      if (!m[1] && !m[2]) return null;
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > count) return null;
      for (let i = a; i <= b; i++) out.add(i - 1);
    }
    return out.size ? [...out].sort((x, y) => x - y) : null;
  }

  // Dateigröße für die Anzeige – Dezimalzeichen nach Oberflächensprache (ohne I18N, z. B. in Tests: deutsch)
  const formatBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB'
    : (typeof I18N !== 'undefined' && I18N.fmtNum ? I18N.fmtNum(n / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : (n / 1048576).toFixed(1).replace('.', ',')) + ' MB';

  const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  /* Word-Dokument (.docx, Office Open XML) aus dem Text der Seiten: ein Absatz je Zeile, Seitenumbruch je Seite */
  function docx(pages, { title = '', author = '' } = {}, date = new Date()) {
    const enc = new TextEncoder(), iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const para = t => `<w:p><w:r><w:t xml:space="preserve">${xml(t)}</w:t></w:r></w:p>`;
    const body = pages.map((t, i) => (i ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') +
      String(t || '').replace(/\r/g, '').split('\n').map(para).join('')).join('');
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
      'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator><dc:language>de-DE</dc:language>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created></cp:coreProperties>`,
      'word/document.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    };
    return zip(Object.entries(files).map(([name, s]) => ({ name, data: enc.encode(s) })), date);
  }

  /* Wortweiser Vergleich zweier Texte (Myers-Diff). Ergebnis: [{op:'='|'+'|'-', t:'…'}], Leerraum bleibt beim Wort. */
  /* Visueller Vergleich (wie „Dateien vergleichen“ in Acrobat Pro): zwei gleich große RGBA-Bilder → Überlagerung.
     Unverändertes blass grau, nur in der zweiten Fassung (neu) grün, nur in der ersten (entfernt) rot.
     Kleine Helligkeitsunterschiede (Kantenglättung, JPEG) unter thr zählen nicht; einzelne Pixel ohne geänderten Nachbarn ebenso. */
  function pixelDiff(a, b, w, h, thr = 60, cs = 24) {
    const n = w * h, d = new Int8Array(n), out = new Uint8ClampedArray(n * 4);
    const lum = (p, o) => p[o] * 0.299 + p[o + 1] * 0.587 + p[o + 2] * 0.114;
    for (let i = 0; i < n; i++) { const la = lum(a, i * 4), lb = lum(b, i * 4); d[i] = lb < la - thr ? 1 : la < lb - thr ? -1 : 0; }
    let changed = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    const gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), cell = new Uint8Array(gw * gh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      let v = d[i];
      if (v && !((x > 0 && d[i - 1]) || (x < w - 1 && d[i + 1]) || (y > 0 && d[i - w]) || (y < h - 1 && d[i + w]))) v = 0;
      if (v > 0) { out[o] = 0; out[o + 1] = 150; out[o + 2] = 60; }
      else if (v < 0) { out[o] = 215; out[o + 1] = 30; out[o + 2] = 30; }
      else { const g = 255 - (255 - Math.min(lum(a, o), lum(b, o))) * 0.28; out[o] = out[o + 1] = out[o + 2] = g; }
      out[o + 3] = 255;
      if (v) { changed++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; cell[Math.floor(y / cs) * gw + Math.floor(x / cs)] = 1; }
    }
    // Geänderte Stellen zu Bereichen zusammenfassen (Raster cs × cs, benachbarte Zellen gehören zusammen) – je Bereich ein Rahmen
    const regions = [];
    for (let s = 0; s < cell.length; s++) {
      if (cell[s] !== 1) continue;
      const st = [s]; cell[s] = 2; let cx0 = gw, cy0 = gh, cx1 = -1, cy1 = -1;
      while (st.length) {
        const c = st.pop(), cx = c % gw, cy = (c - cx) / gw;
        cx0 = Math.min(cx0, cx); cx1 = Math.max(cx1, cx); cy0 = Math.min(cy0, cy); cy1 = Math.max(cy1, cy);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy, k = ny * gw + nx;
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && cell[k] === 1) { cell[k] = 2; st.push(k); }
        }
      }
      const rx = cx0 * cs, ry = cy0 * cs; regions.push({ x: rx, y: ry, w: Math.min(w, (cx1 + 1) * cs) - rx, h: Math.min(h, (cy1 + 1) * cs) - ry });
    }
    return { data: out, changed, share: changed / n, regions, box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
  }
  function diffWords(a, b, maxD = 4000) {
    const tok = s => String(s || '').match(/\s*\S+/g) || [];
    const A = tok(a), B = tok(b), key = t => t.trim();
    // Gemeinsamen Anfang/Ende abschneiden (schnell bei kleinen Änderungen in langen Texten)
    let pre = 0; while (pre < A.length && pre < B.length && key(A[pre]) === key(B[pre])) pre++;
    let suf = 0; while (suf < A.length - pre && suf < B.length - pre && key(A[A.length - 1 - suf]) === key(B[B.length - 1 - suf])) suf++;
    const a2 = A.slice(pre, A.length - suf), b2 = B.slice(pre, B.length - suf), N = a2.length, M = b2.length;
    const out = A.slice(0, pre).map(t => ({ op: '=', t }));
    const mid = [];
    const off = N + M + 1, V = new Int32Array(2 * off + 1), trace = [];
    let found = N === 0 && M === 0;
    for (let d = 0; d <= Math.min(N + M, maxD) && !found; d++) {
      trace.push(V.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && V[off + k - 1] < V[off + k + 1]) ? V[off + k + 1] : V[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && key(a2[x]) === key(b2[y])) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) { found = true; break; }
      }
    }
    if (!found) { a2.forEach(t => mid.push({ op: '-', t })); b2.forEach(t => mid.push({ op: '+', t })); }
    else {
      let x = N, y = M;
      for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
        const v = trace[d], k = x - y;
        const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
        const px = d === 0 ? 0 : v[off + prevK], py = px - prevK;
        while (x > px && y > py) { mid.push({ op: '=', t: b2[--y] }); x--; }
        if (d > 0) { if (x === px) mid.push({ op: '+', t: b2[--y] }); else mid.push({ op: '-', t: a2[--x] }); }
      }
      mid.reverse();
    }
    out.push(...mid, ...B.slice(B.length - suf).map(t => ({ op: '=', t })));
    // Gleichartige Nachbarn zusammenfassen
    const merged = [];
    for (const s of out) { const l = merged[merged.length - 1]; if (l && l.op === s.op) l.t += s.t; else merged.push({ ...s }); }
    return merged;
  }

  /* Platzhalter in Kopf-/Fußzeilen: {seite} {seiten} {datum} {datei} {bates} */
  function fillStamp(tpl, v) {
    return String(tpl || '').replace(/\{(seite|seiten|datum|datei|bates)\}/gi, (_, k) => String(v[k.toLowerCase()] ?? ''));
  }
  /* Bates-Nummer: Präfix + fortlaufende Nummer mit festen Stellen, z. B. "MG-000042" */
  const bates = (prefix, n, digits = 6) => String(prefix || '') + String(n).padStart(digits, '0');

  /* Tabellen aus Wortpositionen: Wörter → Zeilen (gleiche Höhe) → Zellen (große Lücken) → Spalten (gemeinsame linke Kanten).
     words: [{ t, x, y, w, h }] normiert 0..1. Ergebnis: Zeilen mit Zellen (Text) in gemeinsamen Spalten. */
  function tableRows(words) {
    const ws = words.filter(w => w.t && w.t.trim()).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
    const rows = [];
    for (const w of ws) {
      const r = rows[rows.length - 1];
      if (r && Math.abs((w.y + w.h / 2) - r.cy) < Math.max(w.h, r.h) * 0.55) { r.words.push(w); r.cy = (r.cy * (r.words.length - 1) + w.y + w.h / 2) / r.words.length; r.h = Math.max(r.h, w.h); }
      else rows.push({ cy: w.y + w.h / 2, h: w.h, words: [w] });
    }
    // Zellen: Lücke größer als ~1,1 Zeichenhöhen trennt Zellen
    const cellsOf = r => {
      const s = r.words.sort((a, b) => a.x - b.x), cells = [];
      for (const w of s) { const c = cells[cells.length - 1]; if (c && w.x - (c.x + c.w) < r.h * 1.1) { c.t += ' ' + w.t; c.w = w.x + w.w - c.x; } else cells.push({ t: w.t, x: w.x, w: w.w }); }
      return cells;
    };
    const lines = rows.map(cellsOf);
    // Spalten: linke Kanten (und für Beträge rechte Kanten) sammeln und zusammenfassen
    const edges = [];
    for (const l of lines) for (const c of l) edges.push(c.x);
    edges.sort((a, b) => a - b);
    const cols = [];
    for (const x of edges) { const c = cols[cols.length - 1]; if (c && x - c.max < 0.012) { c.max = x; c.n++; } else cols.push({ min: x, max: x, n: 1 }); }
    const col = x => { let best = 0, d = Infinity; cols.forEach((c, i) => { const dd = x < c.min ? c.min - x : x > c.max ? x - c.max : 0; if (dd < d) { d = dd; best = i; } }); return best; };
    return lines.map(l => { const r = []; for (const c of l) { const i = col(c.x); r[i] = r[i] ? r[i] + ' ' + c.t : c.t; } return Array.from({ length: Math.max(r.length, 0) }, (_, i) => r[i] || ''); });
  }
  // Deutsche Zahl/Beträge als Zahl: „1.501,34“, „-12,5“, „1.520,24 EUR“ → 1501.34 (Datumsangaben, Nummern bleiben Text)
  function deNumber(s) {
    const m = String(s).trim().match(/^(-?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})(?:\s?(?:EUR|€|%))?$/) || String(s).trim().match(/^(-?)(\d{1,3}(?:\.\d{3})+)(?:\s?(?:EUR|€))?$/);
    if (!m) return null;
    return +((m[1] || '') + m[2].replace(/\./g, '') + (m[3] ? '.' + m[3] : ''));
  }
  /* Minimale Excel-Datei (.xlsx): sheets = [{ name, rows: [[text|zahl, …]] }] – Beträge als Zahlen mit 2 Nachkommastellen */
  function xlsx(sheets) {
    const enc = s => new TextEncoder().encode(s), esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const sheetXml = rows => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
        if (v === '' || v == null) return '';
        const ref = colName(ci) + (ri + 1), n = typeof v === 'number' ? v : deNumber(v);
        return n != null ? `<c r="${ref}" s="1"><v>${n}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('') + '</row>').join('') + '</sheetData></worksheet>';
    const names = sheets.map((s, i) => (String(s.name || 'Seite ' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)) || 'Seite ' + (i + 1));
    const files = [
      { name: '[Content_Types].xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
      { name: '_rels/.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
      { name: 'xl/workbook.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
      { name: 'xl/styles.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf numFmtId="4" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s.rows)) })),
    ];
    return zip(files);
  }
  // Gliederung aus Wortpositionen (pdf.js-Text oder Texterkennung): Überschriften (Schriftgröße/fett), Aufzählungen,
  // Absätze (Zeilenabstand, Silbentrennung) und Tabellen (mehrere Zeilen mit gleich vielen Spalten). Grundlage für Markdown und HTML.
  // pages: [[{ t, x, y, w, h, f?: { bold } }]] mit Koordinaten 0…1 (y von oben)
  function docBlocks(pages) {
    const all = pages.flat().filter(w => w && w.t && w.t.trim());
    const hs = all.map(w => w.h).sort((a, b) => a - b), body = hs.length ? hs[Math.floor(hs.length / 2)] : 0.012;
    const blocks = [];
    pages.forEach((words, pi) => {
      if (pi > 0) blocks.push({ type: 'page', n: pi + 1 });
      const ws = (words || []).filter(w => w && w.t && w.t.trim()).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
      const rows = [];
      for (const w of ws) {
        const r = rows[rows.length - 1];
        if (r && Math.abs((w.y + w.h / 2) - r.cy) < Math.max(w.h, r.h) * 0.55) { r.words.push(w); r.h = Math.max(r.h, w.h); }
        else rows.push({ cy: w.y + w.h / 2, h: w.h, words: [w] });
      }
      const lines = rows.map(r => {
        const s = r.words.sort((a, b) => a.x - b.x), cells = [];
        for (const w of s) { const c = cells[cells.length - 1]; if (c && w.x - (c.x + c.w) < Math.max(r.h * 1.6, 0.02)) { c.t += ' ' + w.t; c.w = w.x + w.w - c.x; } else cells.push({ t: w.t, x: w.x, w: w.w }); }
        const hMed = r.words.map(w => w.h).sort((a, b) => a - b)[Math.floor(r.words.length / 2)];
        return { cells, text: cells.map(c => c.t).join(' ').replace(/\s+/g, ' ').trim(), y: r.cy - r.h / 2, h: hMed, bottom: r.cy + r.h / 2, x: s[0].x,
          bold: r.words.every(w => w.f?.bold) };
      });
      let i = 0;
      while (i < lines.length) {
        // Tabelle: mindestens 2 aufeinanderfolgende Zeilen mit je ≥ 2 Spalten, ähnlich vielen Spalten
        let j = i;
        while (j < lines.length && lines[j].cells.length >= 2 && Math.abs(lines[j].cells.length - lines[i].cells.length) <= 1) j++;
        if (j - i >= 3 || (j - i >= 2 && lines[i].cells.length >= 3)) {
          const n = Math.max(...lines.slice(i, j).map(l => l.cells.length));
          const edges = lines[i].cells.length === n ? lines[i].cells.map(c => c.x) : lines.slice(i, j).find(l => l.cells.length === n).cells.map(c => c.x);
          const col = x => { let b = 0, d = Infinity; edges.forEach((e, k) => { const dd = Math.abs(e - x); if (dd < d) { d = dd; b = k; } }); return b; };
          const rowsT = lines.slice(i, j).map(l => { const r = Array(n).fill(''); for (const c of l.cells) { const k = col(c.x); r[k] = r[k] ? r[k] + ' ' + c.t : c.t; } return r; });
          blocks.push({ type: 'table', rows: rowsT }); i = j; continue;
        }
        const l = lines[i], t = l.text;
        const ratio = l.h / body;
        if (t.length <= 120 && !/[.,;:]$/.test(t) && (ratio >= 1.3 || (l.bold && t.length <= 80 && !lines.slice(i + 1, i + 2).every(n => n.bold)))) {
          blocks.push({ type: 'h', level: ratio >= 1.8 ? 1 : ratio >= 1.3 ? 2 : 3, text: t }); i++; continue;
        }
        const li = t.match(/^(?:[•●▪◦‣\-–*]|(\d{1,3})[.)])\s+(.+)$/);
        if (li) { blocks.push({ type: 'li', ordered: !!li[1], n: li[1] ? +li[1] : 0, text: li[2] }); i++; continue; }
        // Absatz: Folgezeilen mit normalem Zeilenabstand, keine Überschrift/Aufzählung/Tabelle
        let text = t, k = i + 1;
        while (k < lines.length) {
          const prev = lines[k - 1], nx = lines[k];
          if (nx.cells.length >= 2 || nx.y - prev.bottom > Math.max(prev.h, nx.h) * 0.9 || /^(?:[•●▪◦‣\-–*]|\d{1,3}[.)])\s/.test(nx.text) || nx.h / body >= 1.3) break;
          text = /[A-Za-zÄÖÜäöüß]-$/.test(text) && /^[a-zäöüß]/.test(nx.text) ? text.slice(0, -1) + nx.text : text + ' ' + nx.text;
          k++;
        }
        blocks.push({ type: 'p', text }); i = k;
      }
    });
    return blocks;
  }
  function toMarkdown(blocks, { title = '' } = {}) {
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/([*_`[\]<>])/g, '\\$1');
    const lead = s => s.replace(/^(#|>|\+|-|=|\d+[.)])(?=\s|$)/, '\\$1');
    const out = []; if (title) out.push('# ' + esc(title), '');
    let prevLi = false;
    for (const b of blocks) {
      if (b.type !== 'li' && prevLi) out.push('');
      if (b.type === 'page') out.push(`<!-- Seite ${b.n} -->`, '');
      else if (b.type === 'h') out.push('#'.repeat(Math.min(6, b.level + (title ? 1 : 0))) + ' ' + esc(b.text), '');
      else if (b.type === 'li') out.push((b.ordered ? b.n + '. ' : '- ') + esc(b.text));
      else if (b.type === 'p') out.push(lead(esc(b.text)), '');
      else if (b.type === 'table') {
        const cell = s => esc(s).replace(/\|/g, '\\|');
        out.push('| ' + b.rows[0].map(cell).join(' | ') + ' |', '|' + b.rows[0].map(() => ' --- ').join('|') + '|');
        for (const r of b.rows.slice(1)) out.push('| ' + r.map(cell).join(' | ') + ' |');
        out.push('');
      }
      prevLi = b.type === 'li';
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  function toHtml(blocks, { title = '', lang = 'de' } = {}) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const own = blocks[0]?.type === 'h', out = [], off = title && !own ? 1 : 0; let list = null;   // eigene Überschrift des Dokuments geht vor
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    if (off) out.push(`<h1>${esc(title)}</h1>`);
    for (const b of blocks) {
      if (b.type === 'li') { const t = b.ordered ? 'ol' : 'ul'; if (list !== t) { close(); out.push(`<${t}>`); list = t; } out.push(`<li>${esc(b.text)}</li>`); continue; }
      close();
      if (b.type === 'page') out.push(`<hr aria-label="Seite ${b.n}">`);
      else if (b.type === 'h') { const l = Math.min(6, b.level + off); out.push(`<h${l}>${esc(b.text)}</h${l}>`); }
      else if (b.type === 'p') out.push(`<p>${esc(b.text)}</p>`);
      else if (b.type === 'table') out.push('<table>', '<thead><tr>' + b.rows[0].map(c => `<th scope="col">${esc(c)}</th>`).join('') + '</tr></thead>', '<tbody>', ...b.rows.slice(1).map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>'), '</tbody>', '</table>');
    }
    close();
    return `<!doctype html>\n<html lang="${esc(lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="generator" content="PDFMy (pdfmy.de)">\n<title>${esc(title || 'Dokument')}</title>\n` +
      `<style>body{font:16px/1.55 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #bbb;padding:.3rem .5rem;text-align:left;vertical-align:top}th{background:#f2f2f2}hr{border:0;border-top:1px dashed #bbb;margin:2rem 0}</style>\n</head>\n<body>\n<main>\n${out.join('\n')}\n</main>\n</body>\n</html>\n`;
  }
  const api = { crc32, zip, parseRange, formatBytes, docx, diffWords, pixelDiff, fillStamp, bates, tableRows, deNumber, xlsx, docBlocks, toMarkdown, toHtml };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Tools = api;
})(typeof self !== 'undefined' ? self : this);
