// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Browser-Kompatibilität (app-v356): Mindestbasis Safari/iOS 15.4 (iPhone 6s/7 mit iOS 15), Firefox 115 ESR, Chrome 109 (letzte
   Fassung für Windows 7/8.1). Eine einzige neuere Sprachfunktion (z. B. Regex-Lookbehind vor Safari 16.4) verhindert, dass die GANZE
   Datei lädt – dann fehlt z. B. die komplette Word-/PowerPoint-Umwandlung. Neuere Schnittstellen nur mit Ausweichweg.
   Geprüft wird der eigene Code (js/, sw.js); Bibliotheken unter vendor/ bringen ihre eigenen Ausweichwege mit. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = path.join(__dirname, '..');
const files = [...fs.readdirSync(path.join(A, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f), 'sw.js'];
const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(A, f), 'utf8')]));
// Zeilen ohne Kommentare (grob: // bis Zeilenende, /* … */ einzeilig) – Hinweise im Kommentar zählen nicht
const lines = f => src[f].split('\n').map((l, i) => [i + 1, l.replace(/\/\*.*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/, '$1')]);
const find = (re, ok = () => false) => { const out = []; for (const f of files) for (const [n, l] of lines(f)) if (re.test(l) && !ok(l, f)) out.push(`${f}:${n}: ${l.trim().slice(0, 120)}`); return out; };

test('Kein Sprachmittel, das ältere Browser schon beim Laden der Datei scheitern lässt', () => {
  // Regex-Lookbehind (Safari 16.4) – erlaubt nur als Zeichenkette hinter der Prüfung LOOKBEHIND (js/app.js searchRe)
  assert.deepEqual(find(/\(\?<[=!]/, l => /LOOKBEHIND/.test(l) || /new RegExp\('\(\?<!a\)b'\)/.test(l)), [], 'Regex-Lookbehind');
  assert.deepEqual(find(/\bstatic\s*\{/), [], 'static-Block in Klassen (Safari 16.4)');
  assert.deepEqual(find(/\/[a-z]*v[a-z]*\.test\(|new RegExp\([^)]*,\s*'[a-z]*v[a-z]*'\)/), [], 'Regex-Flag v (Safari 17, Chrome 112)');
});

test('Keine neueren Schnittstellen ohne Ausweichweg', () => {
  const rules = [
    [/\.(toSorted|toReversed|toSpliced)\(/, 'toSorted/toReversed/toSpliced (Safari 16, Chrome 110)'],
    [/\b(Object|Map)\.groupBy\(/, 'Object.groupBy (Safari 17.4, Firefox 124, Chrome 117)'],
    [/Promise\.withResolvers/, 'Promise.withResolvers (Safari 17.4, Firefox 121, Chrome 119)'],
    [/Array\.fromAsync/, 'Array.fromAsync (Safari 16.4, Chrome 121)'],
    [/\.(isWellFormed|toWellFormed)\(/, 'isWellFormed (Safari 16.4, Chrome 111)'],
    [/AbortSignal\.any\(/, 'AbortSignal.any (Safari 17.4)'],
    [/\.(symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, 'Set-Methoden (Safari 17, Firefox 127)'],
    [/RegExp\.escape|Uint8Array\.fromBase64|\.toBase64\(/, 'RegExp.escape/Base64 (sehr neu)'],
    [/Intl\.Segmenter/, 'Intl.Segmenter (Firefox 125)'],
    [/\.roundRect\(/, 'roundRect (Safari 16, Firefox 112)'],
  ];
  for (const [re, what] of rules) assert.deepEqual(find(re), [], what);
});

test('Schnittstellen mit Ausweichweg: AbortSignal.timeout, DecompressionStream, OffscreenCanvas', () => {
  // AbortSignal.timeout (Safari 16): Ersatz in js/app.js, vor jeder Verwendung geladen
  assert.match(src['js/app.js'], /typeof AbortSignal\.timeout !== 'function'\) AbortSignal\.timeout =/);
  // DecompressionStream (Safari 16.4): jede Datei, die ihn nutzt, hat einen Weg ohne ihn
  for (const f of files) if (/new DecompressionStream\(/.test(src[f])) assert.match(src[f], /typeof DecompressionStream === 'undefined'/, f);
  // OffscreenCanvas nur im Worker bzw. nach Prüfung
  assert.deepEqual(find(/new OffscreenCanvas\(/, l => /typeof document === 'undefined'/.test(l)), [], 'OffscreenCanvas ungeprüft');
});

test('CSS: Fokusrahmen bleibt ohne color-mix() sichtbar (Barrierefreiheit, Safari < 16.2, Chrome < 111)', () => {
  const html = fs.readFileSync(path.join(A, 'index.html'), 'utf8');
  assert.match(html, /@supports not \(color:color-mix\(in srgb,red 50%,blue\)\)\{:root\{--ring:0 0 0 3px var\(--accent\)!important;--hover:var\(--accent-soft\)!important\}\}/);
});

test('Word-Datei öffnen ohne DecompressionStream (Safari unter 16.4): Entpacken mit pako', async () => {
  globalThis.self = globalThis;
  const saved = globalThis.DecompressionStream;
  delete globalThis.DecompressionStream;
  try {
    globalThis.pako = require('../vendor/utif/pako_inflate.min.js');
    const Office = require('../js/office.js');
    const d = await Office.docx(new Uint8Array(fs.readFileSync(path.join(A, 'tests', 'office-korpus', 'diagramm', 'word-diagramm.docx'))));
    assert.equal(d.blocks[0].text, 'Jahresbericht 2026');
    assert.ok(d.blocks.some(b => b.type === 'chart'), 'Diagramm aus dem gepackten Teil gelesen');
  } finally { globalThis.DecompressionStream = saved; delete globalThis.pako; }
});

test('Ersatz für Lookbehind liefert dasselbe Ergebnis', () => {
  // Tabellenzellen (js/textpdf.js): „\|“ trennt nicht
  const cells = l => l.trim().replace(/^\||\|$/g, '').replace(/\\\|/g, '\u0001').split('|').map(c => c.replace(/\u0001/g, '\\|').trim());
  assert.deepEqual(cells('| a | b \\| c | d |'), ['a', 'b \\| c', 'd']);
  // Umbruch nach Bindestrich (js/slides.js): „Mitglieder-Versammlung“ trennbar, „-5“ und „A - B“ nicht
  const hy = w => w.replace(/([^\s-][-–])(?=[^\s\d-])/g, '$1\u0001').split('\u0001');
  assert.deepEqual(hy('Mitglieder-Versammlung'), ['Mitglieder-', 'Versammlung']);
  assert.deepEqual(hy('Nord-Süd-Achse'), ['Nord-', 'Süd-', 'Achse']);
  assert.deepEqual(hy('Seite-5'), ['Seite-5']);
  assert.deepEqual(hy('--x'), ['--x']);
  // Gleiches Ergebnis wie mit Lookbehind (Node kann ihn) für eine Reihe von Wörtern
  for (const w of ['a-b', 'x–y-z', 'E-Mail-Adresse', '1-2', 'ab--cd', 'a- b', '-a', 'a-']) assert.deepEqual(hy(w), w.split(new RegExp('(?<=[^\\s-][-–])(?=[^\\s\\d-])')), w);
});
