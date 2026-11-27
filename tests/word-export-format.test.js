// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// „PDF → Word“ mit Formatierung (app-v357, Meldung 2026-0012): bisher nur Text und Gliederung. Jetzt Schriftart, Größe, fett/kursiv,
// Ausrichtung, Einzug, Seitenformat und Ränder aus der PDF; ohne Wortpositionen (reiner Text) unverändert wie bisher.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tools.js'), Reflow = require('../js/reflow.js'), Office = require('../js/office.js');

const W = 595.3, H = 841.9;
// Wort in pt (x, y oben links, Schriftgrad) → Seitenmaße 0…1 wie aus der Textebene (Höhe = Schriftgrad)
const word = (t, x, y, pt, f = {}) => ({ t, x: x / W, y: y / H, w: t.length * pt * 0.5 / W, h: pt / H, f: { font: 'times', bold: false, italic: false, ...f } });
const line = (y, items, pt = 11, f) => { let x = items.x ?? 70; return (items.ws || items).map(t => { const w = word(t, x, y, pt, f); x += t.length * pt * 0.5 + pt * 0.3; return w; }); };
async function docXml(z) { const zip = Office.readZip(z); return new TextDecoder().decode(await zip.get('word/document.xml')); }
async function stylesXml(z) { const zip = Office.readZip(z); return new TextDecoder().decode(await zip.get('word/styles.xml')); }

function letter() {
  const title = 'Jahresbericht'; const tw = title.length * 20 * 0.5;
  const lines = [
    line(60, { ws: [title], x: (W - tw) / 2 }, 20, { bold: true }),   // zentriert, 20 pt, fett
    line(120, { ws: ['Paderborn,', '27.11.2026'], x: 420 }, 11),   // rechtsbündig (endet am rechten Rand)
    line(160, ['Sehr', 'geehrte', 'Damen', 'und', 'Herren,']),
    [...line(190, ['der', 'Verein', 'hat']), word('ausdrücklich', 70 + 60, 190, 11, { italic: true }), ...line(190, { ws: ['beschlossen.'], x: 200 })],
    line(220, { ws: ['Eingerückter', 'Absatz', 'mit', 'Text', 'bis', 'zum', 'rechten', 'Rand', 'der', 'Seite', 'hin.'], x: 120 }),
  ];
  // rechter Rand der Seite durch eine lange Zeile festlegen
  lines.push(line(260, ['Eine', 'lange', 'Zeile', 'Fließtext', 'die', 'bis', 'an', 'den', 'rechten', 'Seitenrand', 'reicht', 'und', 'ihn', 'festlegt', 'hier.']));
  return lines;
}

test('Word mit Formatierung: Schrift, Größe, fett, kursiv, zentriert, rechtsbündig, Einzug, Seitenformat', async () => {
  const lines = letter(), right = Math.max(...lines.flat().map(w => w.x + w.w)) * W;
  // Datumszeile genau an den rechten Rand schieben
  const d = lines[1], sh = (right - Math.max(...d.map(w => (w.x + w.w) * W))) / W; for (const w of d) w.x += sh;
  const blocks = Reflow.blocks(lines, { words: true });
  const z = T.docx([{ blocks, size: [W, H] }], { title: 'Test' });
  const x = await docXml(z), s = await stylesXml(z);
  assert.match(s, /w:rFonts w:ascii="Times New Roman"/, 'Grundschrift aus der PDF');
  assert.match(s, /<w:sz w:val="22"\/>/, 'Grundgröße 11 pt');
  // Überschrift: zentriert, 20 pt (40 halbe Punkte), fett
  assert.match(x, /<w:jc w:val="center"\/><\/w:pPr><w:r><w:rPr><w:b\/><w:sz w:val="40"\/>[^]*?Jahresbericht/);
  // Datum rechtsbündig
  assert.match(x, /<w:jc w:val="right"\/><\/w:pPr><w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t xml:space="preserve">Paderborn, 27\.11\.2026/);
  // kursives Wort als eigener Lauf, davor und danach normal
  assert.match(x, /<w:r><w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">ausdrücklich ?<\/w:t><\/w:r>/);
  assert.match(x, /der Verein hat /);
  // Einzug ~50 pt = 1000 Twips
  const ind = +(/<w:ind w:left="(\d+)"\/>/.exec(x) || [])[1]; assert.ok(ind > 900 && ind < 1100, 'Einzug ' + ind);
  // Seitenformat A4 und linker Rand ~70 pt
  assert.match(x, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  const left = +/w:left="(\d+)" w:header/.exec(x)[1]; assert.ok(Math.abs(left - 1400) < 20, 'linker Rand ' + left);
});

test('Querformat und Texterkennung (ohne Schriftangaben): Größen relativ, Seitenformat quer', async () => {
  const ocrWord = (t, x, y, h) => ({ t, x, y, w: t.length * 0.012, h });
  const blocks = Reflow.blocks([[ocrWord('Titel', 0.1, 0.1, 0.04)], [ocrWord('Normaler', 0.1, 0.25, 0.02), ocrWord('Text', 0.22, 0.25, 0.02)], [ocrWord('Weiter', 0.1, 0.3, 0.02), ocrWord('so.', 0.2, 0.3, 0.02)]], { words: true });
  const z = T.docx([{ blocks, size: [842, 595], ocr: true }]), x = await docXml(z);
  assert.match(x, /w:orient="landscape"/);
  assert.match(x, /<w:sz w:val="44"\/>[^]*?Titel/, 'doppelt so hoch wie der Fließtext → 22 pt');
  assert.doesNotMatch(x, /<w:b\/>[^]*?Normaler/, 'ohne Schriftangaben kein Fettdruck geraten');
});

test('Ohne Wortpositionen bleibt der Word-Export wie bisher', async () => {
  const z = T.docx([[{ type: 'h', level: 1, text: 'Rechnung' }, { type: 'p', text: 'Text' }]]), x = await docXml(z);
  assert.match(x, /<w:pStyle w:val="berschrift1"\/>/);
  assert.match(x, /<w:pgSz w:w="11906" w:h="16838"\/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418"/);
});
