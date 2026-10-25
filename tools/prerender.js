// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Webseiten je Sprache vorab übersetzen (für Suchmaschinen): dist/<domain>/<sprache>/<seite>.html
   Gleiches Verfahren wie im Browser – die Seite wird in headless Chrome mit js/i18n.js übersetzt (andere Seitenskripte gesperrt,
   damit nichts doppelt im HTML landet). Danach: Adressen relativ zum Sprachordner, kanonische Adresse, hreflang-Verweise auf alle
   Fassungen, FAQ-Daten (JSON-LD) in der Zielsprache, Sitemap mit allen Fassungen. Zwischenspeicher in .deploy/prerender: nur Seiten,
   deren deutsches HTML, Wörterbuch oder i18n.js sich geändert hat, werden neu übersetzt.
   Aufruf: node tools/prerender.js (build-web.js ruft es mit PDFMY_PRERENDER=1 vor der Prüfsummenliste auf). Ohne Chrome: Hinweis, kein Abbruch. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), site = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'site.json'), 'utf8'));
const OUT = path.join(ROOT, 'dist', site.domain), CACHE = path.join(ROOT, '.deploy', 'prerender'), BASE = 'https://' + site.domain + '/';
const REV = '2';   // bei Änderungen an diesem Skript erhöhen → alles neu übersetzen
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const LANGS = fs.readdirSync(path.join(ROOT, 'i18n', 'site')).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f)).map(f => f.slice(0, -5)).filter(c => c !== 'de').sort();
const PAGES = fs.readdirSync(OUT).filter(f => f.endsWith('.html') && fs.readFileSync(path.join(OUT, f), 'utf8').includes('data-dict="site"')).sort();
const CHROME = [process.env.PDFMY_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// hreflang-Block für eine Seite: alle Sprachfassungen + Deutsch als x-default
const alternates = page => [`<link rel="alternate" hreflang="de" href="${BASE}${page}">`, ...LANGS.map(c => `<link rel="alternate" hreflang="${c}" href="${BASE}${c}/${page}">`), `<link rel="alternate" hreflang="x-default" href="${BASE}${page}">`].join('');
const setHtmlAttrs = (html, attrs) => html.replace(/<html\b([^>]*)>/i, (m, a) => { for (const [k, v] of Object.entries(attrs)) { a = a.replace(new RegExp(`\\s${k}="[^"]*"`, 'i'), ''); a += ` ${k}="${v}"`; } return `<html${a.replace(/\sclass=""/, '')}>`; });

// Übersetztes HTML für den Sprachordner aufbereiten
function finish(html, page, code) {
  const own = BASE + code + '/' + page, local = new Set(PAGES);
  const rel = v => {
    if (/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(v)) return v;                                       // absolut, Wurzel oder Anker
    const m = /^(\.\/)?(\?[^#]*)?(#.*)?$/.exec(v);
    if (m) return '../?lang=' + code + (m[2] ? '&' + m[2].slice(1) : '') + (m[3] || '');                // z. B. ./?melden bleibt erhalten                                                  // ./ = die App, in derselben Sprache
    const file = v.split(/[?#]/)[0].replace(/^\.\//, '');
    return local.has(file) ? v.replace(/^\.\//, '') : '../' + v.replace(/^\.\//, '');                  // Webseite mit Sprachfassung: im Ordner bleiben
  };
  html = html.replace(/\s(href|src|action)="([^"]*)"/g, (m, a, v) => ` ${a}="${rel(v)}"`)
    .replace(/url\((['"]?)(?![a-z][a-z0-9+.-]*:|\/|#|['"]?data:)/gi, 'url($1../')
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${own}">`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${own}$2`)
    .replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '')
    .replace('</head>', alternates(page) + '</head>');
  html = setHtmlAttrs(html, { 'data-static-lang': code, 'data-static-page': page });
  return '<!DOCTYPE html>\n' + html.replace(/^<!DOCTYPE html>\s*/i, '') + '\n';
}

// ---- Mini-Server für dist ----
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(OUT, p); if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

// ---- Chrome über das DevTools-Protokoll (eingebautes WebSocket von Node) ----
async function chrome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-prerender-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await new Promise(r => setTimeout(r, 100)); try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} }
  if (!port) throw new Error('Chrome startet nicht');
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), handlers = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { const [r, j] = wait.get(m.id); wait.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
    else if (m.method && m.sessionId && handlers.has(m.sessionId)) handlers.get(m.sessionId)(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id; wait.set(i, [r, j]); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const close = () => { try { ws.close(); } catch {} try { proc.kill(); } catch {} setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 500); };
  return { send, handlers, close };
}

async function render(cr, port, page, code) {
  const { targetId } = await cr.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cr.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cr.send(m, p, sessionId);
  try {
    // nur js/i18n.js ausführen – andere Skripte bauen beim Laden Inhalte auf und stünden sonst doppelt im HTML
    cr.handlers.set(sessionId, m => {
      if (m.method !== 'Fetch.requestPaused') return;
      const ok = /\/js\/i18n\.js(\?|$)|\.json(\?|$)/.test(m.params.request.url);   // i18n.js und seine Wörterbücher
      s(ok ? 'Fetch.continueRequest' : 'Fetch.failRequest', ok ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    await s('Fetch.enable', { patterns: [{ urlPattern: '*.js*', requestStage: 'Request' }] });
    await s('Page.enable'); await s('Runtime.enable');
    await s('Page.navigate', { url: `http://127.0.0.1:${port}/${page}?lang=${encodeURIComponent(code)}` });
    const ev = async expr => (await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
    for (let i = 0; i < 100; i++) { if (await ev(`document.readyState === 'complete' && !!window.I18N`)) break; await new Promise(r => setTimeout(r, 100)); }
    await ev(`I18N.ready().then(() => new Promise(r => setTimeout(r, 150)))`);
    // FAQ-Daten (JSON-LD) aus den übersetzten Fragen neu erzeugen
    await ev(`(() => { const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].find(x => /FAQPage/.test(x.textContent)); if (!ld) return;
      const qa = [...document.querySelectorAll('details.faqd')].map(d => ({ '@type': 'Question', name: d.querySelector('summary').textContent.trim(), acceptedAnswer: { '@type': 'Answer', text: d.querySelector('p').textContent.trim() } }));
      if (qa.length) ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa }).replace(/</g, '\\\\u003c'); })()`);
    const html = await ev(`document.documentElement.classList.remove('i18n-wait'); document.documentElement.outerHTML`);
    if (!html || !/<html/i.test(html)) throw new Error('leeres Ergebnis');
    return html;
  } finally { cr.handlers.delete(sessionId); await cr.send('Target.closeTarget', { targetId }).catch(() => {}); }
}

(async () => {
  if (!CHROME) { console.warn('Vorab-Übersetzung übersprungen: kein Chrome/Edge gefunden (PDFMY_CHROME setzen).'); return; }
  fs.mkdirSync(CACHE, { recursive: true });
  const manFile = path.join(CACHE, 'manifest.json'); let man = {}; try { man = JSON.parse(fs.readFileSync(manFile, 'utf8')); } catch {}
  const i18nJs = fs.readFileSync(path.join(OUT, 'js', 'i18n.js'), 'utf8');
  // deutsches HTML ohne die Ergänzungen eines früheren Laufs (hreflang, Kennung) – sonst wäre der Zwischenspeicher nie gültig
  const clean = h => h.replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '').replace(/\sdata-static-page="[^"]*"/, '');
  const src = Object.fromEntries(PAGES.map(p => [p, clean(fs.readFileSync(path.join(OUT, p), 'utf8'))]));
  // Nur die Wörterbuch-Einträge zählen, die auf der Seite vorkommen – eine geänderte Übersetzung übersetzt nur die betroffenen Seiten neu
  const flat = h => h.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
  // drei Fassungen je Seite: Quelltext, mit aufgelösten Zeichen, reiner Text ohne Tags (Browser schreiben innerHTML anders als die Datei)
  const bare = h => flat(h.replace(/<[^>]+>/g, ' ')).replace(/ +/g, ' ');
  const text = Object.fromEntries(PAGES.map(p => [p, { raw: src[p].replace(/\s+/g, ' '), flat: flat(src[p]), bare: bare(src[p]) }]));
  const has = (t, x) => t.raw.includes(x) || t.flat.includes(x) || t.bare.includes(bare(x).trim());
  const onPage = (t, k) => k.includes('{') ? k.split(/\{\d+\}/).filter(x => x.trim().length > 3).every(x => has(t, x)) : has(t, k);
  const jobs = [];
  for (const code of LANGS) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'site', code + '.json'), 'utf8')), keys = Object.keys(dict).sort();
    for (const page of PAGES) {
      const used = keys.filter(k => onPage(text[page], k)).map(k => [k, dict[k]]);
      const key = code + '/' + page, h = sha(REV + '\0' + src[page] + '\0' + JSON.stringify(used) + '\0' + i18nJs + '\0' + LANGS.join(','));
      const cf = path.join(CACHE, code, page);
      if (man[key] === h && fs.existsSync(cf)) { fs.mkdirSync(path.join(OUT, code), { recursive: true }); fs.copyFileSync(cf, path.join(OUT, code, page)); continue; }
      jobs.push({ code, page, key, h, cf });
    }
  }
  const t0 = Date.now(); let done = 0, failed = 0;
  if (jobs.length) {
    const srv = await serve(), port = srv.address().port, cr = await chrome();
    try {
      const worker = async () => {
        for (let j; (j = jobs.shift());) {
          try {
            const out = finish(await render(cr, port, j.page, j.code), j.page, j.code);
            fs.mkdirSync(path.dirname(j.cf), { recursive: true }); fs.writeFileSync(j.cf, out);
            fs.mkdirSync(path.join(OUT, j.code), { recursive: true }); fs.writeFileSync(path.join(OUT, j.code, j.page), out);
            man[j.key] = j.h; done++;
            if (done % 100 === 0) { fs.writeFileSync(manFile, JSON.stringify(man)); console.log(`  … ${done} Seiten übersetzt`); }
          } catch (e) { failed++; console.warn(`  ${j.key}: ${e.message}`); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
    } finally { cr.close(); srv.close(); fs.writeFileSync(manFile, JSON.stringify(man)); }
  }
  // pdfmy.de/<sprache>/ → App in dieser Sprache (statt Fehlerseite)
  for (const code of LANGS) {
    fs.mkdirSync(path.join(OUT, code), { recursive: true });
    fs.writeFileSync(path.join(OUT, code, 'index.html'), `<!DOCTYPE html>\n<html lang="${code}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=../?lang=${code}"><link rel="canonical" href="${BASE}"><title>PDFMy</title></head><body><a href="../?lang=${code}">PDFMy</a></body></html>\n`);
  }
  // Deutsche Seiten: hreflang-Verweise und Kennung für die Sprachwahl
  for (const page of PAGES) {
    let h = src[page].replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '').replace('</head>', alternates(page) + '</head>');
    fs.writeFileSync(path.join(OUT, page), setHtmlAttrs(h, { 'data-static-page': page }));
  }
  // Sitemap: jede Webseite in allen Sprachfassungen
  const sm = path.join(OUT, 'sitemap.xml');
  if (fs.existsSync(sm)) {
    let x = fs.readFileSync(sm, 'utf8').replace(/\s*<url><loc>https:\/\/[^<]+\/(?:[a-z]{2}(?:-[A-Z]{2})?)\/[^<]+<\/loc><\/url>/g, '');
    const extra = PAGES.flatMap(p => LANGS.map(c => `  <url><loc>${BASE}${c}/${p}</loc></url>`)).join('\n');
    x = x.replace('</urlset>', extra + '\n</urlset>'); fs.writeFileSync(sm, x);
  }
  const total = PAGES.length * LANGS.length;
  console.log(`Vorab-Übersetzung: ${PAGES.length} Seiten × ${LANGS.length} Sprachen = ${total} (${done} neu, ${total - done - failed} aus dem Zwischenspeicher${failed ? ', ' + failed + ' FEHLER' : ''}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error('Vorab-Übersetzung:', e.message); process.exitCode = 1; });
