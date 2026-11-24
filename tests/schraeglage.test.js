// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Meldung 2026-0005 (app-v341): Ein gerade aufgelegtes, quer liegendes Dokument (russische Urkunde) wurde schief „gerade gerichtet“
// und nicht gedreht. Ursachen: Schräglage nur aus waagerechten Zeilen und ohne Sicherheit; Ausrichtung nur mit dem deutschen Modell.
// Gemessen im Browser (Canvas): Korpus gekippt um 0/±0,5/1/2/−3° und quer – Winkel exakt, quer erkannt; der gemeldete Scan liefert
// in beiden Hälften verschiedene Winkel → keine Drehung. Synthetische russische Seite quer → gedreht, Russisch, Sicherheit 95.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('Schräglage: Postl-Bewertung, waagerecht und senkrecht, nur bei übereinstimmenden Hälften', () => {
  const im = R('js/imaging.js');
  assert.match(im, /function skewInfo\(src\)/);
  assert.match(im, /const df = bins\[k\] - bins\[k - 1\]; e \+= df \* df;/, 'Energie der Unterschiede (Postl)');
  assert.match(im, /bins\[Math\.round\(vert \? xs\[i\] \* cs \+ ys\[i\] \* sn : ys\[i\] \* cs - xs\[i\] \* sn\) \+ L\]\+\+;/, 'senkrechte Zeilen');
  assert.match(im, /const ok = Math\.abs\(a1 - a2\) <= 0\.35 && Math\.abs\(r\.deg - \(a1 \+ a2\) \/ 2\) <= 0\.3;/, 'beide Hälften gleich');
  assert.match(im, /function estimateSkew\(src\) \{\s*const r = skewInfo\(src\);\s*return r\.ok \? r\.angle : 0;/);
  assert.match(im, /rotate90, estimateSkew, skewInfo, rotateBy/, 'exportiert');
  // Vorzeichen: Punkte auf einer um a im Uhrzeigersinn gekippten Linie haben dieselbe Projektion (waagerecht und senkrecht)
  const a = 2.5 * Math.PI / 180, sn = Math.sin(a), cs = Math.cos(a);
  const h = t => [t * cs, 100 + t * sn], v = t => [50 - t * sn, t * cs];
  const projH = ([x, y]) => y * cs - x * sn, projV = ([x, y]) => x * cs + y * sn;
  for (const t of [0, 40, 300]) { assert.ok(Math.abs(projH(h(t)) - projH(h(0))) < 1e-9); assert.ok(Math.abs(projV(v(t)) - projV(v(0))) < 1e-9); }
});

test('Ausrichtung: quer liegende Seiten zuerst ±90°, dann mit fremden Schriften', () => {
  const app = R('js/app.js'), i = app.indexOf('async function ocrPage(p)'), body = app.slice(i, i + 6000);
  assert.match(body, /const sideways = \(\(\) => \{ try \{ return Imaging\.skewInfo\(small\)\.vertical; \} catch \{ return false; \} \}\)\(\);/);
  assert.match(body, /for \(const dir of sideways \? \[90, -90, 180\] : \[180, 90, -90\]\)/);
  assert.match(body, /for \(const c of scriptProbes\(ocrPrimary\(\)\)\) \{/);
  assert.match(body, /for \(const dir of \[0, 90, -90\]\)/);
  assert.match(body, /if \(dir && r\.conf >= 60 && r\.conf > res\.conf \+ 15\) \{ turnTo = dir; break; \}/, 'klar lesbar');
  // Meldung 2026-0007: blasse Urkunde – Wortzahl statt Sicherheit; Richtung aus Sicherheit + Wortzahl
  assert.match(body, /return Math\.max\(a\.words, b\.words\) >= Math\.max\(8, 3 \* \(w0 \+ 1\)\) && hi\.words >= 8 && sc\(hi\) >= sc\(lo\) \+ 5 \? dir : 0;/);
});

test('Wortzählung: echte Wörter in lateinischer, kyrillischer und griechischer Schrift, Rauschen zählt nicht', () => {
  const app = R('js/app.js'), m = app.match(/const ocrWords = [\s\S]*?\.length;/)[0];
  const ocrWords = new Function(m.replace('const ocrWords =', 'return'))();
  assert.equal(ocrWords('Уважаемый господин Иванов, настоящим подтверждаем'), 5);
  assert.equal(ocrWords('Sehr geehrte Damen und Herren'), 4);
  assert.equal(ocrWords('Αγαπητέ κύριε Παπαδόπουλε'), 3);
  assert.equal(ocrWords('xx ;; |l1 Ii lll nnnn ст тт KM BE Fr'), 0);
  // Messwerte der gemeldeten Urkunde (v341, Glas, WSD): 0° russisch 42 %/4 Wörter, +90° 21/24, −90° 25/31 → −90°
  const sidePick = new Function('s', app.match(/const sidePick = s => \{([\s\S]*?)\n      \};/)[1]);
  assert.equal(sidePick({ 0: { conf: 42, words: 4 }, 90: { conf: 21, words: 24 }, '-90': { conf: 25, words: 31 } }), -90);
  assert.equal(sidePick({ 0: { conf: 52, words: 0 }, 90: { conf: 18, words: 42 }, '-90': { conf: 38, words: 45 } }), -90);
  assert.equal(sidePick({ 0: { conf: 80, words: 40 }, 90: { conf: 30, words: 20 }, '-90': { conf: 35, words: 22 } }), 0, 'aufrecht lesbar: nicht drehen');
  assert.equal(sidePick({ 0: { conf: 30, words: 1 }, 90: { conf: 22, words: 12 }, '-90': { conf: 21, words: 13 } }), 0, 'beide Querlagen gleich: nicht raten');
});

test('Meldung 2026-0008: Import zählt neue Seiten an den Seitenobjekten (Löschen während des Imports), Ausrichtung bricht bei aufrecht lesbarer Seite ab', () => {
  const app = R('js/app.js'), i = app.indexOf('async function importFilesRun('), body = app.slice(i, i + 4500);
  assert.match(body, /const known = new Set\(state\.pages\), before = state\.pages\.length/);
  assert.match(body, /const added = state\.pages\.filter\(q => !known\.has\(q\)\)\.length;\s*if \(!added\) return;/);
  assert.doesNotMatch(body, /if \(state\.pages\.length === before\) return;/, 'nicht mehr über die Anzahl');
  assert.match(app, /if \(!dir && r\.conf >= 55 && s\[0\]\.words >= 8\) break;/);
});

test('Gerade ausrichten (app-v344): Dialog mit Regler, Automatisch und „Wie gescannt“ (nimmt die automatische Begradigung zurück)', () => {
  const app = R('js/app.js'), html = R('index.html');
  assert.match(html, /<button id="btnStraight"/); assert.match(html, /<dialog id="stDlg"/);
  assert.match(html, /<input type="range" id="stRange" min="-10" max="10" step="0\.1"/);
  assert.match(app, /if \(r\.angle\) p\.skew = r\.angle;/, 'automatischer Winkel wird gemerkt');
  assert.match(app, /\$\('#stScan'\)\.onclick = \(\) => \{ rng\.value = p\.skew \|\| 0; draw\(\); \};/);
  assert.match(app, /const s = Imaging\.skewInfo\(base\); rng\.value = s\.ok \? -s\.angle : 0;/);
  assert.match(app, /p\.skew = Math\.round\(\(\(p\.skew \|\| 0\) - a\) \* 100\) \/ 100;/);
  assert.match(app, /p\.ocr = null; p\.failed = false; p\.orientChecked = true;/, 'Texterkennung neu, nicht automatisch weiterdrehen');
});
