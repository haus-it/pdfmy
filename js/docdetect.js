// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Blatterkennung für Handyfotos: findet die vier Ecken eines Papierblatts – auch auf hellem Untergrund,
   bei Schatten, ungleichmäßigem Licht und schräger Perspektive.
   Vorgehen: mehrere Kandidaten (Helligkeit, Bereich ab Bildmitte, von Kanten begrenzte Fläche) → konvexe Hülle → Viereck
   → jede Kante an der stärksten Helligkeitskante nachführen (Geradenausgleich) → Kandidat mit der besten Kantenbestätigung.
   Reine Rechenfunktionen auf RGBA-Daten (auch in Node-Tests). */
(function (root) {
  'use strict';

  function blur(f, W, H) {
    const t = new Float32Array(f.length), o = new Float32Array(f.length);
    for (let y = 0; y < H; y++) { const r = y * W; for (let x = 0; x < W; x++) { const a = x > 0 ? x - 1 : x, b = x < W - 1 ? x + 1 : x; t[r + x] = (f[r + a] + f[r + x] + f[r + b]) / 3; } }
    for (let y = 0; y < H; y++) { const a = (y > 0 ? y - 1 : y) * W, b = (y < H - 1 ? y + 1 : y) * W, r = y * W; for (let x = 0; x < W; x++) o[r + x] = (t[a + x] + t[r + x] + t[b + x]) / 3; }
    return o;
  }

  // „Papierhaftigkeit“ P = hell und farblos; Gradient (Sobel) von P
  function prepare(rgba, W, H) {
    const n = W * H, P0 = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      P0[i] = r * 0.299 + g * 0.587 + b * 0.114 - 0.8 * (Math.max(r, g, b) - Math.min(r, g, b));
    }
    const P = blur(blur(P0, W, H), W, H);
    const gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n), hist = new Uint32Array(256);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const ax = P[i - W + 1] + 2 * P[i + 1] + P[i + W + 1] - P[i - W - 1] - 2 * P[i - 1] - P[i + W - 1];
      const ay = P[i + W - 1] + 2 * P[i + W] + P[i + W + 1] - P[i - W - 1] - 2 * P[i - W] - P[i - W + 1];
      gx[i] = ax; gy[i] = ay; const m = Math.hypot(ax, ay); mag[i] = m; hist[Math.min(255, m | 0)]++;
    }
    let acc = 0, med = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { med = v; break; } }
    return { W, H, P, gx, gy, mag, edgeT: Math.max(10, med * 4) };
  }

  function otsu(f) {
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < f.length; i++) { hist[Math.max(0, Math.min(255, f[i] | 0))]++; n++; }
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let v = 0; v < 256; v++) {
      wB += hist[v]; if (!wB) continue; const wF = n - wB; if (!wF) break;
      sumB += v * hist[v]; const mB = sumB / wB, mF = (sum - sumB) / wF, bt = wB * wF * (mB - mF) ** 2;
      if (bt > best) { best = bt; t = v; }
    }
    return t;
  }

  // Zusammenhängende Fläche ab Startpunkten, solange ok(i) gilt
  function grow(W, H, seeds, ok) {
    const m = new Uint8Array(W * H), st = new Int32Array(W * H); let sp = 0, n = 0;
    for (const s of seeds) if (!m[s] && ok(s)) { m[s] = 1; st[sp++] = s; }
    while (sp) {
      const p = st[--sp]; n++; const x = p % W;
      if (x > 0 && !m[p - 1] && ok(p - 1)) { m[p - 1] = 1; st[sp++] = p - 1; }
      if (x < W - 1 && !m[p + 1] && ok(p + 1)) { m[p + 1] = 1; st[sp++] = p + 1; }
      if (p >= W && !m[p - W] && ok(p - W)) { m[p - W] = 1; st[sp++] = p - W; }
      if (p < W * (H - 1) && !m[p + W] && ok(p + W)) { m[p + W] = 1; st[sp++] = p + W; }
    }
    return { m, n };
  }
  // Größte Fläche einer Maske
  function largest(W, H, mask) {
    const lbl = new Int32Array(W * H), st = new Int32Array(W * H); let best = 0, bestId = 0, id = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || lbl[i]) continue; id++;
      let sp = 0, n = 0; st[sp++] = i; lbl[i] = id;
      while (sp) {
        const p = st[--sp]; n++; const x = p % W;
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < mask.length && mask[q] && !lbl[q]) { lbl[q] = id; st[sp++] = q; }
      }
      if (n > best) { best = n; bestId = id; }
    }
    const m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = lbl[i] === bestId && bestId ? 1 : 0;
    return { m, n: best };
  }

  // Konvexe Hülle (Randpunkte je Zeile) → auf 4 Ecken reduzieren (jeweils die Ecke mit dem kleinsten Flächenverlust weg)
  function maskQuad(W, H, m) {
    const pts = [];
    for (let y = 0; y < H; y++) {
      let a = -1, b = -1; const r = y * W;
      for (let x = 0; x < W; x++) if (m[r + x]) { if (a < 0) a = x; b = x; }
      if (a >= 0) { pts.push([a, y]); if (b !== a) pts.push([b, y]); }
    }
    if (pts.length < 6) return null;
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    if (hull.length < 4) return null;
    const out = [];
    while (hull.length > 4) {
      let bi = 0, bv = Infinity;
      for (let i = 0; i < hull.length; i++) {
        const v = Math.abs(cr(hull[(i + hull.length - 1) % hull.length], hull[i], hull[(i + 1) % hull.length]));
        if (v < bv) { bv = v; bi = i; }
      }
      hull.splice(bi, 1);
      // Verdeckte oder abgeknickte Ecke (Daumen, Eselsohr): die 4 längsten Kanten des 5- bis 8-Ecks verlängern und schneiden
      if (hull.length >= 5 && hull.length <= 8) {
        const idx = hull.map((p, i) => [i, Math.hypot(hull[(i + 1) % hull.length][0] - p[0], hull[(i + 1) % hull.length][1] - p[1])]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]).sort((a, b) => a - b);
        const L = idx.map(i => [hull[i], hull[(i + 1) % hull.length]]), q = [];
        for (let k = 0; k < 4; k++) { const x = intersect(L[(k + 3) % 4], L[k]); if (!x || x[0] < -0.05 * W || x[1] < -0.05 * H || x[0] > 1.05 * W || x[1] > 1.05 * H) break; q.push(x); }
        if (q.length === 4) out.push(order(q));
      }
    }
    out.unshift(order(hull));
    return out;
  }
  function intersect([p1, p2], [p3, p4]) {
    const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if (Math.abs(d) < 1e-9) return null;
    const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
    return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
  }
  // Reihenfolge oben-links, oben-rechts, unten-rechts, unten-links
  function order(q) {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
    const s = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let k = 0; for (let i = 1; i < 4; i++) if (s[i][0] + s[i][1] < s[k][0] + s[k][1]) k = i;
    return [0, 1, 2, 3].map(i => s[(k + i) % 4]);
  }
  const area = q => Math.abs(q.reduce((a, [x, y], i) => { const [x2, y2] = q[(i + 1) % 4]; return a + x * y2 - x2 * y; }, 0)) / 2;
  function anglesOk(q, lo = 45, hi = 135) {
    return q.every((p, i) => {
      const a = q[(i + 3) % 4], b = q[(i + 1) % 4], v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
      const deg = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)))) * 180 / Math.PI;
      return deg > lo && deg < hi;
    });
  }

  // Stärke der Kante senkrecht zur Richtung n an Punkt (x, y)
  function edgeAt(E, x, y, nx, ny) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 1 || yi < 1 || xi >= E.W - 1 || yi >= E.H - 1) return 0;
    const i = yi * E.W + xi, v = E.gx[i] * nx + E.gy[i] * ny;
    return Math.abs(v) > 0.7 * E.mag[i] ? v : 0;   // nur Kanten, die ungefähr parallel zur Blattkante laufen
  }
  function fitLine(pts) {
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0; for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { p: [mx, my], d: [Math.cos(th), Math.sin(th)] };
  }
  /* Jede Kante an der stärksten passenden Helligkeitskante im Umkreis r nachführen, Gerade ausgleichen, Ecken neu schneiden */
  function refine(E, q, r) {
    const lines = [];
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L, N = Math.max(16, Math.min(80, Math.round(L / 4)));
      let pts = [], pos = 0, neg = 0;
      for (let s = 0; s < N; s++) {
        const t = 0.07 + 0.86 * s / (N - 1), px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        let best = 0, bd = 0, bv = 0;
        for (let d = -r; d <= r; d++) { const v = edgeAt(E, px + nx * d, py + ny * d, nx, ny); if (Math.abs(v) > best) { best = Math.abs(v); bd = d; bv = v; } }
        if (best < E.edgeT) continue;
        // Unterpixel: Parabel durch die Nachbarn
        const v0 = Math.abs(edgeAt(E, px + nx * (bd - 1), py + ny * (bd - 1), nx, ny)), v2 = Math.abs(edgeAt(E, px + nx * (bd + 1), py + ny * (bd + 1), nx, ny));
        const den = v0 - 2 * best + v2, off = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (v0 - v2) / den)) : 0;
        pts.push([px + nx * (bd + off), py + ny * (bd + off), bv > 0]); bv > 0 ? pos++ : neg++;
      }
      pts = pts.filter(p => p[2] === (pos >= neg));   // alle Punkte einer Kante haben dieselbe Hell/Dunkel-Richtung
      let line = null;
      for (let it = 0; it < 3 && pts.length >= Math.max(8, N * 0.25); it++) {
        line = fitLine(pts);
        const res = pts.map(p => Math.abs((p[0] - line.p[0]) * line.d[1] - (p[1] - line.p[1]) * line.d[0]));
        const rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
        const keep = pts.filter((p, i) => res[i] <= Math.max(1, 2 * rms));
        if (keep.length === pts.length) break; pts = keep;
      }
      lines.push(line && pts.length >= Math.max(8, N * 0.25) ? [line.p, [line.p[0] + line.d[0], line.p[1] + line.d[1]]] : [a, b]);
    }
    const out = [];
    for (let k = 0; k < 4; k++) {
      const x = intersect(lines[(k + 3) % 4], lines[k]);
      out.push(x && Math.hypot(x[0] - q[k][0], x[1] - q[k][1]) < Math.max(4 * r, 0.08 * (E.W + E.H)) ? x : q[k]);
    }
    return out;
  }
  // Anteil der Kantenpunkte, an denen wirklich eine Blattkante liegt (je Kante; schwächste Kante zählt mit)
  function support(E, q) {
    const per = [];
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
      let hit = 0, pos = 0, neg = 0, n = 0;
      for (let s = 0; s < 40; s++) {
        const t = 0.05 + 0.9 * s / 39, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t; n++;
        let best = 0, bv = 0; for (let d = -2; d <= 2; d++) { const v = edgeAt(E, px + nx * d, py + ny * d, nx, ny); if (Math.abs(v) > best) { best = Math.abs(v); bv = v; } }
        if (best >= E.edgeT) { hit++; bv > 0 ? pos++ : neg++; }
      }
      // Blatt am Bildrand abgeschnitten: Kante auf dem Bildrand zählt halb
      const onBorder = [a, b].every(p => p[0] < 2 || p[1] < 2 || p[0] > E.W - 3 || p[1] > E.H - 3);
      per.push(onBorder ? 0.5 : Math.max(pos, neg) / n);
    }
    return 0.6 * per.reduce((s, v) => s + v, 0) / 4 + 0.4 * Math.min(...per);
  }

  /* rgba: Bilddaten W×H. hint: bekannte Ecken (normiert) → nur nachführen (z. B. bei voller Auflösung nach der Live-Erkennung) */
  function findDocument(rgba, W, H, hint) {
    const E = prepare(rgba, W, H), full = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const norm = q => q.map(([x, y]) => [Math.max(0, Math.min(1, x / (W - 1))), Math.max(0, Math.min(1, y / (H - 1)))]);
    const R = Math.max(3, Math.round(0.02 * Math.max(W, H)));
    if (hint) {
      let q = hint.map(([x, y]) => [x * (W - 1), y * (H - 1)]);
      q = refine(E, q, R); q = refine(E, q, Math.max(2, R >> 1));
      const sc = support(E, q);
      return { corners: anglesOk(q) ? norm(inset(q, W, H)) : hint, found: true, score: sc };
    }
    const n = W * H, cands = [];
    // Startpunkte: Bildmitte (dort liegt das Blatt fast immer)
    const seeds = []; for (let y = Math.round(H * 0.4); y <= H * 0.6; y += 2) for (let x = Math.round(W * 0.4); x <= W * 0.6; x += 2) seeds.push(y * W + x);
    const cvals = seeds.map(i => E.P[i]).sort((a, b) => a - b), ref = cvals[Math.round(cvals.length * 0.7)];
    // 1) heller als die Otsu-Schwelle (dunkler Untergrund)
    const t = otsu(E.P), m1 = new Uint8Array(n); for (let i = 0; i < n; i++) m1[i] = E.P[i] > t ? 1 : 0;
    cands.push(largest(W, H, m1));
    // 2) ähnlich hell wie die Bildmitte (Untergrund mit wenig Kontrast)
    for (const tol of [18, 32, 50]) cands.push(grow(W, H, seeds, i => Math.abs(E.P[i] - ref) < tol));
    // 3) von Kanten begrenzte Fläche (weißes Blatt auf hellem Tisch)
    cands.push(grow(W, H, seeds, i => E.mag[i] < E.edgeT * 0.8 && E.P[i] > ref - 70));
    let best = null;
    for (const c of cands) {
      const frac = c.n / n; if (frac < 0.08 || frac > 0.985) continue;
      const qs = maskQuad(W, H, c.m); if (!qs) continue;
      for (let q of qs) {
      q = order(refine(E, q, R)); q = order(refine(E, q, Math.max(2, R >> 1)));
      const A = area(q) / n; if (A < 0.12 || A > 0.985 || !anglesOk(q)) continue;
      // Füllgrad: Anteil der Maske im Viereck (ohne Löcher durch Schrift → großzügig)
      const fill = Math.min(1, c.n / (area(q) || 1));
      const sc = support(E, q) * (fill > 0.55 ? 1 : fill / 0.55);
      if (!best || sc > best.score + 0.01) best = { q, score: sc, fill, area: A };
      }
    }
    if (!best || best.score < 0.4) return { corners: full, found: false, score: best ? best.score : 0 };
    return { corners: norm(inset(best.q, W, H)), found: true, score: best.score, fill: Math.max(best.fill, Math.min(1, best.score + 0.25)), area: best.area };
  }
  /* Foto auf dem Scannerglas: Untergrund = Farbe am Bildrand (Deckel, meist weiß); das Foto ist die größte zusammenhängende Fläche,
     die sich davon abhebt – egal wo sie liegt (Fotos liegen oft in einer Ecke). photoLike: viele Mitteltöne, wenig Papierweiß
     (Briefe sind überwiegend weiß mit dunkler Schrift). → { corners, found, area, photoLike } */
  function findPhoto(rgba, W, H) {
    const n = W * H, full = [[0, 0], [1, 0], [1, 1], [0, 1]], band = Math.max(2, Math.round(Math.min(W, H) * 0.01));
    const rs = [], gs = [], bs = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= band && x < W - band && y >= band && y < H - band) continue;
      const j = (y * W + x) * 4; rs.push(rgba[j]); gs.push(rgba[j + 1]); bs.push(rgba[j + 2]);
    }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1], br = med(rs), bgc = med(gs), bb = med(bs);
    const lum = j => rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114;
    const tone = inside => {   // Anteil Mitteltöne und Papierweiß
      let k = 0, mid = 0, white = 0;
      for (let i = 0, j = 0; i < n; i++, j += 4) { if (inside && !inside[i]) continue; k++; const l = lum(j); if (l >= 225) white++; else if (l > 40) mid++; }
      return k ? { mid: mid / k, white: white / k } : { mid: 0, white: 1 };
    };
    const like = t => t.mid > 0.5 && t.white < 0.35;
    const m = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) m[i] = Math.abs(rgba[j] - br) + Math.abs(rgba[j + 1] - bgc) + Math.abs(rgba[j + 2] - bb) > 36 ? 1 : 0;
    const c = largest(W, H, m), frac = c.n / n;
    if (frac > 0.01 && frac < 0.97) {
      const qs = maskQuad(W, H, c.m);
      let best = null;
      for (let q of qs || []) { q = order(q); const A = area(q) / n; if (A < 0.01 || A > 0.97 || !anglesOk(q, 60, 120)) continue; if (!best || A > best.A) best = { q, A }; }
      if (best && c.n / (area(best.q) || 1) > 0.8) {   // die Fläche füllt das Viereck fast ganz – ein rechteckiges Foto, kein Text
        const norm = q => q.map(([x, y]) => [Math.max(0, Math.min(1, x / (W - 1))), Math.max(0, Math.min(1, y / (H - 1)))]);
        return { corners: norm(inset(best.q, W, H)), found: true, area: best.A, photoLike: like(tone(c.m)) };
      }
    }
    return { corners: full, found: false, area: 1, photoLike: like(tone(null)) };   // randloses Foto oder Dokument
  }
  // Ecken minimal nach innen ziehen, damit kein Untergrund-Streifen am Rand bleibt
  function inset(q, W, H) {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4, d = 0.0025 * Math.hypot(W, H) + 0.6;
    return q.map(([x, y]) => { const l = Math.hypot(cx - x, cy - y) || 1; return [x + (cx - x) / l * d, y + (cy - y) / l * d]; });
  }

  const api = { findDocument, findPhoto, order, area, anglesOk };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DocDetect = api;
})(typeof self !== 'undefined' ? self : this);
