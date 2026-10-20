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
  async function build(L, { text, kind = 'txt', title = '', fonts }) {
    const doc = await L.PDFDocument.create();
    if (fonts.fontkit) doc.registerFontkit(fonts.fontkit);
    const F = { r: await doc.embedFont(fonts.regular, { subset: true }), b: await doc.embedFont(fonts.bold, { subset: true }), m: await doc.embedFont(fonts.mono, { subset: true }) };
    const sets = {}; for (const k in F) sets[k] = new Set(F[k].getCharacterSet());
    const safe = (s, k) => [...String(s).replace(/\t/g, '    ')].map(ch => ch === '\n' || sets[k].has(ch.codePointAt(0)) ? ch : '?').join('');
    let blocks;
    if (kind === 'csv') blocks = [{ type: 'table', rows: parseCsv(text), head: true }];
    else if (kind === 'md') blocks = parseMarkdown(text);
    else blocks = [{ type: 'pre', text: String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n') }];
    const cols = Math.max(0, ...blocks.filter(b => b.type === 'table').map(b => b.rows[0]?.length || 0));
    const land = cols > 6;
    const PW = land ? 841.89 : 595.28, PH = land ? 595.28 : 841.89, M = 56.7, W = PW - 2 * M, gray = L.rgb(0.45, 0.45, 0.45);
    let page, y;
    const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M; };
    newPage();
    const need = h => { if (y - h < M) newPage(); };
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
    const text1 = (s, { k = 'r', size = 10.5, x = M, width = W, color, lead = 1.38 } = {}) => {
      const font = F[k];
      for (const ln of wrap(safe(s, k), font, size, width)) { need(size * lead); y -= size * lead; page.drawText(ln, { x, y: y + size * 0.25, size, font, color }); }
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
        if (y - lay.h < M) { newPage(); if (hd) drawRow(rows[0], true, hd); }   // Tabellenkopf auf jeder neuen Seite wiederholen
        drawRow(r, false, lay);
      }
      y -= 8;
    };
    if (title && kind !== 'md') { text1(title, { k: 'b', size: 15 }); y -= 6; }
    for (const b of blocks) {
      if (b.type === 'h') { const size = [0, 20, 16, 13.5, 12, 11, 10.5][b.level]; y -= b.level <= 2 ? 10 : 6; need(size * 2.4); text1(b.text, { k: 'b', size, lead: 1.25 }); y -= 4; }
      else if (b.type === 'p') { text1(b.text); y -= 6; }
      else if (b.type === 'li') { const ind = 14 + b.depth * 16; need(16); page.drawText(safe(b.label, 'r'), { x: M + ind - (b.ordered ? 14 : 9), y: y - 10.5 * 1.38 + 10.5 * 0.25, size: 10.5, font: F.r }); text1(b.text, { x: M + ind, width: W - ind }); y -= 2; }   // Aufzählungszeichen zuerst (Lesereihenfolge)
      else if (b.type === 'quote') { const y0 = y, p0 = page; text1(b.text, { x: M + 14, width: W - 14, color: gray }); if (page === p0) page.drawLine({ start: { x: M + 4, y: y0 - 2 }, end: { x: M + 4, y: y + 2 }, thickness: 2, color: L.rgb(0.75, 0.75, 0.75) }); y -= 6; }
      else if (b.type === 'code' || b.type === 'pre') { text1(b.text, { k: 'm', size: b.type === 'pre' ? 9.5 : 9, lead: 1.3 }); y -= 6; }
      else if (b.type === 'hr') { need(14); y -= 7; page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.6, color: L.rgb(0.7, 0.7, 0.7) }); y -= 7; }
      else if (b.type === 'table') table(b.rows, b.head);
    }
    const pages = doc.getPages();
    if (pages.length > 1) pages.forEach((p, i) => { const s = `${i + 1} / ${pages.length}`; p.drawText(s, { x: PW / 2 - F.r.widthOfTextAtSize(s, 8) / 2, y: M / 2, size: 8, font: F.r, color: gray }); });
    doc.setTitle(title || 'Dokument'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setCreator('PDFMy');
    return doc.save();
  }

  const api = { parseCsv, parseMarkdown, build };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TextPdf = api;
})(typeof self !== 'undefined' ? self : this);
