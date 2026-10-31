// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Oberfläche für die Android-App zusammenstellen: die App selbst aus dem Web-Build (zuerst node tools/build-web.js), ohne Sprachfassungen
// der Webseiten, Downloads und Pressematerial – die App liefert alles mit und braucht zur Laufzeit kein Internet.
const fs = require('node:fs'), path = require('node:path');
const SRC = path.join(__dirname, '..', '..', 'dist', 'pdfmy.de'), OUT = path.join(__dirname, 'www');
if (!fs.existsSync(path.join(SRC, 'index.html'))) { console.error('Zuerst bauen: node tools/build-web.js'); process.exit(1); }
const KEEP = new Set(['index.html', 'manifest.webmanifest', 'js', 'vendor', 'i18n', 'icons', 'hilfe.html', 'hilfe.js', 'sprache.js', 'datenschutz.html', 'impressum.html', 'barrierefreiheit.html']);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const e of fs.readdirSync(SRC)) if (KEEP.has(e)) fs.cpSync(path.join(SRC, e), path.join(OUT, e), { recursive: true });
fs.rmSync(path.join(OUT, 'i18n', 'site'), { recursive: true, force: true });
let n = 0, size = 0; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; size += fs.statSync(p).size; } } }; walk(OUT);
console.log(`www: ${n} Dateien, ${(size / 1048576).toFixed(1)} MB`);
