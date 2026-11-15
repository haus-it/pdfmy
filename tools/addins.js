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
};
const OFFICE_ID = '26905598-3380-42e3-bfff-a6ec17b49991', OUTLOOK_ID = 'b56e6053-19f9-4750-9fa4-189192b5f2ff', TEAMS_ID = '5dd50a72-def9-47fc-97c4-b8dbe10b1616';
const ADDIN_VERSION = '1.0.0';

module.exports = function addins({ ROOT, OUT, write, zip, domain }) {
  const { LANGS } = require(path.join(ROOT, 'js', 'i18n.js'));
  const dicts = LANGS.filter(l => l.code !== 'de').map(l => {
    let d = {}; try { d = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'site', l.code + '.json'), 'utf8')); } catch { /* fehlt */ }
    return { ...l, d };
  });
  const tr = (l, k) => l.d[TEXTE[k]] || null;
  const bin = list => list.map(f => ({ ...f, data: typeof f.data === 'string' ? new Uint8Array(Buffer.from(f.data, 'utf8')) : new Uint8Array(f.data) }));   // tools.zip erwartet Bytes
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const URL0 = `https://${domain}`, OFF = `${URL0}/office`;
  const ovr = (k, max = 0) => dicts.map(l => { let v = tr(l, k); if (!v) return ''; if (max && v.length > max) v = v.slice(0, max - 1) + '…'; return `<Override Locale="${l.bcp}" Value="${esc(v)}"/>`; }).join('');
  const str = (id, k, max) => `<bt:String id="${id}" DefaultValue="${esc(TEXTE[k])}">${ovr(k, max)}</bt:String>`;

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
      <Requirements><bt:Sets DefaultMinVersion="1.8"><bt:Set Name="Mailbox"/></bt:Sets></Requirements>
      <Hosts><Host xsi:type="MailHost"><DesktopFormFactor><FunctionFile resid="Commands.Url"/>${mailPoint('MessageReadCommandSurface')}${mailPoint('MessageComposeCommandSurface')}</DesktopFormFactor></Host></Hosts>
      <Resources>${icons}<bt:Urls><bt:Url id="Commands.Url" DefaultValue="${OFF}/commands.html"/><bt:Url id="Taskpane.Url" DefaultValue="${OFF}/taskpane.html"/></bt:Urls>
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
      developer: { name: 'Mentor GmbH', websiteUrl: URL0, privacyUrl: `${URL0}/datenschutz.html`, termsOfUseUrl: `${URL0}/impressum.html` },
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
`;
  return { htaccess, tbXpi, ids: { OFFICE_ID, OUTLOOK_ID, TEAMS_ID }, version: ADDIN_VERSION };
};
module.exports.TEXTE = TEXTE;
