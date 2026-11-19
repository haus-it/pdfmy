// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Vorhandene Bilder einer PDF-Seite bearbeiten (Wettbewerbsanalyse Rang 8: wie „Objekte bearbeiten“ in Acrobat, Foxit, PDF-XChange):
   verschieben, skalieren, ersetzen, löschen – direkt im Seiteninhalt, ohne die Seite zu rastern. Text, Vektoren und Schriften bleiben.

   Seiteninhalt = Folge von Operatoren (ISO 32000-1, 8.2). tokenize() zerlegt ihn (Zeichenketten, Hex, Wörterbücher, Felder,
   Kommentare, eingebettete Inline-Bilder BI…ID…EI werden übersprungen). images() verfolgt q/Q/cm (Transformationsmatrix) und findet
   jeden Aufruf „/Name Do“ eines Bild-XObjects auf oberster Ebene (nicht in Formular-XObjects – die teilen sich oft mehrere Seiten).
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

  /* Bilder auf oberster Ebene: [{ n, name, m, rect, start, end }] – n zählt die Bild-Aufrufe in Inhaltsreihenfolge (Schlüssel für Änderungen).
     isImage(name) entscheidet anhand der Ressourcen, ob /Name ein Bild ist. Inline-Bilder und Bilder in Formularen werden nicht angeboten. */
  function images(ops, isImage, base = ID) {
    const out = []; let ctm = base; const stack = [];
    for (const o of ops) {
      if (o.op === 'q') stack.push(ctm);
      else if (o.op === 'Q') ctm = stack.pop() || base;
      else if (o.op === 'cm' && o.args.length === 6 && o.args.every(a => a.t === 'num')) ctm = mul(o.args.map(a => a.v), ctm);
      else if (o.op === 'Do' && o.args.length === 1 && o.args[0].t === 'name' && isImage(o.args[0].v)) {
        const r = rectOf(ctm); if (!(r.w > 0.5 && r.h > 0.5)) continue;   // unsichtbar klein
        out.push({ n: out.length, name: o.args[0].v, m: ctm, rect: r, start: o.start, end: o.end });
      }
    }
    return out;
  }

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
  function imageTest(L, page) {
    const N = L.PDFName.of, res = page.node.Resources(), xo = res && res.lookupMaybe(N('XObject'), L.PDFDict);
    return name => { try { const o = xo && xo.lookup(N(name)); return !!(o && o.dict && o.dict.get(N('Subtype')) === N('Image')); } catch (e) { return false; } };
  }
  // Bilder einer Seite mit Umriss in Seitenkoordinaten
  function pageImages(L, page) {
    const src = contentOf(L, page);
    return { src, imgs: images(tokenize(src), imageTest(L, page)) };
  }
  /* edits: [{ n, del: true } | { n, to: {x,y,w,h} } | { n, img: { bytes, png }, to? }] – to in Seitenkoordinaten.
     Ersetzte Bilder werden eingepasst (Seitenverhältnis bleibt). Ergebnis: Zahl der geänderten Bilder. */
  async function editPage(L, lib, page, edits) {
    const { src, imgs } = pageImages(L, page), map = new Map();
    for (const e of edits) {
      const im = imgs[e.n]; if (!im) continue;
      if (e.del) { map.set(e.n, { del: true }); continue; }
      let name = null, fit = 0;
      if (e.img) {
        const emb = e.img.png ? await lib.embedPng(e.img.bytes) : await lib.embedJpg(e.img.bytes);
        if (typeof page.node.normalize === 'function') page.node.normalize();
        name = String(page.node.newXObject('PdfmyBild', emb.ref)).slice(1); fit = emb.width / emb.height;
      }
      const T = placement(im.m, im.rect, e.to || im.rect, fit); if (!T || !T.every(isFinite)) continue;
      map.set(e.n, { T, name });
    }
    if (!map.size) return 0;
    page.node.set(L.PDFName.of('Contents'), lib.context.register(lib.context.flateStream(toBytes(apply(src, imgs, map)))));
    return map.size;
  }

  const api = { tokenize, images, placement, apply, rectOf, mapRect, mul, inv, toStr, toBytes, contentOf, pageImages, editPage };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfBild = api;
})(typeof self !== 'undefined' ? self : globalThis);
