// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// OCR-Messkorpus als Test-Gate (tools/ocr-mess.js): echte Erkennung mit dem Tesseract-Kern der App, derselben Bildaufbereitung
// und denselben Einstellungen. Wird die Texterkennung schlechter (Aufbereitung, Sprachdaten, Tesseract-Version), schlägt der Test an.
// Stand 15.11.2026: Zeichenfehlerrate gesamt 0,40 %, Wortfehlerrate 2,91 %, schlechteste Seite (körniges Handyfoto) 0,96 %.
const test = require('node:test');
const assert = require('node:assert/strict');
const { measure, rates } = require('../tools/ocr-mess.js');

test('Fehlerraten: gleicher Text 0 %, ein vertauschtes Zeichen zählt einfach, Zeilenumbrüche zählen nicht', () => {
  assert.deepEqual(rates('Sehr geehrte\nDamen', 'Sehr  geehrte Damen'), { cer: 0, wer: 0, chars: 18, words: 3 });
  const r = rates('Grüße 12,50 EUR', 'Grüse 12,50 EUR');
  assert.equal(r.cer, 1 / 15); assert.equal(r.wer, 1 / 3);
});

test('Messkorpus: Zeichenfehlerrate gesamt unter 0,8 %, keine Seite über 2 %', { timeout: 300000 }, async () => {
  const res = await measure();
  assert.equal(res.pages.length, 6, 'alle Korpusbilder gelesen');
  for (const p of res.pages) assert.ok(p.cer < 0.02, `${p.file}: Zeichenfehlerrate ${(p.cer * 100).toFixed(2)} %`);
  assert.ok(res.cer < 0.008, `gesamt ${(res.cer * 100).toFixed(2)} %`);
  assert.ok(res.wer < 0.05, `Wortfehlerrate gesamt ${(res.wer * 100).toFixed(2)} %`);
});

// Fax mit Störpunkten (26.11.2026): die 6 Korpusbriefe als Fax „fein“ (1728 Punkte breit, aus dem echten TIFF-Weg der App) mit
// Leitungsstörungen/Staub (1500 kleine Punkte, 120 Kleckse, 20 Striche je Seite). Ohne Störpunkte-Entfernung 28 % Zeichenfehler, mit 5,8 %.
test('Fax mit Störpunkten: Zeichenfehlerrate gesamt unter 8 %, keine Seite über 12 %', { timeout: 300000 }, async () => {
  const res = await measure(undefined, undefined, true, undefined, require('node:path').join(__dirname, 'ocr-korpus', 'fax-gestoert'));
  assert.equal(res.pages.length, 6, 'alle Fax-Seiten gelesen');
  for (const p of res.pages) assert.ok(p.cer < 0.12, `${p.file}: Zeichenfehlerrate ${(p.cer * 100).toFixed(2)} %`);
  assert.ok(res.cer < 0.08, `gesamt ${(res.cer * 100).toFixed(2)} %`);
});

test('Störpunkte-Entfernung: freie Punkte weg, i-Punkte, Satzpunkte und Trennpunkte bleiben, Graustufen unberührt', () => {
  const I = globalThis.Imaging || (() => { globalThis.self = globalThis; require('../js/imaging.js'); return globalThis.Imaging; })();
  const W = 1728, H = 120, mk = () => new Uint8ClampedArray(W * H * 4).fill(255);
  const dot = (d, x, y, w = 2, h = 2, v = 0) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * W + xx) * 4; d[i] = d[i + 1] = d[i + 2] = v; } };
  const px = (d, x, y) => d[(y * W + x) * 4];
  const d = mk();
  dot(d, 100, 40, 4, 30);                 // Buchstabe (Strich)
  dot(d, 101, 34);                         // i-Punkt darüber
  dot(d, 108, 68);                         // Satzpunkt daneben
  dot(d, 122, 55);                         // Trennpunkt „·“ 18 Punkte weiter
  dot(d, 900, 20); dot(d, 905, 24); dot(d, 1500, 90, 3, 3);   // Störpunkte, auch als Gruppe
  const n = I.despeckle(d, W, H);
  assert.equal(n, 3, 'drei Störpunkte entfernt');
  assert.equal(px(d, 101, 34), 0); assert.equal(px(d, 108, 68), 0); assert.equal(px(d, 122, 55), 0);
  assert.equal(px(d, 900, 20), 255); assert.equal(px(d, 905, 24), 255); assert.equal(px(d, 1500, 90), 255);
  // Graustufen-Seite (Foto, Schattierung): nichts anfassen
  const g = mk(); dot(g, 0, 0, W, 60, 150); dot(g, 900, 90);
  assert.equal(I.despeckle(g, W, H), 0);
});
