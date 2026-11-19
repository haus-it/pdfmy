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

test('LibreOffice, Nextcloud, ONLYOFFICE: Pakete vollständig und in allen Sprachen (app-v256)', async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-addins3-'));
  fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
  const write = (rel, data) => { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), data); };
  const A = require('../tools/addins.js')({ ROOT, OUT, write, zip: require('../js/tools.js').zip, domain: 'pdfmy.de' });
  const open = f => Office.readZip(new Uint8Array(fs.readFileSync(path.join(OUT, 'download', f))));
  // LibreOffice: Manifest, Beschreibung, Menü nach „Exportieren als“, Python mit eingesetzten Texten
  const lo = open(A.loOxt);
  for (const f of ['META-INF/manifest.xml', 'description.xml', 'Addons.xcu', 'python/pdfmy.py', 'icons/icon-16.png', 'icons/icon-26.png', 'description/de.txt', 'description/fr.txt']) assert.ok(lo.files.has(f), 'oxt: ' + f);
  const xcu = await lo.text('Addons.xcu'), desc = await lo.text('description.xml'), py = await lo.text('python/pdfmy.py');
  assert.match(xcu, /\.uno:PickList\\.uno:ExportAsMenu/); assert.match(xcu, new RegExp(`${A.loOxt.replace(/\./g, '\.')}\|python\|pdfmy\.py\$open_in_pdfmy`));
  assert.match(desc, /<identifier value="de\.mentor-group\.pdfmy"\/>/); assert.match(desc, /libreoffice\.org\/extensions\/description\/2011/);
  assert.ok(!py.includes('__TEXTE__'), 'Texte eingesetzt');
  const texte = JSON.parse(py.match(/^TEXTE = (.*)$/m)[1]);
  assert.ok(Object.keys(texte).length >= 40 && texte.fr.loNoScan.includes('{0}'));
  // Nextcloud: App-Ordner pdfmy/, Bezeichnung in allen Sprachen eingesetzt
  const nc = open(A.ncZip);
  for (const f of ['pdfmy/appinfo/info.xml', 'pdfmy/lib/AppInfo/Application.php', 'pdfmy/lib/Listener/LoadScripts.php', 'pdfmy/js/pdfmy-main.js', 'pdfmy/img/app.svg']) assert.ok(nc.files.has(f), 'Nextcloud: ' + f);
  for (const f of ['pdfmy/LICENSE', 'pdfmy/CHANGELOG.md']) assert.ok(nc.files.has(f), 'Nextcloud: ' + f);
  // App-Store (15.11.2026): AGPL-3.0-or-later, .tar.gz mit genau einem Ordner pdfmy/, CHANGELOG nennt die Version
  const ncInfo = await nc.text('pdfmy/appinfo/info.xml'), ncVer = ncInfo.match(/<version>([^<]+)<\/version>/)[1];
  assert.match(ncInfo, /<licence>AGPL-3\.0-or-later<\/licence>/); assert.ok((await nc.text('pdfmy/CHANGELOG.md')).includes('## ' + ncVer));
  const tar = require('node:zlib').gunzipSync(fs.readFileSync(path.join(OUT, 'download', A.ncTar))), names = [];
  for (let o = 0; o + 512 <= tar.length; ) {
    const h = tar.subarray(o, o + 512); if (!h[0]) break;
    const name = h.toString('utf8', 0, 100).replace(/\0.*$/s, ''), size = parseInt(h.toString('utf8', 124, 136).replace(/\0.*$/s, '').trim(), 8);
    let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    assert.equal(parseInt(h.toString('utf8', 148, 156), 8), sum, 'tar-Prüfsumme ' + name);
    names.push(name); o += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(names.every(n => n.startsWith('pdfmy/')) && names.includes('pdfmy/appinfo/info.xml') && names.includes('pdfmy/CHANGELOG.md'), 'tar: ein Ordner pdfmy/');
  const ncjs = await nc.text('pdfmy/js/pdfmy-main.js');
  assert.ok(!ncjs.includes('__LABELS__')); assert.match(ncjs, /"fr":"[^"]+"/);
  assert.match(ncjs, /const PDFMY = 'https:\/\/pdfmy\.de'/);
  // ONLYOFFICE: config.json mit fester Kennung, Übersetzungen, plugins.js vom eigenen ONLYOFFICE (kein fremder Server)
  const oo = open(A.ooPlugin), cfg = JSON.parse(await oo.text('config.json'));
  assert.equal(cfg.guid, 'asc.{CE4224C6-2955-4D9F-9AB3-384A3EBED0B7}'); assert.deepEqual(cfg.variations[0].EditorsSupport, ['word', 'cell', 'slide', 'pdf']);
  const langs = JSON.parse(await oo.text('translations/langs.json'));
  assert.ok(langs.length >= 39); for (const l of langs) assert.ok(oo.files.has(`translations/${l}.json`));
  assert.match(await oo.text('index.html'), /src="\.\.\/v1\/plugins\.js"/);
  assert.ok(!/https?:\/\/(?!pdfmy\.de|mentor-group\.de)/.test((await oo.text('pdfmy.js')).replace(/^\s*\/\/.*$/gm, '')), 'Plugin spricht nur mit pdfmy.de');
  // Marktplatz (15.11.2026): alle in config.json genannten Bilder im Paket, Symbole hell/dunkel in 5 Stufen, Karten-Symbole, README/CHANGELOG, Englisch als Grundsprache
  const v = cfg.variations[0], pngs = [...v.icons, ...v.icons2.flatMap(s => Object.values(s).filter(x => x.normal).map(x => x.normal)), ...v.store.screenshots,
    ...['', '@1.25x', '@1.5x', '@1.75x', '@2x'].map(s => `${v.store.icons.light}/icon${s}.png`)];
  for (const f of pngs) assert.ok(oo.files.has(f), 'ONLYOFFICE: ' + f);
  assert.deepEqual(v.icons2.map(s => s.style), ['light', 'dark']);
  for (const f of ['README.md', 'CHANGELOG.md']) assert.ok(oo.files.has(f), 'ONLYOFFICE: ' + f);
  assert.match(v.description, /^Open /); assert.match(v.descriptionLocale.de, /^Das offene Dokument/);
  assert.ok((await oo.text('CHANGELOG.md')).includes('## ' + cfg.version), 'CHANGELOG nennt die aktuelle Version');
});

test('Gastgeber Nextcloud/ONLYOFFICE: Seite kommt vom Server, damit das öffnende Fenster verbunden bleibt (app-v256)', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), web = fs.readFileSync(path.join(ROOT, 'tools', 'build-web.js'), 'utf8');
  for (const s of [sw, web]) assert.match(s, /quelle=\(mysupermail\|nextcloud\|onlyoffice\)/);
});

test('Outlook-Manifest: Handy-Knopf beim Lesen, Übersetzungen als bt:Override (Microsoft-Schema) (app-v256)', () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-addins4-'));
  fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
  const write = (rel, data) => { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), data); };
  require('../tools/addins.js')({ ROOT, OUT, write, zip: require('../js/tools.js').zip, domain: 'pdfmy.de' });
  const x = fs.readFileSync(path.join(OUT, 'download', 'pdfmy-outlook.xml'), 'utf8'), o = fs.readFileSync(path.join(OUT, 'download', 'pdfmy-office.xml'), 'utf8');
  const mob = x.match(/<MobileFormFactor>[\s\S]*<\/MobileFormFactor>/)?.[0] || '';
  assert.match(mob, /xsi:type="MobileMessageReadCommandSurface"/); assert.match(mob, /xsi:type="MobileButton"/); assert.match(mob, /xsi:type="bt:MobileIconList"/);
  for (const n of [25, 32, 48]) for (const s of [1, 2, 3]) assert.ok(mob.includes(`<bt:Image size="${n}" scale="${s}" resid="Mobile.${n}"/>`), `Symbol ${n}@${s}`);
  for (const n of [25, 32, 48]) assert.ok(fs.existsSync(path.join(OUT, 'office', 'icons', `mobile-${n}.png`)));
  assert.ok(!/MobileMessageComposeCommandSurface/.test(x), 'kein Verfassen auf dem Handy (von Microsoft nicht unterstützt)');
  for (const m of [x, o]) {
    for (const s of m.match(/<bt:String [^>]*>[\s\S]*?<\/bt:String>/g) || []) assert.ok(!/<Override /.test(s), 'in bt:String nur bt:Override');
    assert.ok(/<bt:Override Locale="fr-FR"/.test(m), 'Übersetzungen vorhanden');
  }
});

test('pdfmy Scan: automatische Updates vom Benutzer abschaltbar, Meldung bleibt (CRA Anhang I Teil I Nr. 2 c, 1.18.1)', () => {
  const cs = fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-scan', 'Program.cs'), 'utf8');
  assert.match(cs, /new ToolStripMenuItem\("Updates automatisch installieren"\) \{ Checked = !Updater\.AutoOff, CheckOnClick = true \}/, 'Schalter im Menü, an als Voreinstellung');
  assert.match(cs, /bool auto = !manual && !Updater\.AutoOff && new System\.Version\(latest\)/, 'aus → keine Selbstinstallation');
  assert.match(cs, /if \(auto && LocalServer\.Idle && !PdfPrinter\.Pending\)/, 'nur ohne laufende Arbeit');
  assert.match(cs, /updateItem\.Visible = true;/, 'verfügbare Updates werden weiter angeboten');
  assert.match(cs, /autoItem\.Visible = !Machine\.UpdatesManaged/, 'bei IT-Verteilung ausgeblendet');
  for (const lang of fs.readdirSync(path.join(ROOT, 'i18n', 'site')).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f)))
    assert.ok(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'site', lang), 'utf8'))).some(k => k.startsWith('<b>Automatische Updates abschalten:</b>')), 'Hilfe übersetzt: ' + lang);
});

test('pdfmy Scan: Rechtsklick und „Senden an“ für die Formate, die PDFMy öffnet (1.18.0)', () => {
  const cs = fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-scan', 'Program.cs'), 'utf8');
  const ext = JSON.parse('[' + cs.match(/static readonly string\[\] MenuExt = \{([^}]+)\}/)[1] + ']');
  // dieselben Endungen nimmt PDFMy über seine Übergabe-Schnittstelle an (OPEN_EXT in js/app.js)
  const open = new RegExp(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').match(/const OPEN_EXT = \/(.+?)\/;/)[1]);
  for (const e of ext) assert.ok(open.test(e.slice(1)), 'PDFMy öffnet ' + e);
  assert.ok(cs.includes('Software' + String.fromCharCode(92) + 'Classes' + String.fromCharCode(92) + 'SystemFileAssociations' + String.fromCharCode(92) + '{ext}' + String.fromCharCode(92) + 'shell' + String.fromCharCode(92) + 'PDFMy.Open'), 'Kontextmenü je Endung');
  assert.match(cs, /file\.EndsWith\("\.pdf", StringComparison\.OrdinalIgnoreCase\) && OpenInApp\(file\)/, 'App-Fenster nur für PDFs');
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'pro.js'), 'utf8'), /type: \/\\.pdf\$\/i\.test\(name\) \? 'application\/pdf' : mimeOf\(name\)/);
});

test('Firefox-Erweiterung freigegeben (18.11.2026): Store-Adresse eingetragen, Hilfe nennt Firefox nicht mehr als „folgt“ (app-v285)', () => {
  const fs = require('node:fs'), path = require('node:path'), ROOT = path.join(__dirname, '..');
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'site.json'), 'utf8'));
  assert.match(site.firefoxAmo, /^https:\/\/addons\.mozilla\.org\/[a-z-]+\/firefox\/addon\/pdfmy-pdfs-direkt-%C3%B6ffnen\/$/);
  const h = fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.html'), 'utf8');
  assert.ok(!h.includes('folgt nach der Prüfung durch Mozilla'), 'Hilfe aktuell');
  assert.ok(h.includes('in Firefox unter Windows, Mac und Linux'), 'Hilfe nennt Firefox');
});

test('Store-Weiterleitungen: Adressen mit %-Kodierung (ö im Firefox-Slug) werden nicht doppelt kodiert (NE)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const bw = fs.readFileSync(path.join(__dirname, '..', 'tools', 'build-web.js'), 'utf8');
  assert.match(bw, /RewriteRule \^go\/\$\{k\}\/\?\$ .* \[R=302,L,NE\]/);
});
