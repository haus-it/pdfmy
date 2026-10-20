// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Prüft und erzeugt die Wörterbücher i18n/<code>.json.
//   node tools/i18n-check.js split            → i18n/parts/_keys.<n>.json (Schlüssel in Teilen zum Übersetzen)
//   node tools/i18n-check.js merge <code>     → i18n/parts/<code>.<n>.json zusammenführen → i18n/<code>.json
//   node tools/i18n-check.js [<code> …]       → prüfen (alle Wörterbücher, wenn keine Sprache angegeben)
//   --site: dasselbe für die Webseiten (Hilfe, Scanner) in i18n/site/ (Teile i18n/site/parts/<code>.<n>.json, 2 Teile)
// Geprüft wird: gültiges JSON, jede Übersetzung nicht leer, gleiche Platzhalter {n}, gleiche HTML-Tags (inkl. id/class/href),
// Abdeckung der Schlüssel aus i18n/_keys.json.
'use strict';
const fs = require('fs'), path = require('path');
const SITE = process.argv.includes('--site');
const DIR = path.join(__dirname, '..', 'i18n', SITE ? 'site' : ''), PARTS = path.join(DIR, 'parts'), N = SITE ? 2 : 4;
const keys = JSON.parse(fs.readFileSync(path.join(DIR, '_keys.json'), 'utf8'));
const ph = s => (s.match(/\{\d+\}/g) || []).sort().join(',');
// Tags mit ihren nicht übersetzbaren Attributen (Text in title/aria-label/alt/placeholder darf sich ändern)
const tags = s => (s.match(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi) || []).map(t => t.replace(/\s(title|aria-label|alt|placeholder|aria-description)="[^"]*"/gi, '').replace(/\s+/g, ' ').toLowerCase()).sort().join('|');

function check(code, d, quiet) {
  const errs = [];
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== 'string' || !v.trim()) { errs.push(`leer: ${k.slice(0, 80)}`); continue; }
    if (ph(k) !== ph(v)) errs.push(`Platzhalter: ${k.slice(0, 80)} → ${v.slice(0, 80)}`);
    if (tags(k) !== tags(v)) errs.push(`HTML: ${k.slice(0, 80)} → ${v.slice(0, 80)}`);
  }
  const missing = keys.filter(k => !(k in d)), extra = Object.keys(d).filter(k => !keys.includes(k));
  if (!quiet) console.log(`${code}: ${Object.keys(d).length} Einträge, ${missing.length} fehlen, ${extra.length} unbekannt, ${errs.length} Fehler`);
  return { errs, missing, extra };
}

const [cmd, ...rest] = process.argv.slice(2).filter(a => a !== '--site');
if (cmd === 'split') {
  fs.mkdirSync(PARTS, { recursive: true });
  const total = keys.reduce((n, k) => n + k.length, 0), parts = Array.from({ length: N }, () => []);
  let acc = 0; for (const k of keys) { parts[Math.min(N - 1, Math.floor(acc / (total / N)))].push(k); acc += k.length; }
  parts.forEach((p, i) => fs.writeFileSync(path.join(PARTS, `_keys.${i + 1}.json`), JSON.stringify(p, null, 1)));
  console.log('Teile:', parts.map(p => p.length).join(' + '));
} else if (cmd === 'merge') {
  let bad = 0;
  for (const code of rest) {
    const d = {};
    const re = new RegExp('^' + code.replace(/-/g, '\\-') + '\\.(\\d+)\\.json$');
    const nums = fs.readdirSync(PARTS).map(f => (f.match(re) || [])[1]).filter(Boolean).map(Number).sort((x, y) => x - y);   // Teile 1–4 und Nachträge 5, 6 …
    if (!nums.length) { console.log(`${code}: keine Teildateien – Wörterbuch bleibt unverändert`); bad++; continue; }
    for (let i = 1; i <= N; i++) if (!nums.includes(i)) console.log(`${code}: Teil ${i} fehlt`);
    for (const i of nums) {
      const f = path.join(PARTS, `${code}.${i}.json`);
      try { Object.assign(d, JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { console.log(`${code}: Teil ${i} ungültig – ${e.message}`); bad++; }
    }
    const out = {}; for (const k of keys) if (k in d) out[k] = d[k];   // nur bekannte Schlüssel, in fester Reihenfolge
    const r = check(code, out);
    const ok = {}; for (const [k, v] of Object.entries(out)) if (!r.errs.some(e => e.includes(k.slice(0, 80)))) ok[k] = v;
    fs.writeFileSync(path.join(DIR, `${code}.json`), JSON.stringify(ok, null, 0).replace(/","/g, '",\n"') + '\n');
    r.errs.slice(0, 10).forEach(e => console.log('  ' + e)); if (r.errs.length) bad++;
  }
  process.exitCode = bad ? 1 : 0;
} else {
  const codes = cmd ? [cmd, ...rest] : fs.readdirSync(DIR).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f)).map(f => f.replace('.json', ''));
  let bad = 0;
  for (const code of codes) {
    const f = fs.existsSync(path.join(DIR, `${code}.json`)) ? path.join(DIR, `${code}.json`) : null;
    if (!f) { console.log(`${code}: fehlt`); bad++; continue; }
    let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`${code}: ungültiges JSON – ${e.message}`); bad++; continue; }
    const r = check(code, d); r.errs.slice(0, 10).forEach(e => console.log('  ' + e)); if (r.errs.length) bad++;
  }
  process.exitCode = bad ? 1 : 0;
}
