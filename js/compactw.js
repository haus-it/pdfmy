// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Web Worker: Scanseite kompakt zerlegen (Imaging.compactLayers – 1-Bit-Schrift + verkleinerter Hintergrund).
   Mehrere Worker arbeiten parallel, damit das Speichern langer Scans nicht nur einen Prozessorkern nutzt.
   Ein: { id, bmp (ImageBitmap), ms, bs } → Aus: { id, w, h, bits, color, inkShare, bg (ImageBitmap | null) } oder { id, error } */
importScripts('imaging.js');
self.onmessage = e => {
  const { id, bmp, ms, bs } = e.data;
  try {
    const L = Imaging.compactLayers(bmp, ms, bs);
    bmp.close?.();
    const bg = L.bg ? L.bg.transferToImageBitmap() : null;
    self.postMessage({ id, w: L.w, h: L.h, bits: L.bits, color: L.color, inkShare: L.inkShare, bg }, [L.bits.buffer, ...(bg ? [bg] : [])]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
