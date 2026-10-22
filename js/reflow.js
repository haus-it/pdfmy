// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Lesemodus: Text einer Seite in Absätze und Überschriften gliedern, damit er auf dem Handy neu umbricht.
   Eingabe: Zeilen aus Wörtern { t, x, y, w, h } (Seitenmaße 0…1, oben = 0), wie sie die Texterkennung bzw. die Textebene liefert.
   Ausgabe: [{ type: 'h' | 'p' | 'li', text }]. Rein lokal, ohne Bibliothek. */
(function (root) {
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * q)] : 0; };
  const BULLET = /^([•·▪◦‣–\-*]|\d{1,2}[.)]|[a-z][.)])\s/;

  function blocks(lines) {
    const L = lines.filter(ws => ws && ws.length).map(ws => {
      const text = ws.map(w => w.t).join(' ').replace(/\s+/g, ' ').trim();
      return { text, x0: Math.min(...ws.map(w => w.x)), x1: Math.max(...ws.map(w => w.x + w.w)),
        top: Math.min(...ws.map(w => w.y)), bot: Math.max(...ws.map(w => w.y + w.h)), h: median(ws.map(w => w.h)) };
    }).filter(l => l.text);
    if (!L.length) return [];
    const medH = median(L.map(l => l.h)) || 0.01;
    const gaps = L.slice(1).map((l, i) => l.top - L[i].bot).filter(g => g > 0);
    const medGap = quant(gaps, 0.3) || medH * 0.3;   // üblicher Zeilenabstand (unteres Drittel: Absatzabstände zählen nicht mit)
    const right = median(L.map(l => l.x1)), left = median(L.map(l => l.x0));
    const out = []; let cur = null;
    const push = () => { if (cur) out.push(cur); cur = null; };
    L.forEach((l, i) => {
      const prev = L[i - 1], big = l.h > medH * 1.3, bullet = BULLET.test(l.text);
      const gap = prev ? l.top - prev.bot : 0;
      const brk = !cur || gap > Math.min(Math.max(medGap * 1.8, medH * 0.7), medH * 1.2) || gap < -medH * 0.5   // großer Abstand oder neue Spalte
        || Math.abs(l.h - prev.h) > medH * 0.3 || bullet
        || (prev.x1 < right - (right - left) * 0.2 && /[.:!?]["“”»]?$/.test(prev.text));   // kurze Zeile mit Satzende
      if (brk) { push(); cur = { type: big && l.text.length < 120 ? 'h' : bullet ? 'li' : 'p', text: l.text, lines: 1 }; return; }
      // Silbentrennung am Zeilenende aufheben („Woh-“ + „nung“), Bindestrich vor Großbuchstaben behalten („Rhein-“ + „Main“)
      if (/[a-zäöüß]-$/.test(cur.text) && /^[a-zäöüß]/.test(l.text)) cur.text = cur.text.slice(0, -1) + l.text;
      else cur.text += ' ' + l.text;
      cur.lines++;
    });
    push();
    // Überschrift über mehr als drei Zeilen ist eher ein großgedruckter Absatz
    return out.map(b => ({ type: b.type === 'h' && b.lines > 3 ? 'p' : b.type, text: b.text }));
  }

  // Ohne Positionen (nur Text): Leerzeilen trennen Absätze
  function fromText(text) {
    return String(text || '').split(/\n\s*\n/).map(p => p.replace(/([a-zäöüß])-\n([a-zäöüß])/g, '$1$2').replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean).map(t => ({ type: BULLET.test(t) ? 'li' : 'p', text: t }));
  }

  const api = { blocks, fromText };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Reflow = api;
})(typeof self !== 'undefined' ? self : globalThis);
