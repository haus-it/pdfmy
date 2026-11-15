// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Erweiterungen (app-v254): Übergabe in Stücken (tools/pdfmy-office/transfer.js), Office-Manifeste, Teams-Paket, Thunderbird-XPI (tools/addins.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
globalThis.self = globalThis;
require('../tools/pdfmy-office/transfer.js');
const Office = require('../js/office.js');
const ROOT = path.join(__dirname, '..');

test('Übergabe: Datei in Stücken hin und zurück, unvollständige Übertragung wird erkannt', () => {
  const bytes = crypto.randomBytes(300 * 1024), msgs = [];
  PdfmyTransfer.sendFile(t => msgs.push(t), { name: 'Anhang ä.pdf', bytes: new Uint8Array(bytes), mode: 'compose' });
  assert.ok(msgs.length > 3 && msgs.every(m => m.length < 120 * 1024), 'mehrere kleine Nachrichten');
  let got = null, other = [];
  const rx = PdfmyTransfer.receiver(f => { got = f; }, m => other.push(m));
  msgs.forEach(rx);
  assert.equal(got.name, 'Anhang ä.pdf'); assert.equal(got.mode, 'compose'); assert.deepEqual(Buffer.from(got.bytes), bytes);
  // ein Stück fehlt → Fehlermeldung statt kaputter Datei
  got = null; const rx2 = PdfmyTransfer.receiver(f => { got = f; }, m => other.push(m));
  msgs.filter((_, i) => i !== 2).forEach(rx2);
  assert.equal(got, null); assert.equal(other.pop().t, 'error');
  rx('{"t":"ready"}'); assert.equal(other.pop().t, 'ready');
});

test('Pakete: Office-Manifeste, Teams-App, Thunderbird – gültig und vollständig', async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-addins-'));
  fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><html><head><link rel="canonical" href="https://pdfmy.de/"></head><body></body></html>');
  const write = (rel, data) => { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), data); };
  const A = require('../tools/addins.js')({ ROOT, OUT, write, zip: require('../js/tools.js').zip, domain: 'pdfmy.de' });
  const read = f => fs.readFileSync(path.join(OUT, f), 'utf8');
  // Office: wohlgeformt (alle Elemente geschlossen), feste Kennung, Seiten auf pdfmy.de, Knopf „In PDFMy öffnen“
  for (const [f, type, id] of [['download/pdfmy-office.xml', 'TaskPaneApp', A.ids.OFFICE_ID], ['download/pdfmy-outlook.xml', 'MailApp', A.ids.OUTLOOK_ID]]) {
    const x = read(f), opens = (x.match(/<[A-Za-z][^>]*[^/]>/g) || []).filter(t => !t.startsWith('<?')).length, closes = (x.match(/<\/[A-Za-z]/g) || []).length;
    assert.equal(opens, closes, f + ': jedes Element geschlossen');
    const root = Office.parseXml(x), app = root.kids.find(k => typeof k === 'object');
    assert.equal(app.name, 'OfficeApp'); assert.equal(app.attrs['xsi:type'], type);
    assert.match(x, new RegExp(`<Id>${id}</Id>`)); assert.match(x, /<ProviderName>Mentor GmbH<\/ProviderName>/);
    assert.ok(!/http:\/\//.test(x.replace(/xmlns(:\w+)?="http:\/\/[^"]+"/g, '')), f + ': nur https');
    for (const u of x.match(/https:\/\/pdfmy\.de\/office\/[\w./-]+/g)) assert.ok(fs.existsSync(path.join(OUT, u.replace('https://pdfmy.de/', ''))), f + ': ' + u + ' vorhanden');
  }
  assert.match(read('download/pdfmy-office.xml'), /<FunctionName>openInPdfmy<\/FunctionName>/);
  assert.match(read('download/pdfmy-outlook.xml'), /MessageComposeCommandSurface/);
  // eingebettete App ohne Suchmaschinen-Eintrag
  assert.match(read('einbetten.html'), /noindex/); assert.ok(!/canonical/.test(read('einbetten.html')));
  // Teams: Manifest mit persönlicher Registerkarte auf pdfmy.de, Symbole, alle Sprachdateien vorhanden
  const tz = Office.readZip(new Uint8Array(fs.readFileSync(path.join(OUT, 'download', 'pdfmy-teams.zip'))));
  const tm = JSON.parse(await tz.text('manifest.json'));
  assert.equal(tm.id, A.ids.TEAMS_ID); assert.deepEqual(tm.validDomains, ['pdfmy.de']);
  assert.match(tm.staticTabs[0].contentUrl, /^https:\/\/pdfmy\.de\/einbetten\.html/);
  for (const f of ['color.png', 'outline.png', ...tm.localizationInfo.additionalLanguages.map(l => l.file)]) assert.ok(tz.files.has(f), 'Teams: ' + f);
  assert.ok(tm.description.short.length <= 80 && tm.description.full.length <= 4000);
  // Thunderbird: Kennung, Rechte, Content-Script nur für pdfmy.de, alle benutzten Texte in jeder Sprache
  const xz = Office.readZip(new Uint8Array(fs.readFileSync(path.join(OUT, 'download', A.tbXpi))));
  const xm = JSON.parse(await xz.text('manifest.json'));
  assert.equal(xm.browser_specific_settings.gecko.id, 'pdfmy@mentor-group.de');
  assert.deepEqual(xm.content_scripts[0].matches, ['https://pdfmy.de/*']);
  const used = new Set(), src = ['background.js', 'popup.js'].map(f => fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-thunderbird', f), 'utf8')).join('\n');
  for (const m of src.matchAll(/\bt\('([a-zA-Z]+)'\)/g)) used.add(m[1]);
  for (const f of [...xz.files.keys()].filter(n => /^_locales\/[^/]+\/messages\.json$/.test(n))) {
    const msg = JSON.parse(await xz.text(f));
    for (const k of [...used, 'extName', 'extDesc']) assert.ok(msg[k]?.message, `${f}: ${k}`);
  }
  for (const f of ['background.js', 'bridge.js', 'popup.html', 'popup.js', 'icons/icon-32.png']) assert.ok(xz.files.has(f), 'XPI: ' + f);
  // Kopfzeilen: Office-Seiten in Office einbettbar, einbetten.html nur in pdfmy.de/Teams
  assert.match(A.htaccess, /m#\^\/office\/#[\s\S]*frame-ancestors 'self' https:\/\/\*\.office\.com/);
  assert.match(A.htaccess, /einbetten\.html[\s\S]*frame-ancestors 'self' https:\/\/teams\.microsoft\.com/);
  assert.match(A.htaccess, /script-src 'self' https:\/\/appsforoffice\.microsoft\.com;/);
});

test('Browser-Erweiterung: Viewer-Adressen von Chrome- und Firefox-Erweiterungen werden erkannt (app-v255)', () => {
  const noop = { addListener() {} };
  for (const base of ['chrome-extension://abcdefghijklmnopabcdefghijklmnop/', 'moz-extension://0123abcd-0000-4000-8000-123456789abc/']) {
    const box = {};
    globalThis.chrome = { runtime: { getURL: () => base, onConnect: noop, onInstalled: noop, onMessage: noop, id: 'x' },
      webRequest: { onHeadersReceived: noop, onBeforeRedirect: noop }, contextMenus: { onClicked: noop }, storage: { local: {}, session: {} } };
    const code = fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-extension', 'background.js'), 'utf8');
    new Function('self', code)(box);
    const { sourceOf } = box.pdfmy;
    assert.equal(sourceOf('moz-extension://0123abcd-0000-4000-8000-123456789abc/viewer.html#https://a.de/x.pdf'), 'https://a.de/x.pdf');
    assert.equal(sourceOf('chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/https://a.de/y.pdf'), 'https://a.de/y.pdf');
    assert.equal(sourceOf('moz-extension://kein-uuid/https://a.de/z.pdf'), '');
  }
  delete globalThis.chrome;
});
