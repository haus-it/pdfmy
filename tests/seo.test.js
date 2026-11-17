// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Suchmaschinen und KI-Suche (SEO/GEO-Prüfung 17.11.2026): jede Seite der Sitemap hat kanonische Adresse und Beschreibung,
// Beschreibungen sind übersetzt und kurz genug für das Suchergebnis, llms.txt nennt nur vorhandene Seiten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'tools', 'build-web.js'), 'utf8');
const SEO = eval('(' + src.match(/const SEO_PAGES = (\{[\s\S]*?\n\});/)[1] + ')');

test('Infoseiten der Sitemap: kanonische Adresse und Beschreibung (≤ 160 Zeichen)', () => {
  const sm = src.match(/write\('sitemap\.xml', `([\s\S]*?)`\);/)[1];
  const pages = [...sm.matchAll(/\$\{site\.domain\}\/([a-z-]+\.html)/g)].map(m => m[1]);
  assert.ok(pages.includes('sicherheit.html'), 'Sicherheit und Compliance steht in der Sitemap');
  for (const p of pages) {
    if (p === 'werkzeuge.html') { assert.match(src, /rel="canonical" href="https:\/\/\$\{site\.domain\}\/werkzeuge\.html"/); continue; }
    assert.ok(p in SEO, p + ': in SEO_PAGES');
    assert.ok(SEO[p].length >= 70 && SEO[p].length <= 160, p + ': Beschreibung ' + SEO[p].length + ' Zeichen');
  }
});

test('Beschreibungen der mehrsprachigen Seiten sind in allen Sprachen übersetzt', () => {
  const dir = path.join(ROOT, 'i18n', 'site');
  const multi = Object.entries(SEO).filter(([p, d]) => d && p !== 'sicherheit.html').map(([, d]) => d);
  const keys = JSON.parse(fs.readFileSync(path.join(dir, '_keys.json'), 'utf8'));
  for (const d of multi) assert.ok(keys.includes(d), 'Schlüssel vorhanden: ' + d.slice(0, 40));
  for (const f of fs.readdirSync(dir).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) {
    const dict = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const d of multi) { assert.ok(dict[d], f + ': ' + d.slice(0, 40)); assert.ok(dict[d].length <= 160, f + ': zu lang'); }
  }
});

test('llms.txt: nur Seiten, die der Build erzeugt', () => {
  const llms = src.match(/write\('llms\.txt', `([\s\S]*?)`\);/)[1];
  for (const m of llms.matchAll(/\$\{site\.domain\}\/((?:en-GB\/)?[a-z-]+\.html)/g)) {
    const file = m[1].replace(/^en-GB\//, '');
    assert.ok(new RegExp(`write\\('${file.replace('.', '\\.')}'`).test(src) || file === 'werkzeuge.html', 'Seite wird gebaut: ' + file);
  }
  assert.match(llms, /^# PDFMy\n\n> /, 'Aufbau nach llmstxt.org: Titel und Kurzbeschreibung');
});

test('Startseite: Tab-Titel ≤ 60 Zeichen mit Stichwort vorne, in allen Sprachen (Entscheidung GF 17.11.2026)', () => {
  const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', '_web.json'), 'utf8'));
  const len = s => [...s].length;
  assert.ok(len(W.title) <= 60, 'Titel ' + len(W.title) + ' Zeichen');
  assert.match(W.title, /^PDF /, 'Stichwort „PDF“ steht vorne');
  assert.match(W.title, /\| PDFMy$/, 'Marke am Ende');
  assert.match(W.ogTitle, /powered by Mentor Group/, 'Marke bleibt beim Teilen (og:title) sichtbar');
  for (const f of fs.readdirSync(path.join(ROOT, 'i18n')).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', f), 'utf8'))[W.title];
    assert.ok(t, f + ': übersetzt');
    assert.ok(len(t) <= 60 && t.endsWith('| PDFMy'), f + ': ' + len(t) + ' Zeichen');
  }
});

test('Suchergebnis-Ausschnitt: Titel und Beschreibung werden nach der Übersetzung passend gekürzt', () => {
  const { fitTitle, fitDesc, fitHtml } = require('../tools/seo/snippet.js');
  const len = s => [...s].length;
  // Titel: nur die Marke entfällt, Stichwörter bleiben (sie zählen für die Rangfolge auch ungezeigt)
  assert.equal(fitTitle('Bilder aus PDF extrahieren – in Originalgröße, ohne Upload – PDFMy'), 'Bilder aus PDF extrahieren – in Originalgröße, ohne Upload');
  assert.equal(fitTitle('PDF zusammenfügen – kostenlos und ohne Upload – PDFMy'), 'PDF zusammenfügen – kostenlos und ohne Upload – PDFMy');
  // Beschreibung: ganzer Satz, sonst Gedankenstrich; nie mitten im Wort, nie nach „z. B.“
  const d1 = 'Mehrere PDF-Dateien kostenlos zu einer zusammenfügen – direkt im Browser, ohne Upload und ohne Anmeldung. Reihenfolge per Ziehen ändern, auch Scans und große Dateien.';
  assert.equal(fitDesc(d1 + ' Mehr Text.'), d1.slice(0, d1.indexOf('Anmeldung.') + 10));
  const d2 = 'PDF vor dem Versand prüfen: Gericht (beA, ERVB 2025), elektronische Patientenakte (ePA), barrierefrei (BITV 2.0, PDF/UA) und Archiv (GoBD, PDF/A) – mit Bericht und automatischer Korrektur. Direkt im Browser, ohne Upload.';
  const f2 = fitDesc(d2);
  assert.ok(len(f2) <= 160 && len(f2) >= 70 && f2.endsWith('PDF/A).'), f2);
  assert.ok(!/z\. B\.$/.test(fitDesc('Formulare ausfüllen, z. B. Anträge der Behörden, Steuerformulare und Verträge mit Rechenfeldern und Unterschrift, alles direkt im Browser ohne Upload und ohne Anmeldung, auch offline.')));
  const kurz = 'Kurz und gut genug für das Suchergebnis, mit mehr als siebzig Zeichen Länge insgesamt.';
  assert.equal(fitDesc(kurz), kurz);
  // HTML: nur geänderte Stellen, Sonderzeichen bleiben kodiert
  const h = '<title>Recadrer un PDF&nbsp;: supprimer les marges blanches – gratuit, sans envoi en ligne – PDFMy</title><meta name="description" content="' + d2 + '">';
  const o = fitHtml(h);
  assert.match(o, /<title>Recadrer un PDF&nbsp;: supprimer les marges blanches – gratuit, sans envoi en ligne<\/title>/);
  assert.ok(o.includes('content="' + f2 + '"'));
  assert.equal(fitHtml('<title>Kurz – PDFMy</title>'), '<title>Kurz – PDFMy</title>');
  // eingebunden: nach der Vorab-Übersetzung (deutsche Seiten) und in prerender.js (Sprachfassungen, auch aus dem Zwischenspeicher)
  assert.match(src, /require\('\.\/seo\/snippet\.js'\)[\s\S]*fitHtml\(h\)/);
  const pre = fs.readFileSync(path.join(ROOT, 'tools', 'prerender.js'), 'utf8');
  assert.match(pre, /setHtmlAttrs\(fitHtml\(html\)/);
  assert.match(pre, /fitHtml\(fs\.readFileSync\(cf/);
  assert.ok(src.indexOf("tools', 'prerender.js'") < src.indexOf("require('./seo/snippet.js')"), 'Kürzen erst nach der Übersetzung');
});

test('Sitemap: Änderungsdatum nur bei geändertem Inhalt', () => {
  assert.match(src, /<lastmod>\$\{seen\[loc\]\.d\}<\/lastmod>/);
  assert.match(src, /seen\[loc\]\.h !== h\) seen\[loc\] = \{ h, d: today \}/);
});

test('Startseite: Beschreibung ≤ 160 Zeichen in allen Sprachen', () => {
  const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', '_web.json'), 'utf8'));
  const len = s => [...s].length;
  assert.ok(len(W.description) <= 160, 'Deutsch ' + len(W.description));
  for (const f of fs.readdirSync(path.join(ROOT, 'i18n')).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', f), 'utf8'))[W.description];
    assert.ok(t && len(t) <= 160, f + ': ' + (t ? len(t) : 'fehlt'));
  }
});

test('Crawler sehen die Startseite deutsch (kanonische Fassung), nicht in ihrer Browsersprache', () => {
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
  const run = ua => {
    const attrs = {}, cls = new Set();
    const html = { lang: '', getAttribute: k => attrs[k] || null, classList: { add: c => cls.add(c), remove: c => cls.delete(c) } };
    const ctx = { navigator: { userAgent: ua, languages: ['en-US', 'en'], language: 'en-US' }, location: { search: '', href: 'https://pdfmy.de/' },
      localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: html, currentScript: null, readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], title: '' },
      fetch: () => new Promise(() => {}), setTimeout: () => 0, console };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    vm.runInNewContext(code, ctx);
    return { lang: html.lang, hidden: cls.has('i18n-wait') };
  };
  const bot = run('Mozilla/5.0 (Linux; Android 6.0.1) Chrome/130 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
  assert.equal(bot.lang, 'de'); assert.equal(bot.hidden, false, 'nichts ausgeblendet');
  const person = run('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36');
  assert.notEqual(person.lang, 'de', 'Besucher mit englischem Browser bekommen weiter ihre Sprache');
});

test('Ladezeit: sichtbare Schriften zuerst, Programm-Skripte der Startseite mit niedriger Priorität', () => {
  assert.match(src, /const FONT_PRELOAD = \['bricolage-grotesque-latin-standard-normal', 'instrument-sans-latin-wght-normal'\]/);
  assert.match(src, /rel="preload" as="font" type="font\/woff2" href="vendor\/fonts\/\$\{f\}\.woff2" crossorigin/);
  assert.ok(src.includes(String.raw`at + '\n' + FONT_PRELOAD + '\n' + srcs.map(x => ` + '`<link rel="preload" as="script" href="${x}" fetchpriority="low">`)'), 'Schriften vor den Skripten, Skripte niedrig');
  assert.match(src, /<title>\$\{title\} – PDFMy<\/title>\$\{FONT_PRELOAD\}/, 'Infoseiten laden die Schriften früh');
  for (const f of ['bricolage-grotesque-latin-standard-normal', 'instrument-sans-latin-wght-normal']) assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'fonts', f + '.woff2')), f);
  assert.match(src, /preloadScripts\(mh\)\.split\('href="vendor\/fonts\/'\)\.join\('href="fonts\/'\)/, 'interne Fassung: eigener Schriftordner');
});

test('laden.js: Programmteile nach dem ersten Bild, gleiche Reihenfolge, „load“ wird nachgereicht', async () => {
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(ROOT, 'js', 'laden.js'), 'utf8');
  const run = (readyState) => new Promise(resolve => {
    const inserted = [], log = [], frames = [];
    const realAdd = function (t, f) { log.push('orig:' + t); };
    const win = { addEventListener: realAdd, Event: class { constructor(t) { this.type = t; } } };
    const doc = {
      readyState, visibilityState: 'visible',
      currentScript: { getAttribute: () => 'js/a.js js/b.js js/c.js' },
      createElement: () => ({}),
      body: { appendChild: s => inserted.push(s) },
    };
    Object.assign(win, { window: win, document: doc, requestAnimationFrame: f => frames.push(f), setTimeout: (f, ms) => { if (!ms) f(); else win._fallback = f; return 0; } });
    vm.runInNewContext(code, win);
    assert.equal(inserted.length, 0, 'vor dem ersten Bild nichts ausführen');
    frames.shift()(); frames.shift()();   // zwei Animationsrahmen
    assert.deepEqual(inserted.map(s => s.src), ['js/a.js', 'js/b.js', 'js/c.js']);
    assert.ok(inserted.every(s => s.async === false), 'Reihenfolge bleibt (async = false)');
    // Programmteil b meldet sich für „load“ an, dann laden alle
    win.addEventListener('load', () => log.push('load-b'));
    win.addEventListener('resize', () => {});
    inserted.forEach(s => s.onload());
    win._fallback && win._fallback();     // Rückfallebene darf nicht doppelt starten
    resolve({ log, inserted, restored: win.addEventListener === realAdd });
  });
  const late = await run('complete');
  assert.deepEqual(late.log, ['orig:resize', 'load-b'], '„load“ nach dem letzten Skript nachgereicht, andere Ereignisse normal');
  assert.ok(late.restored, 'addEventListener wieder im Original');
  assert.equal(late.inserted.length, 3, 'nicht doppelt gestartet');
  const early = await run('interactive');
  assert.deepEqual(early.log, ['orig:load', 'orig:resize'], 'vor „load“: Browser löst „load“ selbst aus');
  // Build: Skript-Tags am Seitenende → eine Liste für laden.js, die interne Fassung bleibt unverändert
  assert.match(src, /html = deferScripts\(html\);\nwrite\('index\.html', html\);/);
  assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'js\/laden\.js'/, 'offline verfügbar');
});

test('Hilfe: häufige Fragen als FAQPage, je Sprache aus den übersetzten Fragen; Startseite mit Entität (GEO)', () => {
  const hilfe = fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.html'), 'utf8');
  const n = (hilfe.match(/<details class="faq"><summary>/g) || []).length;
  assert.ok(n >= 5, 'Fragen in der Hilfe: ' + n);
  assert.match(src, /write\('hilfe\.html', page\('Hilfe', hilfeSrc, ld\(\{ '@context': 'https:\/\/schema\.org', '@type': 'FAQPage'/);
  const pre = fs.readFileSync(path.join(ROOT, 'tools', 'prerender.js'), 'utf8');
  assert.ok(pre.includes("details.faqd, details.faq"), 'prerender übersetzt auch die Hilfe-Fragen');
  assert.match(src, /sameAs: \['https:\/\/github\.com\/haus-it\/pdfmy'\]/);
});

test('Taskleiste: Schnellstarts (Rechtsklick) führen zu vorhandenen Werkzeugen – beim Start und bei laufender App', () => {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(man.shortcuts.length >= 5 && man.shortcuts.length <= 10, 'Chrome zeigt höchstens 10');
  for (const s of man.shortcuts) {
    const m = s.url.match(/^\.\/\?start=([a-z0-9]+)$/); assert.ok(m, s.url);
    const ok = { cam: 'id="btnCam"', einv: 'id="tileEinv"', open: 'id="fileIn"' }[m[1]] || `data-intent="${m[1]}"`;
    assert.ok(html.includes(ok), `Ziel für ${s.name}: ${ok}`);
    assert.ok(s.name && s.short_name.length <= 15, s.name);
  }
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'), pro = fs.readFileSync(path.join(ROOT, 'js', 'pro.js'), 'utf8');
  assert.match(app, /params\.targetURL[\s\S]{0,120}window\.pdfmyStart\?\.\(\)/, 'laufende App: launchQueue');
  assert.match(pro, /window\.pdfmyStart\(\);/, 'Start mit ?start=');
  assert.match(fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.html'), 'utf8'), /Schnellstart per Rechtsklick/);
});

test('Explorer-Rechtsklick (pdfmy Scan 1.19.0): Zusammenfügen und Verkleinern – gesammelt in einem Fenster', () => {
  const cs = fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-scan', 'Program.cs'), 'utf8');
  assert.match(cs, /\["Merge"\] = Tuple\.Create\("merge"/);
  assert.match(cs, /\["Compress"\] = Tuple\.Create\("compress", new\[\] \{ "\.pdf" \}\)/);
  assert.match(cs, /--open --task=\{v\.Value\.Item1\} \\"%1\\"/, 'Befehl je Verb');
  assert.match(cs, /PDFMy\.\{v\.Key\}", false\)/, 'Deinstallation entfernt die Einträge');
  assert.match(cs, /"#open=" \+ string\.Join\(",", files\.Select\(NewToken\)\) \+ "&task=" \+ task/, 'alle Dateien in einer Adresse');
  assert.match(cs, /HandOverWhenReady/, 'Start je Datei: auf die erste Instanz warten');
  const pro = fs.readFileSync(path.join(ROOT, 'js', 'pro.js'), 'utf8');
  const re = new RegExp(pro.match(/location\.hash\.match\(\/(\^#open=[^\n]*?\$)\/\)/)[1]);
  assert.ok(re.test('#open=' + 'a'.repeat(32)), 'einzelne Datei wie bisher');
  const m = ('#open=' + ['a', 'b', 'c'].map(x => x.repeat(32)).join(',') + '&task=merge').match(re);
  assert.ok(m && m[1].split(',').length === 3 && m[2] === 'merge');
  assert.ok(!re.test('#open=' + 'a'.repeat(32) + '&task=Merge;x'), 'nur Kleinbuchstaben');
  assert.match(pro, /HASH_TASKS = new Set\(\['merge', 'compress'\]\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'), /#open=\[a-f0-9,\]\+\(&task=\[a-z\]\+\)\?\$\/\.test\(t\)\) location\.hash = new URL\(t\)\.hash/, 'laufende App');
});
