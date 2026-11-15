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
