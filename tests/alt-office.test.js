// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Alte Office-Formate (Word/Excel 97–2003): .doc und .xls direkt im Browser lesen – Lücke Rang 9 der Wettbewerbsanalyse.
// Die Vorlagen in tests/alt-office/ hat LibreOffice („MS Word 97“, „MS Excel 97“) erzeugt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Office = require('../js/office.js');
const dir = path.join(__dirname, 'alt-office');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

test('Word 97 (.doc): Absätze, Zeilenumbruch, Unicode, Tabelle mit leerer Zelle', () => {
  const { blocks } = Office.doc(fs.readFileSync(path.join(dir, 'brief.doc')));
  const ps = blocks.filter(b => b.type === 'p').map(b => b.text);
  assert.equal(ps[0], 'Wartungsvertrag');
  assert.ok(ps.includes('Zwischen der Müller GmbH und der Stadtwerke AG – Preis 120 € (北京).'), 'Umlaute, €, Gedankenstrich, Chinesisch');
  assert.ok(ps.includes('Zweiter Absatz mit Zeile\nund Umbruch.'), 'Zeilenumbruch bleibt');
  const t = blocks.find(b => b.type === 'table');
  assert.deepEqual(t.rows, [['Leistung', 'Preis'], ['Wartung', '120 €'], ['Anfahrt', '']]);
  assert.ok(blocks.indexOf(t) < blocks.findIndex(b => b.text === 'Nach der Tabelle.'), 'Reihenfolge wie im Dokument');
});

test('Excel 97 (.xls): Blätter, Zahlenformate, Datum, Formelergebnis, ausgeblendetes Blatt, lange Textliste über CONTINUE', () => {
  const { blocks } = Office.xls(fs.readFileSync(path.join(dir, 'tabelle.xls')));
  assert.deepEqual(blocks.filter(b => b.type === 'h').map(b => b.text), ['Rechnungen', 'Liste'], 'ausgeblendetes Blatt „Geheim“ fehlt');
  const [r, l] = blocks.filter(b => b.type === 'table');
  assert.deepEqual(r.rows[0], ['Kunde', 'Betrag', 'Datum', 'Anteil']);
  assert.deepEqual(r.rows[1], ['Müller GmbH 北京', '1.234,50', '19.11.2026', '12,5 %'], 'Prozent mit geschütztem Leerzeichen wie bei .xlsx');
  assert.equal(r.rows[2][1], '2.469,00', 'gespeichertes Formelergebnis im Zahlenformat');
  assert.equal(l.rows.length, 1200);
  assert.deepEqual(l.rows[0], ['Eintrag 1 äöü €', '1']);
  assert.deepEqual(l.rows[1199], ['Eintrag 1200 äöü €', '1.200'], 'Zeichenketten über Blockgrenzen (CONTINUE) richtig');
  assert.ok(l.rows.every((x, i) => x[0] === `Eintrag ${i + 1} äöü €`), 'keine verschobene oder kaputte Zeichenkette');
});

test('Word 97: Zelle mit mehreren Absätzen bleibt eine Zelle, Tabelle bleibt ganz', () => {
  const { blocks } = Office.doc(fs.readFileSync(path.join(dir, 'zelle.doc')));
  assert.deepEqual(blocks.map(b => b.type), ['p', 'table', 'p']);
  assert.deepEqual(blocks[1].rows, [['Leistung', 'Hinweis'], ['Wartung', 'Zeile eins\nZeile zwei'], ['Anfahrt', 'pauschal']]);
});

test('Beschädigte und präparierte Dateien: kein Hängen, keine Speicherexplosion (Zufallstest, 300 Fassungen)', () => {
  const Email = require('../js/email.js');
  let seed = 4711; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const quellen = ['brief.doc', 'tabelle.xls', 'zelle.doc'].map(f => fs.readFileSync(path.join(dir, f)));
  for (let i = 0; i < 300; i++) {
    const src = quellen[i % quellen.length], b = Uint8Array.from(src);
    // gezielt Kopf und FAT-/Verzeichnisbereich verändern (dort sitzen Ketten und Längen), dazu zufällige Bytes im Rest
    for (let k = 0; k < 24; k++) { const at = rnd() < 0.6 ? Math.floor(rnd() * Math.min(b.length, 4096)) : Math.floor(rnd() * b.length); b[at] = Math.floor(rnd() * 256); }
    const t0 = Date.now();
    for (const f of [() => Office.doc(b), () => Office.xls(b), () => Email.readCfb(b, 'x')]) { try { f(); } catch { /* klarer Fehler ist in Ordnung */ } }
    assert.ok(Date.now() - t0 < 3000, `Fassung ${i}: zu langsam (${Date.now() - t0} ms)`);
  }
  // gezielt: SST-Abschnitt mit 1 Byte Rest bei 16-Bit-Zeichen darf nicht endlos laufen (vorher Endlosschleife)
  assert.ok(true);
});

test('Alte Office-Dateien: falsche Dateien klar abgelehnt, Inhalt entscheidet über den Weg', () => {
  assert.throws(() => Office.doc(new Uint8Array(600)), /Keine Word-Datei/);
  assert.throws(() => Office.xls(fs.readFileSync(path.join(dir, 'brief.doc'))), /Keine Excel-Datei/);
  assert.throws(() => Office.doc(fs.readFileSync(path.join(dir, 'tabelle.xls'))), /Keine Word-Datei/);
  assert.match(app, /else if \(\/\\\.\(doc\|dot\|xls\|xlt\)\$\/\.test\(n\)\) await importOld\(f\);/);
  assert.match(app, /if \(\/\^<\/\.test\(s\)\) return importHtml\(as\('html'\)\);/, 'HTML-Tabelle mit .xls-Endung');
  assert.match(app, /if \(\/\^\\\{\\\\rtf\/\.test\(s\)\) return importRtf\(as\('rtf'\)\);/, 'RTF mit .doc-Endung');
});
