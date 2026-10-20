// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Bildverarbeitung für Scans und Handyfotos: Aufbereitung, Geraderichten, Kantenerkennung, Entzerren, Leerseiten. */
(function (root) {
  'use strict';
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function scaled(src, maxSide) {
    const s = Math.min(1, maxSide / Math.max(src.width, src.height));
    const c = canvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function grayData(c) {
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    const g = new Uint8Array(c.width * c.height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) | 0;
    return g;
  }

  function otsu(hist, n) {
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let v = 0; v < 256; v++) {
      wB += hist[v]; if (!wB) continue; const wF = n - wB; if (!wF) break;
      sumB += v * hist[v]; const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; t = v; }
    }
    return t;
  }

  /* Farbige Inhalte (Logo, Stempel, Unterschrift in Blau)? → dann Farbe erhalten */
  function isColorful(src) {
    const s = scaled(src, 400), d = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data;
    let n = 0, colored = 0;
    for (let j = 0; j < d.length; j += 4) {
      const r = d[j], g = d[j + 1], b = d[j + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (r * 0.299 + g * 0.587 + b * 0.114);
      n++; if (mx - mn > 50 && l > 30 && l < 235) colored++;
    }
    return colored / n > 0.003;
  }

  /* Papierhintergrund schätzen und herausrechnen (Schatten, Lichtverlauf bei Handyfotos):
     grob verkleinern, Schrift per Maximum-Filter entfernen, weich vergrößern; Pixel / Hintergrund → Papier wird gleichmäßig hell */
  function flatten(g, W, H) {
    const k = Math.max(8, Math.round(Math.max(W, H) / 64)), sw = Math.ceil(W / k), sh = Math.ceil(H / k), sm = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let m = 0; const y1 = Math.min(H, (y + 1) * k), x1 = Math.min(W, (x + 1) * k);
      for (let yy = y * k; yy < y1; yy += 2) for (let xx = x * k; xx < x1; xx += 2) { const v = g[yy * W + xx]; if (v > m) m = v; }
      sm[y * sw + x] = m;
    }
    // Maximum über die Nachbarn (Schrift-Lücken schließen), dann glätten
    const mx = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < sh && xx >= 0 && xx < sw && sm[yy * sw + xx] > m) m = sm[yy * sw + xx]; } mx[y * sw + x] = m; }
    const bl = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < sh && xx >= 0 && xx < sw) { s += mx[yy * sw + xx]; n++; } } bl[y * sw + x] = s / n; }
    const out = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(sh - 1.001, Math.max(0, y / k - 0.5)), y0 = fy | 0, ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(sw - 1.001, Math.max(0, x / k - 0.5)), x0 = fx | 0, tx = fx - x0, i = y0 * sw + x0;
        const b = (bl[i] * (1 - tx) + bl[i + 1] * tx) * (1 - ty) + (bl[i + sw] * (1 - tx) + bl[i + sw + 1] * tx) * ty;
        out[y * W + x] = b > 40 ? g[y * W + x] * 250 / b : g[y * W + x];
      }
    }
    return out;
  }
  // Leicht nachschärfen (unscharfe Handyfotos): v + a·(v − Mittel 3×3)
  function sharpen(g, W, H, a = 0.6) {
    const out = new Uint8ClampedArray(g.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { out[i] = g[i]; continue; }
      const m = (g[i - W - 1] + g[i - W] + g[i - W + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + W - 1] + g[i + W] + g[i + W + 1]) / 9;
      out[i] = g[i] + a * (g[i] - m);
    }
    return out;
  }

  /* Aufbereitung: document = Papier weiß, Schrift kräftig; colordoc = dasselbe, aber Farben bleiben;
     bw = Otsu-Schwarzweiß; gray; original */
  function enhance(src, mode) {
    if (mode === 'colordoc') {
      const c = canvas(src.width, src.height), ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, n = d.length / 4, hist = new Uint32Array(256);
      for (let j = 0; j < d.length; j += 4) hist[(d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) | 0]++;
      const pct = q => { let acc = 0; const t = n * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
      const paper = pct(0.55), lo = Math.min(pct(0.005), paper - 80), t = otsu(hist, n);
      const hi = Math.max(lo + 20, Math.min(paper - 10, t + Math.round((paper - t) * 0.45)));   // Durchscheinen entfernen
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.pow(clamp((v - lo) / (hi - lo)), 1.3) * 255);
      for (let j = 0; j < d.length; j += 4) { d[j] = lut[d[j]]; d[j + 1] = lut[d[j + 1]]; d[j + 2] = lut[d[j + 2]]; }
      ctx.putImageData(img, 0, 0);
      return c;
    }
    const c = canvas(src.width, src.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    if (mode === 'original') return c;
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, n = d.length / 4;
    let g = new Uint8Array(n); const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) | 0;
    if (mode === 'document' || mode === 'bw') { g = flatten(g, c.width, c.height); if (Math.max(c.width, c.height) < 2600) g = sharpen(g, c.width, c.height, 0.5); }
    for (let i = 0; i < n; i++) hist[g[i]]++;
    const lut = new Uint8ClampedArray(256);
    const pct = q => { let acc = 0; const t = n * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
    if (mode === 'gray') for (let v = 0; v < 256; v++) lut[v] = v;
    else if (mode === 'document') {
      // Papierhelligkeit = Median; Schwarzpunkt mind. 80 darunter, damit leere Seiten weiß bleiben.
      // Weißpunkt zwischen Schrift (Otsu-Grenze) und Papier: hellgraue, durchscheinende Rückseite wird weiß.
      const paper = pct(0.55), lo = Math.min(pct(0.005), paper - 80), t = otsu(hist, n);
      const hi = Math.max(lo + 20, Math.min(paper - 10, t + Math.round((paper - t) * 0.55)));
      // sanfte Kurve (1,15 statt 1,5): Kantenübergänge bleiben grau, die Schrift wird nicht fett
      for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.pow(clamp((v - lo) / (hi - lo)), 1.15) * 255);
    } else {
      const t = otsu(hist, n);
      for (let v = 0; v < 256; v++) lut[v] = v > t ? 255 : 0;
    }
    for (let i = 0, j = 0; i < n; i++, j += 4) { const v = lut[g[i]]; d[j] = d[j + 1] = d[j + 2] = v; }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function rotate90(src, dir) {
    const c = canvas(src.height, src.width), ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(dir * Math.PI / 180); ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  /* Schräglage in Grad schätzen (Projektionsprofil der dunklen Pixel; positiv = im Uhrzeigersinn gekippt) */
  function estimateSkew(src) {
    const s = scaled(src, 1000), g = grayData(s), W = s.width, H = s.height;
    const hist = new Uint32Array(256); for (const v of g) hist[v]++;
    const t = Math.min(otsu(hist, g.length), 160);
    const xs = [], ys = [];
    const step = Math.max(1, Math.round(Math.sqrt((W * H) / 400000)));
    for (let y = Math.round(H * 0.03); y < H * 0.97; y += step) for (let x = Math.round(W * 0.03); x < W * 0.97; x += step) {
      if (g[y * W + x] < t) { xs.push(x); ys.push(y); }
    }
    if (xs.length < 200 || xs.length > g.length / step / step * 0.45) return 0; // leer oder Foto ohne Text
    const bins = new Float64Array(H * 2 + 2);
    const score = deg => {
      const a = deg * Math.PI / 180, sn = Math.sin(a), cs = Math.cos(a);
      bins.fill(0);
      for (let i = 0; i < xs.length; i++) { const k = Math.round(ys[i] * cs - xs[i] * sn) + H; if (k >= 0 && k < bins.length) bins[k]++; }
      let s2 = 0; for (const b of bins) s2 += b * b; return s2;
    };
    let best = 0, bestS = -1;
    for (let d = -6; d <= 6.001; d += 0.25) { const sc = score(d); if (sc > bestS) { bestS = sc; best = d; } }
    const c0 = best;
    for (let d = c0 - 0.25; d <= c0 + 0.25; d += 0.05) { const sc = score(d); if (sc > bestS) { bestS = sc; best = d; } }
    return Math.round(best * 100) / 100;
  }

  function rotateBy(src, deg) {
    const c = canvas(src.width, src.height), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(deg * Math.PI / 180);
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  /* Gibt geraderichtetes Bild und Winkel zurück; kleine Winkel (< 0,15°) werden ignoriert */
  function deskew(src) {
    const a = estimateSkew(src);
    return Math.abs(a) < 0.15 ? { canvas: src, angle: 0 } : { canvas: rotateBy(src, -a), angle: a };
  }

  /* Papierblatt auf einem Foto finden → 4 Ecken (normiert 0..1, Reihenfolge tl,tr,br,bl). Rechenkern: js/docdetect.js.
     hint: bereits bekannte Ecken (z. B. aus der Live-Erkennung) → nur an den echten Kanten nachführen */
  function detectDocument(src, maxSide = 600, hint) {
    const s = scaled(src, maxSide), d = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data;
    return DocDetect.findDocument(d, s.width, s.height, hint);
  }

  /* Liegt das Blatt vor einem andersartigen Untergrund? (Helligkeit/Farbe außerhalb deutlich anders als das Papier) */
  function hasBackground(src, corners) {
    const s = scaled(src, 240), W = s.width, H = s.height, d = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const Q = corners.map(([x, y]) => [x * W, y * H]);
    const inside = (x, y) => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    // Papierweiß = 75-%-Wert innen (Schrift zählt nicht), Untergrund = Median außen
    const hi = new Uint32Array(256), ho = new Uint32Array(256); let ni = 0, no = 0, co = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 4, r = d[j], g = d[j + 1], b = d[j + 2], l = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
      if (inside(x + 0.5, y + 0.5)) { hi[l]++; ni++; } else { ho[l]++; co += Math.max(r, g, b) - Math.min(r, g, b); no++; }
    }
    if (!ni || no < W * H * 0.04) return false;
    const pct = (h, n, q) => { let a = 0; for (let v = 0; v < 256; v++) { a += h[v]; if (a >= n * q) return v; } return 255; };
    return pct(hi, ni, 0.75) - pct(ho, no, 0.5) > 10 || co / no > 28;
  }

  /* Mehrere ausgerichtete Aufnahmen derselben Seite mitteln: Bildrauschen sinkt (bei 4 Bildern etwa auf die Hälfte),
     Schrift wird klarer. Alle Bilder werden auf die Größe des ersten gebracht. */
  function average(list) {
    if (list.length < 2) return list[0];
    const W = list[0].width, H = list[0].height, sum = new Uint16Array(W * H * 3);
    for (const c of list) {
      let src = c;
      if (c.width !== W || c.height !== H) { src = canvas(W, H); src.getContext('2d').drawImage(c, 0, 0, W, H); }
      const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
      for (let i = 0, j = 0; i < sum.length; i += 3, j += 4) { sum[i] += d[j]; sum[i + 1] += d[j + 1]; sum[i + 2] += d[j + 2]; }
    }
    const out = canvas(W, H), x = out.getContext('2d'), img = x.createImageData(W, H), o = img.data, n = list.length;
    for (let i = 0, j = 0; i < sum.length; i += 3, j += 4) { o[j] = sum[i] / n; o[j + 1] = sum[i + 1] / n; o[j + 2] = sum[i + 2] / n; o[j + 3] = 255; }
    x.putImageData(img, 0, 0);
    return out;
  }

  /* Homographie, die Punkte src[i] auf dst[i] abbildet (je 4 Punkte) */
  function homography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
      let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
    }
    const h = A.map((row, i) => row[8] / row[i]);
    return [...h, 1];
  }

  /* Viereck (normierte Ecken tl,tr,br,bl) zu Rechteck entzerren */
  function warp(src, corners) {
    const P = corners.map(([x, y]) => [x * src.width, y * src.height]);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let w = Math.round(Math.max(dist(P[0], P[1]), dist(P[3], P[2])));
    let h = Math.round(Math.max(dist(P[0], P[3]), dist(P[1], P[2])));
    // Perspektive verfälscht das Seitenverhältnis: nahe an DIN A (1 : 1,414) → genau DIN A (Briefe sehen wie gescannt aus)
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (Math.abs(ratio - Math.SQRT2) / Math.SQRT2 < 0.12) { if (h >= w) h = Math.round(w * Math.SQRT2); else w = Math.round(h * Math.SQRT2); }
    const k = Math.min(1, 3300 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    const H = homography([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], P);
    const sd = src.getContext ? src.getContext('2d', { willReadFrequently: true }) : null;
    const srcC = sd ? src : (() => { const c = canvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; })();
    const S = srcC.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, srcC.width, srcC.height), sdat = S.data, SW = S.width, SH = S.height;
    const out = canvas(w, h), octx = out.getContext('2d'), O = octx.createImageData(w, h), od = O.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const z = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / z, sy = (H[3] * x + H[4] * y + H[5]) / z;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * w + x) * 4;
      if (x0 < 0 || y0 < 0 || x0 >= SW - 1 || y0 >= SH - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
      const i00 = (y0 * SW + x0) * 4, i10 = i00 + 4, i01 = i00 + SW * 4, i11 = i01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        od[o + ch] = (sdat[i00 + ch] * (1 - fx) + sdat[i10 + ch] * fx) * (1 - fy) + (sdat[i01 + ch] * (1 - fx) + sdat[i11 + ch] * fx) * fy;
      }
      od[o + 3] = 255;
    }
    octx.putImageData(O, 0, 0);
    return out;
  }

  /* Anteil dunkler Pixel im Innenbereich – unter ~0,04 % gilt eine Seite als leer (Trennblatt) */
  function inkRatio(src) {
    const s = scaled(src, 600), g = grayData(s), W = s.width, H = s.height;
    let dark = 0, n = 0;
    for (let y = Math.round(H * 0.06); y < H * 0.94; y++) for (let x = Math.round(W * 0.06); x < W * 0.94; x++) { n++; if (g[y * W + x] < 110) dark++; }
    return n ? dark / n : 0;
  }
  const isBlank = src => inkRatio(src) < 0.0004;

  /* Kompakt-Speicherung nach dem MRC-Prinzip (wie ABBYY/Acrobat):
     Ebene 1 = Schrift als 1-Bit-Maske in hoher Auflösung (scharf, sehr klein mit Flate),
     Ebene 2 = Hintergrund nur, wenn es Farbe/Graustufen-Inhalte gibt – dann stark verkleinert.
     src: aufbereitete Seite; maskScale/bgScale: Faktoren relativ zu src. */
  function compactLayers(src, maskScale, bgScale) {
    const mw = Math.max(1, Math.round(src.width * maskScale)), mh = Math.max(1, Math.round(src.height * maskScale));
    const mc = canvas(mw, mh), mx = mc.getContext('2d', { willReadFrequently: true });
    mx.imageSmoothingQuality = 'high'; mx.drawImage(src, 0, 0, mw, mh);
    const img = mx.getImageData(0, 0, mw, mh), d = img.data, n = mw * mh;
    const g = new Uint8Array(n), chroma = new Uint8Array(n), hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = d[j], gg = d[j + 1], b = d[j + 2];
      g[i] = (r * 0.299 + gg * 0.587 + b * 0.114) | 0; chroma[i] = Math.max(r, gg, b) - Math.min(r, gg, b); hist[g[i]]++;
    }
    // Schwelle zwischen Schrift (dunkelste 2 %) und Papier (hellste 50 %) bei 42 %: Kantenhalos unscharfer Fotos zählen nicht zur Schrift
    const pctH = q => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= n * q) return v; } return 255; };
    const inkV = pctH(0.02), paperV = pctH(0.5), t = clamp(Math.min(otsu(hist, n), Math.round(inkV + 0.42 * (paperV - inkV))), 70, 180);
    const ink = new Uint8Array(n);
    let inks = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      if (g[i] < t && chroma[i] < 70) { ink[i] = 1; inks++; sr += d[j]; sg += d[j + 1]; sb += d[j + 2]; }
    }
    // 1-Bit packen (MSB zuerst, Zeilen auf Bytegrenze); 1 = Schrift (Decode [1 0])
    const rowBytes = (mw + 7) >> 3, bits = new Uint8Array(rowBytes * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (ink[y * mw + x]) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    // Gibt es außer Schrift noch Bildinhalt (Farbe, Grauflächen)?
    let other = 0;
    for (let i = 0; i < n; i++) if (!ink[i] && (g[i] < 225 || chroma[i] > 35)) other++;
    let bg = null;
    if (other / n > 0.004) {
      // Schrift (plus 1 Pixel Rand) aus dem Hintergrund entfernen, damit keine Schatten bleiben
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const i = y * mw + x;
        if (ink[i] || (x > 0 && ink[i - 1]) || (x < mw - 1 && ink[i + 1]) || (y > 0 && ink[i - mw]) || (y < mh - 1 && ink[i + mw])) {
          const j = i * 4; d[j] = d[j + 1] = d[j + 2] = 255;
        }
      }
      mx.putImageData(img, 0, 0);
      bg = canvas(Math.max(1, Math.round(src.width * bgScale)), Math.max(1, Math.round(src.height * bgScale)));
      const bx = bg.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(mc, 0, 0, bg.width, bg.height);
    }
    // Schriftfarbe: Mittel der Schriftpixel, etwas abgedunkelt
    const color = inks ? [sr, sg, sb].map(v => Math.min(1, (v / inks) / 255 * 0.85)) : [0, 0, 0];
    return { w: mw, h: mh, bits, color, bg, inkShare: inks / n };
  }

  root.Imaging = { canvas, scaled, enhance, hasBackground, average, isColorful, compactLayers, rotate90, estimateSkew, rotateBy, deskew, detectDocument, homography, warp, inkRatio, isBlank };
})(self);
