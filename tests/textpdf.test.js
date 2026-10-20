// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const TP = require('../js/textpdf.js');

const V = p => fs.readFileSync(path.join(__dirname, '..', 'vendor', p));
const fonts = { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf') };
// Text einer PDF mit pypdf lesen (unabhängige Prüfung)
const pdfText = bytes => {
  const f = path.join(os.tmpdir(), 'pdfmy-textpdf.pdf'); fs.writeFileSync(f, bytes);
  return execFileSync('python', ['-I', '-c', 'import pypdf,sys;sys.stdout.reconfigure(encoding="utf-8");r=pypdf.PdfReader(sys.argv[1],strict=True);print(len(r.pages));print("\\n".join(p.extract_text() for p in r.pages))', f]).toString();
};

test('CSV: Trennzeichen erkennen, Anführungszeichen, Zeilenumbruch im Feld, BOM', () => {
  assert.deepEqual(TP.parseCsv('﻿Name;Betrag\n"Müller; Max";"1.234,50"\n"Zeile\nzwei";3\n'), [['Name', 'Betrag'], ['Müller; Max', '1.234,50'], ['Zeile\nzwei', '3']]);
  assert.deepEqual(TP.parseCsv('a,b,c\r\n1,"x ""y""",3'), [['a', 'b', 'c'], ['1', 'x "y"', '3']]);
  assert.deepEqual(TP.parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('Markdown: Überschriften, Listen, Tabelle, Code, Zitat, Inline-Auszeichnung', () => {
  const b = TP.parseMarkdown('# Titel\n\nText mit **fett** und [Link](https://pdfmy.de).\n\n- eins\n- [x] erledigt\n1. erste\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```\ncode  hier\n```\n> Zitat\n\n---');
  assert.deepEqual(b.map(x => x.type), ['h', 'p', 'li', 'li', 'li', 'table', 'code', 'quote', 'hr']);
  assert.equal(b[1].text, 'Text mit fett und Link (https://pdfmy.de).');
  assert.equal(b[3].text, '☑ erledigt');
  assert.equal(b[4].label, '1.');
  assert.deepEqual(b[5].rows, [['A', 'B'], ['1', '2']]);
  assert.equal(b[6].text, 'code  hier');
});

test('Markdown → PDF: Text vollständig und auffindbar (pypdf strict)', async () => {
  const bytes = await TP.build(L, { kind: 'md', title: 'notiz', fonts, text: '# Angebot\n\nSehr geehrte Damen und Herren,\n\n- Glasfaser\n- Cloud-Telefonie\n\n| Pos | Preis |\n|---|---|\n| 1 | 99,00 € |' });
  const t = pdfText(bytes);
  assert.match(t, /^1\r?\n/);
  for (const w of ['Angebot', 'Sehr geehrte Damen und Herren,', 'Glasfaser', 'Cloud-Telefonie', 'Pos', '99,00 €']) assert.ok(t.includes(w), w);
});

test('CSV → PDF: lange Tabelle über mehrere Seiten, Kopf wiederholt, viele Spalten quer', async () => {
  const rows = ['Nr;Name;Betrag', ...Array.from({ length: 120 }, (_, i) => `${i + 1};Kunde ${i + 1};${(i * 3.5).toFixed(2).replace('.', ',')}`)].join('\n');
  const bytes = await TP.build(L, { kind: 'csv', title: 'liste.csv', fonts, text: rows });
  const t = pdfText(bytes), n = +t.split('\n')[0];
  assert.ok(n >= 3, 'mehrere Seiten: ' + n);
  assert.equal((t.match(/Nr\s*Name\s*Betrag/g) || []).length, n, 'Kopfzeile auf jeder Seite');
  assert.ok(t.includes('Kunde 120'));
  const wide = await TP.build(L, { kind: 'csv', fonts, text: 'a;b;c;d;e;f;g;h\n1;2;3;4;5;6;7;8' });
  const d = await L.PDFDocument.load(wide), { width, height } = d.getPage(0).getSize();
  assert.ok(width > height, 'quer bei 8 Spalten');
});

test('Text → PDF: Leerzeichen und Umlaute bleiben, lange Zeilen werden umbrochen', async () => {
  const long = 'Wort '.repeat(60).trim();
  const bytes = await TP.build(L, { kind: 'txt', fonts, text: 'Grüße aus Paderborn – ÄÖÜß €\n' + long });
  const t = pdfText(bytes);
  assert.ok(t.includes('Grüße aus Paderborn – ÄÖÜß €'));
  assert.equal((t.match(/Wort/g) || []).length, 60);
});
