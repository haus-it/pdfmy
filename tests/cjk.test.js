// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Chinesisch, Japanisch, Koreanisch beim Umwandeln (Word, Excel, Text, Webseiten, Übersetzung): Ersatzschrift aus vendor/cjk statt „?“.
// Die Schrift entsteht mit tools/cjk-schrift.py aus Noto Sans CJK (SIL OFL 1.1); geladen wird sie nur bei Bedarf und als Teilmenge eingebettet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js'), TextPdf = require('../js/textpdf.js');
const V = p => fs.readFileSync(path.join(__dirname, '..', 'vendor', p));
const fonts = extra => ({ fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), mono: V('dejavu/DejaVuSansMono.ttf'), ...extra });
const cjkFile = path.join(__dirname, '..', 'vendor', 'cjk', 'PDFMyCJK-Regular.ttf.gz');
const cjk = () => Promise.resolve(zlib.gunzipSync(fs.readFileSync(cjkFile)));
const fontNames = async bytes => { const d = await PDFLib.PDFDocument.load(bytes); return d.context.enumerateIndirectObjects().map(([, o]) => o?.get?.(PDFLib.PDFName.of('BaseFont'))).filter(Boolean).map(String); };

test('Ersatzschrift vorhanden, umbenannt (OFL), mit Lizenz, nur CJK-Bereiche', () => {
  assert.ok(fs.existsSync(cjkFile), 'vendor/cjk/PDFMyCJK-Regular.ttf.gz');
  assert.ok(fs.statSync(cjkFile).size < 14 * 1048576, 'höchstens 14 MB gepackt');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'licenses', 'font-noto-cjk.txt'), 'utf8'), /SIL Open Font License/);
  const f = fontkit.create(zlib.gunzipSync(fs.readFileSync(cjkFile)));
  assert.equal(f.postscriptName, 'PDFMyCJK-Regular', 'Reserved Font Name „Noto“ nicht in der geänderten Fassung');
  assert.ok(!f.directory.tables.CFF && f.directory.tables.glyf, 'TrueType-Umrisse');
  for (const ch of '漢字東京北京서울こんにちはカタカナ「」、。') assert.ok(f.hasGlyphForCodePoint(ch.codePointAt(0)), ch);
});

test('Text mit chinesischen, japanischen und koreanischen Zeichen: Ersatzschrift als Teilmenge, kleiner Zuwachs', async () => {
  const blocks = [{ type: 'h', level: 1, text: '会议纪要 – Protokoll' }, { type: 'p', text: '漢字と日本語のテキスト。'.repeat(30) }, { type: 'table', rows: [['이름', 'Betrag'], ['김민준', '1.234,50']], head: true }];
  let geladen = 0;
  const pdf = await TextPdf.build(PDFLib, { blocks, title: '测试', fonts: fonts({ cjk: () => { geladen++; return cjk(); } }) });
  assert.equal(geladen, 1, 'genau einmal geladen');
  assert.ok((await fontNames(pdf)).some(n => /PDFMyCJK/.test(n)), 'Ersatzschrift eingebettet');
  assert.ok(pdf.length < 400 * 1024, `Teilmenge statt ganzer Schrift (${pdf.length} Bytes)`);
  // ohne Schrift (offline, nicht geladen): wie bisher „?“, kein Fehler
  const ohne = await TextPdf.build(PDFLib, { blocks, title: 't', fonts: fonts({ cjk: () => Promise.reject(new Error('offline')) }) });
  assert.ok(!(await fontNames(ohne)).some(n => /PDFMyCJK/.test(n)));
});

test('Rein lateinischer Text und Emojis laden die Ersatzschrift nie', async () => {
  let geladen = 0;
  await TextPdf.build(PDFLib, { text: 'Grüße aus Paderborn – € 12,50 „Zitat“ 😀 ✅', fonts: fonts({ cjk: () => { geladen++; return cjk(); } }) });
  assert.equal(geladen, 0);
});

test('Umbruch: lange chinesische Zeile ohne Leerzeichen wird umbrochen statt über den Rand zu laufen', async () => {
  const kurz = await TextPdf.build(PDFLib, { blocks: [{ type: 'p', text: '中'.repeat(40) }], fonts: fonts({ cjk }) });
  const lang = await TextPdf.build(PDFLib, { blocks: [{ type: 'p', text: '中'.repeat(4000) }], fonts: fonts({ cjk }) });
  const seiten = async b => (await PDFLib.PDFDocument.load(b)).getPageCount();
  assert.equal(await seiten(kurz), 1);
  assert.ok(await seiten(lang) >= 2, '4000 Zeichen à 10,5 pt (rund 45 je Zeile) brauchen mehrere Seiten');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /self\.pdfmyCjkFont = cjkFont;/); assert.match(app, /new DecompressionStream\('gzip'\)/);
});
