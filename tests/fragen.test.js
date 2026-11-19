// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fragen an die Ablage (Wettbewerbsanalyse Rang 9): passende Dokumente finden, Ausschnitte, Quellen – ohne Upload.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const F = require('../js/fragen.js');

const docs = [
  { key: 'Vertraege\\Strom.pdf', meta: 'Stadtwerke · Stromliefervertrag · Vertrag', text: 'Stromliefervertrag. Laufzeit 24 Monate ab 01.01.2026. Der Vertrag verlängert sich um 12 Monate, wenn er nicht mit einer Kündigungsfrist von 3 Monaten gekündigt wird. Arbeitspreis 31,2 ct/kWh.' },
  { key: 'Vertraege\\Handy.pdf', meta: 'Telefonica · Mobilfunkvertrag · Vertrag', text: 'Mindestlaufzeit 24 Monate, danach monatlich kündbar. Grundgebühr 19,99 EUR. Kündigungsfrist ein Monat.' },
  { key: 'Rechnungen\\Buero.pdf', meta: 'Bürobedarf GmbH · Rechnung 4711 · Rechnung', text: 'Rechnung Nr. 4711 über Druckerpapier, Toner. Gesamtbetrag 238,00 EUR, zahlbar bis 30.11.2026.' },
  { key: 'Bescheide\\Steuer.pdf', meta: 'Finanzamt · Einkommensteuerbescheid 2025 · Bescheid', text: 'Bescheid für 2025 über Einkommensteuer. Einspruch innerhalb eines Monats nach Bekanntgabe.' },
];

test('Begriffe: Füllwörter weg, Wortstämme, Zahlen bleiben, Umlaute finden die Grundform', () => {
  const t = F.terms('Welche Verträge haben eine Kündigungsfrist von 3 Monaten im Jahr 2026?');
  assert.ok(!t.includes('welche') && !t.includes('haben') && !t.includes('von'));
  assert.ok(t.includes('2026'));
  assert.ok(t.some(x => 'kündigungsfrist'.startsWith(x)), t.join());
  assert.ok(t.some(x => 'vertrag'.startsWith(x) && x.length >= 6), 'Verträge → Vertrag: ' + t.join());
  assert.deepEqual(F.terms('und oder die'), []);
});

test('Rangfolge: passende Dokumente zuerst, fremde gar nicht', () => {
  const r = F.rank(docs, 'Welche Verträge verlängern sich automatisch, und mit welcher Kündigungsfrist?');
  assert.ok(r.length >= 2);
  assert.equal(r[0].doc.key, 'Vertraege\\Strom.pdf', 'Verlängerung + Kündigungsfrist');
  assert.ok(r.slice(0, 2).some(x => x.doc.key === 'Vertraege\\Handy.pdf'));
  assert.ok(!r.some(x => x.doc.key === 'Bescheide\\Steuer.pdf'), 'Steuerbescheid hat damit nichts zu tun');
  assert.equal(F.rank(docs, 'Rechnung 4711')[0].doc.key, 'Rechnungen\\Buero.pdf');
  assert.deepEqual(F.rank(docs, 'Zebra Giraffe'), []);
});

test('Ausschnitte: um die Fundstellen, im Rahmen, ohne Fundstelle der Anfang', () => {
  const long = 'A'.repeat(5000) + ' Die Kündigungsfrist beträgt drei Monate. ' + 'B'.repeat(5000);
  const e = F.excerpt(long, F.terms('Kündigungsfrist'), 1000, 100);
  assert.match(e, /Kündigungsfrist beträgt drei Monate/); assert.ok(e.length <= 1010, e.length);
  assert.match(F.excerpt(long, ['zebra'], 300), /^A{300} …$/);
  assert.equal(F.excerpt('kurz', ['x'], 100), 'kurz');
});

test('Kontext und Quellen: nummeriert, Budget eingehalten, ohne Treffer bei wenigen Dokumenten alle, Quellenangaben gelesen', () => {
  const b = F.build(docs, 'Kündigungsfrist der Verträge', { maxChars: 400, maxDocs: 3 });
  assert.deepEqual(b.items.map(i => i.n), b.items.map((_, k) => k + 1));
  assert.ok(b.items.every(i => i.text.length <= 400 / b.items.length + 20));
  assert.equal(b.all, false);
  const p = F.prompt('Kündigungsfrist?', b.items, 'de');
  assert.match(p, /\[1\] (Stadtwerke|Telefonica)/); assert.match(p, /\[\d\] Stadtwerke/); assert.match(p, /Quelle in eckigen Klammern/);
  const all = F.build(docs.slice(0, 2), 'Fasse zusammen', { maxDocs: 6 });
  assert.equal(all.all, true); assert.equal(all.items.length, 2);
  assert.deepEqual(F.build(docs, 'Zebra', { maxDocs: 2 }).items, [], 'viele Dokumente, nichts passt → keine Auswahl');
  assert.deepEqual(F.cited('Strom: 3 Monate [1]. Handy: ein Monat [2, 1]; siehe auch [9] und [3;2].', 3), [1, 2, 3]);
});

test('App: Dialog „Fragen an die Ablage“ eingebunden, nur KI auf diesem Gerät', () => {
  const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const html = R('index.html'), pro = R('js/pro.js'), sw = R('sw.js');
  assert.match(html, /<script src="js\/fragen\.js"><\/script>/); assert.match(sw, /'js\/fragen\.js'/);
  assert.match(html, /<dialog id="askDlg"/); assert.match(html, /id="jAsk"/); assert.match(html, /id="btnAsk"/);
  assert.match(pro, /Fragen\.build\(/); assert.match(pro, /localChat\(\{ system: localSys\(\), prompt: Fragen\.prompt\(/, 'lokale KI auf diesem PC');
  assert.match(pro, /LanguageModel\.create\(/);
});
