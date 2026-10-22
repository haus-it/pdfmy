// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Web Worker: Scanseite beim Import aufbereiten (Imaging.prepScan – zuschneiden, gerade richten, aufbereiten) und QR-Codes lesen.
   Mehrere Worker arbeiten parallel, damit lange Scan-PDFs nicht nur einen Prozessorkern nutzen.
   Ein: { id, bmp (ImageBitmap), o (Optionen für prepScan) }
   Aus: { id, orig (ImageBitmap | null = unverändert), processed (ImageBitmap), cropped, angle, autoMode, qr (Texte) } oder { id, error } */
importScripts('docdetect.js', 'imaging.js', 'patchcode.js', 'qr.js', '../vendor/jsqr.js');
self.onmessage = e => {
  const { id, bmp, o } = e.data;
  try {
    const r = Imaging.prepScan(bmp, o), qr = QR.scan(r.orig);
    const orig = r.orig === bmp ? null : r.orig.transferToImageBitmap(), processed = r.processed.transferToImageBitmap();
    bmp.close?.();
    self.postMessage({ id, orig, processed, cropped: r.cropped, angle: r.angle, autoMode: r.autoMode, photo: !!r.photo, qr }, [processed, ...(orig ? [orig] : [])]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
