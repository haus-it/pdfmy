// Headless-Test der Erweiterung: echter Chrome, echte Klicks, PDFMy aus dist/pdfmy.de.
// pdfmy.de und die Test-Webseite docs.test werden per --host-resolver-rules auf lokale Server umgeleitet – nichts geht ins Netz.
// Aufruf (nach node tools/build-web.js):  node tools/pdfmy-extension/test/e2e.js   (LIVE=1 prüft gegen https://pdfmy.de)
//   puppeteer-core muss auflösbar sein (z. B. NODE_PATH=<ordner>/node_modules), Chrome-Pfad optional über CHROME=…
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), https = require('node:https');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const { PDFDocument, StandardFonts } = require('../../../vendor/pdf-lib.min.js');

const ROOT = path.resolve(__dirname, '../../..'), EXT = path.resolve(__dirname, '..'), DIST = path.join(ROOT, 'dist', 'pdfmy.de');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = process.env.LIVE === '1';   // LIVE=1: gegen das veröffentlichte https://pdfmy.de statt dist
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-ext-'));
const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' – ' + info : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function makePdf(text) {
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  for (const t of [text, text + ' – Seite 2']) d.addPage([595, 842]).drawText(t, { x: 60, y: 760, size: 20, font: f });
  return Buffer.from(await d.save());
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Zuerst node tools/build-web.js ausführen.');
  // Testkopie der Erweiterung: Webseiten-Zugriff vorab erteilt (die Rückfrage des Browsers lässt sich headless nicht bestätigen)
  const ext = path.join(tmp, 'ext');
  fs.cpSync(EXT, ext, { recursive: true, filter: s => !s.includes(`${path.sep}test`) });
  const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  man.host_permissions.push(...man.optional_host_permissions);
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man));

  // pdfmy.de (HTTPS, selbstsigniert) aus dist
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=pdfmy.de',
    '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem')], { stdio: 'ignore' });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.icc': 'application/octet-stream', '.gz': 'application/gzip' };
  const site = https.createServer({ key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) }, (q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'https://pdfmy.de').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }).listen(0, '127.0.0.1');

  // Fremde Webseite mit PDF-Links (wie televero.net)
  const brief = await makePdf('Testbrief docs.test'), rechnung = await makePdf('Rechnung 4711');
  const docs = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://docs.test');
    if (u.pathname === '/') {
      r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return r.end(`<!doctype html><title>Docs</title>
<a id="same" href="/unterlagen/Brief%20Mai.pdf">Brief (gleicher Tab)</a>
<a id="blank" href="/download?id=7" target="_blank">Rechnung (neuer Tab, ohne .pdf)</a>
<a id="att" href="/att.pdf">Download</a>
<a id="html" href="/seite">keine PDF</a>`);
    }
    if (decodeURIComponent(u.pathname) === '/unterlagen/Brief Mai.pdf') { r.writeHead(200, { 'content-type': 'application/pdf' }); return r.end(brief); }
    if (u.pathname === '/download') { r.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="Rechnung_4711.pdf"' }); return r.end(rechnung); }
    if (u.pathname === '/att.pdf') { r.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="att.pdf"' }); return r.end(brief); }
    r.writeHead(200, { 'content-type': 'text/html' }); r.end('<p>Normale Seite</p>');
  }).listen(0, '127.0.0.1');
  await Promise.all([site, docs].map(s => new Promise(ok => s.listening ? ok() : s.once('listening', ok))));

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, pipe: true, enableExtensions: [ext], userDataDir: path.join(tmp, 'profile'),
    args: [`--host-resolver-rules=${LIVE ? '' : `MAP pdfmy.de 127.0.0.1:${site.address().port}, `}MAP docs.test 127.0.0.1:${docs.address().port}`,
      '--ignore-certificate-errors', '--no-first-run', '--no-default-browser-check'],
  });
  try {
    const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
    const sw = await swTarget.worker();
    const welcome = await browser.waitForTarget(t => t.url().endsWith('/welcome.html'), { timeout: 5000 }).catch(() => null);
    check('Willkommensseite öffnet sich nach der Installation', !!welcome);

    const pdfmyPage = async (pred = () => true) => {
      const t = await browser.waitForTarget(t => t.type() === 'page' && t.url().startsWith('https://pdfmy.de/') && pred(t), { timeout: 15000 });
      const p = await t.page();
      await p.waitForFunction(() => typeof state !== 'undefined' && state.pages.length >= 2 && state.dirty === false || /nicht übernommen/.test(document.querySelector('#msg')?.textContent || ''), { timeout: 30000 });
      await wait(300);
      return p;
    };
    const info = p => p.evaluate(() => ({ url: location.href, pages: state.pages.length, name: state.docs[0]?.name, msg: document.querySelector('#msg').textContent }));

    // 1. Klick auf PDF-Link im selben Tab
    const page = await browser.newPage(), dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message() || d.type()); d.accept(); });
    await page.goto('http://docs.test/');
    await page.click('#same');
    let p = await pdfmyPage(), i = await info(p);
    check('Klick auf PDF-Link öffnet PDFMy im selben Tab', p === page || i.url === 'https://pdfmy.de/', i.url);
    check('PDF wurde übernommen (2 Seiten, Dateiname)', i.pages === 2 && i.name === 'Brief Mai.pdf', `${i.pages} Seiten, ${i.name}`);
    check('Übergabe-Token ist aus der Adresse entfernt', !i.url.includes('pdfmy-import'), i.url);

    // 2. Zurück: kein erneutes Abfangen (keine Schleife)
    await page.goBack({ waitUntil: 'load' }).catch(() => {});
    await wait(1500);
    check('„Zurück“ zeigt die Original-PDF, ohne erneut abzufangen', page.url().startsWith('http://docs.test/unterlagen/'), page.url());
    check('„Zurück“ ohne Rückfrage „Seite verlassen?“', dialogs.length === 0, dialogs.join());

    // 3. Link mit target=_blank, ohne .pdf-Endung (Content-Type + Content-Disposition inline)
    await page.goto('http://docs.test/');
    await page.click('#blank');
    p = await pdfmyPage(t => t !== page.target()); i = await info(p);
    check('PDF ohne .pdf-Endung im neuen Tab → PDFMy', i.pages === 2 && i.name === 'Rechnung_4711.pdf', `${i.pages} Seiten, ${i.name}`);
    await p.close();

    // 4. Download-Links (attachment) bleiben Downloads, die Seite bleibt stehen
    await page.goto('http://docs.test/');
    await page.click('#att'); await wait(1500);
    check('Download-Link (attachment) wird nicht umgeleitet', page.url() === 'http://docs.test/', page.url());

    // 5. Rechtsklick „In PDFMy öffnen“ (gleicher Handler wie das Kontextmenü)
    const n0 = (await browser.pages()).length;
    await sw.evaluate(() => self.pdfmy.openInPdfMy({ url: 'http://docs.test/download?id=7', name: 'Rechnung_4711.pdf', newTab: true }));
    p = await pdfmyPage(t => t !== page.target()); i = await info(p);
    check('Kontextmenü-Aktion öffnet neuen PDFMy-Tab', i.pages === 2 && (await browser.pages()).length > n0, i.name);
    await p.close();

    // 6. Link auf eine HTML-Seite → verständliche Meldung statt Absturz
    await sw.evaluate(() => self.pdfmy.openInPdfMy({ url: 'http://docs.test/seite', newTab: true }));
    p = await pdfmyPage(t => t !== page.target()); i = await info(p);
    check('Keine PDF → Hinweis in PDFMy', /nicht zu einer PDF/.test(i.msg) && i.pages === 0, i.msg);
    await p.close();

    // 7. Adobe-Viewer-Adressen und Dateinamen
    const u = await sw.evaluate(() => [
      self.pdfmy.sourceOf('chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/https://www.televero.net/files/Info.pdf'),
      self.pdfmy.nameFrom('https://x.de/a', "attachment; filename*=UTF-8''Gr%C3%BC%C3%9Fe.pdf"),
      self.pdfmy.nameFrom('https://x.de/dl/Bericht'),
    ]);
    check('Adobe-Viewer-Adresse wird erkannt', u[0] === 'https://www.televero.net/files/Info.pdf', u[0]);
    check('Dateinamen aus Content-Disposition/Adresse', u[1] === 'Grüße.pdf' && u[2] === 'Bericht.pdf', `${u[1]}, ${u[2]}`);

    // 8. Fremde Seiten können die Import-Schnittstelle nicht von außen auslösen (nur eigenes Fenster + eigene Herkunft)
    const p2 = await browser.newPage(); await p2.goto('https://pdfmy.de/');
    await p2.waitForFunction(() => document.documentElement.dataset.pdfmyImport === '1');
    const before = await p2.evaluate(() => state.pages.length);
    await p2.evaluate(() => { const f = document.createElement('iframe'); f.srcdoc = '<script>parent.postMessage({type:"pdfmy:open-file",name:"x.pdf",bytes:new ArrayBuffer(8)},"*")<\/script>'; document.body.append(f); });
    await wait(800);
    check('postMessage aus fremdem Frame wird ignoriert', (await p2.evaluate(() => state.pages.length)) === before);

    // 9. Automatisch öffnen aus → Browser verhält sich wie ohne Erweiterung
    // über das Popup (der Service Worker kann inzwischen schlafen)
    const popup = await browser.newPage(); await popup.goto(swTarget.url().replace('background.js', 'popup.html'));
    await popup.waitForFunction(() => document.querySelector('#auto').checked);
    await popup.click('#auto'); await popup.waitForFunction(() => !document.querySelector('#auto').checked);
    check('Popup zeigt Schalter „an“ und schaltet aus', (await popup.evaluate(() => chrome.storage.local.get('auto'))).auto === false);
    await popup.close();
    const p3 = await browser.newPage();
    await p3.goto('http://docs.test/'); await p3.click('#same'); await wait(2000);
    check('Schalter „aus“: PDF bleibt im Browser', p3.url().startsWith('http://docs.test/unterlagen/'), p3.url());
  } finally {
    await browser.close(); site.close(); docs.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const fail = results.filter(r => !r).length;
  console.log(`\n${results.length - fail}/${results.length} bestanden`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
