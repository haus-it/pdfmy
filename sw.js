// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Service Worker: hält App, Bibliotheken und OCR-Daten offline vor.
   App-Dateien: zuerst Netz (damit Updates sofort greifen), sonst Offline-Speicher. vendor/: Offline-Speicher zuerst.
   Updates laden nur geänderte Dateien (Update-Strategie, KONZEPT.md): Der Offline-Speicher bleibt über Versionen bestehen; beim
   Installieren wird jede gespeicherte Datei mit ihrer Prüfsumme in pruefsummen.json verglichen und nur bei Abweichung neu geladen.
   Bei 100.000 Nutzern spart das je Veröffentlichung Terabytes (vorher: alle ~18 MB je Gerät bei jeder neuen VERSION). */
const VERSION = 'app-v197';
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
// Abruf am HTTP-Cache vorbei, mit Wiederholung (Mobilfunk) → Antwort oder null
async function fetchRetry(f, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const res = await fetch(new Request(f, { cache: 'reload' })); if (res.ok) return res; if (res.status === 404) return null; } catch {}
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}
/* Weitere Dateien für den Offline-Betrieb, die nicht beim Installieren, sondern danach im Hintergrund geladen werden (Seite fragt an):
   klein und wichtig (iPhone-Fotos HEIC, Schriften der Unterschrift und Oberfläche, Verschlüsselung) immer; die großen Schriften für
   Word-Import und „Text ändern“ (~10 MB) nur im WLAN bzw. ohne Datensparmodus. Dazu die OCR-Sprache der Oberfläche. */
const EXTRA = ['vendor/libheif/libheif.js', 'vendor/libheif/libheif.wasm', 'vendor/forge.min.js',
  'vendor/fonts/archivo-latin-standard-normal.woff2', 'vendor/fonts/archivo-latin-standard-italic.woff2', 'vendor/fonts/source-sans-3-latin-wght-normal.woff2',
  ...['allura', 'caveat', 'dancing-script', 'great-vibes', 'homemade-apple'].map(n => `vendor/fonts/sign/${n}.woff2`)];
const HEAVY = [...['Sans-Oblique', 'Sans-BoldOblique', 'SansMono', 'Serif-Bold', 'Serif-Italic', 'Serif-BoldItalic'].map(n => `vendor/dejavu/DejaVu${n}.ttf`),
  ...['Caladea', 'LiberationMono', 'LiberationSans', 'LiberationSerif', 'PDFMySansC'].flatMap(f => ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(s => `vendor/fonts/metric/${f}-${s}.ttf`))];
// Offline-Stand prüfen und fehlende Dateien nachladen: { want: [...], load: true|false } → { missing: [...], total }
async function ensure(list, load) {
  const store = await caches.open(STORE), missing = [];
  for (const f of list) {
    if (await store.match(new Request(f), { ignoreSearch: true })) continue;
    const res = load ? await fetchRetry(f, 2) : null;
    if (res) await store.put(new Request(f), res); else missing.push(f);
  }
  return { missing, total: list.length };
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'pdfmy:offline') return;
  const langs = (d.langs || []).filter(l => /^[a-z_]{3,8}$/.test(l)).map(l => `vendor/tesseract/lang/${l}.traineddata.gz`);
  const base = [...CORE, ...VENDOR], more = [...EXTRA, ...langs, ...(d.heavy ? HEAVY : [])];
  e.waitUntil((async () => {
    const core = await ensure(base, true), extra = await ensure(more, d.load !== false);
    e.source?.postMessage({ type: 'pdfmy:offline', ready: !core.missing.length, coreMissing: core.missing.length, extraMissing: extra.missing.length, heavy: !!d.heavy });
  })());
});
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
    // App-Dateien (CORE) sind Pflicht – fehlt eine, bleibt die bisherige Fassung aktiv. Bibliotheken (VENDOR) mit Wiederholung;
    // scheitert eine trotzdem (schwaches Mobilfunknetz), installiert die Fassung dennoch – die Datei lädt die Seite später nach (ensure).
    let missed = 0;
    await Promise.all([...CORE, ...VENDOR].map(async f => {
      const req = new Request(f), want = sums?.[rel(req.url)], have = want && await stored(req);
      if (have && await shaOf(have) === want) { if (!await store.match(req, { ignoreSearch: true })) await stage.put(req, have); kept++; return; }   // aus altem Speicher je VERSION übernehmen
      const res = await fetchRetry(f);
      if (!res) { if (CORE.includes(f)) throw new Error(`${f}: nicht ladbar`); missed++; return; }
      await stage.put(req, res); loaded++;
    }));
    // Zur Laufzeit gespeicherte Dateien (z. B. weitere OCR-Sprachen): veraltete merken – beim Aktivieren entfernt, bei Bedarf neu geladen
    const stale = [];
    if (sums) for (const req of await store.keys()) {
      const r = rel(req.url), want = r && sums[r];
      if (want && !CORE.includes(r) && !VENDOR.includes(r)) { const hit = await store.match(req); if (!hit || await shaOf(hit) !== want) stale.push(req.url); }
    }
    await stage.put('__veraltet__', new Response(JSON.stringify(stale)));
    console.info(`PDFMy ${VERSION}: ${loaded} Datei(en) geladen, ${kept} unverändert übernommen${missed ? `, ${missed} später` : ''}`);
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
    await store.put('__version__', new Response(VERSION));   // Stand der aktiven Fassung für die Versionsanzeige der App
    // alte Speicher je VERSION und Zwischenspeicher entfernen
    for (const k of await caches.keys()) if (k !== STORE && k !== SHARE) await caches.delete(k);   // geteilte Dateien (Android) bleiben, bis die App sie übernommen hat
    await self.clients.claim();
  })());
});
/* Android „Teilen“ / „Öffnen mit → PDFMy“ (share_target im Manifest): Die installierte App bekommt die Datei per POST an ./teilen.
   Der Service Worker legt sie nur kurz im Gerätespeicher ab (SHARE) und öffnet die App; die App übernimmt sie und löscht den Speicher.
   Die Datei geht nie an den Server – die Anfrage beantwortet der Service Worker selbst. */
const SHARE = 'pdfmy-teilen';
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'POST' || u.origin !== location.origin || !u.pathname.endsWith('/teilen')) return;
  e.respondWith((async () => {
    try {
      const fd = await e.request.formData(), files = fd.getAll('dateien').filter(f => f && typeof f !== 'string' && f.size);
      const c = await caches.open(SHARE);
      for (const k of await c.keys()) await c.delete(k);
      for (const [i, f] of files.entries()) await c.put(new Request(`__teilen__/${i}`), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'Datei') } }));
      return Response.redirect(new URL(`./?geteilt=${files.length}`, BASE).href, 303);
    } catch { return Response.redirect(new URL('./?geteilt=0', BASE).href, 303); }
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/download/')) return;   // Downloads direkt vom Server, nicht im Offline-Speicher ablegen
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
