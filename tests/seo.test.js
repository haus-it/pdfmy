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
