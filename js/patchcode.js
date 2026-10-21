// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Patchcode-Trennblätter erkennen (Kodak-Patchcode, wie ihn Dokumentenscanner von Kodak, Fujitsu/Ricoh, Canon u. a. nutzen).
   Ein Patchcode sind vier parallele schwarze Balken, jeder breit (W) oder schmal (N); das Muster ergibt den Typ.
   Erkennung lokal auf Graustufen: viele Bildzeilen (bzw. -spalten) müssen an derselben Stelle genau vier Balken
   mit freiem Rand zeigen – Text und Tabellen erfüllen das nicht.
   detect(gray, W, H) → { type, pattern, vertical } oder null. fromCanvas(canvas) → dasselbe. */
(function (root) {
  'use strict';
  const TYPES = { WNNW: '1', WNWN: '2', WWNN: '3', NWNW: '4', NWWN: '6', WNNN: 'T' };
  const DARK = 110;

  // Dunkle Abschnitte einer Linie: [[start, länge], …]
  function runs(get, n) {
    const out = []; let s = -1;
    for (let i = 0; i <= n; i++) {
      const d = i < n && get(i) < DARK;
      if (d && s < 0) s = i; else if (!d && s >= 0) { out.push([s, i - s]); s = -1; }
    }
    return out;
  }

  // In einer Linie vier Balken mit Patchcode-Proportionen suchen → { pattern, center, width } oder null
  function lineCode(rs, n) {
    const found = [];
    for (let i = 0; i + 4 <= rs.length; i++) {
      const b = rs.slice(i, i + 4), w = b.map(r => r[1]), maxW = Math.max(...w), minW = Math.min(...w);
      if (minW < 2 || maxW / minW < 1.7 || maxW / minW > 4.5) continue;            // breit und schmal deutlich verschieden
      const thr = (maxW + minW) / 2;
      if (w.some(x => Math.abs(x - thr) < (maxW - minW) * 0.15)) continue;           // jede Breite eindeutig zuzuordnen
      let gapsOk = true;
      for (let k = 0; k < 3; k++) { const g = b[k + 1][0] - (b[k][0] + b[k][1]); if (g < minW * 0.8 || g > maxW * 2.2) gapsOk = false; }
      if (!gapsOk) continue;
      const left = b[0][0], right = b[3][0] + b[3][1], quiet = maxW * 2;               // freier Rand links und rechts
      const prev = rs[i - 1], next = rs[i + 4];
      if (prev && left - (prev[0] + prev[1]) < quiet) continue;
      if (next && next[0] - right < quiet) continue;
      found.push({ pattern: w.map(x => x > thr ? 'W' : 'N').join(''), center: (left + right) / 2 / n, width: (right - left) / n });
    }
    return found.length === 1 ? found[0] : null;
  }

  // Viele Linien quer zu den Balken prüfen; mindestens 35 % müssen dasselbe Muster an derselben Stelle zeigen
  function scanDir(gray, W, H, vertical) {
    const lines = vertical ? H : W, len = vertical ? W : H, hits = [];
    let tried = 0;
    for (let l = Math.round(lines * 0.04); l < lines * 0.96; l += Math.max(1, Math.round(lines / 80))) {
      tried++;
      const get = vertical ? x => gray[l * W + x] : y => gray[y * W + l];
      const c = lineCode(runs(get, len), len);
      if (c) hits.push(c);
    }
    if (!tried || hits.length < tried * 0.35) return null;
    const byKey = new Map();
    for (const h of hits) {
      const key = h.pattern + ':' + Math.round(h.center * 25);
      byKey.set(key, (byKey.get(key) || []).concat([h]));
    }
    let best = null;
    for (const list of byKey.values()) if (!best || list.length > best.length) best = list;
    if (best.length < tried * 0.35) return null;
    const pattern = best[0].pattern, rev = [...pattern].reverse().join('');
    const type = TYPES[pattern] || TYPES[rev];                                         // um 180° gedreht eingelegt: Muster rückwärts
    return type ? { type, pattern, vertical } : null;
  }

  function detect(gray, W, H) {
    if (!gray || !W || !H) return null;
    return scanDir(gray, W, H, true) || scanDir(gray, W, H, false);
  }

  function fromCanvas(src, maxSide = 900) {
    if (!src || !src.width) return null;
    const k = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    const c = typeof document === 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) | 0;
    c.width = 0; c.height = 0;
    return detect(g, w, h);
  }

  const api = { detect, fromCanvas, TYPES };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PatchCode = api;
})(typeof self !== 'undefined' ? self : globalThis);
