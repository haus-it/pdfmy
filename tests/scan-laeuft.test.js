// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Meldung 2026-0002 (app-v339): Während ein langsamer Netzwerk-Scan (WSD, Brother MFC-9142CDN) noch einzog, ließ die App einen
// zweiten Scan starten; pdfmy Scan lehnte mit 409 „Es läuft bereits ein Scan“ ab und die App zeigte das als Fehler mit Fehlerbericht.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

test('Zweiter Scan wird nicht gestartet, solange einer läuft – stattdessen ein Hinweis', () => {
  const go = app.slice(app.indexOf("$('#scanGo').onclick"), app.indexOf('async function scanRun'));
  assert.match(go, /if \(state\.scanning > 0\) \{ \$\('#scanDlg'\)\.close\(\); toast\(I18N\.t\(SCAN_BUSY_MSG\), 9000\); return; \}/);
  assert.ok(go.indexOf('state.scanning > 0') < go.indexOf('scanRun('), 'Prüfung vor dem Start');
  assert.match(app, /const SCAN_BUSY_MSG = 'Der Scanner arbeitet noch am vorigen Auftrag/);
});

test('409 von pdfmy Scan: verständlicher Hinweis statt Fehlerdialog', () => {
  assert.match(app, /if \(r\.status === 409\) \{ const err = new Error\(I18N\.t\('pdfmy Scan arbeitet noch an einem vorigen Scan/);
  assert.match(app, /err\.busy = true; throw err;/);
  assert.match(app, /catch \(e\) \{ if \(e\.busy\) \{ status\(e\.message\); toast\(e\.message, 9000\); \} else showScanError\(e\); \}/);
  // Server-Seite: 409 genau bei laufendem Scan
  const cs = fs.readFileSync(path.join(__dirname, '..', 'tools', 'pdfmy-scan', 'Program.cs'), 'utf8');
  assert.match(cs, /SendJson\(s, 409, new \{ error = "Es läuft bereits ein Scan\." \}/);
});

test('Langsamer Einzug: nach 15 s ohne Seite ein Zwischenstand', () => {
  assert.match(app, /if \(!got && !st\.pages && !slowShown && Date\.now\(\) - t0 > 15000\)/);
  assert.match(app, /Der Scanner zieht noch ein/);
});
