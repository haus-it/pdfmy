// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Schnellerer Erstbesuch (app-v338): Dialoge als <template> ausliefern, laden.js setzt sie vor den Programmteilen ein.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('index.html: alle Dialoge einzeln abgrenzbar (keine Verschachtelung), genug für die Umwandlung', () => {
  const html = R('index.html'), dlg = html.match(/<dialog\b[\s\S]*?<\/dialog>/g) || [];
  assert.ok(dlg.length >= 20, `${dlg.length} Dialoge`);
  assert.deepEqual(dlg.filter(d => (d.match(/<dialog\b/g) || []).length > 1).map(d => d.slice(0, 60)), []);
  assert.equal((html.match(/<dialog\b/g) || []).length, dlg.length, 'jeder Dialog ist geschlossen');
  assert.ok(!/<template class="dlgtpl">/.test(html), 'Quelle bleibt unverändert (Umwandlung nur beim Bauen für pdfmy.de)');
});

test('Bauwerkzeug und Lader: Vorlagen beim Bauen, Einsetzen vor dem ersten Programmteil', () => {
  const b = R('tools/build-web.js'), l = R('js/laden.js');
  assert.match(b, /const templateDialogs = h =>/);
  assert.match(b, /html = templateDialogs\(html\);\s*\r?\n\s*write\('index\.html', html\);/);
  // Einsetzen steht am Anfang von start() – vor dem Anlegen der <script>-Elemente
  const s = l.indexOf('function start()'), ins = l.indexOf("querySelectorAll('template.dlgtpl')"), scr = l.indexOf("createElement('script')");
  assert.ok(s > 0 && ins > s && scr > ins, 'Reihenfolge: start → Dialoge einsetzen → Skripte');
  assert.match(l, /tp\[i\]\.replaceWith\(tp\[i\]\.content\)/, 'an derselben Stelle, Inhalt statt Vorlage');
});

test('Übersetzung erfasst später eingesetzte Dialoge (MutationObserver auf childList/subtree)', () => {
  const i = R('js/i18n.js');
  assert.match(i, /new MutationObserver/);
  assert.match(i, /childList: true, subtree: true/);
  assert.match(i, /for \(const n of m\.addedNodes\)/);
});
