// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Baut den Symbol-Sprite (Lucide, ISC-Lizenz) aus vendor/lucide/*.svg in index.html ein – zwischen <!--icons--> und <!--/icons-->.
// Aufruf: node tools/icons.js   (nach dem Hinzufügen eines Symbols nach vendor/lucide)
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '..'), dir = path.join(ROOT, 'vendor', 'lucide');
const symbols = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort().map(f => {
  const inner = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1].replace(/\s*\n\s*/g, '');
  return `<symbol id="i-${f.replace(/\.svg$/, '')}" viewBox="0 0 24 24">${inner}</symbol>`;
});
const file = path.join(ROOT, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const sprite = `<!--icons--><svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols.join('')}</svg><!--/icons-->`;
html = /<!--icons-->[\s\S]*?<!--\/icons-->/.test(html) ? html.replace(/<!--icons-->[\s\S]*?<!--\/icons-->/, sprite) : html.replace(/<body([^>]*)>/, `<body$1>\n${sprite}`);
fs.writeFileSync(file, html);
console.log(`${symbols.length} Symbole eingebaut.`);
