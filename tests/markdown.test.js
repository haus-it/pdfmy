// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tools.js');

// Wörter einer Zeile: gleichmäßig verteilt ab x, Höhe h
const line = (text, y, { x = 0.1, h = 0.012, bold = false, gap = 0.006 } = {}) => {
  let cx = x; return text.split(' ').map(t => { const w = { t, x: cx, y, w: t.length * h * 0.5, h, f: { bold } }; cx += w.w + gap; return w; });
};
const cells = (arr, y, xs) => arr.map((t, i) => ({ t, x: xs[i], y, w: t.length * 0.006, h: 0.012 }));

test('Überschrift, Absatz mit Silbentrennung, Aufzählung', () => {
  const page = [
    ...line('Mietvertrag', 0.05, { h: 0.024 }),
    ...line('Zwischen den Parteien wird folgender Ver-', 0.1),
    ...line('trag geschlossen und unterschrieben.', 0.116),
    ...line('• Miete monatlich', 0.16),
    ...line('• Kaution drei Monate', 0.176),
    ...line('Ende des Textes.', 0.22),
  ];
  const b = T.docBlocks([page]);
  assert.deepEqual(b.map(x => x.type), ['h', 'p', 'li', 'li', 'p']);
  assert.equal(b[0].level, 1);
  assert.equal(b[1].text, 'Zwischen den Parteien wird folgender Vertrag geschlossen und unterschrieben.');
  const md = T.toMarkdown(b);
  assert.match(md, /^# Mietvertrag\n\nZwischen den Parteien wird folgender Vertrag geschlossen und unterschrieben\.\n\n- Miete monatlich\n- Kaution drei Monate\n\nEnde des Textes\.\n$/);
});

test('Tabelle wird erkannt und als Markdown/HTML-Tabelle ausgegeben', () => {
  const xs = [0.1, 0.45, 0.75];
  const page = [cells(['Pos', 'Artikel', 'Betrag'], 0.1, xs), cells(['1', 'Papier', '12,50'], 0.12, xs), cells(['2', 'Toner', '89,00'], 0.14, xs)].flat();
  const b = T.docBlocks([page]);
  assert.equal(b.length, 1); assert.equal(b[0].type, 'table');
  assert.deepEqual(b[0].rows[2], ['2', 'Toner', '89,00']);
  assert.match(T.toMarkdown(b), /\| Pos \| Artikel \| Betrag \|\n\| --- \| --- \| --- \|\n\| 1 \| Papier \| 12,50 \|/);
  const html = T.toHtml(b, { title: 'Rechnung', lang: 'de-DE' });
  assert.match(html, /<html lang="de-DE">/);
  assert.match(html, /<th scope="col">Artikel<\/th>/);
  assert.match(html, /<td>89,00<\/td>/);
});

test('Sonderzeichen werden maskiert, Seitenwechsel markiert', () => {
  const b = T.docBlocks([line('Preis <netto> & *Rabatt*', 0.1), line('# kein Titel', 0.1)]);
  const md = T.toMarkdown(b), html = T.toHtml(b);
  assert.match(md, /Preis \\<netto\\> & \\\*Rabatt\\\*/);
  assert.match(md, /<!-- Seite 2 -->\n\n\\# kein Titel/);
  assert.match(html, /<p>Preis &lt;netto&gt; &amp; \*Rabatt\*<\/p>/);
  assert.match(html, /<hr aria-label="Seite 2">/);
});

test('Nummerierte Liste und fette Zwischenüberschrift', () => {
  const page = [...line('Leistungen', 0.1, { bold: true }), ...line('1. Beratung vor Ort', 0.13), ...line('2. Einrichtung', 0.146)];
  const b = T.docBlocks([page]);
  assert.deepEqual(b.map(x => x.type + (x.level || '')), ['h3', 'li', 'li']);
  assert.match(T.toMarkdown(b), /### Leistungen\n\n1\. Beratung vor Ort\n2\. Einrichtung/);
  assert.match(T.toHtml(b), /<ol>\n<li>Beratung vor Ort<\/li>\n<li>Einrichtung<\/li>\n<\/ol>/);
});
