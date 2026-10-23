// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Text einer Seite gliedern – für den Lesemodus (Text neu umbrechen) und „PDF → Word“:
   Absätze, Überschriften (Ebene 1/2), Aufzählungen und Tabellen.
   Eingabe: Zeilen aus Wörtern { t, x, y, w, h } (Seitenmaße 0…1, oben = 0), wie sie die Texterkennung bzw. die Textebene liefert.
   Ausgabe: [{ type: 'h', level, text } | { type: 'p' | 'li', text } | { type: 'table', rows: [[Zelle, …], …] }]. Rein lokal, ohne Bibliothek. */
(function (root) {
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * q)] : 0; };
  const BULLET = /^([•·▪◦‣–\-*]|\d{1,2}[.)]|[a-z][.)])\s/;

  // Zellen einer Zeile: Lücke ab ~1,6 Zeichenhöhen trennt (Wortabstände im Fließtext sind ~0,3)
  function cellsOf(ws, h) {
    const s = [...ws].sort((a, b) => a.x - b.x), cells = [];
    for (const w of s) {
      const c = cells[cells.length - 1];
      if (c && w.x - c.x1 < h * 1.6) { c.t += ' ' + w.t; c.x1 = w.x + w.w; } else cells.push({ t: w.t, x0: w.x, x1: w.x + w.w });
    }
    return cells;
  }

  /* Tabelle aus Zeilen mit Zellen: Spalten = zusammengefasste Zellbereiche aller Zeilen (so passen auch rechtsbündige Beträge).
     Ergebnis null, wenn es keine saubere Tabelle ist (weniger als 2 Spalten). */
  function tableOf(rows) {
    const spans = [];
    for (const r of rows) for (const c of r.cells) {
      const hit = spans.filter(s => c.x0 < s.x1 && c.x1 > s.x0);
      if (!hit.length) spans.push({ x0: c.x0, x1: c.x1 });
      else { const m = { x0: Math.min(c.x0, ...hit.map(s => s.x0)), x1: Math.max(c.x1, ...hit.map(s => s.x1)) }; for (const s of hit) spans.splice(spans.indexOf(s), 1); spans.push(m); }
    }
    spans.sort((a, b) => a.x0 - b.x0);
    if (spans.length < 2) return null;
    const out = rows.map(r => { const cells = spans.map(() => ''); for (const c of r.cells) { const i = spans.findIndex(s => c.x0 < s.x1 && c.x1 > s.x0); cells[i] = cells[i] ? cells[i] + ' ' + c.t : c.t; } return cells; });
    // Spaltenbreiten wie im Original (Anteile, Summe 1): vom Beginn einer Spalte bis zum Beginn der nächsten
    const ext = spans.map((s, i) => (i + 1 < spans.length ? spans[i + 1].x0 : s.x1) - s.x0), sum = ext.reduce((a, b) => a + b, 0) || 1;
    return { rows: out, widths: ext.map(e => Math.round(e / sum * 1000) / 1000) };
  }

  function blocks(lines) {
    const L = lines.filter(ws => ws && ws.length).map(ws => {
      const text = ws.map(w => w.t).join(' ').replace(/\s+/g, ' ').trim(), h = median(ws.map(w => w.h));
      return { ws, text, h, x0: Math.min(...ws.map(w => w.x)), x1: Math.max(...ws.map(w => w.x + w.w)),
        top: Math.min(...ws.map(w => w.y)), bot: Math.max(...ws.map(w => w.y + w.h)) };
    }).filter(l => l.text);
    if (!L.length) return [];
    const medH = median(L.map(l => l.h)) || 0.01;
    for (const l of L) l.cells = cellsOf(l.ws, Math.max(l.h, medH));
    const gaps = L.slice(1).map((l, i) => l.top - L[i].bot).filter(g => g > 0);
    const medGap = quant(gaps, 0.3) || medH * 0.3;   // üblicher Zeilenabstand (unteres Drittel: Absatzabstände zählen nicht mit)
    const right = median(L.map(l => l.x1)), left = median(L.map(l => l.x0));
    const out = []; let cur = null;
    const push = () => { if (cur) out.push(cur); cur = null; };
    for (let i = 0; i < L.length; i++) {
      const l = L[i], prev = L[i - 1];
      // Tabelle: mindestens 2 aufeinanderfolgende Zeilen mit je 2+ Zellen
      if (l.cells.length >= 2) {
        let j = i; while (j + 1 < L.length && L[j + 1].cells.length >= 2 && L[j + 1].top - L[j].bot < medH * 2.5) j++;
        const t = j > i ? tableOf(L.slice(i, j + 1)) : null;
        if (t) { push(); out.push({ type: 'table', rows: t.rows, widths: t.widths }); i = j; continue; }
      }
      const big = l.h > medH * 1.2, bullet = BULLET.test(l.text);
      const gap = prev ? l.top - prev.bot : 0;
      const brk = !cur || gap > Math.min(Math.max(medGap * 1.8, medH * 0.7), medH * 1.2) || gap < -medH * 0.5   // großer Abstand oder neue Spalte
        || Math.abs(l.h - prev.h) > medH * 0.2 || bullet
        || /^(sehr geehrte|liebe|hallo|guten tag|dear|bonjour|madame|monsieur)\b.*,$/i.test(prev.text)   // Anrede steht für sich
        || (prev.x1 < right - (right - left) * 0.2 && /[.:!?]["“”»]?$/.test(prev.text));   // kurze Zeile mit Satzende
      if (brk) { push(); cur = { type: big && l.text.length < 120 ? 'h' : bullet ? 'li' : 'p', level: l.h > medH * 1.7 ? 1 : 2, text: l.text, lines: 1 }; continue; }
      // Silbentrennung am Zeilenende aufheben („Woh-“ + „nung“), Bindestrich vor Großbuchstaben behalten („Rhein-“ + „Main“)
      // Kurze Zeilen untereinander (Anschrift, Briefkopf): Zeilenumbruch behalten
      const short = x => x.x1 < left + (right - left) * 0.6;
      if (short(prev) && short(l)) cur.text += '\n' + l.text;
      else if (/[a-zäöüß]-$/.test(cur.text) && /^[a-zäöüß]/.test(l.text)) cur.text = cur.text.slice(0, -1) + l.text;
      else cur.text += ' ' + l.text;
      cur.lines++;
    }
    push();
    // Überschrift über mehr als drei Zeilen ist eher ein großgedruckter Absatz
    return out.map(b => b.type === 'table' ? b : b.type === 'h' && b.lines <= 3 ? { type: 'h', level: b.level, text: b.text } : { type: b.type === 'h' ? 'p' : b.type, text: b.text });
  }

  // Ohne Positionen (nur Text): Leerzeilen trennen Absätze
  function fromText(text) {
    return String(text || '').split(/\n\s*\n/).map(p => p.replace(/([a-zäöüß])-\n([a-zäöüß])/g, '$1$2').replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean).map(t => ({ type: BULLET.test(t) ? 'li' : 'p', text: t }));
  }

  const api = { blocks, fromText };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Reflow = api;
})(typeof self !== 'undefined' ? self : globalThis);
