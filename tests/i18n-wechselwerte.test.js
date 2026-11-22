// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wechselnde Werte auf den Webseiten (app-v332): Versionen, Paketnamen und -größen werden zu Platzhaltern, damit eine neue
// Fassung die Übersetzungen der Firmenseite (Selbstbetrieb) nicht jedes Mal entwertet – feste Größenangaben bleiben unberührt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { volatile } = require('../tools/i18n-extract.js');

test('Platzhalter für wechselnde Werte', () => {
  assert.equal(volatile(', jede Fassung sofort, derzeit v331). Eigener Spiegel im Intranet:'), ', jede Fassung sofort, derzeit {0}). Eigener Spiegel im Intranet:');
  assert.equal(volatile('pdfmy-selfhost-v331.tar.gz'), 'pdfmy-selfhost-{0}.tar.gz');
  assert.equal(volatile('(106 MB, SHA-256'), '({0} MB, SHA-256');
  assert.equal(volatile('nach Dateigröße (z. B. höchstens 5 MB für E-Mail-Anhänge)'), 'nach Dateigröße (z. B. höchstens 5 MB für E-Mail-Anhänge)', 'feste Angaben bleiben');
  assert.equal(volatile('die Versionsnummer, z. B. <i>v215</i>'), 'die Versionsnummer, z. B. <i>v215</i>', 'Beispiele im Hilfetext bleiben');
  assert.equal(volatile('pdfmy Scan 1.23.0'), 'pdfmy Scan {0}');
});
