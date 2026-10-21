// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* QR-Codes auf Seiten lesen (lokal, jsQR): GiroCode/QR-Rechnung auf Rechnungen und PDFMy-Trennblätter.
   Patchcode-Trennblätter von Dokumentenscannern (js/patchcode.js) zählen ebenfalls als Trennblatt.
   scan(canvas) → Liste der gefundenen Inhalte (bis zu 4 je Seite). */
(function (root) {
  'use strict';
  const SEPARATOR = 'PDFMY:TRENNBLATT';
  function scan(src, maxSide = 1600) {
    if (!src || !src.width) return [];
    let patch = null; try { patch = root.PatchCode?.fromCanvas(src); } catch { patch = null; }
    if (patch) return [SEPARATOR];
    if (typeof jsQR !== 'function') return [];
    const k = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    const c = typeof document === 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });   // im Worker (js/scanw.js) ohne document
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, c.width, c.height);
    const out = [];
    for (let i = 0; i < 4; i++) {
      const img = x.getImageData(0, 0, c.width, c.height);
      let r = null; try { r = jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' }); } catch { r = null; }
      if (!r || !r.data) break;
      out.push(r.data);
      // gefundenen Code weiß abdecken und weitersuchen (mehrere Codes auf einer Seite)
      const L = r.location, pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner];
      const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
      x.fillStyle = '#fff'; x.beginPath(); pts.forEach((p, j) => { const px = cx + (p.x - cx) * 1.25, py = cy + (p.y - cy) * 1.25; j ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); x.fill();
    }
    c.width = 0; c.height = 0;
    return out;
  }
  root.QR = { scan, SEPARATOR };
})(self);
