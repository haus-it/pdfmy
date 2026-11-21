// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Android „Teilen → PDFMy“ (share_target): Der Service Worker nimmt die Datei an, legt sie lokal ab und öffnet die App.
// Fehlerbericht 20.11.2026 (Android 10, „Es wurde keine Datei übergeben“): Herkunft einer App darf nicht abgewiesen werden,
// und die App erfährt den Grund, wenn keine Datei ankam (Link/Text, leer, fremde Seite) – ohne Inhalte weiterzugeben.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function sw() {
  const handlers = [], store = new Map();
  const cache = { keys: async () => [...store.keys()].map(k => new Request(k)), delete: async k => store.delete(typeof k === 'string' ? k : k.url), put: async (k, r) => store.set(k.url, r), match: async k => store.get(k.url) };
  const self = { location: new URL('https://pdfmy.de/sw.js'), addEventListener: (t, h) => { if (t === 'fetch') handlers.push(h); }, clients: { claim: async () => {} }, skipWaiting: () => {}, registration: {} };
  // wie im echten Service Worker: relative Adressen gegen den Ort des Service Workers auflösen
  class SwRequest extends Request { constructor(u, o) { super(typeof u === 'string' ? new URL(u, 'https://pdfmy.de/').href : u, o); } }
  const ctx = { self, location: self.location, caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined }, URL, Request, Response, Headers, FormData, Blob, File, fetch: async () => new Response(''), console, setTimeout, clearTimeout, TextEncoder, TextDecoder, crypto: globalThis.crypto };
  ctx.Request = SwRequest;
  vm.runInNewContext(src, ctx);
  const send = async (fd, referrer) => {
    const req = new Request('https://pdfmy.de/teilen', { method: 'POST', body: fd });
    Object.defineProperty(req, 'referrer', { value: referrer ?? '' });
    let res = null; for (const h of handlers) { h({ request: req, respondWith: p => { res = p; } }); if (res) break; }
    const r = await res; return { ort: new URL(r.headers.get('location')), store };
  };
  return send;
}
const pdf = () => new File([new Uint8Array([37, 80, 68, 70, 45])], 'Brief.pdf', { type: 'application/pdf' });

test('Teilen: Datei aus einer Android-App (Herkunft android-app://…) wird angenommen', async () => {
  for (const ref of ['', 'about:client', 'android-app://com.whatsapp/', 'android-app://com.google.android.gm/']) {
    const fd = new FormData(); fd.append('dateien', pdf());
    const { ort, store } = await sw()(fd, ref);
    assert.equal(ort.searchParams.get('geteilt'), '1', ref); assert.equal(store.size, 1, ref);
  }
});

test('Teilen: fremde Webseite wird abgewiesen, Link statt Datei und leere Übergabe melden den Grund', async () => {
  let fd = new FormData(); fd.append('dateien', pdf());
  let { ort, store } = await sw()(fd, 'https://boese.example/formular');
  assert.equal(ort.searchParams.get('grund'), 'fremd'); assert.equal(store.size, 0);
  fd = new FormData(); fd.append('dateien', pdf()); ({ ort } = await sw()(fd, 'https://pdfmy.de/'));
  assert.equal(ort.searchParams.get('geteilt'), '1', 'eigene Seite');
  fd = new FormData(); fd.append('url', 'https://bank.example/rechnung.pdf'); fd.append('title', 'Rechnung');
  ({ ort } = await sw()(fd, 'android-app://com.android.chrome/'));
  assert.equal(ort.searchParams.get('grund'), 'text'); assert.equal(ort.searchParams.get('inhalt'), 'url,title');
  assert.doesNotMatch(ort.href, /bank\.example|Rechnung/, 'keine Inhalte in der Adresse');
  fd = new FormData(); fd.append('dateien', new File([], 'leer.pdf', { type: 'application/pdf' }));
  ({ ort } = await sw()(fd, ''));
  assert.equal(ort.searchParams.get('grund'), 'leer'); assert.match(ort.searchParams.get('inhalt'), /^dateien\(0 B, application\/pdf\)$/);
});

test('App: Grund wird gemeldet und ins Protokoll geschrieben', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /logLine\(`Teilen ohne Datei \(Grund: /);
  assert.match(app, /grund === 'text' \? 'Geteilt wurde ein Link oder Text, keine Datei\./);
});
