// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Service Worker: hält App, Bibliotheken und OCR-Daten offline vor.
   App-Dateien: zuerst Netz (damit Updates sofort greifen), sonst Offline-Speicher. vendor/: Offline-Speicher zuerst.
   Updates laden nur geänderte Dateien (Update-Strategie, KONZEPT.md): Der Offline-Speicher bleibt über Versionen bestehen; beim
   Installieren wird jede gespeicherte Datei mit ihrer Prüfsumme in pruefsummen.json verglichen und nur bei Abweichung neu geladen.
   Bei 100.000 Nutzern spart das je Veröffentlichung Terabytes (vorher: alle ~18 MB je Gerät bei jeder neuen VERSION). */
const VERSION = 'app-v191';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'js/app.js', 'js/config.js', 'js/i18n.js', 'js/bea.js', 'js/letter.js', 'js/qr.js', 'js/patchcode.js', 'js/formdetect.js', 'js/formcalc.js', 'js/formprofile.js', 'js/reflow.js', 'js/preflight.js', 'js/hotfolder.js', 'js/a11ycheck.js', 'js/bank.js', 'js/pdfsign.js', 'js/pdfcrypt.js', 'js/sigreq.js', 'js/pdfinc.js', 'js/layout.js', 'js/textpdf.js', 'js/glyphless.js', 'js/office.js', 'js/pdfacheck.js', 'js/pptx.js', 'js/pdfverify.js', 'js/docdetect.js', 'js/imaging.js', 'js/compactw.js', 'js/scanw.js', 'js/camera.js', 'js/tools.js', 'js/journal.js', 'js/einvoice.js', 'js/einvoice-out.js', 'js/email.js', 'js/pro.js',
  'icons/mentor-192.png', 'icons/mentor-512.png', 'icons/mentor-group.png'];
const VENDOR = ['vendor/pdf-lib.min.js', 'vendor/fontkit.umd.min.js', 'vendor/pdfjs/loader.js', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'vendor/pdfjs/wasm/openjpeg.wasm', 'vendor/pdfjs/wasm/jbig2.wasm', 'vendor/pdfjs/wasm/qcms_bg.wasm',
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js', 'vendor/DejaVuSans.ttf', 'vendor/dejavu/DejaVuSerif.ttf', 'vendor/dejavu/DejaVuSans-Bold.ttf', 'vendor/sRGB.icc', 'vendor/pdf-lib-crypt.min.js', 'vendor/qrcode.js', 'vendor/jsqr.js', 'vendor/utif/UTIF.js', 'vendor/utif/pako_inflate.min.js',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/lang/deu.traineddata.gz'];


const STORE = 'pdfmy-dateien';   // dauerhafter Offline-Speicher (nicht je VERSION)
const STAGE = 'pdfmy-neu-' + VERSION;   // geänderte Dateien einer neuen Fassung – erst beim Aktivieren in STORE übernommen (abgebrochene Installation lässt STORE unberührt)
const NOCACHE = /(^|\/)(pruefsummen\.(json|txt)|sw\.js)$/;   // nie zwischenspeichern – sonst vergliche ein Gerät offline mit alten Prüfsummen
const BASE = new URL('./', self.location).href;
const rel = url => { const u = new URL(url, BASE); u.search = ''; const r = u.href.startsWith(BASE) ? u.href.slice(BASE.length) : null; return r === '' ? 'index.html' : r; };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const shaOf = async res => hex(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer()));

// Prüfsummen der veröffentlichten Fassung (Web-Version: pruefsummen.json; lokale Ausgabe ohne Liste → alles neu laden wie bisher)
async function published() {
  try { const r = await fetch('pruefsummen.json', { cache: 'reload' }); if (r.ok) return (await r.json()).dateien || null; } catch {}
  return null;
}
// Gespeicherte Antwort zu einer Datei – im dauerhaften Speicher oder in einem alten Speicher je VERSION (Übergang)
async function stored(req) {
  for (const name of [STORE, ...(await caches.keys()).filter(k => k !== STORE && !k.startsWith('pdfmy-neu-'))]) {
    const hit = await (await caches.open(name)).match(req, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pdfmy-neu-') && k !== STAGE) await caches.delete(k);   // Reste abgebrochener Installationen
    const sums = await published(), stage = await caches.open(STAGE), store = await caches.open(STORE);
    let kept = 0, loaded = 0;
    // Pflichtdateien: unverändert behalten, geändert oder fehlend neu laden (in den Zwischenspeicher). 'reload' umgeht den HTTP-Cache.
    await Promise.all([...CORE, ...VENDOR].map(async f => {
      const req = new Request(f), want = sums?.[rel(req.url)], have = want && await stored(req);
      if (have && await shaOf(have) === want) { if (!await store.match(req, { ignoreSearch: true })) await stage.put(req, have); kept++; return; }   // aus altem Speicher je VERSION übernehmen
      const res = await fetch(new Request(f, { cache: 'reload' }));
      if (!res.ok) throw new Error(`${f}: ${res.status}`);
      await stage.put(req, res); loaded++;
    }));
    // Zur Laufzeit gespeicherte Dateien (z. B. weitere OCR-Sprachen): veraltete merken – beim Aktivieren entfernt, bei Bedarf neu geladen
    const stale = [];
    if (sums) for (const req of await store.keys()) {
      const r = rel(req.url), want = r && sums[r];
      if (want && !CORE.includes(r) && !VENDOR.includes(r)) { const hit = await store.match(req); if (!hit || await shaOf(hit) !== want) stale.push(req.url); }
    }
    await stage.put('__veraltet__', new Response(JSON.stringify(stale)));
    console.info(`PDFMy ${VERSION}: ${loaded} Datei(en) geladen, ${kept} unverändert übernommen`);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // neue Fassung übernehmen: Zwischenspeicher → dauerhafter Speicher, veraltete Laufzeit-Dateien entfernen
    const store = await caches.open(STORE);
    if (await caches.has(STAGE)) {
      const stage = await caches.open(STAGE);
      for (const req of await stage.keys()) {
        if (req.url.endsWith('/__veraltet__')) { for (const u of await (await stage.match(req)).json()) await store.delete(u); continue; }
        await store.put(req, await stage.match(req));
      }
    }
    // alte Speicher je VERSION und Zwischenspeicher entfernen
    for (const k of await caches.keys()) if (k !== STORE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(STORE).then(c => c.put(e.request, copy)); }
      return res;
    })));
  } else {
    // App-Dateien immer frisch vom Server (am HTTP-Cache vorbei, Server antwortet bei unveränderter Datei nur mit „304“), offline aus dem Speicher
    const net = e.request.mode === 'navigate' ? fetch(e.request) : fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
    e.respondWith(net.then(res => {
      if (res.ok && !NOCACHE.test(url.pathname)) { const copy = res.clone(); caches.open(STORE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
  }
});
