// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Erweiterungen für andere Programme (app-v254), gebaut von tools/build-web.js:
   - Office-Add-ins (tools/pdfmy-office): Seiten unter /office/, Manifeste download/pdfmy-office.xml (Word, Excel, PowerPoint)
     und download/pdfmy-outlook.xml (Outlook) – für „Eigenes Add-in hochladen“ und die zentrale Bereitstellung im Microsoft 365 Admin Center.
   - Teams-App (tools/pdfmy-teams): download/pdfmy-teams.zip (persönliche App mit PDFMy, /einbetten.html).
   - Thunderbird (tools/pdfmy-thunderbird): download/pdfmy-thunderbird-<Version>.xpi.
   Texte in allen Sprachen aus i18n/site/<code>.json (Schlüssel: die deutschen Texte in TEXTE, gesammelt von tools/i18n-extract.js --site).
   Ausnahme von Leitplanke 2 (Entscheidung GF 15.11.2026): Die Office-Seiten laden office.js von Microsoft (Pflicht für Outlook und
   AppSource); die PDFMy-App selbst und ihre Sicherheitsrichtlinie bleiben unverändert. */
'use strict';
const fs = require('fs'), path = require('path');

const TEXTE = {
  name: 'PDFMy',
  officeDesc: 'PDFs ansehen, bearbeiten, unterschreiben und schwärzen – direkt aus Word, Excel und PowerPoint. Alles bleibt auf Ihrem Gerät.',
  outlookDesc: 'PDF-Anhänge in PDFMy öffnen, bearbeiten und unterschreiben, neue PDFs scannen – und an die E-Mail anhängen. Alles bleibt auf Ihrem Gerät.',
  open: 'In PDFMy öffnen',
  openTip: 'Dieses Dokument als PDF in PDFMy öffnen: bearbeiten, unterschreiben, schwärzen, speichern – ohne Upload.',
  mailTip: 'Anhänge in PDFMy öffnen, PDFs bearbeiten oder neu scannen und an diese E-Mail anhängen – ohne Upload.',
  teamsShort: 'PDFs bearbeiten, unterschreiben und scannen – ohne Upload.',
  teamsFull: 'PDFMy in Teams: PDFs öffnen, bearbeiten, unterschreiben, schwärzen, zusammenfügen und scannen. Die Dateien bleiben auf Ihrem Gerät, nichts wird hochgeladen. Kostenlos und ohne Konto.',
  edit: 'Bearbeiten',
  newPdf: 'Neues PDF anhängen …',
  noAttachments: 'Diese E-Mail hat keinen Anhang, den PDFMy öffnen kann.',
  privacy: 'Anhänge öffnen sich in PDFMy auf diesem Gerät – nichts wird hochgeladen.',
  expired: 'Die Übergabe ist abgelaufen.',
  tbDesc: 'PDF-Anhänge in PDFMy öffnen, bearbeiten und unterschreiben – und wieder anhängen. Alles bleibt auf Ihrem Gerät.',
  // LibreOffice (app-v256)
  loDesc: 'Das offene Dokument mit einem Klick als PDF in PDFMy öffnen – bearbeiten, unterschreiben, schwärzen. Die Datei bleibt auf Ihrem Rechner.',
  loTip: 'Dieses Dokument als PDF in PDFMy öffnen (über pdfmy Scan, ohne Upload)',
  loNoFilter: 'Dieses Dokument kann nicht als PDF gespeichert werden.',
  loExportFailed: 'Das PDF konnte nicht erstellt werden: {0}',
  loNoScan: 'Das PDF liegt hier: {0}. Damit es sich direkt in PDFMy öffnet, installieren Sie pdfmy Scan (pdfmy.de/scanner.html). Jetzt öffnet sich pdfmy.de – ziehen Sie die Datei einfach hinein.',
  // ONLYOFFICE-Plugin und Nextcloud-App (app-v256)
  ooDesc: 'Das offene Dokument als PDF in PDFMy öffnen – bearbeiten, unterschreiben, schwärzen. Ohne Upload an Dritte.',
  ooNote: 'Das Dokument geht als PDF direkt an PDFMy in Ihrem Browser – nichts wird an Dritte hochgeladen.',
  ooBlocked: 'Der Browser hat das neue Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.',
  ooCreating: 'PDF wird erstellt …',
  ooDesktop: 'In den ONLYOFFICE-Desktop-Programmen geht das nicht. Bitte „Datei → Drucken“ und den Drucker „PDFMy“ wählen.',
  ooFailed: 'Das PDF konnte nicht erstellt werden.',
  ooOpened: 'Das Dokument ist in PDFMy geöffnet.',
  ncSummary: 'PDFs in PDFMy öffnen, bearbeiten, unterschreiben – und zurück in Nextcloud speichern',
};
const OFFICE_ID = '26905598-3380-42e3-bfff-a6ec17b49991', OUTLOOK_ID = 'b56e6053-19f9-4750-9fa4-189192b5f2ff', TEAMS_ID = '5dd50a72-def9-47fc-97c4-b8dbe10b1616';
const ADDIN_VERSION = '1.0.0', LO_VERSION = '1.0.0', NC_VERSION = '1.0.1', OO_VERSION = '1.0.1';

module.exports = function addins({ ROOT, OUT, write, zip, domain }) {
  const { LANGS } = require(path.join(ROOT, 'js', 'i18n.js'));
  const dicts = LANGS.filter(l => l.code !== 'de').map(l => {
    let d = {}; try { d = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'site', l.code + '.json'), 'utf8')); } catch { /* fehlt */ }
    return { ...l, d };
  });
  const tr = (l, k) => l.d[TEXTE[k]] || null;
  const bin = list => list.map(f => ({ ...f, data: typeof f.data === 'string' ? new Uint8Array(Buffer.from(f.data, 'utf8')) : new Uint8Array(f.data) }));   // tools.zip erwartet Bytes
  // tar (POSIX ustar) + gzip ohne Fremdbibliothek – Ordner-Einträge werden aus den Dateipfaden ergänzt; feste Zeit für reproduzierbare Pakete
  function tarGz(files, mtime) {
    const blocks = [], oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
    const header = (name, size, type) => {
      const h = Buffer.alloc(512);
      h.write(name, 0, 100, 'utf8'); h.write(type === '5' ? '0000755\0' : '0000644\0', 100); h.write(oct(0, 8), 108); h.write(oct(0, 8), 116);
      h.write(oct(size, 12), 124); h.write(oct(mtime, 12), 136); h.write('        ', 148); h.write(type, 156);
      h.write('ustar\0', 257); h.write('00', 263); h.write('root', 265); h.write('root', 297);
      let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
      return h;
    };
    const dirs = new Set();
    for (const f of files) { const parts = f.name.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/'); }
    for (const d of [...dirs].sort()) blocks.push(header(d, 0, '5'));
    for (const f of files) {
      const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
      if (Buffer.byteLength(f.name) > 99) throw new Error('tar: Pfad zu lang: ' + f.name);
      blocks.push(header(f.name, data.length, '0'), data, Buffer.alloc((512 - data.length % 512) % 512));
    }
    blocks.push(Buffer.alloc(1024));
    return require('node:zlib').gzipSync(Buffer.concat(blocks), { level: 9 }).fill(0, 4, 8);   // gzip-Kopf ohne Zeitstempel (reproduzierbar)
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const URL0 = `https://${domain}`, OFF = `${URL0}/office`;
  const ovr = (k, max = 0, tag = 'Override') => dicts.map(l => { let v = tr(l, k); if (!v) return ''; if (max && v.length > max) v = v.slice(0, max - 1) + '…'; return `<${tag} Locale="${l.bcp}" Value="${esc(v)}"/>`; }).join('');   // in bt:String: bt:Override (Microsoft-Schema)
  const str = (id, k, max) => `<bt:String id="${id}" DefaultValue="${esc(TEXTE[k])}">${ovr(k, max, 'bt:Override')}</bt:String>`;

  // ---------- Office: Seiten ----------
  const SRC = path.join(ROOT, 'tools', 'pdfmy-office');
  for (const f of fs.readdirSync(SRC)) if (/\.(html|js|css)$/.test(f)) write('office/' + f, fs.readFileSync(path.join(SRC, f), 'utf8'));
  for (const f of fs.readdirSync(path.join(SRC, 'icons'))) { fs.mkdirSync(path.join(OUT, 'office', 'icons'), { recursive: true }); fs.copyFileSync(path.join(SRC, 'icons', f), path.join(OUT, 'office', 'icons', f)); }
  // PDFMy zum Einbetten (Office-Fenster, Teams): eigene Adresse, damit der Service Worker sie nicht mit index.html (frame-ancestors 'none') beantwortet
  const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  write('einbetten.html', index.replace(/<head>/i, '<head><meta name="robots" content="noindex">').replace(/<link rel="canonical"[^>]*>/i, ''));

  const icons = `<bt:Images><bt:Image id="Icon.16" DefaultValue="${OFF}/icons/icon-16.png"/><bt:Image id="Icon.32" DefaultValue="${OFF}/icons/icon-32.png"/><bt:Image id="Icon.64" DefaultValue="${OFF}/icons/icon-64.png"/><bt:Image id="Icon.80" DefaultValue="${OFF}/icons/icon-80.png"/></bt:Images>`;
  const head = (type, id, desc) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- PDFMy – Add-in der Mentor GmbH (https://pdfmy.de). Dokumente bleiben auf dem Gerät. -->
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"${type === 'MailApp' ? ' xmlns:mailappor="http://schemas.microsoft.com/office/mailappversionoverrides/1.0"' : ' xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"'} xsi:type="${type}">
  <Id>${id}</Id>
  <Version>${ADDIN_VERSION}.0</Version>
  <ProviderName>Mentor GmbH</ProviderName>
  <DefaultLocale>de-DE</DefaultLocale>
  <DisplayName DefaultValue="PDFMy"/>
  <Description DefaultValue="${esc(TEXTE[desc])}">${ovr(desc, 250)}</Description>
  <IconUrl DefaultValue="${OFF}/icons/icon-64.png"/>
  <HighResolutionIconUrl DefaultValue="${OFF}/icons/icon-128.png"/>
  <SupportUrl DefaultValue="${URL0}/hilfe.html"/>
  <AppDomains><AppDomain>${URL0}</AppDomain></AppDomains>`;
  // Word, Excel, PowerPoint: Knopf „In PDFMy öffnen“ auf der Registerkarte „Start“
  const hostXml = h => `<Host xsi:type="${h}"><DesktopFormFactor><FunctionFile resid="Commands.Url"/><ExtensionPoint xsi:type="PrimaryCommandSurface"><OfficeTab id="TabHome"><Group id="PdfmyGroup.${h}"><Label resid="Group.Label"/><Icon><bt:Image size="16" resid="Icon.16"/><bt:Image size="32" resid="Icon.32"/><bt:Image size="80" resid="Icon.80"/></Icon><Control xsi:type="Button" id="PdfmyOpen.${h}"><Label resid="Open.Label"/><Supertip><Title resid="Open.Label"/><Description resid="Open.Tip"/></Supertip><Icon><bt:Image size="16" resid="Icon.16"/><bt:Image size="32" resid="Icon.32"/><bt:Image size="80" resid="Icon.80"/></Icon><Action xsi:type="ExecuteFunction"><FunctionName>openInPdfmy</FunctionName></Action></Control></Group></OfficeTab></ExtensionPoint></DesktopFormFactor></Host>`;
  write('download/pdfmy-office.xml', `${head('TaskPaneApp', OFFICE_ID, 'officeDesc')}
  <Hosts><Host Name="Document"/><Host Name="Workbook"/><Host Name="Presentation"/></Hosts>
  <DefaultSettings><SourceLocation DefaultValue="${OFF}/commands.html"/></DefaultSettings>
  <Permissions>ReadAllDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>${['Document', 'Workbook', 'Presentation'].map(hostXml).join('')}</Hosts>
    <Resources>${icons}<bt:Urls><bt:Url id="Commands.Url" DefaultValue="${OFF}/commands.html"/></bt:Urls>
      <bt:ShortStrings><bt:String id="Group.Label" DefaultValue="PDFMy"/>${str('Open.Label', 'open', 125)}</bt:ShortStrings>
      <bt:LongStrings>${str('Open.Tip', 'openTip', 250)}</bt:LongStrings></Resources>
  </VersionOverrides>
</OfficeApp>
`);
  // Outlook: Knopf „PDFMy“ beim Lesen und Verfassen → Aufgabenbereich
  const mailPoint = p => `<ExtensionPoint xsi:type="${p}"><OfficeTab id="TabDefault"><Group id="PdfmyGroup.${p}"><Label resid="Group.Label"/><Control xsi:type="Button" id="PdfmyPane.${p}"><Label resid="Pane.Label"/><Supertip><Title resid="Pane.Label"/><Description resid="Pane.Tip"/></Supertip><Icon><bt:Image size="16" resid="Icon.16"/><bt:Image size="32" resid="Icon.32"/><bt:Image size="80" resid="Icon.80"/></Icon><Action xsi:type="ShowTaskpane"><SourceLocation resid="Taskpane.Url"/><SupportsPinning>true</SupportsPinning></Action></Control></Group></OfficeTab></ExtensionPoint>`;
  // Outlook für iOS und Android (app-v256): nur beim Lesen (Microsoft unterstützt dort keine Knöpfe beim Verfassen); graue Symbole 25/32/48 je 3 Skalierungen
  const mobileIcons = [25, 32, 48].map(n => `<bt:Image id="Mobile.${n}" DefaultValue="${OFF}/icons/mobile-${n}.png"/>`).join('');
  const mobilePoint = `<MobileFormFactor><FunctionFile resid="Commands.Url"/><ExtensionPoint xsi:type="MobileMessageReadCommandSurface"><Group id="PdfmyGroup.Mobile"><Label resid="Group.Label"/><Control xsi:type="MobileButton" id="PdfmyPane.Mobile"><Label resid="Pane.Label"/><Icon xsi:type="bt:MobileIconList">${[25, 32, 48].map(n => [1, 2, 3].map(sc => `<bt:Image size="${n}" scale="${sc}" resid="Mobile.${n}"/>`).join('')).join('')}</Icon><Action xsi:type="ShowTaskpane"><SourceLocation resid="Taskpane.Url"/></Action></Control></Group></ExtensionPoint></MobileFormFactor>`;
  write('download/pdfmy-outlook.xml', `${head('MailApp', OUTLOOK_ID, 'outlookDesc')}
  <Hosts><Host Name="Mailbox"/></Hosts>
  <Requirements><Sets><Set Name="Mailbox" MinVersion="1.1"/></Sets></Requirements>
  <FormSettings>
    <Form xsi:type="ItemRead"><DesktopSettings><SourceLocation DefaultValue="${OFF}/taskpane.html"/><RequestedHeight>300</RequestedHeight></DesktopSettings></Form>
    <Form xsi:type="ItemEdit"><DesktopSettings><SourceLocation DefaultValue="${OFF}/taskpane.html"/></DesktopSettings></Form>
  </FormSettings>
  <Permissions>ReadWriteItem</Permissions>
  <Rule xsi:type="RuleCollection" Mode="Or"><Rule xsi:type="ItemIs" ItemType="Message" FormType="Read"/><Rule xsi:type="ItemIs" ItemType="Message" FormType="Edit"/></Rule>
  <DisableEntityHighlighting>false</DisableEntityHighlighting>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides" xsi:type="VersionOverridesV1_0">
    <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides/1.1" xsi:type="VersionOverridesV1_1">
      <Requirements><bt:Sets DefaultMinVersion="1.5"><bt:Set Name="Mailbox"/></bt:Sets></Requirements>
      <Hosts><Host xsi:type="MailHost"><DesktopFormFactor><FunctionFile resid="Commands.Url"/>${mailPoint('MessageReadCommandSurface')}${mailPoint('MessageComposeCommandSurface')}</DesktopFormFactor>${mobilePoint}</Host></Hosts>
      <Resources>${icons.replace('</bt:Images>', mobileIcons + '</bt:Images>')}<bt:Urls><bt:Url id="Commands.Url" DefaultValue="${OFF}/commands.html"/><bt:Url id="Taskpane.Url" DefaultValue="${OFF}/taskpane.html"/></bt:Urls>
        <bt:ShortStrings><bt:String id="Group.Label" DefaultValue="PDFMy"/><bt:String id="Pane.Label" DefaultValue="PDFMy"/></bt:ShortStrings>
        <bt:LongStrings>${str('Pane.Tip', 'mailTip', 250)}</bt:LongStrings></Resources>
    </VersionOverrides>
  </VersionOverrides>
</OfficeApp>
`);

  // ---------- Teams: persönliche App ----------
  const TS = path.join(ROOT, 'tools', 'pdfmy-teams');
  const teamsFiles = [
    { name: 'manifest.json', data: JSON.stringify({
      $schema: 'https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json', manifestVersion: '1.17', version: ADDIN_VERSION, id: TEAMS_ID,
      developer: { name: 'Mentor GmbH', websiteUrl: URL0, privacyUrl: `${URL0}/datenschutz.html`, termsOfUseUrl: `${URL0}/nutzungsbedingungen.html` },
      name: { short: 'PDFMy', full: 'PDFMy' }, description: { short: TEXTE.teamsShort, full: TEXTE.teamsFull },
      icons: { color: 'color.png', outline: 'outline.png' }, accentColor: '#4A5280',
      localizationInfo: { defaultLanguageTag: 'de-de', additionalLanguages: dicts.filter(l => tr(l, 'teamsShort') && tr(l, 'teamsFull')).map(l => ({ languageTag: l.bcp.toLowerCase(), file: `${l.code}.json` })) },
      staticTabs: [{ entityId: 'pdfmy', name: 'PDFMy', contentUrl: `${URL0}/einbetten.html?quelle=teams`, websiteUrl: URL0, scopes: ['personal'] }],
      permissions: [], validDomains: [domain],
    }, null, 2) },
    { name: 'color.png', data: fs.readFileSync(path.join(TS, 'color.png')) }, { name: 'outline.png', data: fs.readFileSync(path.join(TS, 'outline.png')) },
    ...dicts.filter(l => tr(l, 'teamsShort') && tr(l, 'teamsFull')).map(l => ({ name: `${l.code}.json`, data: JSON.stringify({ $schema: 'https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.Localization.schema.json', 'name.short': 'PDFMy', 'name.full': 'PDFMy', 'description.short': tr(l, 'teamsShort').slice(0, 80), 'description.full': tr(l, 'teamsFull').slice(0, 4000) }, null, 2) })),
  ];
  write('download/pdfmy-teams.zip', Buffer.from(zip(bin(teamsFiles), new Date(2026, 0, 1))));

  // ---------- Thunderbird ----------
  const TB = path.join(ROOT, 'tools', 'pdfmy-thunderbird'), tbVer = ADDIN_VERSION;
  const msgs = l => ({ extName: { message: 'PDFMy' }, extDesc: { message: (l ? tr(l, 'tbDesc') : null) || TEXTE.tbDesc }, openInPdfmy: { message: (l ? tr(l, 'open') : null) || TEXTE.open }, open: { message: (l ? tr(l, 'open') : null) || TEXTE.open }, edit: { message: (l ? tr(l, 'edit') : null) || TEXTE.edit }, newPdf: { message: (l ? tr(l, 'newPdf') : null) || TEXTE.newPdf }, noAttachments: { message: (l ? tr(l, 'noAttachments') : null) || TEXTE.noAttachments }, privacy: { message: (l ? tr(l, 'privacy') : null) || TEXTE.privacy }, expired: { message: (l ? tr(l, 'expired') : null) || TEXTE.expired } });
  const tbFiles = [
    { name: 'manifest.json', data: JSON.stringify({
      manifest_version: 2, name: '__MSG_extName__', description: '__MSG_extDesc__', version: tbVer, author: 'Mentor GmbH', homepage_url: URL0, default_locale: 'de',
      browser_specific_settings: { gecko: { id: 'pdfmy@mentor-group.de', strict_min_version: '115.0' } },
      icons: { 32: 'icons/icon-32.png', 64: 'icons/icon-64.png', 128: 'icons/icon-128.png' },
      permissions: ['messagesRead', 'compose', 'menus', 'tabs', `${URL0}/*`],
      background: { scripts: ['background.js'] },
      content_scripts: [{ matches: [`${URL0}/*`], js: ['bridge.js'], run_at: 'document_start' }],
      message_display_action: { default_title: 'PDFMy', default_icon: { 32: 'icons/icon-32.png', 64: 'icons/icon-64.png' }, default_popup: 'popup.html' },
      compose_action: { default_title: 'PDFMy', default_icon: { 32: 'icons/icon-32.png', 64: 'icons/icon-64.png' }, default_popup: 'popup.html' },
    }, null, 2) },
    ...['background.js', 'bridge.js', 'popup.html', 'popup.js', 'popup.css'].map(f => ({ name: f, data: fs.readFileSync(path.join(TB, f)) })),
    ...['icon-32.png', 'icon-64.png', 'icon-128.png'].map(f => ({ name: 'icons/' + f, data: fs.readFileSync(path.join(TB, 'icons', f)) })),
    { name: '_locales/de/messages.json', data: JSON.stringify(msgs(null), null, 1) },
    // Thunderbird kennt Sprachkennungen mit Unterstrich (en_US); einfache Sprachen ohne Land
    ...dicts.filter(l => tr(l, 'open')).map(l => ({ name: `_locales/${l.code.replace('-', '_')}/messages.json`, data: JSON.stringify(msgs(l), null, 1) })),
  ];
  const tbXpi = `pdfmy-thunderbird-${tbVer}.xpi`;
  write('download/' + tbXpi, Buffer.from(zip(bin(tbFiles), new Date(2026, 0, 1))));

  // ---------- LibreOffice / Collabora Office: „Datei → In PDFMy öffnen“ (app-v256) ----------
  // Python-Makro exportiert das Dokument als PDF und öffnet es über pdfmy Scan (wie ein Doppelklick) – tools/pdfmy-libreoffice
  const LO = path.join(ROOT, 'tools', 'pdfmy-libreoffice'), loVer = LO_VERSION, loOxt = `pdfmy-libreoffice-${loVer}.oxt`;
  const loLangs = [{ code: 'de', bcp: 'de-DE', d: null }, ...dicts];
  const loT = (l, k) => (l.d ? tr(l, k) : null) || TEXTE[k];
  const texte = {}; for (const l of loLangs) texte[l.code] = { loNoFilter: loT(l, 'loNoFilter'), loExportFailed: loT(l, 'loExportFailed'), loNoScan: loT(l, 'loNoScan') };
  const py = fs.readFileSync(path.join(LO, 'pdfmy.py'), 'utf8').replace(/^TEXTE = .*__TEXTE__.*$/m, 'TEXTE = ' + JSON.stringify(texte));
  const loTag = l => l.code === 'de' ? 'de' : l.code;   // LibreOffice: BCP-47 (de, en-GB, pt …)
  const titles = k => loLangs.map(l => `<value xml:lang="${loTag(l)}">${esc(loT(l, k))}</value>`).join('');
  const SCRIPT = `vnd.sun.star.script:${loOxt}|python|pdfmy.py$open_in_pdfmy?language=Python&amp;location=user:uno_packages`;
  const ctxs = 'com.sun.star.text.TextDocument,com.sun.star.text.WebDocument,com.sun.star.sheet.SpreadsheetDocument,com.sun.star.presentation.PresentationDocument,com.sun.star.drawing.DrawingDocument';
  const addonsXcu = `<?xml version="1.0" encoding="UTF-8"?>
<oor:component-data xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" oor:name="Addons" oor:package="org.openoffice.Office">
 <node oor:name="AddonUI">
  <node oor:name="OfficeMenuBarMerging">
   <node oor:name="de.mentor-group.pdfmy" oor:op="replace">
    <node oor:name="M1" oor:op="replace">
     <prop oor:name="MergePoint"><value>.uno:PickList\\.uno:ExportAsMenu</value></prop>
     <prop oor:name="MergeCommand"><value>AddAfter</value></prop>
     <prop oor:name="MergeFallback"><value>AddLast</value></prop>
     <prop oor:name="MergeContext"><value>${ctxs}</value></prop>
     <node oor:name="MenuItems">
      <node oor:name="M1" oor:op="replace">
       <prop oor:name="URL"><value>${SCRIPT}</value></prop>
       <prop oor:name="Title">${titles('open')}</prop>
       <prop oor:name="Target"><value>_self</value></prop>
      </node>
     </node>
    </node>
   </node>
  </node>
  <node oor:name="OfficeToolBar">
   <node oor:name="de.mentor-group.pdfmy" oor:op="replace">
    <node oor:name="T1" oor:op="replace">
     <prop oor:name="URL"><value>${SCRIPT}</value></prop>
     <prop oor:name="Title">${titles('loTip')}</prop>
     <prop oor:name="Target"><value>_self</value></prop>
     <prop oor:name="Context"><value>${ctxs}</value></prop>
    </node>
   </node>
  </node>
  <node oor:name="Images">
   <node oor:name="de.mentor-group.pdfmy.icon" oor:op="replace">
    <prop oor:name="URL"><value>${SCRIPT}</value></prop>
    <node oor:name="UserDefinedImages">
     <prop oor:name="ImageSmallURL"><value>%origin%/icons/icon-16.png</value></prop>
     <prop oor:name="ImageBigURL"><value>%origin%/icons/icon-26.png</value></prop>
    </node>
   </node>
  </node>
 </node>
</oor:component-data>
`;
  const loFiles = [
    { name: 'META-INF/manifest.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="http://openoffice.org/2001/manifest">
 <manifest:file-entry manifest:full-path="python" manifest:media-type="application/vnd.sun.star.framework-script"/>
 <manifest:file-entry manifest:full-path="Addons.xcu" manifest:media-type="application/vnd.sun.star.configuration-data"/>
</manifest:manifest>
` },
    { name: 'description.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<description xmlns="http://openoffice.org/extensions/description/2006" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:d="http://openoffice.org/extensions/description/2006">
 <identifier value="de.mentor-group.pdfmy"/>
 <version value="${loVer}"/>
 <dependencies><l:LibreOffice-minimal-version xmlns:l="http://libreoffice.org/extensions/description/2011" l:name="LibreOffice 7.0" value="7.0"/></dependencies>
 <publisher><name xlink:href="${URL0}/" lang="de">Mentor GmbH</name></publisher>
 <display-name>${loLangs.map(l => `<name lang="${loTag(l)}">PDFMy</name>`).join('')}</display-name>
 <icon><default xlink:href="icons/icon-42.png"/></icon>
 <extension-description>${loLangs.map(l => `<src lang="${loTag(l)}" xlink:href="description/${l.code}.txt"/>`).join('')}</extension-description>
</description>
` },
    { name: 'Addons.xcu', data: addonsXcu },
    { name: 'python/pdfmy.py', data: py },
    ...['icon-16.png', 'icon-26.png', 'icon-42.png'].map(f => ({ name: 'icons/' + f, data: fs.readFileSync(path.join(LO, 'icons', f)) })),
    ...loLangs.map(l => ({ name: `description/${l.code}.txt`, data: loT(l, 'loDesc') + '\n\nhttps://pdfmy.de/' })),
  ];
  write('download/' + loOxt, Buffer.from(zip(bin(loFiles), new Date(2026, 0, 1))));

  // ---------- Nextcloud: Dateiaktion „In PDFMy öffnen“ (app-v256) – tools/pdfmy-nextcloud, ZIP zum Entpacken nach custom_apps/ ----------
  const NC = path.join(ROOT, 'tools', 'pdfmy-nextcloud'), ncVer = NC_VERSION, ncZip = `pdfmy-nextcloud-${ncVer}.zip`;
  const labels = {}; for (const l of loLangs) labels[l.code] = loT(l, 'open');
  const ncFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name), rel = path.relative(NC, full).split(path.sep).join('/');
      if (e.isDirectory()) walk(full);
      else if (!/^README/i.test(e.name)) {   // CHANGELOG.md gehört ins Paket (Vorgabe Nextcloud-App-Store)
        let data = fs.readFileSync(full);
        if (rel === 'js/pdfmy-main.js') data = data.toString('utf8').replace(/const LABELS = \{[^\n]*__LABELS__[^\n]*/, `const LABELS = ${JSON.stringify(labels)};`);
        if (rel === 'appinfo/info.xml') data = data.toString('utf8').replace(/<version>[^<]*<\/version>/, `<version>${ncVer}</version>`);
        ncFiles.push({ name: 'pdfmy/' + rel, data });
      }
    }
  })(NC);
  write('download/' + ncZip, Buffer.from(zip(bin(ncFiles), new Date(2026, 0, 1))));
  // Nextcloud-App-Store (15.11.2026): .tar.gz mit genau einem Ordner „pdfmy/“ (Vorgabe nextcloudappstore.readthedocs.io, „Registering an App“)
  const ncTar = `pdfmy-nextcloud-${ncVer}.tar.gz`;
  write('download/' + ncTar, tarGz(ncFiles, Date.UTC(2026, 0, 1) / 1000));

  // ---------- ONLYOFFICE Docs: Plugin „PDFMy“ (app-v256) – tools/pdfmy-onlyoffice, .plugin für den Plugin-Manager ----------
  const OO = path.join(ROOT, 'tools', 'pdfmy-onlyoffice'), ooVer = OO_VERSION, ooPlugin = `pdfmy-onlyoffice-${ooVer}.plugin`;
  const OO_SCALES = [['', '100%'], ['@1.25x', '125%'], ['@1.5x', '150%'], ['@1.75x', '175%'], ['@2x', '200%']];
  // alle Dateien unter resources/ (Symbole, Karten-Symbole, Bildschirmfoto), Pfade mit „/“
  const ooResources = (dir = '') => fs.readdirSync(path.join(OO, 'resources', dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? ooResources(dir + e.name + '/') : [dir + e.name]).sort();
  const ooKeys = ['open', 'ooNote', 'ooBlocked', 'ooCreating', 'ooDesktop', 'ooFailed', 'ooOpened'];
  const ooTrans = dicts.filter(l => tr(l, 'open')).map(l => ({ file: `${l.bcp}.json`, data: Object.fromEntries(ooKeys.map(k => [TEXTE[k], tr(l, k) || TEXTE[k]])) }));
  const ooConfig = {
    name: 'PDFMy', nameLocale: Object.fromEntries(dicts.map(l => [l.bcp.split('-')[0], 'PDFMy'])),
    guid: 'asc.{CE4224C6-2955-4D9F-9AB3-384A3EBED0B7}', version: ooVer, minVersion: '7.4.0', offered: 'Mentor GmbH',
    variations: [{
      // Grundsprache des ONLYOFFICE-Marktplatzes ist Englisch; Deutsch und die übrigen Sprachen als Übersetzung
      description: (en => en && tr(en, 'ooDesc'))(dicts.find(l => l.bcp === 'en-US')) || TEXTE.ooDesc,
      descriptionLocale: { de: TEXTE.ooDesc, ...Object.fromEntries(dicts.filter(l => tr(l, 'ooDesc') && !l.bcp.startsWith('en')).map(l => [l.bcp.split('-')[0], tr(l, 'ooDesc')])) },
      url: 'index.html', icons: ['resources/light/icon.png', 'resources/light/icon@2x.png'],
      // Symbole hell/dunkel in fünf Stufen und Karten-Symbole 120×60 nach Vorgabe des ONLYOFFICE-Marktplatzes (tools/oo-icons.js)
      icons2: ['light', 'dark'].map(style => ({ style, ...Object.fromEntries(OO_SCALES.map(([suf, pct]) => [pct, { normal: `resources/${style}/icon${suf}.png` }])) })),
      isViewer: true, EditorsSupport: ['word', 'cell', 'slide', 'pdf'],
      isVisual: true, isModal: false, isInsideMode: true, initDataType: 'none', initData: '', buttons: [], size: [300, 200],
      store: { background: { light: '#4A5280', dark: '#4A5280' }, screenshots: ['resources/store/screenshots/screen_1.png'], icons: { light: 'resources/store/icons', dark: 'resources/store/icons' }, categories: ['work'] },
    }],
  };
  const ooFiles = [
    { name: 'config.json', data: JSON.stringify(ooConfig, null, 2) },
    ...['index.html', 'pdfmy.js'].map(f => ({ name: f, data: fs.readFileSync(path.join(OO, f)) })),
    ...ooResources().map(f => ({ name: 'resources/' + f, data: fs.readFileSync(path.join(OO, 'resources', f)) })),
    ...['README.md', 'CHANGELOG.md'].map(f => ({ name: f, data: fs.readFileSync(path.join(OO, f)) })),
    { name: 'translations/langs.json', data: JSON.stringify(ooTrans.map(t => t.file.replace(/\.json$/, ''))) },
    ...ooTrans.map(t => ({ name: 'translations/' + t.file, data: JSON.stringify(t.data, null, 1) })),
  ];
  write('download/' + ooPlugin, Buffer.from(zip(bin(ooFiles), new Date(2026, 0, 1))));

  // ---------- Kopfzeilen (.htaccess) ----------
  const officeFrames = "'self' https://*.office.com https://*.office365.com https://*.microsoft.com https://*.officeapps.live.com https://*.sharepoint.com https://*.cloud.microsoft https://outlook.live.com https://*.outlook.com";
  const teamsFrames = "'self' https://teams.microsoft.com https://*.teams.microsoft.com https://teams.live.com https://*.teams.live.com https://teams.cloud.microsoft https://*.cloud.microsoft https://*.office.com https://*.microsoft365.com https://*.skype.com";
  const htaccess = `
# Erweiterungen (tools/addins.js): Office-Seiten dürfen in Office eingebettet werden und laden office.js von Microsoft (Ausnahme L2, GF 15.11.2026);
# einbetten.html (PDFMy im Office-Fenster bzw. in Teams) darf nur von pdfmy.de selbst und von Teams eingebettet werden.
<IfModule mod_headers.c>
  <If "%{REQUEST_URI} =~ m#^/office/#">
    Header always unset X-Frame-Options
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self' https://appsforoffice.microsoft.com; connect-src 'self' https://appsforoffice.microsoft.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors ${officeFrames}"
    Header always set Cross-Origin-Opener-Policy "unsafe-none"
  </If>
  <If "%{REQUEST_URI} == '/einbetten.html'">
    Header always unset X-Frame-Options
    Header always edit Content-Security-Policy "frame-ancestors 'none'" "frame-ancestors ${teamsFrames}"
  </If>
</IfModule>
<FilesMatch "^pdfmy-(office|outlook)\\.xml$">
  ForceType application/xml
  <IfModule mod_headers.c>
    Header set Content-Disposition "attachment"
  </IfModule>
</FilesMatch>
AddType application/x-xpinstall .xpi
AddType application/vnd.openofficeorg.extension .oxt
AddType application/zip .plugin
`;
  return { htaccess, tbXpi, loOxt, ncZip, ncTar, ooPlugin, ids: { OFFICE_ID, OUTLOOK_ID, TEAMS_ID }, version: ADDIN_VERSION };
};
module.exports.TEXTE = TEXTE;
