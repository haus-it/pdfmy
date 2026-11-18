// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Rückmeldungen aus den Kommentaren unter dem Artikel in Borns IT-Blog (01.11.2026, ausgewertet 18.11.2026)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

test('Firefox ohne Seitenschriften: PDF-Text wird als Formen gezeichnet statt unsichtbar', () => {
  assert.match(app, /const noFonts = await webFontsBlocked\(\) \? \{ disableFontFace: true \} : \{\};/);
  assert.match(app, /getDocument\(\{ data, fontExtraProperties: true, \.\.\.window\.PDFJS_OPTS, \.\.\.noFonts, \.\.\.extra \}\)/, 'gilt für jedes geöffnete PDF');
  assert.match(app, /webFontsOk = Math\.abs\(a - b\) > 4;/, 'Erkennung über Textbreite eigene Schrift vs. Festbreite');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(idx, /@font-face\{font-family:"DejaVu Sans";src:url\(vendor\/DejaVuSans\.ttf\)/, 'Prüfschrift ist als Webschrift eingebunden');
  assert.ok(fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.html'), 'utf8').includes('<b>Firefox ohne eigene Schriften:</b>'), 'Hilfe');
});

test('Sicherheit: Nutzer können selbst nachprüfen, dass nichts hochgeladen wird', () => {
  const bw = fs.readFileSync(path.join(ROOT, 'tools', 'build-web.js'), 'utf8');
  assert.ok(bw.includes('<b>Selbst nachprüfen statt glauben:</b>'), 'Anleitung auf der Sicherheitsseite');
  const csp = bw.match(/const CSP = "([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self' blob: data: http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*;/, 'keine Verbindungen zu fremden Servern');
  assert.match(fs.readFileSync(path.join(ROOT, 'vendor', 'pdfjs', 'loader.js'), 'utf8'), /isEvalSupported: false/, 'kein eval in pdf.js');
});
