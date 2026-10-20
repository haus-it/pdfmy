// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Seitenformat und Bogenaufteilung (wie „Zuschneiden“, „Seitengröße ändern“, „Mehrere Seiten pro Blatt“ und „Broschüre“
   in Acrobat Pro, Sejda und PDF24) – ohne Neurastern: die Seiten bleiben Vektor/Text, nur Rahmen und Lage ändern sich.
   fit(doc, …)   weiße Ränder abschneiden und/oder jede Seite auf A4 bringen (Inhalt mittig, maßstabsgetreu; Links,
                 Markierungen und Formularfelder wandern mit)
   nup(bytes, n) 2 oder 4 Seiten verkleinert auf ein A4-Blatt
   booklet(bytes) Broschüre zum Falten: A4 quer, je Blattseite zwei A5-Seiten in Heftreihenfolge (beidseitig drucken,
                 an der kurzen Kante wenden)
   Braucht pdf-lib (PDFLib). */
(function (root) {
  const PL = () => root.PDFLib;
  const A4 = [595.28, 841.89];
  const num = v => (v && typeof v.asNumber === 'function' ? v.asNumber() : +v);

  // Heftreihenfolge für die Broschüre (Rückenheftung): je Bogen Vorderseite [letzte, erste], Rückseite [zweite, vorletzte] …
  // Seitenzahl wird auf ein Vielfaches von 4 aufgefüllt (null = Leerseite)
  function bookletOrder(n) {
    const m = Math.max(4, Math.ceil(n / 4) * 4), r = [], v = i => (i < n ? i : null);
    for (let k = 0; k < m / 2; k += 2) r.push([v(m - 1 - k), v(k)], [v(k + 1), v(m - 2 - k)]);
    return r;
  }
  // Rechteck b (PDF-Koordinaten [x0, y0, x1, y1]) um Rand m vergrößern und auf Rahmen c beschränken
  function padBox(b, c, m) {
    const r = [Math.max(c[0], b[0] - m), Math.max(c[1], b[1] - m), Math.min(c[2], b[2] + m), Math.min(c[3], b[3] + m)];
    return r[2] - r[0] > 2 && r[3] - r[1] > 2 ? r : c;
  }
  // Maßstab und Verschiebung, um das Rechteck b mittig in ein Ziel W×H (mit Rand m) zu legen
  function fitMatrix(b, W, H, m = 0) {
    const bw = b[2] - b[0], bh = b[3] - b[1], s = Math.min((W - 2 * m) / bw, (H - 2 * m) / bh);
    return [s, 0, 0, s, (W - bw * s) / 2 - b[0] * s, (H - bh * s) / 2 - b[1] * s];
  }
  const tp = (M, x, y) => [M[0] * x + M[4], M[3] * y + M[5]];   // nur Maßstab + Verschiebung

  // Seiteninhalt in „q Matrix [Clip] … Q“ einklammern
  function wrapContent(doc, page, M, clip) {
    const L = PL(), ctx = doc.context, N = L.PDFName.of;
    const pre = `q\n${M.map(v => +v.toFixed(5)).join(' ')} cm\n` + (clip ? `${clip[0]} ${clip[1]} ${clip[2] - clip[0]} ${clip[3] - clip[1]} re W n\n` : '');
    const a = ctx.register(ctx.flateStream(pre)), z = ctx.register(ctx.flateStream('\nQ\n'));
    const raw = page.node.get(N('Contents')), cur = page.node.lookup(N('Contents'));
    if (cur instanceof L.PDFArray) { cur.insert(0, a); cur.push(z); }
    else page.node.set(N('Contents'), ctx.obj(raw ? [a, raw, z] : [a, z]));
  }
  // Anmerkungen (Links, Markierungen, Formularfelder, Notizen …) mitverschieben
  function moveAnnots(doc, page, M) {
    const L = PL(), ctx = doc.context, N = L.PDFName.of, arr = page.node.lookup(N('Annots'));
    if (!(arr instanceof L.PDFArray)) return;
    const pts = (d, key) => {
      const a = d.lookup(N(key)); if (!(a instanceof L.PDFArray)) return;
      const v = a.asArray().map(x => num(ctx.lookup(x)));
      if (v.some(isNaN)) return;
      const o = []; for (let i = 0; i + 1 < v.length; i += 2) o.push(...tp(M, v[i], v[i + 1]));
      d.set(N(key), ctx.obj(o));
    };
    for (let k = 0; k < arr.size(); k++) {
      const d = ctx.lookup(arr.get(k)); if (!(d instanceof L.PDFDict)) continue;
      const r = d.lookup(N('Rect'));
      if (r instanceof L.PDFArray && r.size() === 4) {
        const v = r.asArray().map(x => num(ctx.lookup(x))), [x0, y0] = tp(M, Math.min(v[0], v[2]), Math.min(v[1], v[3])), [x1, y1] = tp(M, Math.max(v[0], v[2]), Math.max(v[1], v[3]));
        d.set(N('Rect'), ctx.obj([x0, y0, x1, y1]));
      }
      for (const key of ['QuadPoints', 'L', 'Vertices', 'CL']) pts(d, key);
      const ink = d.lookup(N('InkList'));
      if (ink instanceof L.PDFArray) ink.asArray().forEach((_, i) => {
        const s = ink.lookup(i); if (!(s instanceof L.PDFArray)) return;
        const v = s.asArray().map(x => num(ctx.lookup(x))), o = [];
        for (let j = 0; j + 1 < v.length; j += 2) o.push(...tp(M, v[j], v[j + 1]));
        ink.set(i, ctx.obj(o));
      });
    }
  }
  const boxOf = page => { const c = page.getCropBox(); return [c.x, c.y, c.x + c.width, c.y + c.height]; };
  const clearBoxes = page => { for (const k of ['CropBox', 'TrimBox', 'BleedBox', 'ArtBox']) page.node.delete(PL().PDFName.of(k)); };

  /* boxes[i]: Bereich mit Inhalt der Seite i in PDF-Koordinaten (oder null = ganze Seite); margin: Rand um den Inhalt (pt) */
  function fit(doc, { trim = false, a4 = false, boxes = [], margin = 10 } = {}) {
    const L = PL(), N = L.PDFName.of;
    doc.getPages().forEach((page, i) => {
      const c = boxOf(page), b = trim && boxes[i] ? padBox(boxes[i], c, margin) : c;
      if (!a4) {
        if (b === c) return;
        page.node.set(N('CropBox'), doc.context.obj(b.map(v => +v.toFixed(3)))); page.node.delete(N('TrimBox')); page.node.delete(N('ArtBox'));
        return;
      }
      const land = b[2] - b[0] > b[3] - b[1], W = land ? A4[1] : A4[0], H = land ? A4[0] : A4[1];
      const M = fitMatrix(b, W, H, trim ? 28 : 0);
      if (Math.abs(M[0] - 1) < 1e-4 && Math.abs(M[4]) < 0.05 && Math.abs(M[5]) < 0.05 && b === c && Math.abs(c[2] - W) < 0.5 && Math.abs(c[3] - H) < 0.5) return;   // schon A4
      wrapContent(doc, page, M, b);
      moveAnnots(doc, page, M);
      page.node.set(N('MediaBox'), doc.context.obj([0, 0, W, H])); clearBoxes(page);
    });
  }

  // Seite p (eingebettet) gedreht und eingepasst in das Feld [x, y, w, h] zeichnen
  function place(sheet, emb, rot, x, y, w, h) {
    const L = PL(), q = ((rot % 360) + 360) % 360, sw = q % 180 ? emb.height : emb.width, sh = q % 180 ? emb.width : emb.height;
    const s = Math.min(w / sw, h / sh), dw = sw * s, dh = sh * s, cx = x + (w - dw) / 2, cy = y + (h - dh) / 2;
    // drawPage dreht um die linke untere Ecke (gegen den Uhrzeigersinn) – Ausgleich je Winkel; /Rotate dreht im Uhrzeigersinn
    const at = { 0: [cx, cy, 0], 90: [cx, cy + dh, -90], 180: [cx + dw, cy + dh, 180], 270: [cx + dw, cy, 90] }[q];
    sheet.drawPage(emb, { x: at[0], y: at[1], xScale: s, yScale: s, rotate: L.degrees(at[2]) });
  }
  async function embedAll(out, src) {
    const pages = src.getPages(), embs = [];
    for (const pg of pages) embs.push(await out.embedPage(pg, (() => { const c = pg.getCropBox(); return { left: c.x, bottom: c.y, right: c.x + c.width, top: c.y + c.height }; })()));
    return { embs, rots: pages.map(pg => pg.getRotation().angle || 0) };
  }
  async function newDoc(src) {
    const out = await PL().PDFDocument.create({ updateMetadata: false });
    const t = src.getTitle?.(); if (t) out.setTitle(t);
    const a = src.getAuthor?.(); if (a) out.setAuthor(a);
    out.setCreator(src.getCreator?.() || 'PDFMy'); out.setProducer(src.getProducer?.() || 'PDFMy');
    out.setCreationDate(new Date()); out.setModificationDate(new Date());
    return out;
  }
  /* n = 2: A4 quer, zwei Seiten nebeneinander; n = 4: A4 hoch, 2 × 2 */
  async function nup(bytes, n = 2) {
    const src = await PL().PDFDocument.load(bytes, { ignoreEncryption: true }), out = await newDoc(src);
    const { embs, rots } = await embedAll(out, src), gap = 14;
    const [W, H, cols, rows] = n === 4 ? [A4[0], A4[1], 2, 2] : [A4[1], A4[0], 2, 1];
    const cw = (W - gap * (cols + 1)) / cols, ch = (H - gap * (rows + 1)) / rows;
    for (let i = 0; i < embs.length; i += n) {
      const sheet = out.addPage([W, H]);
      for (let k = 0; k < n && i + k < embs.length; k++) {
        const c = k % cols, r = Math.floor(k / cols);
        place(sheet, embs[i + k], rots[i + k], gap + c * (cw + gap), H - gap - (r + 1) * ch - r * gap, cw, ch);
      }
    }
    return out.save();
  }
  async function booklet(bytes) {
    const src = await PL().PDFDocument.load(bytes, { ignoreEncryption: true }), out = await newDoc(src);
    const { embs, rots } = await embedAll(out, src), W = A4[1], H = A4[0], half = W / 2, m = 10;
    for (const side of bookletOrder(embs.length)) {
      const sheet = out.addPage([W, H]);
      side.forEach((idx, k) => { if (idx != null) place(sheet, embs[idx], rots[idx], k * half + m, m, half - 2 * m, H - 2 * m); });
    }
    return out.save();
  }

  const api = { fit, nup, booklet, bookletOrder, padBox, fitMatrix, A4 };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Layout = api;
})(typeof self !== 'undefined' ? self : globalThis);
