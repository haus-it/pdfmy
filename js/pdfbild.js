// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Vorhandene Bilder einer PDF-Seite bearbeiten (Wettbewerbsanalyse Rang 8: wie „Objekte bearbeiten“ in Acrobat, Foxit, PDF-XChange):
   verschieben, skalieren, ersetzen, löschen – direkt im Seiteninhalt, ohne die Seite zu rastern. Text, Vektoren und Schriften bleiben.

   Seiteninhalt = Folge von Operatoren (ISO 32000-1, 8.2). tokenize() zerlegt ihn (Zeichenketten, Hex, Wörterbücher, Felder,
   Kommentare, eingebettete Inline-Bilder BI…ID…EI werden übersprungen). images() verfolgt q/Q/cm (Transformationsmatrix) und findet
   jeden Aufruf „/Name Do“ eines Bild-XObjects – seit app-v312 auch in Formular-XObjects (geändert wird dann eine Kopie für diesen Aufruf).
   apply() ersetzt genau diese Aufrufe: löschen = weglassen; verschieben/skalieren/ersetzen = „q T cm /Name Do Q“.

   Matrizen wie in PDF als [a b c d e f] (Zeilenvektor: Punkt × M). Bild = Einheitsquadrat × CTM. */
(function (root) {
  'use strict';
  const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set([...'()<>[]{}/%'].map(c => c.charCodeAt(0)));

  // Operanden-Token: { t: 'num'|'name'|'str'|'hex'|'arr'|'dict'|'kw', v } – nur so genau wie für Bilder nötig
  function tokenize(src) {
    const s = src, n = s.length, ops = [];
    let i = 0, args = [], start = -1;
    const skipWs = () => { for (;;) { while (i < n && WS.has(s.charCodeAt(i))) i++; if (s[i] === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; } else return; } };
    const str = () => {   // (…) mit Klammer-Tiefe und Escapes
      let depth = 0; const a = i;
      for (; i < n; i++) {
        const c = s[i];
        if (c === '\\') { i++; continue; }
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) { i++; return s.slice(a, i); }
      }
      throw new Error('Zeichenkette nicht abgeschlossen');
    };
    const nested = (open, close) => {   // [ … ] und << … >> mit Zeichenketten darin
      const a = i; let depth = 0;
      while (i < n) {
        if (s.startsWith(open, i)) { depth++; i += open.length; continue; }
        if (s.startsWith(close, i)) { depth--; i += close.length; if (!depth) return s.slice(a, i); continue; }
        if (s[i] === '(') { str(); continue; }
        if (s[i] === '<' && s[i + 1] !== '<') { const e = s.indexOf('>', i); i = e < 0 ? n : e + 1; continue; }   // Hex-Zeichenkette (auch direkt vor „>>“)
        if (s[i] === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
        if (open === '[' && s.startsWith('<<', i)) { nested('<<', '>>'); continue; }
        if (open === '<<' && s[i] === '[') { nested('[', ']'); continue; }
        i++;
      }
      throw new Error('Feld/Wörterbuch nicht abgeschlossen');
    };
    for (;;) {
      skipWs(); if (i >= n) break;
      if (start < 0) start = i;
      const c = s[i];
      if (c === '(') { args.push({ t: 'str', v: str() }); continue; }
      if (s.startsWith('<<', i)) { args.push({ t: 'dict', v: nested('<<', '>>') }); continue; }
      if (c === '<') { const e = s.indexOf('>', i); if (e < 0) throw new Error('Hex nicht abgeschlossen'); args.push({ t: 'hex', v: s.slice(i, e + 1) }); i = e + 1; continue; }
      if (c === '[') { args.push({ t: 'arr', v: nested('[', ']') }); continue; }
      if (c === '/') { const a = i++; while (i < n && !WS.has(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++; args.push({ t: 'name', v: s.slice(a + 1, i) }); continue; }
      if (c === ')' || c === '>' || c === ']' || c === '{' || c === '}') { i++; continue; }   // Unsinn überspringen (wie Leseprogramme)
      const a = i; while (i < n && !WS.has(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++;
      const w = s.slice(a, i);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) { args.push({ t: 'num', v: +w }); continue; }
      if (w === 'true' || w === 'false' || w === 'null') { args.push({ t: 'kw', v: w }); continue; }
      if (w === 'BI') {   // Inline-Bild: bis „ID“, dann Binärdaten bis „EI“ zwischen Leerraum
        const id = s.indexOf('ID', i); if (id < 0) throw new Error('Inline-Bild ohne ID');
        let k = id + 3;
        for (;; k++) {
          k = s.indexOf('EI', k); if (k < 0) throw new Error('Inline-Bild ohne EI');
          if (WS.has(s.charCodeAt(k - 1)) && (k + 2 >= n || WS.has(s.charCodeAt(k + 2)))) break;
        }
        i = k + 2; ops.push({ op: 'BI', args: [], start, end: i }); args = []; start = -1; continue;
      }
      ops.push({ op: w, args, start, end: i }); args = []; start = -1;
    }
    return ops;
  }

  const mul = (m, k) => [m[0] * k[0] + m[1] * k[2], m[0] * k[1] + m[1] * k[3], m[2] * k[0] + m[3] * k[2], m[2] * k[1] + m[3] * k[3], m[4] * k[0] + m[5] * k[2] + k[4], m[4] * k[1] + m[5] * k[3] + k[5]];
  function inv(m) {
    const det = m[0] * m[3] - m[1] * m[2]; if (!det || !isFinite(det)) return null;
    const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(m[4] * a + m[5] * c), -(m[4] * b + m[5] * d)];
  }
  const ID = [1, 0, 0, 1, 0, 0];
  // Umriss des Einheitsquadrats unter m: { x, y, w, h } in Seitenkoordinaten (PDF: y nach oben)
  function rectOf(m) {
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [u * m[0] + v * m[2] + m[4], u * m[1] + v * m[3] + m[5]]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /* Bilder: [{ n, name, m, local, rect, start, end, path }] – n zählt die Bild-Aufrufe in Inhaltsreihenfolge (Schlüssel für Änderungen).
     isImage(name) entscheidet anhand der Ressourcen, ob /Name ein Bild ist. Seit app-v312 auch Bilder in Formular-XObjects (viele PDFs
     aus Word, Druckertreibern und Scannern packen den ganzen Seiteninhalt in ein Formular): formOf(name) liefert dann
     { ops, matrix, isImage, formOf, … } und es geht bis zu 4 Ebenen hinein. m = Lage auf der Seite, local = Lage im eigenen Formular,
     path = Formular-Aufrufe von außen nach innen ({ name, start, end, local, form }). Inline-Bilder werden nicht angeboten. */
  function images(ops, isImage, base = ID, formOf = null) {
    const out = [];
    (function walk(ops, isImage, base, formOf, path) {
      let ctm = ID; const stack = [];
      for (const o of ops) {
        if (o.op === 'q') stack.push(ctm);
        else if (o.op === 'Q') ctm = stack.pop() || ID;
        else if (o.op === 'cm' && o.args.length === 6 && o.args.every(a => a.t === 'num')) ctm = mul(o.args.map(a => a.v), ctm);
        else if (o.op === 'Do' && o.args.length === 1 && o.args[0].t === 'name') {
          const name = o.args[0].v, full = mul(ctm, base);
          if (isImage(name)) {
            const r = rectOf(full); if (!(r.w > 0.5 && r.h > 0.5)) continue;   // unsichtbar klein
            out.push({ n: out.length, name, m: full, local: ctm, rect: r, start: o.start, end: o.end, path });
          } else if (formOf && path.length < 4) {
            const f = formOf(name); if (!f) continue;
            walk(f.ops, f.isImage, mul(mul(f.matrix, ctm), base), f.formOf, [...path, { name, start: o.start, end: o.end, local: ctm, form: f }]);
          }
        }
      }
    })(ops, isImage, base, formOf, []);
    return out;
  }

  /* Vektorgrafiken (app-v333, letzte offene Bearbeiten-Lücke aus Rang 8): Linien, Formen, Logos, Diagramme.
     Ein Objekt ist entweder
       – ein Block q … Q, der nur Grafik enthält (Pfade, Farben, Linienstil, cm, innere q/Q, Beschneidung), also kein Text (BT),
         kein Bild/Formular (Do), kein Inline-Bild, keine Schattierung (sh) und ausgeglichene Markierungen (BDC/BMC … EMC) – typisch ein Logo
         oder ein Diagramm; der äußerste solche Block zählt als ein Objekt;
       – sonst jeder einzelne gezeichnete Pfad (m, l, c, v, y, h, re, dann S, s, f, F, f-Stern, B, B-Stern, b, b-Stern), z. B. Tabellenlinien aus Word.
     Pfade mit Beschneidung (W/W*) oder nur „n“ sind unsichtbar bzw. begrenzen anderes – sie werden nie angeboten.
     Ergebnis wie images(): [{ kind:'vec', n, m, local, rect, lrect, start, end, path, paths }]; m = Lage zu Beginn des Objekts auf der Seite
     (für placement), local = dasselbe im eigenen Inhalt, lrect = Umriss im eigenen Inhalt (für den Begrenzungsrahmen von Formularen).
     Änderungen: „q T cm <Objekt> Q“ (verschieben/skalieren) bzw. weglassen (löschen) – der übrige Inhalt bleibt Byte für Byte. */
  const PATH = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']), PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n']);
  const STROKE = new Set(['S', 's', 'B', 'B*', 'b', 'b*']), IMPURE = new Set(['BT', 'ET', 'Do', 'BI', 'sh', 'd0', 'd1', 'BX', 'EX']);
  const MAX_VEC = 2000;
  function graphics(ops, isImage, base = ID, formOf = null) {
    const out = [];
    (function walk(ops, isImage, base, formOf, path) {
      // Paare q … Q und ob der Block reine Grafik ist
      const match = new Array(ops.length).fill(-1), pure = new Array(ops.length).fill(false), st = [];
      const bad = new Array(ops.length + 1).fill(0), mc = new Array(ops.length + 1).fill(0), painted = new Array(ops.length + 1).fill(0);
      for (let i = 0; i < ops.length; i++) {   // Präfixsummen: unreine Operatoren, Markierungstiefe, sichtbar gemalte Pfade
        const o = ops[i].op;
        bad[i + 1] = bad[i] + (IMPURE.has(o) ? 1 : 0);
        mc[i + 1] = mc[i] + (o === 'BDC' || o === 'BMC' ? 1 : o === 'EMC' ? -1 : 0);
        painted[i + 1] = painted[i] + (PAINT.has(o) && o !== 'n' ? 1 : 0);
        if (o === 'q') st.push(i);
        else if (o === 'Q' && st.length) { const a = st.pop(); match[a] = i; }
      }
      const mcOk = (a, b) => { if (mc[b + 1] !== mc[a]) return false; for (let k = a; k <= b; k++) if (mc[k + 1] < mc[a]) return false; return true; };
      for (let i = 0; i < ops.length; i++) if (match[i] > i) { const j = match[i]; pure[i] = bad[j + 1] === bad[i] && painted[j + 1] > painted[i] && mcOk(i, j); }
      let ctm = ID, lw = 1; const stack = [];
      let pts = [], pStart = -1, clip = false;
      const scale = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const bboxPts = (p, m, pad) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [u, v] of p) { const x = u * m[0] + v * m[2] + m[4], y = u * m[1] + v * m[3] + m[5]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        return x0 === Infinity ? null : { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
      };
      const addPts = o => {
        const a = o.args.map(t => t.t === 'num' ? t.v : NaN); if (!a.every(isFinite)) return;
        if (o.op === 're' && a.length === 4) pts.push([a[0], a[1]], [a[0] + a[2], a[1]], [a[0], a[1] + a[3]], [a[0] + a[2], a[1] + a[3]]);
        else for (let k = 0; k + 1 < a.length; k += 2) pts.push([a[k], a[k + 1]]);   // Kontrollpunkte eingeschlossen – Umriss eher zu groß als zu klein
      };
      const emit = (start, end, lrect, mStart, localStart, paths) => {
        if (!lrect || out.length >= MAX_VEC) return;
        const rect = mapRect(lrect, base);
        if (!(Math.max(rect.w, rect.h) >= 2) || ![rect.x, rect.y, rect.w, rect.h].every(isFinite)) return;   // unsichtbar klein
        out.push({ kind: 'vec', n: out.length, m: mStart, local: localStart, rect, lrect, start, end, path, paths });
      };
      // Block i … j vollständig durchrechnen: Umriss aller sichtbar gemalten Pfade im eigenen Inhalt
      const blockBox = (i, j) => {
        let c = ctm, w = lw, p = [], cl = false, box = null, n = 0; const s2 = [];
        for (let k = i; k <= j; k++) {
          const o = ops[k];
          if (o.op === 'q') s2.push([c, w]);
          else if (o.op === 'Q') [c, w] = s2.pop() || [ID, 1];
          else if (o.op === 'cm' && o.args.length === 6 && o.args.every(a => a.t === 'num')) c = mul(o.args.map(a => a.v), c);
          else if (o.op === 'w' && o.args[0]?.t === 'num') w = o.args[0].v;
          else if (PATH.has(o.op)) { const keep = pts; pts = p; addPts(o); p = pts; pts = keep; }
          else if (o.op === 'W' || o.op === 'W*') cl = true;
          else if (PAINT.has(o.op)) {
            if (!cl && o.op !== 'n') { const r = bboxPts(p, c, STROKE.has(o.op) ? Math.max(w, 0.5) * scale(c) / 2 : 0); if (r) { box = union(box, r); n++; } }
            p = []; cl = false;
          }
        }
        return { box, n };
      };
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (o.op === 'q') {
          if (pure[i] && pStart < 0) {
            const j = match[i], b = blockBox(i, j);
            emit(o.start, ops[j].end, b.box, mul(ctm, base), ctm, b.n);
            i = j; continue;
          }
          stack.push([ctm, lw]);
        } else if (o.op === 'Q') [ctm, lw] = stack.pop() || [ID, 1];
        else if (o.op === 'cm' && o.args.length === 6 && o.args.every(a => a.t === 'num')) ctm = mul(o.args.map(a => a.v), ctm);
        else if (o.op === 'w' && o.args[0]?.t === 'num') lw = o.args[0].v;
        else if (PATH.has(o.op)) { if (pStart < 0) { pStart = i; pts = []; clip = false; } addPts(o); }
        else if (o.op === 'W' || o.op === 'W*') clip = true;
        else if (PAINT.has(o.op)) {
          if (pStart >= 0 && !clip && o.op !== 'n') emit(ops[pStart].start, o.end, bboxPts(pts, ctm, STROKE.has(o.op) ? Math.max(lw, 0.5) * scale(ctm) / 2 : 0), mul(ctm, base), ctm, 1);
          pStart = -1; pts = []; clip = false;
        } else if (o.op === 'Do' && o.args.length === 1 && o.args[0].t === 'name' && formOf && path.length < 4 && !isImage(o.args[0].v)) {
          const name = o.args[0].v, f = formOf(name); if (!f) continue;
          walk(f.ops, f.isImage, mul(mul(f.matrix, ctm), base), f.formOf, [...path, { name, start: o.start, end: o.end, local: ctm, form: f }]);
        }
      }
    })(ops, isImage, base, formOf, []);
    return out;
  }

  /* Grafik umfärben (app-v334): alle Füll- und Linienfarben im Objekt auf eine Farbe setzen – Weiß bleibt Weiß (ausgesparte Flächen
     in Logos). Jede Farbangabe wird zu „r g b rg“ bzw. „RG“ (Geräte-RGB); Farbraum-Wechsel (cs/CS) entfallen dadurch. Muster und
     Sonderfarben (Name als Operand, unbekannter Farbraum) gelten als „nicht weiß“. Vorn steht die neue Farbe für Pfade, die die Farbe
     von außen erben. rgb = [r, g, b] von 0 bis 1. */
  const FILL = new Set(['rg', 'g', 'k', 'sc', 'scn']), STRK = new Set(['RG', 'G', 'K', 'SC', 'SCN']);
  function recolor(src, rgb) {
    const ops = tokenize(src), c = rgb.map(num).join(' ');
    let out = '', at = 0, csF = '', csS = '';
    const white = (o, cs) => {
      const v = o.args.filter(a => a.t === 'num').map(a => a.v); if (o.args.some(a => a.t === 'name')) return false;   // Muster
      const op = o.op.toLowerCase(), sp = op === 'g' ? 'DeviceGray' : op === 'rg' ? 'DeviceRGB' : op === 'k' ? 'DeviceCMYK' : cs;
      if (sp === 'DeviceGray' && v.length === 1) return v[0] >= 0.95;
      if (sp === 'DeviceRGB' && v.length === 3) return v.every(x => x >= 0.95);
      if (sp === 'DeviceCMYK' && v.length === 4) return v.every(x => x <= 0.05);
      return false;
    };
    for (const o of ops) {
      let rep = null;
      if (o.op === 'cs' || o.op === 'CS') { const nm = o.args[0]?.t === 'name' ? o.args[0].v : ''; if (o.op === 'cs') csF = nm; else csS = nm; rep = ''; }
      else if (FILL.has(o.op)) rep = white(o, csF) ? '1 1 1 rg' : `${c} rg`;
      else if (STRK.has(o.op)) rep = white(o, csS) ? '1 1 1 RG' : `${c} RG`;
      if (rep === null) continue;
      out += src.slice(at, o.start) + rep; at = o.end;
    }
    return `${c} rg ${c} RG\n` + out + src.slice(at);
  }
  // „#1a2b3c“ → [r, g, b] (0–1) oder null
  const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; };

  /* Neue Lage eines Bilds aus Seiten-Rechtecken: from = bisheriger Umriss, to = gewünschter Umriss (beide achsenparallel, Seitenkoordinaten).
     Ergebnis: Matrix T, die vor „Do“ als „T cm“ steht – (Einheitsquadrat × T × M) liegt dann in „to“.
     fit: Seitenverhältnis des neuen Bilds (Breite/Höhe in Pixeln) – das Bild wird mittig eingepasst statt verzerrt (beim Ersetzen). */
  function placement(m, from, to, fit) {
    if (!(to && to.w > 0 && to.h > 0 && from.w > 0 && from.h > 0) || ![to.x, to.y, to.w, to.h].every(isFinite)) return null;
    const sx = to.w / from.w, sy = to.h / from.h;
    const S = [sx, 0, 0, sy, to.x - from.x * sx, to.y - from.y * sy];   // Seitenraum: from → to
    const mi = inv(m); if (!mi) return null;
    let T = mul(mul(m, S), mi);
    if (fit > 0) {
      // Bildrahmen im eigenen Koordinatensystem: Breite |(a,b)|, Höhe |(c,d)| – nach dem Verschieben/Skalieren
      const M2 = mul(m, S), fw = Math.hypot(M2[0], M2[1]), fh = Math.hypot(M2[2], M2[3]), f = fw / fh;
      const U = fit > f ? [1, 0, 0, f / fit, 0, (1 - f / fit) / 2] : [fit / f, 0, 0, 1, (1 - fit / f) / 2, 0];
      T = mul(U, T);
    }
    return T;
  }
  const num = v => { const r = Math.round(v * 1e5) / 1e5; return Object.is(r, -0) ? '0' : String(r); };

  /* Änderungen anwenden: edits = Map(n → { del } | { T, name? }) – name = neuer Ressourcenname (Ersetzen).
     Gibt den neuen Inhalt zurück (Latin-1-Zeichenkette wie die Eingabe). */
  function apply(src, imgs, edits) {
    let out = '', at = 0;
    for (const im of [...imgs].sort((a, b) => a.start - b.start)) {
      const e = edits.get(im.n); if (!e) continue;
      out += src.slice(at, im.start);
      if (!e.del) out += `q ${e.T.map(num).join(' ')} cm /${e.name || im.name} Do Q`;
      at = im.end;
    }
    return out + src.slice(at);
  }

  // Bytes ↔ Latin-1 (jedes Byte ein Zeichen – binärsicher)
  const toStr = b => { let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; };
  const toBytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };

  // Achsenparalleles Rechteck unter einer Matrix abbilden (z. B. Seitenkoordinaten → Bildschirm über viewport.transform von pdf.js)
  function mapRect(r, m) { return rectOf(mul([r.w, 0, 0, r.h, r.x, r.y], m)); }

  /* ---- Anbindung an pdf-lib (L = PDFLib): Inhalt lesen, Bilder finden, Änderungen schreiben ---- */
  function contentOf(L, page) {
    const c = page.node.get(L.PDFName.of('Contents')), ctx = page.doc.context;
    const list = c instanceof L.PDFArray ? c.asArray() : c ? [c] : [];
    return list.map(r => {
      const st = ctx.lookup(r);
      if (st instanceof L.PDFRawStream) return toStr(L.decodePDFRawStream(st).decode());
      if (st && typeof st.getUnencodedContents === 'function') return toStr(st.getUnencodedContents());
      return '';
    }).join('\n');
  }
  const subtypeOf = (L, res, name) => { try { const xo = res && res.lookupMaybe(L.PDFName.of('XObject'), L.PDFDict), o = xo && xo.lookup(L.PDFName.of(name)); return o && o.dict ? { o, ref: xo.get(L.PDFName.of(name)), sub: o.dict.get(L.PDFName.of('Subtype')) } : null; } catch (e) { return null; } };
  const imageTestRes = (L, res) => name => { const x = subtypeOf(L, res, name); return !!x && x.sub === L.PDFName.of('Image'); };
  function imageTest(L, page) { return imageTestRes(L, page.node.Resources()); }
  const streamText = (L, st) => st instanceof L.PDFRawStream ? toStr(L.decodePDFRawStream(st).decode()) : st && typeof st.getUnencodedContents === 'function' ? toStr(st.getUnencodedContents()) : '';
  // Formular-XObjects unter den Ressourcen res (fehlen eigene Ressourcen, gelten die des Aufrufers – ältere PDFs)
  function formFactory(L, res, cache = new Map()) {
    return name => {
      const x = subtypeOf(L, res, name); if (!x || x.sub !== L.PDFName.of('Form')) return null;
      const key = x.ref || x.o; if (cache.has(key)) return cache.get(key);
      cache.set(key, null);   // Schutz vor Formularen, die sich selbst aufrufen
      try {
        const d = x.o.dict, mArr = d.lookupMaybe(L.PDFName.of('Matrix'), L.PDFArray), bArr = d.lookupMaybe(L.PDFName.of('BBox'), L.PDFArray);
        const nums = a => a ? a.asArray().map(v => { try { return v.asNumber(); } catch (e) { return NaN; } }) : null;
        const matrix = nums(mArr), bbox = nums(bArr), own = d.lookupMaybe(L.PDFName.of('Resources'), L.PDFDict), fres = own || res, src = streamText(L, x.o);
        const f = { ops: tokenize(src), src, matrix: matrix && matrix.length === 6 && matrix.every(isFinite) ? matrix : ID, bbox: bbox && bbox.length === 4 && bbox.every(isFinite) ? bbox : null,
          stream: x.o, res: fres, ownRes: !!own, isImage: imageTestRes(L, fres) };
        f.formOf = formFactory(L, fres, cache);
        cache.set(key, f); return f;
      } catch (e) { return null; }
    };
  }
  // Bilder einer Seite (auch in Formularen) mit Umriss in Seitenkoordinaten
  function pageImages(L, page) {
    const src = contentOf(L, page), res = page.node.Resources();
    return { src, imgs: images(tokenize(src), imageTestRes(L, res), ID, formFactory(L, res)) };
  }
  /* Bilder und Vektorgrafiken einer Seite. bg = Grafik bedeckt fast die ganze Seite (Hintergrund, Rahmen) – die Oberfläche wählt sie
     nicht per Klick, nur über die Liste. */
  function pageObjects(L, page) {
    const src = contentOf(L, page), res = page.node.Resources(), ops = tokenize(src), cache = new Map();
    const imgs = images(ops, imageTestRes(L, res), ID, formFactory(L, res, cache)), vecs = graphics(ops, imageTestRes(L, res), ID, formFactory(L, res, new Map()));
    let area = 0; try { const s = page.getSize(); area = s.width * s.height; } catch (e) { /* ohne Größe kein Hintergrund-Merkmal */ }
    for (const v of vecs) v.bg = area > 0 && v.rect.w * v.rect.h >= 0.85 * area;
    return { src, imgs, vecs, truncated: vecs.length >= MAX_VEC };
  }
  // freier Ressourcenname im XObject-Wörterbuch
  function addXObject(L, ctx, res, prefix, ref) {
    const N = L.PDFName.of; let xo = res.lookupMaybe(N('XObject'), L.PDFDict);
    if (!xo) { xo = ctx.obj({}); res.set(N('XObject'), xo); }
    const used = new Set(xo.keys().map(k => k.asString().slice(1)));
    let k = 1; while (used.has(prefix + k)) k++;
    xo.set(N(prefix + k), ref); return prefix + k;
  }
  // flache Kopie eines Wörterbuchs (Unterwörterbuch XObject ebenfalls kopiert – das Original anderer Seiten bleibt unberührt)
  function cloneRes(L, ctx, res) {
    const N = L.PDFName.of, c = ctx.obj({}); if (!res) return c;
    for (const [k, v] of res.entries()) c.set(k, v);
    const xo = res.lookupMaybe(N('XObject'), L.PDFDict); if (xo) { const x2 = ctx.obj({}); for (const [k, v] of xo.entries()) x2.set(k, v); c.set(N('XObject'), x2); }
    return c;
  }
  const union = (a, r) => !a ? r : !r ? a : { x: Math.min(a.x, r.x), y: Math.min(a.y, r.y), w: Math.max(a.x + a.w, r.x + r.w) - Math.min(a.x, r.x), h: Math.max(a.y + a.h, r.y + r.h) - Math.min(a.y, r.y) };
  /* edits: [{ n, del: true } | { n, to: {x,y,w,h} } | { n, img: { bytes, png }, to? }] – to in Seitenkoordinaten.
     Ersetzte Bilder werden eingepasst (Seitenverhältnis bleibt). Bilder in Formularen: Das Formular wird für genau diesen Aufruf
     kopiert und geändert (andere Seiten und Aufrufe, die es mitbenutzen, bleiben gleich); sein Begrenzungsrahmen (BBox) wächst mit,
     damit ein verschobenes Bild nicht abgeschnitten wird. Ergebnis: Zahl der geänderten Bilder. */
  async function editPage(L, lib, page, edits) {
    const { src, imgs, vecs } = pageObjects(L, page), ctx = lib.context, N = L.PDFName.of;
    // Baum der betroffenen Aufrufe: Wurzel = Seite, Kinder = Formular-Aufrufe (je Stelle im Inhalt), Blätter = Bild-Änderungen
    const root = { src, kids: new Map(), items: [] };
    for (const e of edits) {
      const im = (e.vec ? vecs : imgs)[e.n]; if (!im) continue;
      let ed;
      if (e.del) ed = { del: true };
      else if (e.vec) {   // Grafik: verschieben/skalieren und/oder umfärben
        const T = e.to ? placement(im.m, im.rect, e.to, 0) : null, color = e.color ? hexRgb(e.color) : null;
        if (e.to && !(T && T.every(isFinite))) continue;
        if (!T && !color) continue;
        ed = { T, color };
      } else {
        let emb = null, fit = 0;
        if (e.img && !e.vec) { emb = e.img.png ? await lib.embedPng(e.img.bytes) : await lib.embedJpg(e.img.bytes); fit = emb.width / emb.height; }
        const T = placement(im.m, im.rect, e.to || im.rect, fit); if (!T || !T.every(isFinite)) continue;
        ed = { T, emb };
      }
      let node = root;
      for (const c of im.path) { let k = node.kids.get(c.start); if (!k) node.kids.set(c.start, k = { src: c.form.src, call: c, kids: new Map(), items: [] }); node = k; }
      node.items.push({ im, ed });
    }
    let count = 0;
    // Inhalt eines Knotens neu schreiben; addX(ref, prefix) trägt ein XObject in die Ressourcen dieses Knotens ein → Name.
    // Ergebnis: neuer Inhalt und die Fläche der geänderten Bilder in den Koordinaten dieses Knotens (für den Begrenzungsrahmen)
    const rewrite = (node, addX) => {
      const parts = []; let extent = null;
      for (const { im, ed } of node.items) {
        count++;
        if (ed.del) { parts.push({ start: im.start, end: im.end, text: '' }); continue; }
        if (im.kind === 'vec') {   // Grafik: eigenes q … Q mit der Verschiebung, Inhalt unverändert
          const body = ed.color ? recolor(node.src.slice(im.start, im.end), ed.color) : node.src.slice(im.start, im.end);
          parts.push({ start: im.start, end: im.end, text: `q ${ed.T ? ed.T.map(num).join(' ') + ' cm' : ''}\n${body}\nQ` });
          const li = inv(im.local); if (li && ed.T) extent = union(extent, mapRect(im.lrect, mul(mul(li, ed.T), im.local)));
          continue;
        }
        const name = ed.emb ? addX(ed.emb.ref, 'PdfmyBild') : im.name;
        parts.push({ start: im.start, end: im.end, text: `q ${ed.T.map(num).join(' ')} cm /${name} Do Q` });
        extent = union(extent, rectOf(mul(ed.T, im.local)));
      }
      for (const kid of node.kids.values()) {
        const f = kid.call.form, res2 = cloneRes(L, ctx, f.res);
        const r = rewrite(kid, (ref, p) => addXObject(L, ctx, res2, p, ref));
        const st = ctx.flateStream(toBytes(r.src));
        for (const [k, v] of f.stream.dict.entries()) if (!['Length', 'Filter', 'DecodeParms', 'Resources', 'BBox'].includes(k.asString().slice(1))) st.dict.set(k, v);
        st.dict.set(N('Resources'), res2);
        let bb = f.bbox ? { x: Math.min(f.bbox[0], f.bbox[2]), y: Math.min(f.bbox[1], f.bbox[3]), w: Math.abs(f.bbox[2] - f.bbox[0]), h: Math.abs(f.bbox[3] - f.bbox[1]) } : null;
        if (bb && r.extent) bb = union(bb, r.extent);
        if (bb) st.dict.set(N('BBox'), ctx.obj([bb.x, bb.y, bb.x + bb.w, bb.y + bb.h].map(v => Math.round(v * 1000) / 1000)));
        const name = addX(ctx.register(st), 'PdfmyForm');
        parts.push({ start: kid.call.start, end: kid.call.end, text: `/${name} Do` });
        if (r.extent) extent = union(extent, rectOf(mul(mul([r.extent.w, 0, 0, r.extent.h, r.extent.x, r.extent.y], f.matrix), kid.call.local)));
      }
      let out = '', at = 0;
      for (const p of parts.sort((a, b) => a.start - b.start)) { out += node.src.slice(at, p.start) + p.text; at = p.end; }
      return { src: out + node.src.slice(at), extent };
    };
    if (!root.items.length && !root.kids.size) return 0;
    if (typeof page.node.normalize === 'function') page.node.normalize();
    const r = rewrite(root, (ref, p) => String(page.node.newXObject(p, ref)).slice(1));
    page.node.set(N('Contents'), ctx.register(ctx.flateStream(toBytes(r.src))));
    return count;
  }

  const api = { tokenize, images, graphics, pageObjects, recolor, hexRgb, placement, apply, rectOf, mapRect, mul, inv, toStr, toBytes, contentOf, pageImages, editPage };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfBild = api;
})(typeof self !== 'undefined' ? self : globalThis);
