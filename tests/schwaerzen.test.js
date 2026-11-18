// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Schwärzen (Hinweis eines Nutzers 18.11.2026: „Text darunter lässt sich weiter markieren und kopieren“): Geschwärztes darf nirgends
// mehr auftauchen – nicht in der gespeicherten PDF, der Textansicht („Text kopieren“), Exporten oder Dokumenteigenschaften/Dateiname.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// Hilfsfunktionen aus app.js laden (ohne Browser)
const grab = re => { const m = app.match(re); assert.ok(m, 'fehlt: ' + re); return m[0]; };
const code = [
  grab(/^const overlaps = .*$/m),
  grab(/^const coversOf = .*$/m), grab(/^const unredacted = .*$/m), grab(/^const redTok = .*$/m),
  grab(/^function redactedTokens\(pages\) \{[\s\S]*?\n\}/m), grab(/^const leaks = .*$/m),
  grab(/^function scrubMeta\([\s\S]*?\n\}/m),
].join('\n');
const H = new Function('state', code + '\nreturn { coversOf, unredacted, redactedTokens, leaks, scrubMeta };');

const word = (t, x, y) => ({ t, x, y, w: 0.3, h: 0.02 });
const page = () => ({
  annots: [{ type: 'rd', x: 0.1, y: 0.1, w: 0.5, h: 0.03 }],
  nwords: [word('Hans Geheimname GmbH', 0.12, 0.105), word('Betrag 120,00 EUR', 0.12, 0.5), word('Kd.-Nr. 77341', 0.12, 0.2)],
});

test('Schwärzen: verdeckte Wörter fehlen in Text und Exporten', () => {
  const p = page(), h = H({ pages: [p] });
  const ws = h.unredacted(p, p.nwords).map(w => w.t);
  assert.deepEqual(ws, ['Betrag 120,00 EUR', 'Kd.-Nr. 77341']);
  assert.equal(h.unredacted({ annots: [] }, p.nwords).length, 3, 'ohne Schwärzung bleibt alles');
  // Alle Wege nutzen die gefilterten Wörter
  assert.match(app, /const pageText = p => \{\n  if \(!coversOf\(p\)\.length\)/, 'Textansicht/Kopieren/Ablage-Suche');
  assert.match(app, /async function pageWords\(p\) \{\n  if \(p\.ocr\?\.words\) return unredacted\(p, p\.ocr\.words\);/, 'Word-Export, Ersetzen');
  assert.equal((app.match(/unredacted\(p, p\.ocr\?\.words \|\| \(p\.kind === 'pdf' && p\.native/g) || []).length, 3, 'Excel, Markdown/HTML, PowerPoint');
  assert.match(app, /words = \(p\.ocr\?\.words \|\| words \|\| \[\]\)\.filter\(w => !cover\.some\(a => overlaps\(a, w\)\)\)/, 'PDF: Textebene ohne Verdecktes');
  assert.match(app, /const rasterOf = p => p\.kind === 'image' \|\| p\.annots\.some\(a => a\.type === 'rd'/, 'PDF: geschwärzte Seite wird Bild');
});

test('Schwärzen: Briefdaten unter der Schwärzung nicht in Dateiname und Dokumenteigenschaften', () => {
  const p = page(), h = H({ pages: [p] });
  const red = h.redactedTokens([p]);
  assert.ok(red.has('geheimname') && red.has('gmbh'));
  assert.ok(!red.has('betrag'), 'Sichtbares bleibt');
  const m = h.scrubMeta({ type: 'Rechnung', sender: 'Hans Geheimname GmbH', customerNo: '77341', date: '01.11.2026' }, red);
  assert.equal(m.sender, '', 'Absender geschwärzt');
  assert.equal(m.customerNo, '77341', 'nicht geschwärzte Kundennummer bleibt');
  assert.equal(m.type, 'Rechnung');
  assert.equal(h.leaks('der und die', red), false, 'Füllwörter zählen nicht');
  assert.match(app, /return Letter\.buildFilename\(scrubMeta\(state\.meta\)\);/, 'Dateiname');
  assert.match(app, /const isCur = meta === state\.meta; meta = scrubMeta\(meta, red\);/, 'Titel, Autor, Stichwörter');
});
