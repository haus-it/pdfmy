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
