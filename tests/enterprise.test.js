// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Unterlagen für Unternehmen und Behörden (tools/enterprise.js): SBOM, security.txt, ADMX-Vorlagen
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const ROOT = path.join(__dirname, '..');
const E = require('../tools/enterprise.js');

test('SBOM: CycloneDX 1.5, Bibliotheksstände wie in docs/ISO-Konformitaet.md, reproduzierbar', () => {
  const iso = fs.readFileSync(path.join(ROOT, 'docs', 'ISO-Konformitaet.md'), 'utf8'), sec5 = iso.slice(iso.indexOf('## 5.'), iso.indexOf('## 6.'));
  for (const c of E.COMPONENTS.filter(c => !c.font)) assert.ok(c.iso ? sec5.includes(c.iso) : sec5.includes(`| ${c.version} |`), `${c.name} ${c.version} steht in Abschnitt 5`);
  // jede Schrift bzw. Bibliothek hat eine Lizenzdatei in vendor/ (Stichprobe über den Namen)
  const lic = [...fs.readdirSync(path.join(ROOT, 'vendor', 'licenses')), ...fs.readdirSync(path.join(ROOT, 'vendor', 'fonts')).filter(f => f.startsWith('LICENSE'))].join(' ').toLowerCase();
  for (const c of E.COMPONENTS.filter(c => c.font)) assert.ok(lic.includes(c.name.split(' (')[0].split(' ')[0].toLowerCase().replace('liberation', 'liberation')), `Lizenzdatei für ${c.name}`);
  const a = E.sbom({ webVersion: 'v1', scanVersion: '1.0.0', domain: 'pdfmy.de', company: 'Mentor GmbH' }), b = E.sbom({ webVersion: 'v1', scanVersion: '1.0.0', domain: 'pdfmy.de', company: 'Mentor GmbH' });
  assert.equal(a.bomFormat, 'CycloneDX'); assert.equal(a.specVersion, '1.5');
  assert.match(a.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a.serialNumber, b.serialNumber, 'gleiche Inhalte – gleiche Seriennummer');
  assert.ok(a.components.every(c => c.name && c.licenses?.length));
  assert.ok(a.components.find(c => c.group === '@cantoo').pedigree.patches[0].type === 'unofficial', 'lokale Korrektur gekennzeichnet');
  assert.ok(a.components.some(c => c.name === 'pdfmy Scan (Windows)' && c.version === '1.0.0'));
  assert.equal(a.dependencies[0].dependsOn.length, E.COMPONENTS.length);
  assert.equal(new Set(a.components.map(c => c['bom-ref'])).size, a.components.length, 'bom-ref eindeutig');
});

test('security.txt nach RFC 9116: Kontakt, Ablauf in höchstens einem Jahr, Canonical, Policy', () => {
  const now = new Date('2026-11-15T12:00:00Z'), t = E.securityTxt({ domain: 'pdfmy.de', email: 'a@b.de', now });
  assert.match(t, /^Contact: mailto:a@b\.de$/m);
  const exp = new Date(t.match(/^Expires: (\S+)$/m)[1]);
  assert.ok(exp > now && exp - now < 365 * 24 * 3600 * 1000, 'Expires weniger als ein Jahr (RFC 9116, 2.5.5)');
  assert.match(t, /^Canonical: https:\/\/pdfmy\.de\/\.well-known\/security\.txt$/m);
  assert.match(t, /^Policy: https:\/\/pdfmy\.de\/sicherheit\.html#schwachstellen$/m);
});

test('ADMX/ADML: jede Richtlinie mit Texten in Deutsch und Englisch, Schlüssel wie in pdfmy Scan', () => {
  const x = E.admx('1.0'), cs = fs.readdirSync(path.join(ROOT, 'tools', 'pdfmy-scan')).filter(f => f.endsWith('.cs')).map(f => fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-scan', f), 'utf8')).join('');
  assert.match(x, /key="Software\\Policies\\Mentor GmbH\\PDFMy"/);
  for (const lang of ['de-DE', 'en-US']) {
    const l = E.adml(lang, '1.0');
    for (const p of E.POLICIES) {
      assert.match(x, new RegExp(`<policy name="${p.id}" class="Both"[^>]*valueName="${p.id}"`));
      assert.ok(l.includes(`<string id="${p.id}">`) && l.includes(`<string id="${p.id}_Help">`), `${lang}: ${p.id}`);
      assert.ok(cs.includes(`"${p.id}"`), `pdfmy Scan liest ${p.id}`);
    }
    for (const id of x.match(/\$\(string\.([A-Za-z_]+)\)/g).map(m => m.slice(9, -1))) assert.ok(l.includes(`<string id="${id}">`), `${lang}: Text ${id}`);
  }
  // Tags ausgeglichen (einfache Wohlgeformtheit)
  for (const doc of [x, E.adml('de-DE', '1.0')]) {
    const stack = [];
    for (const m of doc.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([A-Za-z]+)[^>]*?(\/?)>/g)) {
      if (m[3]) continue; if (!m[1]) stack.push(m[2]); else assert.equal(stack.pop(), m[2]);
    }
    assert.equal(stack.length, 0);
  }
});

test('Erzeugte Dateien: security.txt, SBOM, ADMX-Paket', () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-ent-')), files = {};
  const write = (rel, data) => { files[rel] = data; };
  const r = E({ write, zip: require('../js/tools.js').zip, domain: 'pdfmy.de', company: 'Mentor GmbH', email: 'a@b.de', webVersion: 'v1', scanVersion: '1.0.0' });
  assert.ok(files['.well-known/security.txt']);
  assert.match(r.htaccess, /AddCharset utf-8 \.txt/);
  assert.equal(JSON.parse(files[r.sbom]).bomFormat, 'CycloneDX');
  const Office = require('../js/office.js'), z = Office.readZip(new Uint8Array(files[r.admx]));
  for (const f of ['PolicyDefinitions/PDFMy.admx', 'PolicyDefinitions/de-DE/PDFMy.adml', 'PolicyDefinitions/en-US/PDFMy.adml']) assert.ok(z.files.has(f), f);
  fs.rmSync(OUT, { recursive: true, force: true });
});
