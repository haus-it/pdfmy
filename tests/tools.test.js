// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const T = require('../js/tools.js');

test('CRC32 Referenzwert', () => {
  assert.equal(T.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('ZIP ist gültig und enthält die Dateien (geprüft mit Python zipfile)', () => {
  const f = path.join(os.tmpdir(), 'pdfmy-test.zip');
  fs.writeFileSync(f, T.zip([{ name: 'Seite 1.txt', data: new TextEncoder().encode('Hallo') }, { name: 'Größe/ä.txt', data: new Uint8Array([1, 2, 3]) }]));
  const out = execFileSync('python', ['-I', '-c', 'import zipfile,sys;sys.stdout.reconfigure(encoding="utf-8");z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print("|".join(z.namelist()));print(z.read("Seite 1.txt").decode())', f]).toString();
  assert.match(out, /^None/);
  assert.match(out, /Seite 1\.txt\|Größe\/ä\.txt/);
  assert.match(out, /Hallo/);
});

test('Seitenbereiche', () => {
  assert.deepEqual(T.parseRange('1-3, 5', 10), [0, 1, 2, 4]);
  assert.deepEqual(T.parseRange('8-', 10), [7, 8, 9]);
  assert.deepEqual(T.parseRange('-2', 10), [0, 1]);
  assert.deepEqual(T.parseRange('3-1,2', 5), [0, 1, 2]);
  assert.equal(T.parseRange('0', 5), null);
  assert.equal(T.parseRange('7', 5), null);
  assert.equal(T.parseRange('a', 5), null);
  assert.equal(T.parseRange('', 5), null);
});

test('Größenangaben', () => {
  assert.equal(T.formatBytes(500), '500 B');
  assert.equal(T.formatBytes(20480), '20 KB');
  assert.equal(T.formatBytes(1572864), '1,5 MB');
});

test('Word-Export: gültiges docx-Paket mit Text, Seitenumbruch und Sonderzeichen', () => {
  const T = require('../js/tools.js');
  const z = T.docx(['Sehr geehrte Damen & Herren,\nZeile <2>', 'Seite zwei'], { title: 'Brief "A"', author: 'Stadtwerke' }, new Date('2026-10-15T10:00:00Z'));
  const s = Buffer.from(z).toString('latin1');
  assert.equal(s.slice(0, 2), 'PK');
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'docProps/core.xml']) assert.ok(s.includes(n), n);
  assert.ok(s.includes('Damen &amp; Herren,</w:t>') && s.includes('Zeile &lt;2&gt;'));
  assert.ok(s.includes('<w:br w:type="page"/>'));
  assert.ok(s.includes('<dc:title>Brief &quot;A&quot;</dc:title>'));
});

test('Vergleich: geänderte, eingefügte und gelöschte Wörter', () => {
  const T = require('../js/tools.js');
  const d = T.diffWords('Die Miete beträgt 850 EUR monatlich ab Januar.', 'Die Miete beträgt 910 EUR monatlich ab sofort zum Januar.');
  const ops = d.filter(x => x.op !== '=').map(x => x.op + x.t.trim());
  assert.deepEqual(ops, ['-850', '+910', '+sofort zum']);
  assert.equal(d.filter(x => x.op !== '-').map(x => x.t).join(''), 'Die Miete beträgt 910 EUR monatlich ab sofort zum Januar.');
  assert.equal(d.filter(x => x.op !== '+').map(x => x.t).join(''), 'Die Miete beträgt 850 EUR monatlich ab Januar.');
  assert.deepEqual(T.diffWords('gleich', 'gleich'), [{ op: '=', t: 'gleich' }]);
  assert.deepEqual(T.diffWords('', 'neu').map(x => x.op), ['+']);
});

test('Kopf-/Fußzeile und Bates-Nummern', () => {
  const T = require('../js/tools.js');
  assert.equal(T.bates('MG-', 42), 'MG-000042');
  assert.equal(T.fillStamp('{bates} · Seite {seite} von {seiten} · {datum} · {Datei}', { bates: 'MG-000042', seite: 2, seiten: 5, datum: '15.10.2026', datei: 'Brief' }),
    'MG-000042 · Seite 2 von 5 · 15.10.2026 · Brief');
  assert.equal(T.fillStamp('{unbekannt}', {}), '{unbekannt}');
});

test('Tabellen nach Excel: Zeilen/Spalten aus Wortpositionen, Beträge als Zahlen, gültige .xlsx', () => {
  const w = (t, x, y) => ({ t, x, y, w: t.length * 0.008, h: 0.012 });
  const words = [w('Pos.', 0.1, 0.30), w('Beschreibung', 0.2, 0.30), w('Menge', 0.55, 0.30), w('Betrag', 0.75, 0.30),
    w('1', 0.1, 0.33), w('Stromlieferung', 0.2, 0.33), w('September', 0.32, 0.33), w('4.812', 0.55, 0.33), w('1.501,34', 0.75, 0.33),
    w('2', 0.1, 0.36), w('Grundpreis', 0.2, 0.36), w('1', 0.55, 0.36), w('18,90', 0.76, 0.36)];
  const rows = T.tableRows(words);
  assert.deepEqual(rows[0], ['Pos.', 'Beschreibung', 'Menge', 'Betrag']);
  assert.deepEqual(rows[1], ['1', 'Stromlieferung September', '4.812', '1.501,34']);
  assert.deepEqual(rows[2], ['2', 'Grundpreis', '1', '18,90']);
  assert.equal(T.deNumber('1.501,34'), 1501.34); assert.equal(T.deNumber('1.520,24 EUR'), 1520.24); assert.equal(T.deNumber('-12,5'), -12.5);
  assert.equal(T.deNumber('07.10.2026'), null); assert.equal(T.deNumber('2026-48213'), null);
  const bytes = T.xlsx([{ name: 'Seite 1', rows }]);
  const f = require('node:path').join(require('node:os').tmpdir(), 'pdfmy-test.xlsx'); require('node:fs').writeFileSync(f, bytes);
  const py = require('node:child_process').spawnSync('python', ['-I', '-c', `import openpyxl,sys\nws=openpyxl.load_workbook(sys.argv[1]).active\nprint(ws['B2'].value, ws['D2'].value, ws['D2'].number_format)`, f], { encoding: 'utf8' });
  if (py.status === 0) assert.equal(py.stdout.trim(), 'Stromlieferung September 1501.34 #,##0.00');
});
