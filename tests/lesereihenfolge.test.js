// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Barrierefrei (PDF/UA, BFSG/BITV): Lesereihenfolge und Art der Blöcke von Hand korrigieren – Lücke Rang 8 der Wettbewerbsanalyse.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = require('../js/reflow.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Zweispaltige Seite: Überschrift, linke Spalte, rechte Spalte, Seitenzahl
const w = (t, x, y, h = 0.015) => ({ t, x, y, w: 0.05, h });
const line = (txt, x, y, h) => txt.split(' ').map((t, k) => w(t, x + k * 0.06, y, h));
const lines = [
  line('Jahresbericht', 0.1, 0.05, 0.035),
  line('Links steht der erste Absatz.', 0.1, 0.2),
  line('Rechts steht der zweite Absatz.', 0.55, 0.4),
  line('3', 0.5, 0.95),
];
const bs = R.blocks(lines, { words: true });
const kinds = bs.map(b => b.type === 'h' ? 'h' + b.level : b.type === 'li' ? 'li' : b.type === 'table' ? 'table' : 'p');

test('Lesereihenfolge: ohne Korrektur bleibt die automatische Gliederung', () => {
  const it = R.ordered(bs, kinds, null);
  assert.deepEqual(it.map(x => x.i), bs.map((_, i) => i));
  assert.ok(it.every(x => x.kind === x.auto));
  assert.equal(R.toRo(bs, it), null, 'unverändert → nichts speichern');
});

test('Lesereihenfolge: Reihenfolge und Art von Hand, Rundlauf über toRo', () => {
  assert.ok(bs.length >= 3, 'Blöcke erkannt: ' + bs.length);
  const it = R.ordered(bs, kinds, null).map(x => ({ ...x }));
  it.reverse(); it[0].kind = 'art';   // Seitenzahl nach vorn, aber „nicht vorlesen“
  const ro = R.toRo(bs, it);
  assert.ok(ro && ro.sig === R.sig(bs));
  const back = R.ordered(bs, kinds, ro);
  assert.deepEqual(back.map(x => x.i), it.map(x => x.i));
  assert.equal(back[0].kind, 'art');
  assert.deepEqual(back.slice(1).map(x => x.kind), it.slice(1).map(x => x.auto), 'nicht geänderte Arten bleiben automatisch');
});

test('Lesereihenfolge: veralteter Stand (Text neu erkannt) fällt auf automatisch zurück, Unsinniges wird ignoriert', () => {
  const ro = { sig: 'alt', seq: [{ i: 1, k: 'h1' }] };
  assert.deepEqual(R.ordered(bs, kinds, ro).map(x => x.i), bs.map((_, i) => i));
  // Text wird nie zur Tabelle, unbekannte Art und doppelte/fehlende Nummern
  const ro2 = { sig: R.sig(bs), seq: [{ i: 1, k: 'table' }, { i: 1, k: 'h1' }, { i: 0, k: 'quatsch' }, { i: 99, k: 'p' }] };
  const it = R.ordered(bs, kinds, ro2);
  assert.equal(it.length, bs.length, 'jeder Block genau einmal');
  assert.equal(it[0].i, 1); assert.equal(it[0].kind, kinds[1]);
  assert.equal(it[1].i, 0); assert.equal(it[1].kind, kinds[0]);
});

test('Lesereihenfolge: Blöcke mit dem vorigen verbinden – ein Tag, Art des vorigen, Rundlauf über toRo, Tabellen nie', () => {
  const it = R.ordered(bs, kinds, null).map(x => ({ ...x }));
  it[2].merge = true;   // dritten Block an den zweiten hängen
  const ro = R.toRo(bs, it);
  assert.deepEqual(ro.seq[2], { i: 2, k: '', m: 1 });
  const back = R.ordered(bs, kinds, ro), j = R.joined(back);
  assert.equal(j.length, bs.length - 1, 'ein Block weniger');
  assert.equal(j[1].b.text, `${bs[1].text} ${bs[2].text}`);
  assert.equal(j[1].b.ws.length, bs[1].ws.length + bs[2].ws.length, 'Wörter beider Blöcke');
  assert.equal(j[1].kind, back[1].kind, 'Art des vorigen');
  assert.equal(R.toRo(bs, R.ordered(bs, kinds, null)), null, 'ohne Verbinden nichts gespeichert');
  // Tabelle wird nicht verbunden
  const tab = [{ b: { type: 'p', text: 'a', ws: [] }, kind: 'p' }, { b: { type: 'table', cws: [] }, kind: 'table', merge: true }];
  assert.equal(R.joined(tab).length, 2);
  const pro = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(pro, /class="rojoin" aria-pressed="\$\{verbunden\}"/, 'Umschalter mit aria-pressed');
});

test('Lesereihenfolge: Umriss je Block für die nummerierten Kästen', () => {
  const b = R.box(bs[0]);
  assert.ok(b.x >= 0.09 && b.y >= 0.04 && b.w > 0 && b.h > 0);
  assert.equal(R.box({ ws: [] }), null);
});

test('Lesereihenfolge: Speichern als PDF/UA nutzt die korrigierte Gliederung, Dialog ist erreichbar', () => {
  assert.match(app, /for \(const \{ b, kind \} of Reflow\.joined\(readingBlocks\(p, words, isRunning\)\.items\)\)/, 'buildPdf taggt in der Reihenfolge von readingBlocks, verbundene Blöcke als ein Tag');
  assert.match(app, /Reflow\.ordered\(bs, bs\.map\(b => autoKind\(b, isRunning\)\), p\.ro\)/);
  assert.match(app, /kind === 'art'\) \{[^\n]*\n\s*T\.artifact\(\)/, '„Nicht vorlesen“ wird Artefakt');
  assert.match(app, /await readingOrder\(\{ flow: true \}\)/, 'Schritt in „PDF barrierefrei machen“');
  assert.match(html, /id="btnReadOrder"/); assert.match(html, /<dialog id="roDlg"/);
  // bedienbar ohne Maus: Knöpfe mit Beschriftung, Alt + Pfeiltaste
  const pro = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(pro, /e\.altKey && \(e\.key === 'ArrowUp' \|\| e\.key === 'ArrowDown'\)/);
  assert.match(pro, /aria-label="\$\{esc\(I18N\.t\(`Art von Block \$\{n \+ 1\}`\)\)\}"/);
});
