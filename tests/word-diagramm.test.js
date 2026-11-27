// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Diagramme in Word-Dateien (app-v353): bisher fehlten sie im PDF ganz. Jetzt Werte aus dem gespeicherten Zwischenstand, Farben aus den
// Designfarben (theme1.xml, mit Helligkeitsänderung), gezeichnet mit demselben Zeichner wie bei PowerPoint (js/slides.js drawChart).
// Arten, die PDFMy nicht zeichnet (Blase, Kurs, Oberfläche), erscheinen als sichtbarer Hinweis mit Titel statt still zu fehlen.
// app-v355: Punkt (XY), Netz und Kombination (Säulen + Linie, zweite Größenachse) werden ebenfalls gezeichnet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Office = require('../js/office.js'), Slides = require('../js/slides.js'), L = require('../vendor/pdf-lib.min.js'), fontkit = require('../vendor/fontkit.umd.min.js'), TP = require('../js/textpdf.js');
const V = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', f));
const fonts = { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf') };
const F = path.join(__dirname, 'office-korpus', 'diagramm', 'word-diagramm.docx');
const hex = c => [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('Word-Diagramme: Säulen, Kreis und Netz mit Werten, Titel, Größe und Designfarben', async () => {
  const d = await Office.docx(new Uint8Array(fs.readFileSync(F)));
  const ch = d.blocks.filter(b => b.type === 'chart');
  assert.equal(ch.length, 3);
  const [bar, pie] = ch;
  assert.equal(bar.chart.type, 'bar'); assert.equal(bar.chart.title, 'Mitglieder je Quartal'); assert.equal(bar.align, 'center');
  assert.deepEqual(bar.chart.cats, ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.deepEqual(bar.chart.series.map(s => [s.name, s.vals]), [['2025', [120, 135, 150, 160]], ['2026', [165, 172, 180, 195]]]);
  assert.equal(hex(bar.chart.series[0].color), '1565c0', 'Designfarbe accent1 aus theme1.xml');
  assert.equal(hex(bar.chart.series[1].color), 'bf7200', 'accent2 mit lumMod 75 %');
  assert.deepEqual([Math.round(bar.w), Math.round(bar.h)], [432, 252], 'Größe aus wp:extent');
  assert.equal(pie.chart.type, 'pie'); assert.deepEqual(pie.chart.series[0].vals, [40, 25, 20, 15]);
  assert.equal(hex(pie.chart.series[0].points[0].color), '2e7d32', 'eigene Farbe eines Kreisstücks');
  // Reihenfolge im Text: Diagramm hinter seinem Absatz
  const t = d.blocks.map(b => b.type === 'chart' ? 'chart:' + b.chart.type : b.text);
  assert.deepEqual(t.slice(1), ['Die Mitgliederzahl ist in jedem Quartal gestiegen.', 'chart:bar', 'So verteilen sich die Ausgaben:', 'chart:pie', 'Umfrage:', 'chart:radar', 'Ende des Berichts.']);
  // PDF: Diagramme als Vektorgrafik (keine Bilder)
  const pdf = await L.PDFDocument.load(await TP.build(L, { blocks: d.blocks, page: d.page, fonts }));
  assert.equal(pdf.getPageCount(), 2, "Netzdiagramm braucht Platz auf Seite 2");
  const ops = pdf.getPage(0).node.Contents(); assert.ok(ops, 'Seiteninhalt');
});

test('Diagramm-Zeichner ist eigenständig und zeichnet auch auf fremde Seiten (Word, Folien)', async () => {
  assert.equal(typeof Slides.drawChart, 'function'); assert.equal(typeof Slides.chartOf, 'function');
  const doc = await L.PDFDocument.create(), page = doc.addPage([400, 300]), f = await doc.embedFont(L.StandardFonts.Helvetica), fb = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const chart = { type: 'line', dir: 'col', grouping: 'standard', title: 'Test', cats: ['a', 'b', 'c'], series: [{ name: 'S', vals: [1, -2, 3], cats: [], color: { r: 0, g: 0, b: 1 }, points: [] }], legend: true, legendPos: 'r', percent: false, vary: false, hole: 0, accents: [{ r: 1, g: 0, b: 0 }], size: 10 };
  for (const type of ['line', 'area', 'bar', 'pie', 'doughnut', 'radar']) Slides.drawChart(L, page, { x: 10, y: 10, w: 380, h: 280, chart: { ...chart, type, hole: type === 'doughnut' ? 0.5 : 0 } }, { f, fb });
  assert.ok((await doc.save()).length > 1000);
});

test('OpenDocument-Text (.odt): Diagramme aus der eingebetteten Datentabelle statt „[Bild]“ (app-v354)', async () => {
  // Dieselbe Datei wie oben, mit LibreOffice als .odt gespeichert
  const d = await Office.odt(new Uint8Array(fs.readFileSync(path.join(__dirname, 'office-korpus', 'diagramm', 'odt-diagramm.odt'))));
  const t = d.blocks.map(b => b.type === 'chart' ? 'chart:' + b.chart.type : b.text);
  assert.deepEqual(t.slice(1), ['Die Mitgliederzahl ist in jedem Quartal gestiegen.', 'chart:bar', 'So verteilen sich die Ausgaben:', 'chart:pie', 'Umfrage:', 'chart:radar', 'Ende des Berichts.']);
  const [bar, pie] = d.blocks.filter(b => b.type === 'chart');
  assert.equal(bar.chart.title, 'Mitglieder je Quartal'); assert.deepEqual(bar.chart.cats, ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.deepEqual(bar.chart.series.map(s => [s.name, s.vals]), [['2025', [120, 135, 150, 160]], ['2026', [165, 172, 180, 195]]]);
  assert.deepEqual(pie.chart.series[0].vals, [40, 25, 20, 15]);
  assert.deepEqual([Math.round(bar.w), Math.round(bar.h)], [432, 252], 'Größe aus svg:width/height');
  assert.ok(!d.blocks.some(b => b.text === '[Bild]'), 'kein „[Bild]“ für Diagramme');
  const pdf = await L.PDFDocument.load(await TP.build(L, { blocks: d.blocks, page: d.page, fonts }));
  assert.equal(pdf.getPageCount(), 2, "Netzdiagramm braucht Platz auf Seite 2");
});

test('Alte Word-Datei (.doc): eingebettete Diagramme als sichtbarer Hinweis statt stiller Lücke (app-v354)', () => {
  // Dieselbe Datei, mit LibreOffice als Word 97 gespeichert: Diagramme als OLE-Objekte im ObjectPool (Feld EMBED)
  const d = Office.doc(new Uint8Array(fs.readFileSync(path.join(__dirname, 'office-korpus', 'diagramm', 'doc-diagramm.doc'))));
  assert.deepEqual(d.blocks.map(b => b.text), ['Jahresbericht 2026', 'Die Mitgliederzahl ist in jedem Quartal gestiegen.', '[Diagramm]', 'So verteilen sich die Ausgaben:', '[Diagramm]', 'Umfrage:', '[Diagramm]', 'Ende des Berichts.']);
  // Dateien ohne Diagramme bekommen keinen Hinweis
  for (const f of ['08-newsletter.doc', '13-textfeld.doc']) assert.ok(!Office.doc(new Uint8Array(fs.readFileSync(path.join(__dirname, 'office-korpus', 'doc97', f)))).blocks.some(b => /^\[Diagramm/.test(b.text || '')), f);
});

test('Kombination, Punkt (XY) und Netz in .docx (app-v355)', async () => {
  const d = await Office.docx(new Uint8Array(fs.readFileSync(path.join(__dirname, 'office-korpus', 'diagramm', 'word-kombi.docx'))));
  const [combo, xy, radar] = d.blocks.filter(b => b.type === 'chart').map(b => b.chart);
  // Säulen + Linie: Linie auf der zweiten Größenachse mit Prozentformat
  assert.equal(combo.type, 'bar'); assert.equal(combo.title, 'Umsatz und Marge');
  assert.deepEqual(combo.series.map(s => [s.name, s.kind, s.axis]), [['Umsatz', 'bar', 0], ['Marge', 'line', 1]]);
  assert.deepEqual(combo.series[1].vals, [0.12, 0.15, 0.14, 0.18]);
  assert.equal(combo.percent, false); assert.equal(combo.percent2, true);
  assert.equal(hex(combo.series[1].color), 'ff9800', 'Linienfarbe accent2');
  // Punkt: x-Werte als Zahlen, nur Punkte (Linie ausgeblendet), eigene Punktfarbe
  assert.equal(xy.type, 'scatter');
  assert.deepEqual(xy.series[0].xs, [-5, 0, 5, 10, 15, 20]); assert.deepEqual(xy.series[0].vals, [95, 80, 62, 50, 35, 22]);
  assert.equal(xy.series[0].line, false); assert.equal(xy.series[0].marker, true); assert.equal(hex(xy.series[0].color), '2e7d32');
  // Netz mit Markierungen, zwei Reihen
  assert.equal(radar.type, 'radar'); assert.equal(radar.radarStyle, 'marker');
  assert.deepEqual(radar.cats, ['Service', 'Preis', 'Qualität', 'Tempo', 'Beratung']);
  assert.deepEqual(radar.series.map(s => s.vals), [[3, 4, 4.5, 2.5, 3.5], [4, 3.5, 4.8, 4, 4.2]]);
  assert.ok(!d.blocks.some(b => /^\[Diagramm/.test(b.text || '')), 'kein Hinweis mehr');
  const pdf = await L.PDFDocument.load(await TP.build(L, { blocks: d.blocks, page: d.page, fonts }));
  assert.ok(pdf.getPageCount() >= 1);
});

test('Kombination, Punkt und Netz in .odt: Reihen über ihre Zellbereiche (app-v355)', async () => {
  // Dieselbe Datei, mit LibreOffice als .odt gespeichert: x-Werte der Punktreihe stehen in chart:domain (Spalte C)
  const d = await Office.odt(new Uint8Array(fs.readFileSync(path.join(__dirname, 'office-korpus', 'diagramm', 'odt-kombi.odt'))));
  const [combo, xy, radar] = d.blocks.filter(b => b.type === 'chart').map(b => b.chart);
  assert.deepEqual(combo.series.map(s => [s.name, s.kind, s.axis, s.vals]), [['Umsatz', 'bar', 0, [1200, 1350, 1500, 1800]], ['Marge', 'line', 1, [0.12, 0.15, 0.14, 0.18]]]);
  assert.deepEqual(combo.cats, ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.equal(xy.type, 'scatter'); assert.equal(xy.series.length, 1);
  assert.deepEqual(xy.series[0].xs, [-5, 0, 5, 10, 15, 20]); assert.deepEqual(xy.series[0].vals, [95, 80, 62, 50, 35, 22]);
  assert.equal(radar.type, 'radar'); assert.deepEqual(radar.series.map(s => s.name), ['2025', '2026']);
  const pdf = await L.PDFDocument.load(await TP.build(L, { blocks: d.blocks, page: d.page, fonts }));
  assert.ok(pdf.getPageCount() >= 1);
});

test('Nicht gezeichnete Arten (Blase, Kurs) bleiben ein Hinweis; Kreis nicht mit Säulen kombinierbar', () => {
  const NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const ser = '<c:ser><c:idx val="0"/><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>1</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>';
  const of = body => Slides.chartOf(Office.parseXml(`<c:chartSpace ${NS}><c:chart><c:plotArea>${body}</c:plotArea></c:chart></c:chartSpace>`), () => null);
  assert.equal(of('<c:bubbleChart>' + ser + '</c:bubbleChart>'), null);
  assert.equal(of('<c:stockChart>' + ser + '</c:stockChart>'), null);
  assert.equal(of('<c:barChart>' + ser + '</c:barChart><c:pieChart>' + ser + '</c:pieChart>'), null);
  assert.equal(of('<c:barChart>' + ser + '</c:barChart>').type, 'bar');
});
