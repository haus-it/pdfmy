// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Formularfelder auf „flachen“ Formularen erkennen (Scan oder PDF ohne Felder) – wie „Formular vorbereiten“ in Acrobat.
   Findet Schreiblinien (____), leere Eingabekästen und Ankreuzfelder; benennt sie nach der Beschriftung daneben.
   gray: Graustufen (0–255) W×H, words: [{ t, x, y, w, h }] normiert 0..1. Ergebnis normiert: [{ type: 'text'|'check', x, y, w, h, name }] */
(function (root) {
  'use strict';
  function detectFields(gray, W, H, words = []) {
    const dark = new Uint8Array(W * H);
    for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < 140 ? 1 : 0;
    const textH = (() => { const hs = words.map(w => w.h * H).filter(h => h > 4).sort((a, b) => a - b); return hs.length ? hs[hs.length >> 1] : H * 0.012; })();
    const inkIn = (x0, y0, x1, y1) => { let n = 0, t = 0; for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1); x++) { t++; n += dark[y * W + x]; } return t ? n / t : 1; };
    const wordIn = (x0, y0, x1, y1) => words.some(w => w.x * W < x1 && (w.x + w.w) * W > x0 && w.y * H < y1 && (w.y + w.h) * H > y0 && !/^[_.…\-–]+$/.test(w.t));

    // 1) Waagrechte Linien: lange dunkle Läufe in einer Zeile, über bis zu 5 Zeilen zusammengefasst
    const minLen = Math.max(40, W * 0.06), segs = [];
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!dark[y * W + x]) { x++; continue; }
        let e = x; while (e < W && dark[y * W + e]) e++;
        if (e - x >= minLen) {
          const s = segs.find(g => y - g.y1 <= 1 && Math.abs(g.x0 - x) < 6 && Math.abs(g.x1 - e) < 6);
          if (s) { s.y1 = y; s.x0 = Math.min(s.x0, x); s.x1 = Math.max(s.x1, e); } else segs.push({ x0: x, x1: e, y0: y, y1: y });
        }
        x = e;
      }
    }
    const lines = segs.filter(s => s.y1 - s.y0 <= 5);
    const fields = [], used = new Set();
    // 2) Kästen: zwei Linien gleicher Breite übereinander + senkrechte Ränder, innen leer → Eingabefeld im Kasten
    for (const a of lines) for (const b of lines) {
      if (a === b || used.has(a) || used.has(b)) continue;
      const gap = b.y0 - a.y1;
      if (gap < textH * 1.1 || gap > H * 0.3 || Math.abs(a.x0 - b.x0) > 5 || Math.abs(a.x1 - b.x1) > 5) continue;
      const side = x => inkIn(x - 3, a.y1 + 1, x + 4, b.y0) > 0.15;   // senkrechter Rand (1–3 px breit) im 7-px-Fenster
      if (!side(a.x0) || !side(a.x1 - 1)) continue;
      const ix0 = a.x0 + 4, ix1 = a.x1 - 4, iy0 = a.y1 + 3, iy1 = b.y0 - 2;
      if (inkIn(ix0, iy0, ix1, iy1) > 0.01 || wordIn(ix0, iy0, ix1, iy1)) continue;   // Kasten mit Inhalt (Tabelle mit Text) – kein Feld
      used.add(a); used.add(b);
      fields.push({ type: 'text', x: ix0, y: iy0, w: ix1 - ix0, h: iy1 - iy0 });
    }
    // 3) Schreiblinien: über der Linie frei (kein Text, kaum Tinte) → Feld darüber
    for (const l of lines) {
      if (used.has(l)) continue;
      const h = textH * 1.7, y0 = l.y0 - h, x0 = l.x0 + 2, x1 = l.x1 - 2;
      if (y0 < 0 || inkIn(x0, y0, x1, l.y0 - 2) > 0.012 || wordIn(x0, y0, x1, l.y0 - 1)) continue;
      // Teil eines Kastens/einer Tabelle (Linie direkt darüber) → auslassen
      if (lines.some(o => o !== l && o.y1 < l.y0 && l.y0 - o.y1 < h && Math.abs(o.x0 - l.x0) < 6 && Math.abs(o.x1 - l.x1) < 6)) continue;
      fields.push({ type: 'text', x: x0, y: y0 + h * 0.15, w: x1 - x0, h: h * 0.85 });
    }
    // 4) Ankreuzfelder: kleine, fast quadratische Rahmen mit leerem Inneren
    const lbl = new Int32Array(W * H), st = new Int32Array(W * H); let id = 0;
    const cmin = Math.max(8, textH * 0.55), cmax = Math.max(cmin + 4, textH * 2.2);
    for (let i = 0; i < dark.length; i++) {
      if (!dark[i] || lbl[i]) continue; id++;
      let sp = 0, n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; st[sp++] = i; lbl[i] = id;
      while (sp) {
        const p = st[--sp], x = p % W, y = (p - x) / W; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && dark[p - 1] && !lbl[p - 1]) { lbl[p - 1] = id; st[sp++] = p - 1; }
        if (x < W - 1 && dark[p + 1] && !lbl[p + 1]) { lbl[p + 1] = id; st[sp++] = p + 1; }
        if (p >= W && dark[p - W] && !lbl[p - W]) { lbl[p - W] = id; st[sp++] = p - W; }
        if (p < W * (H - 1) && dark[p + W] && !lbl[p + W]) { lbl[p + W] = id; st[sp++] = p + W; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < cmin || bw > cmax || bh < cmin || bh > cmax || Math.abs(bw - bh) > Math.max(3, bw * 0.2)) continue;
      const fill = n / (bw * bh);
      if (fill < 0.12 || fill > 0.6) continue;
      const m = Math.round(bw * 0.28);
      if (inkIn(x0 + m, y0 + m, x1 - m + 1, y1 - m + 1) > 0.03) continue;   // schon angekreuzt oder ein Buchstabe (O, D …)
      // Gerade Ränder auf allen vier Seiten (Buchstaben wie O, D, 0 sind rund oder offen)
      const band = (ax, ay, bx, by) => inkIn(ax, ay, bx, by);
      const t = Math.max(2, Math.round(bw * 0.12));
      if (band(x0, y0, x1 + 1, y0 + t) < 0.4 || band(x0, y1 - t + 1, x1 + 1, y1 + 1) < 0.4 || band(x0, y0, x0 + t, y1 + 1) < 0.4 || band(x1 - t + 1, y0, x1 + 1, y1 + 1) < 0.4) continue;
      // Buchstabe (D, O, 0 …): rechts daneben geht die Schrift ohne Abstand weiter – bei einem Ankreuzfeld folgt eine Lücke
      if (inkIn(x1 + 1, y0 + 2, x1 + 1 + Math.max(3, Math.round(bw * 0.35)), y1 - 1) > 0.04) continue;
      // Buchstabe mitten in einem Wort (Wort reicht links und rechts deutlich über den Rahmen hinaus)
      const cx = (x0 + x1) / 2;   // … oder am Wortende: Wort beginnt deutlich links davon und reicht über die Mitte des Rahmens
      if (words.some(w => w.x * W < x0 - bw && (w.x + w.w) * W > cx && w.y * H < y1 && (w.y + w.h) * H > y0)) continue;
      fields.push({ type: 'check', x: x0, y: y0, w: bw, h: bh });
    }
    // Beschriftung: Wörter links davon (Textfelder) bzw. rechts daneben (Ankreuzfelder), sonst darüber
    const names = new Map();
    const label = f => {
      const cy = f.y + f.h / 2, same = words.filter(w => Math.abs((w.y + w.h / 2) * H - cy) < Math.max(f.h, textH) * 0.8 && !/^[_.…\-–:]+$/.test(w.t));
      let pick = f.type === 'check'
        ? (() => {   // Wörter rechts daneben bis zur nächsten Lücke bzw. zum nächsten Ankreuzfeld
            const nextBox = fields.filter(o => o !== f && o.type === 'check' && Math.abs(o.y - f.y) < f.h && o.x > f.x).reduce((m, o) => Math.min(m, o.x), Infinity);
            const r = same.filter(w => w.x * W >= f.x + f.w - 2 && w.x * W < nextBox).sort((a, b) => a.x - b.x), out = [];
            for (const w of r) { const last = out[out.length - 1]; if ((last ? w.x * W - (last.x + last.w) * W : w.x * W - (f.x + f.w)) > textH * 1.6 || out.length >= 4) break; out.push(w); }
            return out;
          })()
        : same.filter(w => (w.x + w.w) * W <= f.x + 4 && f.x - (w.x + w.w) * W < textH * 14).sort((a, b) => a.x - b.x).slice(-3);
      if (!pick.length && f.type === 'text') {
        // Beschriftung darüber oder darunter – die nähere gewinnt (viele Formulare: Linie, Beschriftung klein darunter)
        const ok = w => !/^[_.…\-–:]+$/.test(w.t) && w.x * W < f.x + f.w && (w.x + w.w) * W > f.x;
        const line = f.y + f.h;   // Unterkante des Felds = Schreiblinie
        const above = words.filter(w => ok(w) && (w.y + w.h) * H <= f.y + 2 && f.y - (w.y + w.h) * H < textH * 1.6).map(w => ({ w, d: f.y - (w.y + w.h) * H }));
        const below = words.filter(w => ok(w) && w.y * H >= line - 2 && w.y * H - line < textH * 1.6 && w.x * W >= f.x - textH * 2 && w.x * W < f.x + Math.max(textH * 6, f.w * 0.5)).map(w => ({ w, d: w.y * H - line }));
        const near = a => a.length ? Math.min(...a.map(o => o.d)) : Infinity, dA = near(above), dB = near(below);
        const src = dB <= dA ? below : above, d0 = Math.min(dA, dB);
        pick = src.filter(o => o.d - d0 < textH * 0.6).map(o => o.w).sort((a, b) => a.x - b.x).slice(0, 3);
      }
      if (!pick.length) pick = words.filter(w => (w.y + w.h) * H <= f.y + 2 && f.y - (w.y + w.h) * H < textH * 1.6 && w.x * W < f.x + f.w && (w.x + w.w) * W > f.x).slice(0, 3);
      let n = pick.map(w => w.t).join(' ').replace(/\s*[(\-–,]\s*falls\b.*$/i, '').replace(/[:_.…]+$/, '').trim().slice(0, 40) || (f.type === 'check' ? 'Auswahl' : 'Feld');   // „Kundennummer (falls vorhanden)“ → „Kundennummer“
      const k = names.get(n) || 0; names.set(n, k + 1); return k ? `${n} ${k + 1}` : n;
    };
    return fields.sort((a, b) => a.y - b.y || a.x - b.x).map(f => ({ type: f.type, x: f.x / W, y: f.y / H, w: f.w / W, h: f.h / H, name: label(f) }));
  }
  const api = { detectFields };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FormDetect = api;
})(typeof self !== 'undefined' ? self : globalThis);
