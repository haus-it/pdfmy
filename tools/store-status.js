// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Store-Freigaben prüfen (15.11.2026): Ist die Erweiterung bei Firefox-Add-ons bzw. Thunderbird-Add-ons öffentlich?
   Die öffentlichen Schnittstellen der Stores antworten erst nach der Freigabe (vorher 401). Kein Konto, keine Zugangsdaten.
   Aufruf:  node tools/store-status.js            → Stand anzeigen
            node tools/store-status.js --apply    → freigegebene Adressen in tools/site.json („stores“) eintragen; Exit 10 = geändert
   Chrome und Edge vergeben die Kennung erst beim Einreichen – sobald bekannt, in STORES ergänzen (id-Feld). */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const SITE = path.join(__dirname, 'site.json');
const STORES = {
  firefox: { api: 'https://addons.mozilla.org/api/v5/addons/addon/pdfmy-pdfs-direkt-%C3%B6ffnen/', page: d => d.url },
  thunderbird: { api: 'https://addons.thunderbird.net/api/v4/addons/addon/pdfmy/', page: d => d.url },
};

(async () => {
  const site = JSON.parse(fs.readFileSync(SITE, 'utf8')), have = Object.assign({}, site.firefoxAmo ? { firefox: site.firefoxAmo } : {}, site.stores || {});
  const found = {};
  for (const [k, s] of Object.entries(STORES)) {
    let status = 'nicht erreichbar', url = null;
    try {
      const r = await fetch(s.api, { headers: { accept: 'application/json', 'user-agent': 'pdfmy-store-status' } });
      if (r.ok) { const d = await r.json(); url = s.page(d); status = d.status === 'public' || d.current_version ? 'freigegeben' : `Status ${d.status}`; }
      else status = r.status === 401 || r.status === 404 ? 'noch in Prüfung' : `HTTP ${r.status}`;
    } catch (e) { status = 'Netzfehler: ' + e.message; }
    console.log(`${k.padEnd(12)} ${status}${url ? ' – ' + url : ''}${have[k] ? ' (auf pdfmy.de eingetragen)' : ''}`);
    if (status === 'freigegeben' && url && /^https:\/\//.test(url) && have[k] !== url) found[k] = url;
  }
  if (!process.argv.includes('--apply') || !Object.keys(found).length) return;
  site.stores = Object.assign({}, site.stores || {}, found);
  fs.writeFileSync(SITE, JSON.stringify(site, null, 2) + '\n');
  console.log('Eingetragen in tools/site.json: ' + Object.keys(found).join(', '));
  process.exitCode = 10;
})();
