// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) â€“ PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Service Worker: hÃ¤lt App, Bibliotheken und OCR-Daten offline vor.
   App-Dateien: zuerst Netz (damit Updates sofort greifen), sonst Cache. vendor/: Cache zuerst (Ã¤ndert sich nur mit VERSION). */
const VERSION = 'app-v138';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'js/app.js', 'js/config.js', 'js/i18n.js', 'js/bea.js', 'js/letter.js', 'js/qr.js', 'js/formdetect.js', 'js/a11ycheck.js', 'js/bank.js', 'js/pdfsign.js', 'js/pdfcrypt.js', 'js/sigreq.js', 'js/pdfinc.js', 'js/layout.js', 'js/pdfverify.js', 'js/docdetect.js', 'js/imaging.js', 'js/camera.js', 'js/tools.js', 'js/journal.js', 'js/einvoice.js', 'js/einvoice-out.js', 'js/email.js', 'js/pro.js',
  'icons/mentor-192.png', 'icons/mentor-512.png', 'icons/mentor-group.png'];
const VENDOR = ['vendor/pdf-lib.min.js', 'vendor/fontkit.umd.min.js', 'vendor/pdfjs/loader.js', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'vendor/pdfjs/wasm/openjpeg.wasm', 'vendor/pdfjs/wasm/jbig2.wasm', 'vendor/pdfjs/wasm/qcms_bg.wasm',
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js', 'vendor/DejaVuSans.ttf', 'vendor/dejavu/DejaVuSerif.ttf', 'vendor/dejavu/DejaVuSans-Bold.ttf', 'vendor/sRGB.icc', 'vendor/pdf-lib-crypt.min.js', 'vendor/qrcode.js', 'vendor/jsqr.js',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/lang/deu.traineddata.gz'];

self.addEventListener('install', e => {
  // 'reload' umgeht den HTTP-Cache des Browsers â€“ sonst kÃ¶nnten beim Update alte Dateien in den neuen Offline-Speicher geraten
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll([...CORE, ...VENDOR].map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    })));
  } else {
    // App-Dateien immer frisch vom Server (am HTTP-Cache vorbei), offline aus dem eigenen Speicher
    const net = e.request.mode === 'navigate' ? fetch(e.request) : fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
    e.respondWith(net.then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
  }
});
