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
  assert.match(body, /for \(const c of scriptProbes\(ocrPrimary\(\)\)\) \{\s*for \(const dir of \[90, -90\]\)/);
  assert.match(body, /recognizeLangs\(turn\(small, dir\), c === 'rus' \? \['rus', 'ukr'\] : \[c\]\)/);
  assert.match(body, /if \(r\.conf >= 60 && r\.conf > res\.conf \+ 15 && r\.conf > best\.conf\) best = \{ dir, conf: r\.conf \};/, 'nur bei wirklich lesbarem Ergebnis');
});
