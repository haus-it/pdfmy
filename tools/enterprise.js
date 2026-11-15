// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Unterlagen für Unternehmen und Behörden (15.11.2026), erzeugt bei jedem Web-Build (tools/build-web.js):
   - /.well-known/security.txt  (RFC 9116): Kontakt für Sicherheitsmeldungen
   - /download/pdfmy-sbom.cdx.json  (CycloneDX 1.5): Software-Stückliste der Web-App und von pdfmy Scan
   - /download/pdfmy-richtlinien-admx.zip  (ADMX/ADML de-DE, en-US): Gruppenrichtlinien-Vorlagen für pdfmy Scan
   Die Bibliotheksstände müssen mit docs/ISO-Konformitaet.md, Abschnitt 5, übereinstimmen (Test tests/enterprise.test.js). */
'use strict';
const crypto = require('node:crypto');

// Ausgelieferte Fremdbestandteile der Web-App. Geprüft am 15.11.2026: Bibliotheken byteweise (SHA-256) gegen das npm-Paket der
// angegebenen Version (unpkg.com), Lizenz aus dessen package.json; Schriften: Version aus der Schriftdatei, Lizenz aus vendor/licenses.
// Bibliotheksstände = docs/ISO-Konformitaet.md, Abschnitt 5 (Test tests/enterprise.test.js).
const OFL = { license: 'OFL-1.1' };
const COMPONENTS = [
  { name: 'pdf-lib', version: '1.17.1', license: 'MIT', purl: 'pkg:npm/pdf-lib@1.17.1' },
  { group: '@pdf-lib', name: 'fontkit', version: '1.1.1', license: 'MIT', purl: 'pkg:npm/%40pdf-lib/fontkit@1.1.1' },
  { group: '@cantoo', name: 'pdf-lib', version: '2.4.2', license: 'MIT', purl: 'pkg:npm/%40cantoo/pdf-lib@2.4.2',
    patched: 'Lokal korrigiert am 03.11.2026 (vendor/pdf-lib-crypt.min.js): Escape-Folgen in Zeichenketten vor dem Entschlüsseln auflösen (RC4-geschützte PDFs zeigten Kästchen statt Schrift); Regressionstest tests/pdfcrypt-strings.test.js; vermerkt in vendor/licenses/_cantoo_pdf-lib.txt' },
  { name: 'pdfjs-dist', version: '6.4.299', license: 'Apache-2.0', purl: 'pkg:npm/pdfjs-dist@6.4.299' },
  { name: 'tesseract.js', version: '5.1.1', license: 'Apache-2.0', purl: 'pkg:npm/tesseract.js@5.1.1' },
  { name: 'tesseract.js-core', version: '5.1.1', license: 'Apache-2.0', purl: 'pkg:npm/tesseract.js-core@5.1.1' },
  { group: '@tesseract.js-data', name: 'Sprachdaten (tessdata 4.0.0_best_int, je Sprache ein Paket, z. B. deu)', version: '1.0.0', expression: 'MIT AND Apache-2.0',
    purl: 'pkg:npm/%40tesseract.js-data/deu@1.0.0', iso: '@tesseract.js-data 1.0.0' },
  { name: 'qrcode-generator', version: '1.4.4', license: 'MIT', purl: 'pkg:npm/qrcode-generator@1.4.4' },
  { name: 'jsqr', version: '1.4.0', license: 'Apache-2.0', purl: 'pkg:npm/jsqr@1.4.0' },
  { name: 'libheif-js', version: '1.23.5', expression: 'LGPL-3.0', purl: 'pkg:npm/libheif-js@1.23.5' },
  { name: 'utif', version: '3.1.0', license: 'MIT', purl: 'pkg:npm/utif@3.1.0' },
  { name: 'pako', version: '2.1.0', expression: 'MIT AND Zlib', purl: 'pkg:npm/pako@2.1.0' },
  { name: 'node-forge', version: '1.4.0', expression: 'BSD-3-Clause OR GPL-2.0', purl: 'pkg:npm/node-forge@1.4.0', note: 'genutzt unter BSD-3-Clause' },
  { name: 'lucide-static', version: '0.460.0', license: 'ISC', purl: 'pkg:npm/lucide-static@0.460.0' },
  { name: 'DejaVu Fonts', version: '2.37', licenseName: 'Bitstream Vera Fonts / DejaVu (frei)', iso: 'DejaVu 2.37' },
  { name: 'Liberation Fonts', version: '2.1.5', ...OFL, font: true },
  { name: 'Caladea', version: '1.001', ...OFL, font: true },
  { name: 'Carlito (als „PDFMy Sans C“)', ...OFL, font: true, patched: 'Gemäß OFL umbenannt und angepasst (vendor/fonts/metric/PDFMySansC-*.ttf)' },
  { name: 'Bricolage Grotesque', ...OFL, font: true },
  { name: 'Instrument Sans', ...OFL, font: true },
  { name: 'IBM Plex Mono', ...OFL, font: true },
  { name: 'Allura', ...OFL, font: true },
  { name: 'Caveat', ...OFL, font: true },
  { name: 'Dancing Script', ...OFL, font: true },
  { name: 'Great Vibes', ...OFL, font: true },
  { name: 'Homemade Apple', license: 'Apache-2.0', font: true },
];

// Gruppenrichtlinien von pdfmy Scan (HKLM bzw. HKCU \SOFTWARE\Policies\Mentor GmbH\PDFMy, DWORD 1 = ein)
const POLICIES = [
  { id: 'DisableUpdates',
    de: ['Updates von pdfmy Scan abschalten', 'pdfmy Scan aktualisiert sich nicht selbst und bietet keine Updates an. Neue Versionen verteilt die IT (z. B. Intune, SCCM/MECM, Startskript). Gilt auch für Installationen einzelner Benutzer.'],
    en: ['Turn off pdfmy Scan updates', 'pdfmy Scan does not update itself and does not offer updates. IT deploys new versions (e.g. Intune, SCCM/MECM, startup script). Also applies to per-user installations.'] },
  { id: 'DisablePrinter',
    de: ['Drucker „PDFMy“ nicht anbieten', 'pdfmy Scan richtet den virtuellen Drucker „PDFMy“ nicht ein und bietet ihn nicht an.'],
    en: ['Do not offer the “PDFMy” printer', 'pdfmy Scan does not set up or offer the virtual “PDFMy” printer.'] },
];
const POLICY_KEY = 'Software\\Policies\\Mentor GmbH\\PDFMy';

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function admx(version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- PDFMy – Gruppenrichtlinien für pdfmy Scan (Mentor GmbH, https://pdfmy.de/firmen.html) -->
<policyDefinitions xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" revision="${version}" schemaVersion="1.0" xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions">
  <policyNamespaces>
    <target prefix="pdfmy" namespace="MentorGmbH.Policies.PDFMy" />
    <using prefix="windows" namespace="Microsoft.Policies.Windows" />
  </policyNamespaces>
  <resources minRequiredRevision="${version}" />
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_PdfmyScan" displayName="$(string.SUPPORTED_PdfmyScan)" />
    </definitions>
  </supportedOn>
  <categories>
    <category name="PDFMy" displayName="$(string.Cat_PDFMy)" />
  </categories>
  <policies>
${POLICIES.map(p => `    <policy name="${p.id}" class="Both" displayName="$(string.${p.id})" explainText="$(string.${p.id}_Help)" key="${POLICY_KEY}" valueName="${p.id}">
      <parentCategory ref="PDFMy" />
      <supportedOn ref="SUPPORTED_PdfmyScan" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>`).join('\n')}
  </policies>
</policyDefinitions>
`;
}
function adml(lang, version) {
  const L = lang === 'de-DE' ? 'de' : 'en';
  const t = L === 'de'
    ? { cat: 'PDFMy (Mentor GmbH)', sup: 'pdfmy Scan 1.17 oder neuer (Windows)', title: 'PDFMy-Richtlinien', desc: 'Gruppenrichtlinien für pdfmy Scan' }
    : { cat: 'PDFMy (Mentor GmbH)', sup: 'pdfmy Scan 1.17 or later (Windows)', title: 'PDFMy policies', desc: 'Group Policy settings for pdfmy Scan' };
  return `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" revision="${version}" schemaVersion="1.0" xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions">
  <displayName>${xmlEsc(t.title)}</displayName>
  <description>${xmlEsc(t.desc)}</description>
  <resources>
    <stringTable>
      <string id="Cat_PDFMy">${xmlEsc(t.cat)}</string>
      <string id="SUPPORTED_PdfmyScan">${xmlEsc(t.sup)}</string>
${POLICIES.map(p => `      <string id="${p.id}">${xmlEsc(p[L][0])}</string>
      <string id="${p.id}_Help">${xmlEsc(p[L][1])}</string>`).join('\n')}
    </stringTable>
  </resources>
</policyDefinitionResources>
`;
}

function sbom({ webVersion, scanVersion, domain, company }) {
  const comps = COMPONENTS.map(c => ({
    type: c.font ? 'file' : 'library', 'bom-ref': c.purl || `font:${c.name.split(' (')[0].replace(/\s+/g, '-').toLowerCase()}`,
    ...(c.group ? { group: c.group } : {}), name: c.name, ...(c.version ? { version: c.version } : {}),
    ...(c.note ? { description: c.note } : {}),
    licenses: c.expression ? [{ expression: c.expression }] : [{ license: c.license ? { id: c.license } : { name: c.licenseName } }],
    ...(c.purl ? { purl: c.purl } : {}),
    // lokal geänderte Fremdbestandteile kennzeichnen (CycloneDX pedigree, Patch „unofficial“)
    ...(c.patched ? { pedigree: { ...(c.purl ? { ancestors: [{ type: 'library', name: c.name, version: c.version, purl: c.purl }] } : {}), patches: [{ type: 'unofficial' }], notes: c.patched } } : {}),
  }));
  const own = name => ({ type: 'application', 'bom-ref': `pdfmy:${name}`, supplier: { name: company, url: [`https://${domain}`] }, licenses: [{ license: { id: 'PolyForm-Noncommercial-1.0.0' } }] });
  const body = {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: {
      component: { ...own('web'), name: 'PDFMy (Web-App)', version: webVersion, externalReferences: [{ type: 'website', url: `https://${domain}/` }, { type: 'vcs', url: 'https://github.com/haus-it/pdfmy' }] },
      supplier: { name: company, url: [`https://${domain}`] },
    },
    components: [...comps, { ...own('scan'), name: 'pdfmy Scan (Windows)', version: scanVersion, description: 'Lokaler Helfer (127.0.0.1) für Scanner, Drucker „PDFMy“ und Dateiübergabe; nur .NET Framework 4.8, keine Fremdbibliotheken' }],
    dependencies: [{ ref: 'pdfmy:web', dependsOn: comps.map(c => c['bom-ref']) }],
  };
  // gleiche Inhalte → gleiche Seriennummer (reproduzierbarer Build)
  const h = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { serialNumber: `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`, ...body };
}

function securityTxt({ domain, email, now = new Date() }) {
  // RFC 9116, 2.5.5: Expires weniger als ein Jahr in der Zukunft – 300 Tage, jedes Ausrollen erneuert das Datum
  const exp = new Date(now.getTime() + 300 * 24 * 3600 * 1000); exp.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: mailto:${email}`,
    `Expires: ${exp.toISOString().replace('.000', '')}`,
    'Preferred-Languages: de, en',
    `Canonical: https://${domain}/.well-known/security.txt`,
    `Policy: https://${domain}/sicherheit.html#schwachstellen`,
    '',
  ].join('\n');
}

module.exports = ({ write, zip, domain, company, email, webVersion, scanVersion }) => {
  write('.well-known/security.txt', securityTxt({ domain, email }));
  write('download/pdfmy-sbom.cdx.json', JSON.stringify(sbom({ webVersion, scanVersion, domain, company }), null, 2) + '\n');
  const te = new TextEncoder(), rev = '1.0';
  write('download/pdfmy-richtlinien-admx.zip', Buffer.from(zip([
    { name: 'PolicyDefinitions/PDFMy.admx', data: te.encode(admx(rev)) },
    { name: 'PolicyDefinitions/de-DE/PDFMy.adml', data: te.encode(adml('de-DE', rev)) },
    { name: 'PolicyDefinitions/en-US/PDFMy.adml', data: te.encode(adml('en-US', rev)) },
  ], new Date(2026, 0, 1))));
  // RFC 9116, 3: text/plain mit charset=utf-8; JSON der SBOM als CycloneDX-Medientyp
  const htaccess = `
# security.txt (RFC 9116) und Prüfsummen als UTF-8-Text; SBOM mit CycloneDX-Medientyp
AddCharset utf-8 .txt
<Files "pdfmy-sbom.cdx.json">
  ForceType "application/vnd.cyclonedx+json"
</Files>
`;
  return { htaccess, sbom: 'download/pdfmy-sbom.cdx.json', admx: 'download/pdfmy-richtlinien-admx.zip', components: COMPONENTS, policies: POLICIES };
};
Object.assign(module.exports, { COMPONENTS, POLICIES, admx, adml, sbom, securityTxt });
