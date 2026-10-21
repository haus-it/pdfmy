// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Text, Markdown und CSV → PDF (A4, eingebettete DejaVu-Schriften). Ohne DOM: läuft im Browser und in Node-Tests.
   TextPdf.build(PDFLib, { text, kind: 'txt'|'md'|'csv', title, fonts: { regular, bold, mono } }) → Uint8Array */
(function (root) {
  'use strict';

  // CSV lesen: Trennzeichen (; , Tab |) aus der ersten Zeile, Anführungszeichen mit "" als Escape, Zeilenumbrüche in Feldern
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = [';', ',', '\t', '|'].map(d => [d, first.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
    const d = counts[0][1] > 0 ? counts[0][0] : ';';
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
      if (c === '"' && f === '') q = true;
      else if (c === d) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every(x => x === '')) rows.pop();
    const n = Math.max(0, ...rows.map(r => r.length));
    return rows.map(r => Array.from({ length: n }, (_, i) => (r[i] ?? '').trim()));
  }

  // Markdown (vereinfachtes CommonMark): Überschriften, Absätze, Listen, Zitate, Code-Blöcke, Tabellen, Trennlinien
  const inline = s => String(s).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(^|[^*\w])[*_]([^*_\s][^*_]*?)[*_](?=[^*\w]|$)/g, '$1$2').replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1');
  const isRow = l => /^\s*\|.*\|\s*$/.test(l);
  const cellsOf = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => inline(c.trim()));
  function parseMarkdown(text) {
    const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n'), out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^\s*(```|~~~)/))) {
        const code = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(m[1])) code.push(lines[i++]);
        i++; out.push({ type: 'code', text: code.join('\n') }); continue;
      }
      if ((m = l.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push({ type: 'h', level: m[1].length, text: inline(m[2]) }); i++; continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push({ type: 'hr' }); i++; continue; }
      if (isRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const rows = [cellsOf(l)]; i += 2;
        while (i < lines.length && isRow(lines[i])) rows.push(cellsOf(lines[i++]));
        out.push({ type: 'table', rows, head: true }); continue;
      }
      if ((m = l.match(/^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/))) {
        const ord = /\d/.test(m[2]); let text = m[3]; i++;
        while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d{1,3}[.)])\s+/.test(lines[i]) && /^\s{2,}/.test(lines[i])) text += ' ' + lines[i++].trim();
        out.push({ type: 'li', ordered: ord, label: ord ? m[2].replace(')', '.') : '•', depth: Math.min(3, Math.floor(m[1].replace(/\t/g, '    ').length / 2)), text: inline(text.replace(/^\[( |x)\]\s+/i, (s, x) => x.trim() ? '☑ ' : '☐ ')) });
        continue;
      }
      if (/^\s*>/.test(l)) {
        const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push({ type: 'quote', text: inline(q.join(' ')) }); continue;
      }
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^\s{0,3}(#{1,6}\s|```|~~~|>|[-*+]\s|\d{1,3}[.)]\s)/.test(lines[i]) && !isRow(lines[i])) p.push(lines[i++].trim());
      if (!p.length) { out.push({ type: 'p', text: inline(lines[i++].trim()) }); continue; }
      out.push({ type: 'p', text: inline(p.join(' ')) });
    }
    return out;
  }

  // Satz: A4 hoch (Tabellen mit vielen Spalten: quer), Ränder 2 cm, Umbruch nach Wortbreite, Seitenzahl unten
  /* blocks: fertige Bausteine (z. B. aus js/office.js) statt text; page: { size: [w, h] in pt, margin, top, bottom, header: [Bausteine], footer: [Bausteine] }
     (sonst A4, 2 cm). Absätze mit runs: [{ t, b, i }] wechseln innerhalb der Zeile zwischen normal, fett und kursiv. {PAGE}/{NUMPAGES} in Kopf-/Fußzeile. */
  async function build(L, { text, kind = 'txt', title = '', fonts, blocks: given = null, page: pg = null }) {
    const doc = await L.PDFDocument.create();
    if (fonts.fontkit) doc.registerFontkit(fonts.fontkit);
    const F = { r: await doc.embedFont(fonts.regular, { subset: true }), b: await doc.embedFont(fonts.bold, { subset: true }), m: await doc.embedFont(fonts.mono, { subset: true }) };
    if (fonts.italic) F.i = await doc.embedFont(fonts.italic, { subset: true });
    if (fonts.boldItalic) F.bi = await doc.embedFont(fonts.boldItalic, { subset: true });
    F.i ||= F.r; F.bi ||= F.b;   // ohne Kursivschnitt: aufrecht
    const sets = {}; for (const k in F) sets[k] = new Set(F[k].getCharacterSet());
    const safe = (s, k) => [...String(s).replace(/\t/g, '    ')].map(ch => ch === '\n' || sets[k].has(ch.codePointAt(0)) ? ch : '?').join('');
    let blocks;
    if (given) blocks = given;
    else if (kind === 'csv') blocks = [{ type: 'table', rows: parseCsv(text), head: true }];
    else if (kind === 'md') blocks = parseMarkdown(text);
    else blocks = [{ type: 'pre', text: String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n') }];
    const cols = Math.max(0, ...blocks.filter(b => b.type === 'table').map(b => b.rows[0]?.length || 0));
    const sz = pg?.size && pg.size[0] > 100 && pg.size[1] > 100 ? pg.size : null, land = !sz && cols > 6;
    const PW = sz ? sz[0] : land ? 841.89 : 595.28, PH = sz ? sz[1] : land ? 595.28 : 841.89, M = pg?.margin || 56.7, W = PW - 2 * M, gray = L.rgb(0.45, 0.45, 0.45);
    const Mt = pg?.top || M, Mb = pg?.bottom || M;   // Rand oben/unten (Word: getrennt einstellbar)
    let paginate = true;   // Kopf-/Fußzeilen: ohne Seitenumbruch
    let page, y;
    const newPage = () => { page = doc.addPage([PW, PH]); y = PH - Mt; };
    newPage();
    const need = h => { if (paginate && y - h < Mb) newPage(); };
    const wrap = (s, font, size, width) => {
      const out = [];
      for (const para of String(s).split('\n')) {
        let line = '';
        for (const word of para.split(/(\s+)/)) {
          if (!word) continue;
          const t = line + word;
          if (font.widthOfTextAtSize(t.trimEnd(), size) <= width || !line.trim()) {
            if (!line.trim() && font.widthOfTextAtSize(word, size) > width) {   // überlanges Wort hart trennen
              let w = '';
              for (const ch of word) { if (font.widthOfTextAtSize(w + ch, size) > width) { out.push(w); w = ''; } w += ch; }
              line = w;
            } else line = t;
          } else { out.push(line.trimEnd()); line = word.trimStart(); }
        }
        out.push(line.trimEnd());
      }
      return out;
    };
    // Text mit wechselnden Schnitten: Wörter je Schnitt messen und zeilenweise setzen
    const runs1 = (runs, { size = 10.5, x = M, width = W, color, lead = 1.38, align } = {}) => {
      const kOf = r => r.b && r.i ? 'bi' : r.b ? 'b' : r.i ? 'i' : 'r', toks = [];
      for (const rn of runs) for (const part of String(rn.t).split(/(\n|\s+)/)) if (part) toks.push({ t: part === '\n' ? '\n' : safe(part, 'r'), k: kOf(rn) });
      const lines = [[]]; let wl = 0;
      for (const t of toks) {
        if (t.t === '\n') { lines.push([]); wl = 0; continue; }
        const tw = F[t.k].widthOfTextAtSize(t.t, size), cur = lines[lines.length - 1];
        if (/^\s+$/.test(t.t)) { if (cur.length) { cur.push({ ...t, w: tw }); wl += tw; } continue; }
        if (wl + tw > width && cur.length) { while (cur.length && /^\s+$/.test(cur[cur.length - 1].t)) wl -= cur.pop().w; lines.push([]); wl = 0; }
        lines[lines.length - 1].push({ ...t, w: tw }); wl += tw;
      }
      for (const ln of lines) {
        while (ln.length && /^\s+$/.test(ln[ln.length - 1].t)) ln.pop();
        need(size * lead); y -= size * lead;
        const tw = ln.reduce((a, t) => a + t.w, 0); let lx = align === 'center' ? x + (width - tw) / 2 : align === 'right' ? x + width - tw : x;
        // aufeinanderfolgende Wörter gleichen Schnitts als ein Stück (beim Kopieren bleiben die Leerzeichen erhalten)
        const segs = []; for (const t of ln) { const g = segs[segs.length - 1]; if (g && g.k === t.k) { g.t += t.t; g.w += t.w; } else segs.push({ ...t }); }
        for (const g of segs) { if (g.t.trim()) page.drawText(g.t, { x: lx, y: y + size * 0.25, size, font: F[g.k], color }); lx += g.w; }
      }
    };
    const text1 = (s, { k = 'r', size = 10.5, x = M, width = W, color, lead = 1.38, align } = {}) => {
      const font = F[k];
      for (const ln of wrap(safe(s, k), font, size, width)) {
        need(size * lead); y -= size * lead;
        const tw = align ? font.widthOfTextAtSize(ln, size) : 0, lx = align === 'center' ? x + (width - tw) / 2 : align === 'right' ? x + width - tw : x;
        page.drawText(ln, { x: lx, y: y + size * 0.25, size, font, color });
      }
    };
    const table = (rows, head) => {
      if (!rows.length) return;
      const n = rows[0].length, size = n > 10 ? 7.5 : n > 6 ? 8.5 : 9.5, pad = 3;
      // Spaltenbreite nach Inhalt (gekappt), mindestens 6 %
      const want = Array.from({ length: n }, (_, c) => Math.min(220, Math.max(24, ...rows.slice(0, 200).map(r => F[head && r === rows[0] ? 'b' : 'r'].widthOfTextAtSize(safe(r[c], 'r'), size) + 2 * pad))));
      const sum = want.reduce((a, b) => a + b, 0), cw = want.map(w => Math.max(W * 0.06, w * W / sum));
      const scale = W / cw.reduce((a, b) => a + b, 0); for (let c = 0; c < n; c++) cw[c] *= scale;
      const layout = (r, bold) => { const k = bold ? 'b' : 'r', lines = r.map((v, c) => wrap(safe(v, k), F[k], size, cw[c] - 2 * pad)); return { k, lines, h: Math.max(...lines.map(l => l.length)) * size * 1.3 + 2 * pad }; };
      const drawRow = (r, bold, lay = layout(r, bold)) => {
        const { k, lines, h } = lay; let x = M;
        for (let c = 0; c < n; c++) {
          page.drawRectangle({ x, y: y - h, width: cw[c], height: h, borderColor: L.rgb(0.7, 0.7, 0.7), borderWidth: 0.5, color: bold ? L.rgb(0.93, 0.93, 0.93) : undefined });
          const num = !bold && /^-?[\d.,\s]+(?:€|EUR|%)?$/.test(r[c]) && /\d/.test(r[c]);   // Zahlen rechtsbündig
          lines[c].forEach((ln, j) => {
            const tw = F[k].widthOfTextAtSize(ln, size);
            page.drawText(ln, { x: num ? x + cw[c] - pad - tw : x + pad, y: y - pad - (j + 1) * size * 1.3 + size * 0.3, size, font: F[k] });
          });
          x += cw[c];
        }
        y -= h;
      };
      const hd = head ? layout(rows[0], true) : null;
      if (hd) { need(hd.h + size * 3); drawRow(rows[0], true, hd); }
      for (const r of rows.slice(head ? 1 : 0)) {
        const lay = layout(r, false);
        if (paginate && y - lay.h < Mb) { newPage(); if (hd) drawRow(rows[0], true, hd); }   // Tabellenkopf auf jeder neuen Seite wiederholen
        drawRow(r, false, lay);
      }
      y -= 8;
    };
    if (title && kind !== 'md' && !given) { text1(title, { k: 'b', size: 15 }); y -= 6; }
    async function render(list) {
    for (const b of list) {
      if (b.type === 'h') { const size = [0, 20, 16, 13.5, 12, 11, 10.5][b.level]; y -= b.level <= 2 ? 10 : 6; need(size * 2.4); text1(b.text, { k: 'b', size, lead: 1.25 }); y -= 4; }
      else if (b.type === 'p') { if (b.runs?.length) runs1(b.runs, { align: b.align }); else text1(b.text, { k: b.bold ? 'b' : 'r', align: b.align }); y -= b.tight ? 2 : 6; }
      else if (b.type === 'gap') { y -= 10.5 * 1.1; if (paginate && y < Mb) newPage(); }
      else if (b.type === 'pagebreak') { if (paginate && y < PH - Mt - 1) newPage(); }
      else if (b.type === 'img') {
        // Bild (PNG/JPEG) in Originalgröße, höchstens Satzbreite bzw. -höhe
        let im; try { im = b.mime === 'image/png' ? await doc.embedPng(b.bytes) : await doc.embedJpg(b.bytes); } catch { text1('[Bild]', { color: gray }); continue; }
        const k = Math.min(1, W / b.w, (PH - Mt - Mb) / b.h), w = b.w * k, h = b.h * k;
        need(h + 4); y -= h + 2;
        page.drawImage(im, { x: b.align === 'center' ? M + (W - w) / 2 : b.align === 'right' ? M + W - w : M, y, width: w, height: h }); y -= 4;
      }
      else if (b.type === 'li') { const ind = 14 + b.depth * 16; need(16); page.drawText(safe(b.label, 'r'), { x: M + ind - (b.ordered ? 14 : 9), y: y - 10.5 * 1.38 + 10.5 * 0.25, size: 10.5, font: F.r }); if (b.runs?.length) runs1(b.runs, { x: M + ind, width: W - ind }); else text1(b.text, { x: M + ind, width: W - ind }); y -= 2; }   // Aufzählungszeichen zuerst (Lesereihenfolge)
      else if (b.type === 'quote') { const y0 = y, p0 = page; text1(b.text, { x: M + 14, width: W - 14, color: gray }); if (page === p0) page.drawLine({ start: { x: M + 4, y: y0 - 2 }, end: { x: M + 4, y: y + 2 }, thickness: 2, color: L.rgb(0.75, 0.75, 0.75) }); y -= 6; }
      else if (b.type === 'code' || b.type === 'pre') { text1(b.text, { k: 'm', size: b.type === 'pre' ? 9.5 : 9, lead: 1.3 }); y -= 6; }
      else if (b.type === 'hr') { need(14); y -= 7; page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.6, color: L.rgb(0.7, 0.7, 0.7) }); y -= 7; }
      else if (b.type === 'table') table(b.rows, b.head);
    }
    }
    await render(blocks);
    const pages = doc.getPages();
    // Kopf- und Fußzeilen (z. B. aus Word): auf jede Seite, {PAGE}/{NUMPAGES} ersetzt; Kopf oben im Rand, Fuß unter dem Satzspiegel
    const hf = (list, i) => JSON.parse(JSON.stringify(list, (k, v) => k === 'bytes' ? undefined : v), (k, v) => typeof v === 'string' ? v.replace(/\{PAGE\}/g, String(i + 1)).replace(/\{NUMPAGES\}/g, String(pages.length)) : v)
      .map((b, j) => list[j].bytes ? { ...b, bytes: list[j].bytes } : b);
    if (pg?.header?.length || pg?.footer?.length) {
      paginate = false;
      for (const [i, p] of pages.entries()) {
        page = p;
        if (pg.header?.length) { y = PH - (pg.headerY || Math.max(20, Mt * 0.45)); await render(hf(pg.header, i).map(b => b.type === 'p' ? { ...b, tight: true } : b)); }
        if (pg.footer?.length) { y = Math.min(Mb - 4, (pg.footerY || Mb * 0.45) + 30); await render(hf(pg.footer, i).map(b => b.type === 'p' ? { ...b, tight: true } : b)); }
      }
      paginate = true;
    } else if (pages.length > 1) pages.forEach((p, i) => { const s = `${i + 1} / ${pages.length}`; p.drawText(s, { x: PW / 2 - F.r.widthOfTextAtSize(s, 8) / 2, y: M / 2, size: 8, font: F.r, color: gray }); });
    doc.setTitle(title || 'Dokument'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setCreator('PDFMy');
    return doc.save();
  }

  const api = { parseCsv, parseMarkdown, build };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TextPdf = api;
})(typeof self !== 'undefined' ? self : this);
