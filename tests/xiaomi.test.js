// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Xiaomi, Redmi, POCO mit HyperOS/MIUI (app-v306): Gerät erkennen, im Xiaomi-Browser den Weg über Chrome erklären,
// nach der Installation sagen, wo das Symbol liegt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const pro = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
const MODEL = new RegExp(pro.match(/const XIAOMI_MODEL = \/(.+)\/i;/)[1], 'i');
const MIBROWSER = new RegExp(pro.match(/const miBrowser = IS_ANDROID && \/(.+?)\/i\.test/)[1], 'i');

test('Xiaomi-Geräte am Modellnamen erkennen (Client Hints), andere Hersteller nicht', () => {
  for (const m of ['Redmi Note 13 Pro 5G', 'POCO X6 Pro', 'Xiaomi 14T', 'Mi 11 Lite 5G', '23021RAAEG', '2201117TY', 'M2101K6G', 'MIX Fold 3'])
    assert.ok(MODEL.test(m), 'erkannt: ' + m);
  for (const m of ['Pixel 8', 'SM-S918B', 'CPH2449', 'moto g54 5G', 'Nokia G42', 'ONEPLUS A6013', 'K', '', 'Galaxy A55', 'MAR-LX1A', 'XQ-DQ54'])
    assert.ok(!MODEL.test(m), 'nicht Xiaomi: ' + m);
});

test('Xiaomi-Browser erkennen; Hinweise vorhanden; Knopf erklärt den Weg über Chrome', () => {
  assert.ok(MIBROWSER.test('Mozilla/5.0 (Linux; U; Android 14; de-de; 23021RAAEG Build/UKQ1) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.10.1-gn'));
  assert.ok(!MIBROWSER.test('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'));
  assert.match(pro, /\|\| firefoxDesk \|\| miBrowser \|\| samsungBrowser \|\| operaDesk \|\| silk\); \}/, 'Knopf erscheint im Xiaomi-Browser');
  assert.match(pro, /if \(miBrowser\) \{ alert\(I18N\.t\('Im Xiaomi-Browser lässt sich PDFMy nicht als App installieren/);
  assert.match(pro, /\(xiaomi \? ' ' \+ I18N\.t\(XIAOMI_ICON_HINT\) : samsung/, 'nach der Installation: Hinweis zum Symbol');
  assert.match(pro, /getHighEntropyValues\?\.\(\['model'\]\)/, 'Chrome meldet das Modell nur über Client Hints');
});
