// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Symbole des ONLYOFFICE-Plugins in den Größen des ONLYOFFICE-Marktplatzes (15.11.2026), aus dem Symbol der Browser-Erweiterung (ohne „APP“-Abzeichen):
   resources/light|dark/icon[@1.25x|@1.5x|@1.75x|@2x].png  – 28 px Grundgröße (Symbolleiste, hell/dunkel)
   resources/store/icons/icon[@…].png                       – 120×60 Grundgröße (Karte im Plugin-Manager, Kopf #4A5280)
   Aufruf: node tools/oo-icons.js  (headless Chrome über tools/cdp.js). Ergebnis wird eingecheckt; tools/addins.js packt es. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { launch } = require('./cdp.js');
const ROOT = path.resolve(__dirname, '..'), RES = path.join(ROOT, 'tools', 'pdfmy-onlyoffice', 'resources');
const SCALES = [['', 1], ['@1.25x', 1.25], ['@1.5x', 1.5], ['@1.75x', 1.75], ['@2x', 2]];

(async () => {
  const src = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-extension', 'icons', 'icon-128.png')).toString('base64');
  const b = await launch({ W: 400, H: 300 });
  const out = await b.ev(`
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    const draw = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; fn(x, w, h); return c.toDataURL('image/png').split(',')[1]; };
    const r = {};
    for (const [suf, s] of ${JSON.stringify(SCALES)}) {
      const n = Math.round(28 * s);
      r['light/icon' + suf + '.png'] = r['dark/icon' + suf + '.png'] = draw(n, n, (x) => x.drawImage(img, 0, 0, n, n));
      const W = Math.round(120 * s), H = Math.round(60 * s), k = Math.round(40 * s);
      r['store/icons/icon' + suf + '.png'] = draw(W, H, (x) => {
        x.drawImage(img, Math.round(8 * s), Math.round((H - k) / 2), k, k);
        x.fillStyle = '#fff'; x.font = '800 ' + Math.round(22 * s) + 'px "Segoe UI", system-ui, sans-serif'; x.textBaseline = 'middle';
        x.fillText('PDFMy', Math.round(54 * s), H / 2 + 1);
      });
    }
    return r;`);
  b.close();
  for (const [rel, data] of Object.entries(out)) { const f = path.join(RES, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(data, 'base64')); }
  console.log(Object.keys(out).length + ' Symbole in tools/pdfmy-onlyoffice/resources/');
})().catch(e => { console.error(e); process.exit(1); });
