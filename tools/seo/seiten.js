// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Aufruf: node tools/seo/seiten.js ergebnis.json  (siehe docs/SEO-GEO-2026-11.md)
// Alle deutschen Seiten der Sitemap + Stichprobe fr/: Titel, Beschreibung, Canonical, H1, hreflang, JSON-LD
(async () => {
  const sm = await (await fetch('https://pdfmy.de/sitemap.xml')).text();
  const all = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const de = all.filter(u => !/pdfmy\.de\/[a-z]{2}(-[A-Z]{2})?\//.test(u));
  const sample = all.filter(u => /pdfmy\.de\/fr\//.test(u)).slice(0, 48);
  const rows = [];
  const pool = [...de, ...sample];
  const one = async u => {
    const h = await (await fetch(u)).text();
    const m = re => (h.match(re) || [])[1] || '';
    const title = m(/<title[^>]*>([^<]*)<\/title>/i).trim();
    const desc = m(/<meta name="description" content="([^"]*)"/i);
    const can = m(/<link rel="canonical" href="([^"]*)"/i);
    const ld = [...h.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(x => x[1]);
    rows.push({ u: u.replace('https://pdfmy.de/', ''), tl: title.length, dl: desc.length, can: can === u ? 'ok' : (can ? 'anders:' + can.replace('https://pdfmy.de/', '') : 'FEHLT'), h1: (h.match(/<h1[\s>]/gi) || []).length, hl: (h.match(/hreflang=/g) || []).length, ld: [...new Set(ld)].join('/'), title });
  };
  for (let i = 0; i < pool.length; i += 8) await Promise.all(pool.slice(i, i + 8).map(one));
  rows.sort((a, b) => a.u.localeCompare(b.u));
  require('fs').writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
  const n = rows.length, cnt = f => rows.filter(f).length;
  console.log(`Seiten geprüft: ${n} (de ${de.length}, fr-Stichprobe ${sample.length}); Sitemap gesamt ${all.length}`);
  console.log('Canonical fehlt:', cnt(r => r.can === 'FEHLT'), '| zeigt woanders hin:', cnt(r => r.can.startsWith('anders')));
  console.log('Titel > 60 Zeichen:', cnt(r => r.tl > 60), '| Beschreibung fehlt:', cnt(r => !r.dl), '| > 160:', cnt(r => r.dl > 160), '| < 70:', cnt(r => r.dl && r.dl < 70));
  console.log('H1 ≠ 1:', cnt(r => r.h1 !== 1), '| ohne hreflang:', cnt(r => !r.hl), '| ohne JSON-LD:', cnt(r => !r.ld));
  for (const r of rows.filter(r => r.can !== 'ok' || r.h1 !== 1 || !r.dl || !r.hl)) console.log(' ', r.u, '| can', r.can, '| h1', r.h1, '| desc', r.dl, '| hl', r.hl);
})();
