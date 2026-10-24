// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Probelauf vor dem Ausrollen (sichere Update-Strategie, KONZEPT.md): die fertige Website im echten Browser prüfen.
     node tools/smoke.js                     → dist/<domain> lokal ausliefern und prüfen
     node tools/smoke.js --url https://…/    → eine schon hochgeladene Testadresse prüfen
   Geprüft: Startseite ohne Skriptfehler, Kacheln da, PDF öffnen, als PDF und PDF/A erzeugen, Vorabprüfung,
   Handyansicht ohne seitlichen Überlauf, Service Worker registriert. Exit-Code 1 bei einem Fehler → deploy.ps1 lädt nichts hoch. */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { launch } = require('./cdp.js');

const ROOT = path.join(__dirname, '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.icc': 'application/octet-stream', '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

// Kleiner statischer Server nur für 127.0.0.1 (Service Worker verlangt einen sicheren Ursprung – 127.0.0.1 gilt als sicher)
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, path.normalize(p).replace(/^([\\/]\.\.)+/, ''));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function main() {
  let base = arg('--url'), srv = null;
  if (!base) {
    const site = JSON.parse(fs.readFileSync(path.join(__dirname, 'site.json'), 'utf8'));
    const dir = path.resolve(arg('--dir') || path.join(ROOT, 'dist', site.domain));
    if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error('Kein Build gefunden: ' + dir);
    srv = await serve(dir); base = `http://127.0.0.1:${srv.address().port}/`;
  }
  const results = [], ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? '✓' : '✗'} ${name}${info ? ' – ' + info : ''}`); };
  const wait = `for (let i = 0; i < 80 && typeof importFiles === 'undefined'; i++) await new Promise(r => setTimeout(r, 250));`;
  console.log('Probelauf: ' + base);
  try {
    // Desktop
    const b = await launch({ W: 1280, H: 900 });
    try {
      await b.nav(base, 1500);
      await b.ev(`localStorage.setItem('mpdf.setupSeen', '1'); return 1;`);
      b.errors.length = 0;
      await b.nav(base + '?probelauf=1', 4000);
      const home = await b.ev(`${wait} return { app: typeof importFiles === 'function', tiles: document.querySelectorAll('.tile').length, title: document.title };`);
      ok('Startseite lädt die App', home.app, home.title);
      ok('Kacheln vorhanden', home.tiles >= 20, `${home.tiles} Kacheln`);
      const sw = await b.ev(`for (let i = 0; i < 40; i++) { const r = await navigator.serviceWorker?.getRegistration(); if (r?.active || r?.installing || r?.waiting) return true; await new Promise(r => setTimeout(r, 250)); } return false;`);
      ok('Service Worker registriert (offline nutzbar)', sw);
      const doc = await b.ev(`${wait}
        const d = await PDFLib.PDFDocument.create(), pg = d.addPage([595, 842]), f = await d.embedFont(PDFLib.StandardFonts.Helvetica);
        pg.drawText('Probelauf PDFMy', { x: 60, y: 760, size: 16, font: f }); pg.drawText('Rechnung Nr. 1 vom 24.10.2026', { x: 60, y: 730, size: 11, font: f });
        await importFiles([new File([await d.save()], 'Probelauf.pdf', { type: 'application/pdf' })]);
        for (let i = 0; i < 40 && !state.pages.length; i++) await new Promise(r => setTimeout(r, 250));
        const head = b => new TextDecoder().decode(b.subarray(0, 5));
        const pdf = await buildPdf(state.pages, state.meta, { onPage: () => {} });
        const pdfa = await buildPdf(state.pages, state.meta, { pdfa: true, onPage: () => {} });
        const pa = await Preflight.run('pdfa', pdfa, { pages: 1, textPages: 1 }), be = await Preflight.run('bea', pdf, { name: 'Probelauf.pdf', pages: 1, textPages: 1 });
        return { pages: state.pages.length, pdf: head(pdf), pdfa: head(pdfa), paClaim: pa.items.find(x => /PDF\\/A gekennzeichnet/.test(x.title))?.ok, paBad: pa.items.filter(x => x.ok === false).map(x => x.title), bea: be.ok };`);
      ok('PDF öffnen', doc.pages === 1);
      ok('Als PDF speichern', doc.pdf === '%PDF-');
      ok('Als PDF/A speichern (Kurzprüfung ohne Fehler)', doc.pdfa === '%PDF-' && doc.paClaim === true && !doc.paBad.length, doc.paBad.join('; '));
      ok('Vorabprüfung beA', doc.bea === true);
      const errs = b.errors.filter(e => !/favicon|ERR_INTERNET_DISCONNECTED/i.test(e));
      ok('Keine Skriptfehler', !errs.length, errs.slice(0, 3).join(' | ').slice(0, 300));
    } finally { b.close(); }
    // Handy
    const m = await launch({ W: 390, H: 800, mobile: true });
    try {
      await m.nav(base, 1500); await m.ev(`localStorage.setItem('mpdf.setupSeen', '1'); return 1;`); await m.nav(base, 4000);
      const r = await m.ev(`${wait} return { w: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };`);
      ok('Handyansicht ohne seitlichen Überlauf', r.w <= r.vw + 1, `${r.w} px bei ${r.vw} px`);
    } finally { m.close(); }
  } finally { srv?.close(); }
  const bad = results.filter(r => !r.pass);
  console.log(bad.length ? `Probelauf FEHLGESCHLAGEN: ${bad.length} von ${results.length} Prüfungen` : `Probelauf bestanden: ${results.length}/${results.length}`);
  process.exit(bad.length ? 1 : 0);
}
main().catch(e => { console.error('Probelauf FEHLGESCHLAGEN: ' + e.message); process.exit(1); });
