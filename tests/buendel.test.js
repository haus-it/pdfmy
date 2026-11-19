// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Skripte bündeln (app-v307): pdfmy.de spricht nur HTTP/1.1 – zusammenhängende eigene Module werden beim Bauen zu einer Datei.
// Geprüft wird, dass das Bündel gültiges JavaScript ist, keine Namen doppelt deklariert und die Ausnahmen eingehalten werden.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), build = fs.readFileSync(path.join(ROOT, 'tools', 'build-web.js'), 'utf8');
const NO_BUNDLE = new RegExp(build.match(/const NO_BUNDLE = \/(.+)\/;/)[1]);

function runs() {
  const out = []; let run = [];
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    if (/^js\/[\w-]+\.js$/.test(m[1]) && !NO_BUNDLE.test(m[1])) run.push(m[1]); else { if (run.length > 1) out.push(run); run = []; }
  }
  if (run.length > 1) out.push(run);
  return out;
}

test('Bündel: zusammenhängende Module, Ausnahmen bleiben einzeln', () => {
  const r = runs();
  assert.ok(r.length >= 1 && r[0].length >= 20, 'mindestens ein großes Bündel');
  const all = r.flat();
  for (const f of ['js/app.js', 'js/pro.js', 'js/config.js', 'js/i18n.js']) assert.ok(!all.includes(f), f + ' bleibt einzeln');
  assert.ok(all.every(f => !f.startsWith('vendor/')), 'fremde Bibliotheken bleiben einzeln');
  // keine gebündelte Datei setzt den strikten Modus auf oberster Ebene oder liest document.currentScript
  for (const f of all) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Direktive am Dateianfang (nach Kommentaren) = strikter Modus für die ganze Datei – im Bündel würde sie nicht mehr wirken
    assert.doesNotMatch(s.replace(/^﻿/, ''), /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use strict['"]/, f + ': strikter Modus auf oberster Ebene');
    assert.doesNotMatch(s, /document\.currentScript/, f + ': document.currentScript');
  }
});

test('Bündel: gültiges JavaScript, keine doppelt deklarierten Namen (wie als einzelne Skripte)', () => {
  for (const files of runs()) {
    const code = files.map(f => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, '') + '\n;\n').join('');
    assert.doesNotThrow(() => new vm.Script(code, { filename: 'module-bündel.js' }), 'Bündel lässt sich übersetzen');
  }
});

test('Build: Bündel auf pdfmy.de und im Selbstbetrieb, im Offline-Speicher, Einzeldateien bleiben für die Worker', () => {
  assert.match(build, /html = bundleScripts\(html\);\nhtml = preloadScripts\(html\);/);
  assert.match(build, /h = deferScripts\(preloadScripts\(bundleScripts\(h\)\)\);/);
  assert.equal((build.match(/\[\.\.\.bundles\.keys\(\)\]\.map\(b => `'\$\{b\}', `\)/g) || []).length, 2, 'beide Service Worker kennen die Bündel');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of ['js/imaging.js', 'js/docdetect.js', 'js/patchcode.js', 'js/qr.js']) assert.ok(sw.includes(`'${f}'`), f + ' bleibt im Offline-Speicher (Worker)');
});
