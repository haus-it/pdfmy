// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Store-Mappe (15.11.2026): Bilder für Chrome Web Store, Edge-Add-ons, Firefox/Thunderbird-Add-ons und Microsoft AppSource/Teams
   – Bildschirmfotos von PDFMy (aus dist/pdfmy.de, lokal ausgeliefert) und Werbekacheln in den geforderten Größen.
   Aufruf (nach node tools/build-web.js):  node tools/store-assets.js   → store/<Store>/bilder/…
   Ohne Abhängigkeiten: headless Chrome über tools/cdp.js (wie der Probelauf vor dem Ausrollen). */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { launch, sleep } = require('./cdp.js');
const ROOT = path.resolve(__dirname, '..'), DIST = path.join(ROOT, 'dist', 'pdfmy.de'), OUT = path.join(ROOT, 'store');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      if (p === '/__kachel.html') { rsp.writeHead(200, { 'content-type': TYPES['.html'] }); return rsp.end(tile(new URL(req.url, 'http://x').searchParams)); }
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
// Werbekachel im Mentor-Design: Symbol, Name, Satz – feste Größe
function tile(q) {
  const w = +q.get('w'), h = +q.get('h'), big = h >= 500, t = q.get('t') || '', s = q.get('s') || '';
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:B;src:url(/vendor/fonts/bricolage-grotesque-latin-standard-normal.woff2)}@font-face{font-family:I;src:url(/vendor/fonts/instrument-sans-latin-wght-normal.woff2)}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
body{background:linear-gradient(135deg,#4A5280,#2E3561);color:#fff;font-family:I,sans-serif;display:flex;align-items:center;gap:${Math.round(h * .09)}px;padding:0 ${Math.round(w * .07)}px;box-sizing:border-box}
img{width:${Math.round(h * (big ? .42 : .38))}px;height:auto;border-radius:${Math.round(h * .06)}px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
b{display:block;font-family:B,sans-serif;font-weight:800;font-size:${Math.round(h * (big ? .17 : .19))}px;letter-spacing:-.02em;line-height:1}
span{display:block;margin-top:${Math.round(h * .05)}px;font-size:${Math.round(h * (big ? .06 : .075))}px;line-height:1.25;opacity:.92;max-width:${Math.round(w * .55)}px}
</style><img src="/icons/app-512.png" alt=""><div><b>${t}</b><span>${s}</span></div>`;
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Zuerst node tools/build-web.js ausführen.');
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/`;
  const made = [];
  const save = async (b, rel) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); await b.shot(f); made.push(rel); };

  // Beispieldokument im Browser erzeugen und in PDFMy öffnen (Rechnung mit Text – zeigt die echte Oberfläche)
  const openDemo = async (b, extra = '') => {
    await b.nav(base + 'einbetten.html', 4500);
    await b.ev(`
      for (let i = 0; i < 50 && typeof state === 'undefined'; i++) await new Promise(r => setTimeout(r, 200));
      const d = await PDFLib.PDFDocument.create(), f = await d.embedFont(PDFLib.StandardFonts.Helvetica), fb = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
      for (let n = 1; n <= 2; n++) {
        const p = d.addPage([595, 842]);
        p.drawText('Muster GmbH · Hauptstraße 1 · 33100 Paderborn', { x: 60, y: 780, size: 9, font: f });
        p.drawText(n === 1 ? 'Rechnung Nr. 2026-1104' : 'Leistungsübersicht', { x: 60, y: 700, size: 22, font: fb });
        const rows = n === 1 ? [['Beratung (6 Std.)', '540,00 €'], ['Einrichtung Scanner', '180,00 €'], ['Schulung', '240,00 €'], ['Summe netto', '960,00 €'], ['USt. 19 %', '182,40 €'], ['Gesamt', '1.142,40 €']]
          : [['14.10.2026', 'Vor-Ort-Termin'], ['21.10.2026', 'Einrichtung'], ['04.11.2026', 'Schulung Team']];
        rows.forEach(([a, b], i) => { p.drawText(a, { x: 60, y: 640 - i * 26, size: 12, font: i === rows.length - 1 && n === 1 ? fb : f }); p.drawText(b, { x: 420, y: 640 - i * 26, size: 12, font: i === rows.length - 1 && n === 1 ? fb : f }); });
        p.drawText('Bitte überweisen Sie den Betrag innerhalb von 14 Tagen.', { x: 60, y: 380, size: 11, font: f });
      }
      const bytes = await d.save();
      await importFiles([new File([bytes], 'Rechnung 2026-1104.pdf', { type: 'application/pdf' })]);
      state.dirty = false;
      ${extra}
      await new Promise(r => setTimeout(r, 1500));`);
    await sleep(1500);
  };

  // 1) Bildschirmfotos 1280×800 (Chrome, Edge, Firefox, Thunderbird)
  let b = await launch({ W: 1280, H: 800 });
  await openDemo(b);
  for (const s of ['chrome', 'edge', 'firefox']) await save(b, `${s}/bilder/bildschirm-1-pdf-geoeffnet-1280x800.png`);
  await b.nav(base + 'erweiterung.html', 2500); for (const s of ['chrome', 'edge', 'firefox']) await save(b, `${s}/bilder/bildschirm-2-erweiterung-1280x800.png`);
  // mit „An E-Mail anhängen“ (Outlook, Thunderbird)
  await openDemo(b, `window.postMessage({ type: 'pdfmy:host', actions: ['attach'] }, location.origin);`);
  await save(b, 'thunderbird/bilder/bildschirm-1-an-e-mail-anhaengen-1280x800.png');
  b.close();

  // 2) Microsoft AppSource / Teams: 1366×768
  b = await launch({ W: 1366, H: 768 });
  await openDemo(b, `window.postMessage({ type: 'pdfmy:host', actions: ['attach'] }, location.origin);`);
  await save(b, 'microsoft-appsource/bilder/bildschirm-1-outlook-an-e-mail-anhaengen-1366x768.png');
  await openDemo(b);
  await save(b, 'microsoft-appsource/bilder/bildschirm-2-pdf-bearbeiten-1366x768.png');
  await save(b, 'microsoft-teams/bilder/bildschirm-1-pdfmy-in-teams-1366x768.png');
  b.close();

  // 3) Werbekacheln
  const tiles = [
    ['chrome/bilder/kachel-klein-440x280.png', 440, 280, 'PDFMy', 'PDFs mit einem Klick öffnen – ohne Upload'],
    ['chrome/bilder/kachel-gross-1400x560.png', 1400, 560, 'PDFMy', 'PDFs aus dem Browser öffnen, bearbeiten, unterschreiben – alles bleibt auf Ihrem Gerät'],
    ['edge/bilder/kachel-klein-440x280.png', 440, 280, 'PDFMy', 'PDFs mit einem Klick öffnen – ohne Upload'],
    ['edge/bilder/kachel-gross-1400x560.png', 1400, 560, 'PDFMy', 'PDFs aus dem Browser öffnen, bearbeiten, unterschreiben – alles bleibt auf Ihrem Gerät'],
  ];
  for (const [rel, w, h, t, s] of tiles) {
    b = await launch({ W: w, H: h });
    await b.nav(`${base}__kachel.html?w=${w}&h=${h}&t=${encodeURIComponent(t)}&s=${encodeURIComponent(s)}`, 1200);
    await save(b, rel); b.close();
  }
  // 4) Symbole: Erweiterungen mit dem Erweiterungssymbol, Microsoft mit dem App-Symbol (300 px)
  const extIcon = path.join(ROOT, 'tools', 'pdfmy-extension', 'icons', 'icon-128.png');
  for (const st of ['chrome', 'edge', 'firefox', 'thunderbird']) { const f = path.join(OUT, st, 'bilder', 'symbol-128.png'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(extIcon, f); made.push(`${st}/bilder/symbol-128.png`); }
  b = await launch({ W: 300, H: 300 });
  await b.nav(base + 'icons/app-512.png', 800);
  await b.ev(`document.body.style.margin = 0; const i = document.querySelector('img'); i.style.width = i.style.height = '300px';`);
  await save(b, 'microsoft-appsource/bilder/symbol-300.png'); b.close();
  // 5) Pakete zum Hochladen (aus dem Bau) in den Ordner des jeweiligen Stores
  const dl = path.join(DIST, 'download'), pick = re => fs.readdirSync(dl).filter(f => re.test(f)).sort().pop();
  const pkgs = { chrome: [pick(/^pdfmy-erweiterung-[\d.]+\.zip$/)], edge: [pick(/^pdfmy-erweiterung-[\d.]+\.zip$/)], firefox: [pick(/^pdfmy-firefox-[\d.]+\.xpi$/)], thunderbird: [pick(/^pdfmy-thunderbird-[\d.]+\.xpi$/)],
    'microsoft-appsource': ['pdfmy-outlook.xml', 'pdfmy-office.xml'], 'microsoft-teams': ['pdfmy-teams.zip'], nextcloud: [pick(/^pdfmy-nextcloud-[\d.]+\.zip$/)], onlyoffice: [pick(/^pdfmy-onlyoffice-[\d.]+\.plugin$/)] };
  for (const [st, files] of Object.entries(pkgs)) for (const f of files) { const d = path.join(OUT, st, 'paket', f); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(dl, f), d); made.push(`${st}/paket/${f}`); }
  fs.writeFileSync(path.join(OUT, 'LIESMICH.txt'), 'Store-Mappe von PDFMy – Anleitung und Texte zum Kopieren: docs/Store-Einreichung.md
Entscheidungen: docs/Entscheidungen-Stores.md
Je Store: paket\ (hochladen) und bilder\ (hochladen).
');
  srv.close();
  console.log(`${made.length} Bilder in store/:`); for (const m of made) console.log('  ' + m);
})().catch(e => { console.error(e); process.exit(1); });
