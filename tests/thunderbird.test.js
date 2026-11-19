// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Thunderbird-Add-on 1.0.1 nach der Prüfung durch addons.thunderbird.net (19.11.2026): kein async-Listener, keine unnötige
// Berechtigung „tabs“, Rechtsklick auf Anhänge findet die Nachricht auch ohne getDisplayedMessage, Ladeanzeige im Tab.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const DIR = path.join(__dirname, '..', 'tools', 'pdfmy-thunderbird');
const J = x => JSON.parse(JSON.stringify(x));   // Objekte aus dem VM-Kontext vergleichbar machen

function load({ displayed = null, displayedList = [], selected = [], attachments = {} } = {}) {
  const calls = { tabs: [], listeners: [], menus: [] };
  const messenger = {
    i18n: { getMessage: k => k },
    runtime: { onMessage: { addListener: f => calls.listeners.push(f) }, lastError: null, getBackgroundPage: async () => ({}) },
    tabs: { create: async o => { calls.tabs.push(o.url); return {}; }, query: async () => [{ id: 2, type: 'mail' }] },
    messages: { getAttachmentFile: async (id, part) => new Blob(['%PDF ' + id + ' ' + part]), listAttachments: async id => attachments[id] || [] },
    messageDisplay: { getDisplayedMessage: async id => typeof displayed === 'function' ? displayed(id) : displayed, getDisplayedMessages: async () => displayedList },
    mailTabs: { getSelectedMessages: async () => ({ messages: selected }) },
    compose: { getAttachmentFile: async () => new Blob(['x']), addAttachment: async () => {}, removeAttachment: async () => {} },
    menus: { create: (o, cb) => { calls.menus.push(o); cb?.(); }, onClicked: { addListener: f => calls.click = f } },
  };
  const later = (f, ms) => { const h = setTimeout(f, ms); h.unref?.(); return h; };   // 30-Minuten-Zeitgeber hält den Test nicht auf
  const ctx = vm.createContext({ messenger, crypto: globalThis.crypto, File, Blob, setTimeout: later, console, self: {} });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), ctx);
  return { calls, ctx };
}

test('Nachrichten: fremde bleiben ohne Antwort (kein async-Listener), PDFMy bekommt die Datei bzw. „abgelaufen“', async () => {
  const src = fs.readFileSync(path.join(DIR, 'background.js'), 'utf8');
  assert.doesNotMatch(src, /onMessage\.addListener\(\s*async/, 'kein async-Listener');
  const { calls } = load(), on = calls.listeners[0];
  assert.equal(on({ hallo: 1 }, { url: 'https://pdfmy.de/' }), undefined, 'ohne Kennung: keine Antwort');
  assert.equal(on({ token: 'x', get: true }, { url: 'https://boese.example/' }), undefined, 'fremde Seite: keine Antwort');
  assert.equal(on({ token: 'x', other: true }, { url: 'https://pdfmy.de/' }), undefined, 'unbekannte Nachricht: keine Antwort');
  assert.deepEqual(J(await on({ token: 'gibtsnicht', get: true }, { url: 'https://pdfmy.de/' })), { error: 'expired' });
});

test('Rechtsklick auf Anhang: öffnet auch, wenn getDisplayedMessage nichts liefert (mehrere ausgewählt → passende Nachricht)', async () => {
  const att = { name: 'Rechnung.pdf', partName: '1.2' };
  const { calls, ctx } = load({ displayed: null, selected: [{ id: 5 }, { id: 7 }], attachments: { 5: [{ name: 'Brief.pdf', partName: '1.2' }], 7: [att] } });
  await calls.click({ menuItemId: 'pdfmy-open', attachments: [att] }, { id: 3, type: 'mail' });
  assert.equal(calls.tabs.length, 1); assert.match(calls.tabs[0], /^https:\/\/pdfmy\.de\/#pdfmy-import=[0-9a-f-]{36}$/);
  // die Datei hinter der Kennung stammt aus Nachricht 7
  const token = calls.tabs[0].split('=')[1], r = await calls.listeners[0]({ token, get: true }, { url: 'https://pdfmy.de/' });
  assert.equal(r.name, 'Rechnung.pdf'); assert.equal(new TextDecoder().decode(r.bytes), '%PDF 7 1.2');
  // ohne Tab-Angabe (manche Fenster): aktiver Tab; nicht öffenbare Dateien werden übergangen
  const b = load({ displayed: { id: 4 } });
  await b.calls.click({ menuItemId: 'pdfmy-open', attachments: [{ name: 'virus.exe', partName: '1' }, { name: 'a.pdf', partName: '2' }] }, undefined);
  assert.equal(b.calls.tabs.length, 1);
  assert.deepEqual(J(b.calls.menus[0].contexts), ['message_attachments', 'compose_attachments']);
  void ctx;
});

test('Thunderbird 160 (im echten Programm gefunden): Rechtsklick liefert einen inneren Tab ohne Typ – Nachricht kommt über den aktiven Mail-Tab', async () => {
  const att = { name: 'Rechnung-2026-1142.pdf', partName: '1.2', contentType: 'application/pdf', size: 1350 };
  const { calls } = load({ displayed: id => (id === 2 ? { id: 42 } : null) });
  await calls.click({ menuItemId: 'pdfmy-open', attachments: [att] }, { id: 1, windowId: 29, type: null, mailTab: false });
  assert.equal(calls.tabs.length, 1, 'PDFMy-Tab geöffnet');
  const token = calls.tabs[0].split('=')[1], r = await calls.listeners[0]({ token, get: true }, { url: 'https://pdfmy.de/' });
  assert.equal(new TextDecoder().decode(r.bytes), '%PDF 42 1.2', 'Anhang aus der angezeigten Nachricht');
});

test('Paket 1.0.1: ohne Berechtigung „tabs“, Ladeanzeige übersetzbar, Version erhöht', () => {
  const a = fs.readFileSync(path.join(__dirname, '..', 'tools', 'addins.js'), 'utf8'), br = fs.readFileSync(path.join(DIR, 'bridge.js'), 'utf8');
  assert.match(a, /const TB_VERSION = '1\.0\.1';/); assert.match(a, /tbVer = TB_VERSION/);
  assert.match(a, /permissions: \['messagesRead', 'compose', 'menus', `\$\{URL0\}\/\*`\]/);
  assert.match(a, /loading: \{ message: \(l \? tr\(l, 'tbLoading'\) : null\) \|\| TEXTE\.tbLoading \}/);
  assert.match(br, /show\(msg\('loading'\) \|\|/); assert.match(br, /hide\(file\.bytes \? 1500 : 0\)/);
});
