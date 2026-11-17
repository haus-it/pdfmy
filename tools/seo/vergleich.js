// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Aufruf: node tools/seo/vergleich.js ergebnis.json  (siehe docs/SEO-GEO-2026-11.md)
// SEO/GEO-Messung: gleiche Kennzahlen für PDFMy und Mitbewerber (nur öffentliche Seiten, je 1 Abruf)
const SITES = [
  ['PDFMy', 'https://pdfmy.de/'],
  ['PDF24', 'https://tools.pdf24.org/de/'],
  ['iLovePDF', 'https://www.ilovepdf.com/de'],
  ['Smallpdf', 'https://smallpdf.com/de'],
  ['Sejda', 'https://www.sejda.com/de'],
  ['PDFgear', 'https://www.pdfgear.com/de/'],
  ['Adobe online', 'https://www.adobe.com/de/acrobat/online.html'],
  ['Stirling-PDF', 'https://www.stirlingpdf.com/'],
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36';
const AIBOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot'];
async function get(u) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const ttfb = Date.now() - t0; const body = await r.text();
    return { status: r.status, url: r.url, ttfb, ms: Date.now() - t0, body, type: r.headers.get('content-type') || '' };
  } catch (e) { return { status: 0, err: e.message, body: '' }; }
}
function botRule(robots, bot) {
  // vereinfachte Auswertung: eigene Gruppe für den Bot, sonst *
  const groups = []; let cur = null;
  for (const raw of robots.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(); if (!l) continue;
    const [k, ...v] = l.split(':'); const key = k.trim().toLowerCase(), val = v.join(':').trim();
    if (key === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); }
    else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push([key, val]);
  }
  const g = groups.find(g => g.agents.includes(bot.toLowerCase())) || groups.find(g => g.agents.includes('*'));
  if (!g) return 'erlaubt';
  const root = g.rules.find(([k, v]) => k === 'disallow' && v === '/');
  return root ? 'gesperrt' : (g.rules.some(([k, v]) => k === 'disallow' && v) ? 'teilweise' : 'erlaubt');
}
(async () => {
  const out = [];
  for (const [name, url] of SITES) {
    const p = await get(url); const h = p.body;
    const origin = new URL(p.url || url).origin;
    const m = re => (h.match(re) || [])[1];
    const title = (m(/<title[^>]*>([^<]*)<\/title>/i) || '').trim();
    const desc = m(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || m(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description/i) || '';
    const ld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(x => x[1]);
    const types = new Set(); for (const j of ld) for (const t of j.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) t[1].replace(/[\[\]"]/g, '').split(',').forEach(s => s.trim() && types.add(s.trim()));
    const robots = await get(origin + '/robots.txt'); const llms = await get(origin + '/llms.txt');
    const sm = (robots.body.match(/sitemap:\s*(\S+)/gi) || []).map(s => s.split(/:\s*/).slice(1).join(':'));
    let smUrls = null; if (sm[0]) { const s = await get(sm[0]); smUrls = (s.body.match(/<loc>/g) || []).length; if (/<sitemapindex/i.test(s.body)) smUrls = 'Index mit ' + smUrls + ' Teil-Sitemaps'; }
    out.push({
      name, url: p.url || url, status: p.status, ttfb_ms: p.ttfb, html_kb: Math.round(Buffer.byteLength(h) / 1024),
      title, title_len: title.length, desc_len: desc.length, desc,
      h1: (h.match(/<h1[\s>]/gi) || []).length, canonical: !!/rel=["']canonical/i.test(h),
      hreflang: (h.match(/hreflang=/gi) || []).length, og: !!/property=["']og:title/i.test(h),
      jsonld: [...types].join(', ') || '–', faq: types.has('FAQPage'), app: [...types].some(t => /Application/.test(t)),
      words: h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[a-zäöüß]{2}/i.test(w)).length,
      llms_txt: llms.status === 200 && /text\/(plain|markdown)/.test(llms.type) && !/<html/i.test(llms.body.slice(0, 500)),
      sitemap: smUrls, ai_bots: Object.fromEntries(AIBOTS.map(b => [b, robots.status === 200 ? botRule(robots.body, b) : 'keine robots.txt'])),
    });
    console.error('ok', name);
  }
  require('fs').writeFileSync(process.argv[2] || 'seo.json', JSON.stringify(out, null, 1));
})();
