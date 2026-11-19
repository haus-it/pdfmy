// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Samsung Galaxy mit One UI (app-v308): Samsung Internet, Samsung DeX und Galaxy Tab im Desktop-Modus zählen als Android
// (kein pdfmy Scan für Linux); der Knopf „App herunterladen“ erklärt in Samsung Internet den Weg über das Menü.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const pro = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
const expr = app.match(/const ANDROID_DESKTOP_MODE = ([\s\S]+?);\n/)[1];
const desk = (userAgent, maxTouchPoints, fine, platform) => new Function('navigator', 'window', 'matchMedia', 'return ' + expr)(
  { userAgent, maxTouchPoints, platform }, { matchMedia: true }, () => ({ matches: fine }));
const X11 = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ';

test('Samsung DeX / Galaxy Tab im Desktop-Modus gilt als Android, ein Linux-PC nicht', () => {
  assert.equal(desk(X11 + 'SamsungBrowser/27.0 Chrome/125.0.0.0 Safari/537.36', 0, true, 'Linux x86_64'), true, 'DeX mit Maus, ohne Touch');
  assert.equal(desk(X11 + 'Chrome/131.0.0.0 Safari/537.36', 10, false, 'Linux aarch64'), true, 'Galaxy Tab, Chrome Desktop-Modus');
  assert.equal(desk(X11 + 'Chrome/131.0.0.0 Safari/537.36', 10, true, 'Linux armv8l'), true, 'DeX mit Chrome und Maus (ARM)');
  assert.equal(desk(X11 + 'Silk/131.4.1 like Chrome/131.0.0.0 Safari/537.36', 0, true, 'Linux x86_64'), true, 'Fire-Tablet, Silk Desktop-Modus');
  assert.equal(desk(X11 + 'Chrome/131.0.0.0 Safari/537.36', 0, true, 'Linux x86_64'), false, 'Linux-PC');
  assert.equal(desk(X11 + 'Chrome/131.0.0.0 Safari/537.36', 10, true, 'Linux x86_64'), false, 'Linux-Laptop mit Touchscreen');
});

test('Samsung Internet: Installationsweg, Modell-Erkennung, Hinweis zum Symbol', () => {
  const MODEL = new RegExp(pro.match(/const SAMSUNG_MODEL = \/(.+)\/i;/)[1], 'i');
  for (const m of ['SM-S928B', 'SM-X710', 'SM-A556B', 'Galaxy Tab S9']) assert.ok(MODEL.test(m), m);
  for (const m of ['Pixel 8', 'Redmi Note 13', 'K', '', 'CPH2449']) assert.ok(!MODEL.test(m), m);
  assert.match(pro, /const samsungBrowser = IS_ANDROID && \/SamsungBrowser\\\/\/\.test/);
  assert.match(pro, /\|\| miBrowser \|\| samsungBrowser \|\| operaDesk \|\| silk\); \}/, 'Knopf erscheint in Samsung Internet');
  assert.match(pro, /if \(samsungBrowser\) \{ alert\(I18N\.t\('So kommt PDFMy als App auf Ihr Samsung Galaxy/);
  assert.match(pro, /samsung \? ' ' \+ I18N\.t\(SAMSUNG_ICON_HINT\)/);
});

test('Opera am PC und Amazon Silk: Knopf erklärt den Weg statt zu fehlen', () => {
  assert.ok(pro.includes(String.raw`const operaDesk = /\bOPR\//.test(navigator.userAgent) && !IS_MOBILE`));
  assert.ok(pro.includes(String.raw`const silk = /\bSilk\//.test(navigator.userAgent);`));
  assert.ok(pro.includes("if (operaDesk) { alert(I18N.t('Opera kann PDFMy nicht"));
  assert.ok(pro.includes("if (silk) { alert(I18N.t('So kommt PDFMy auf Ihr Fire-Tablet"));
  const i = pro.indexOf('if (installEvt) {'), j = pro.indexOf('if (operaDesk) {');
  assert.ok(i > 0 && i < j, 'echtes Installieren hat Vorrang');
});
