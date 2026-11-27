// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Diagramme in Word-Dateien (app-v353): bisher fehlten sie im PDF ganz. Jetzt Werte aus dem gespeicherten Zwischenstand, Farben aus den
// Designfarben (theme1.xml, mit Helligkeitsänderung), gezeichnet mit demselben Zeichner wie bei PowerPoint (js/slides.js drawChart).
// Arten, die PDFMy nicht zeichnet (z. B. Netz), erscheinen als sichtbarer Hinweis mit Titel statt still zu fehlen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Office = require('../js/office.js'), Slides = require('../js/slides.js'), L = require('../vendor/pdf-lib.min.js'), fontkit = require('../vendor/fontkit.umd.min.js'), TP = require('../js/textpdf.js');
const V = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', f));
const fonts = { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf') };
const F = path.join(__dirname, 'office-korpus', 'diagramm', 'word-diagramm.docx');
const hex = c => [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('Word-Diagramme: Säulen und Kreis mit Werten, Titel, Größe und Designfarben; andere Arten als Hinweis', async () => {
  const d = await Office.docx(new Uint8Array(fs.readFileSync(F)));
  const ch = d.blocks.filter(b => b.type === 'chart');
  assert.equal(ch.length, 2);
  const [bar, pie] = ch;
  assert.equal(bar.chart.type, 'bar'); assert.equal(bar.chart.title, 'Mitglieder je Quartal'); assert.equal(bar.align, 'center');
  assert.deepEqual(bar.chart.cats, ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.deepEqual(bar.chart.series.map(s => [s.name, s.vals]), [['2025', [120, 135, 150, 160]], ['2026', [165, 172, 180, 195]]]);
  assert.equal(hex(bar.chart.series[0].color), '1565c0', 'Designfarbe accent1 aus theme1.xml');
  assert.equal(hex(bar.chart.series[1].color), 'bf7200', 'accent2 mit lumMod 75 %');
  assert.deepEqual([Math.round(bar.w), Math.round(bar.h)], [432, 252], 'Größe aus wp:extent');
  assert.equal(pie.chart.type, 'pie'); assert.deepEqual(pie.chart.series[0].vals, [40, 25, 20, 15]);
  assert.equal(hex(pie.chart.series[0].points[0].color), '2e7d32', 'eigene Farbe eines Kreisstücks');
  // Reihenfolge im Text: Diagramm hinter seinem Absatz, Netzdiagramm als Hinweis
  const t = d.blocks.map(b => b.type === 'chart' ? 'chart:' + b.chart.type : b.text);
  assert.deepEqual(t.slice(1), ['Die Mitgliederzahl ist in jedem Quartal gestiegen.', 'chart:bar', 'So verteilen sich die Ausgaben:', 'chart:pie', 'Umfrage:', '[Diagramm: Zufriedenheit]', 'Ende des Berichts.']);
  // PDF: eine Seite, Diagramm als Vektorgrafik (keine Bilder)
  const pdf = await L.PDFDocument.load(await TP.build(L, { blocks: d.blocks, page: d.page, fonts }));
  assert.equal(pdf.getPageCount(), 1);
  const ops = pdf.getPage(0).node.Contents(); assert.ok(ops, 'Seiteninhalt');
});

test('Diagramm-Zeichner ist eigenständig und zeichnet auch auf fremde Seiten (Word, Folien)', async () => {
  assert.equal(typeof Slides.drawChart, 'function'); assert.equal(typeof Slides.chartOf, 'function');
  const doc = await L.PDFDocument.create(), page = doc.addPage([400, 300]), f = await doc.embedFont(L.StandardFonts.Helvetica), fb = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const chart = { type: 'line', dir: 'col', grouping: 'standard', title: 'Test', cats: ['a', 'b', 'c'], series: [{ name: 'S', vals: [1, -2, 3], cats: [], color: { r: 0, g: 0, b: 1 }, points: [] }], legend: true, legendPos: 'r', percent: false, vary: false, hole: 0, accents: [{ r: 1, g: 0, b: 0 }], size: 10 };
  for (const type of ['line', 'area', 'bar', 'pie', 'doughnut']) Slides.drawChart(L, page, { x: 10, y: 10, w: 380, h: 280, chart: { ...chart, type, hole: type === 'doughnut' ? 0.5 : 0 } }, { f, fb });
  assert.ok((await doc.save()).length > 1000);
});
