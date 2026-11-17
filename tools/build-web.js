// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Baut die öffentliche Web-Version (pdfmy.de) nach dist/<domain>.
// Aufruf: node tools/build-web.js   (bricht ab, wenn Impressumsdaten in tools/site.json fehlen)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(__dirname, 'site.json'), 'utf8'));
// Store-Adressen (15.11.2026): tools/site.json → "stores": { "firefox": "https://addons.mozilla.org/…", "thunderbird": …, "chrome": …, "edge": … }
// Auf der Website stehen nur feste Verweise pdfmy.de/go/<store> (Umleitung in .htaccess) – die Texte bleiben gleich und sind vorübersetzt.
// PDFMY_ALL_STORES=1 zeigt alle Knöpfe mit Platzhalter-Adressen (nur zum Sammeln der Übersetzungstexte, nie ausrollen).
const STORE = Object.assign({}, site.firefoxAmo ? { firefox: site.firefoxAmo } : {}, site.stores || {},
  process.env.PDFMY_ALL_STORES === '1' ? { firefox: 'https://example.invalid/', thunderbird: 'https://example.invalid/', chrome: 'https://example.invalid/', edge: 'https://example.invalid/' } : {});
for (const [k, v] of Object.entries(STORE)) if (!/^https:\/\/[\w.-]+\/[^\s"'<>]*$/.test(v)) { console.error(`Store-Adresse ungültig (${k}): ${v}`); process.exit(1); }
const OUT = path.join(ROOT, 'dist', site.domain);
const op = site.operator;
const APPSUPPORT = (fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8').match(/supportMail:\s*'([^']+)'/) || [])[1] || 'wumertens@mentor-group.de';
// Texte der Startseite (Tab-Titel, Beschreibung, Fußzeile): eine Quelle für Build und Wörterbuch (i18n/_web.json → i18n-extract)
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', '_web.json'), 'utf8')), N = W.nav;
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const missing = ['street', 'zipCity', 'email'].filter(k => !op[k]).concat(op.name || op.company ? [] : ['name/company']);
if (missing.length && !process.argv.includes('--draft')) {
  console.error('Impressumsdaten fehlen in tools/site.json: ' + missing.join(', '));
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copy = (rel, to = rel) => fs.cpSync(path.join(ROOT, rel), path.join(OUT, to), { recursive: true });
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), text); };

// Dateien der App
// pdfmy.de im Mentor-Group-Design: „PDFMy – powered by Mentor Group“ (Schriften, Logo und Symbole wie die interne Version)
for (const f of ['js/app.js', 'js/i18n.js', 'js/bea.js', 'js/letter.js', 'js/fristen.js', 'js/formdaten.js', 'js/kommentare.js', 'js/qrstempel.js', 'js/qr.js', 'js/patchcode.js', 'js/formdetect.js', 'js/formcalc.js', 'js/formprofile.js', 'js/reflow.js', 'js/preflight.js', 'js/hotfolder.js', 'js/a11ycheck.js', 'js/bank.js', 'js/pdfsign.js', 'js/pdfcrypt.js', 'js/sigreq.js', 'js/pdfinc.js', 'js/layout.js', 'js/textpdf.js', 'js/glyphless.js', 'js/office.js', 'js/pdfacheck.js', 'js/pptx.js', 'js/slides.js', 'js/pdfverify.js', 'js/docdetect.js', 'js/imaging.js', 'js/compactw.js', 'js/scanw.js', 'js/camera.js', 'js/tools.js', 'js/journal.js', 'js/einvoice.js', 'js/einvoice-out.js', 'js/email.js', 'js/pro.js',
  'icons/mentor-192.png', 'icons/mentor-512.png', 'icons/mentor-maskable-512.png', 'icons/mentor-group.png', 'icons/file-pdf-256.png', 'icons/file-image-256.png', 'icons/app-192.png', 'icons/app-512.png', 'icons/app-maskable-512.png']) copy(f);
// Wörterbücher der Oberfläche (nur fertige Sprachen, ohne Arbeitsdateien)
for (const f of fs.readdirSync(path.join(ROOT, 'i18n')).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) copy('i18n/' + f);
fs.cpSync(path.join(ROOT, 'vendor'), path.join(OUT, 'vendor'), {
  recursive: true, filter: src => !/tesseract-core(-simd)?-lstm\.wasm$|tesseract-core(-simd)?\.wasm/.test(path.basename(src)) || /\.wasm\.js$/.test(src),
});
const webConfig = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8').replace("ownName: 'mentor', edition: 'local'", "ownName: '', edition: 'web'");
if (!webConfig.includes("edition: 'web'")) throw new Error('config.js: Edition nicht gefunden');
write('js/config.js', webConfig.replace('/* Edition und Branding.', `/* Web-Edition ${site.domain}.`));

// Content-Security-Policy: nur eigene Dateien; WebAssembly (OCR) und Blob-Worker erlaubt
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self' blob: data: http://127.0.0.1:* http://localhost:*; " +
  "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; frame-src 'self' blob:; base-uri 'self'; form-action 'none'; manifest-src 'self'";

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rep = (a, b) => { if (!html.includes(a)) throw new Error('index.html: nicht gefunden: ' + a.slice(0, 60)); html = html.replace(a, b); };
rep('<title>PDFMy</title>', `<title>${esc(W.title)}</title>
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<link rel="canonical" href="https://${site.domain}/">
<meta property="og:title" content="${esc(W.ogTitle)}">
<meta property="og:description" content="${esc(W.ogDescription)}">
<meta property="og:url" content="https://${site.domain}/">
<meta property="og:image" content="https://${site.domain}/icons/mentor-512.png">`);
rep('content="Briefe scannen, als durchsuchbares PDF ablegen und bearbeiten – lokal, ohne Upload."',
  `content="${esc(W.description)}"`);
rep('<span id="msg" role="status">Bereit.</span>', `<span id="msg" role="status">Bereit.</span><nav class="legal"><a class="lx" href="#weiterempfehlen">${N.weiterempfehlen}</a><a class="lx" href="hilfe.html">${N.hilfe}</a><a class="lx" href="werkzeuge.html">${N.werkzeuge}</a><a class="lx ext" href="erweiterung.html">${N.erweiterung}</a><a class="lx" href="presse.html">${N.presse}</a><a href="impressum.html">${N.impressum}</a><a href="datenschutz.html">${N.datenschutz}</a><a class="lx" href="nutzungsbedingungen.html">${N.nutzungsbedingungen}</a><a href="barrierefreiheit.html">${N.barrierefreiheit}</a><a class="lx" href="https://github.com/haus-it/pdfmy" target="_blank" rel="noopener">${N.quellcode}</a></nav>`);
// Fußzeile am Handy (Rückmeldung GF 08.11.2026 „der Fuß ist zu hoch – sei sparsamer“): eine Zeile – Impressum, Datenschutz,
// Barrierefreiheit (Pflichtangaben); Hilfe, Weiterempfehlen usw. stehen im Menü „Mehr“. Zeigt die Statuszeile eine Meldung, hat sie Vorrang.
rep('</style>', 'footer .legal a{color:var(--muted)} footer .legal{white-space:nowrap} footer .legal a+a::before{content:"·";display:inline-block;margin:0 5px;color:var(--muted);text-decoration:none} @media (pointer:coarse){footer .legal .ext{display:none}} @media (max-width:760px){footer .legal .lx{display:none} footer .legal{display:flex;gap:10px;flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none} footer .legal a+a::before{content:none} footer .legal::-webkit-scrollbar{display:none} footer:not(.st-idle) .legal{display:none}}\n</style>');
// Suchmaschinen: kanonische Adresse und strukturierte Daten (schema.org) der Anwendung
rep('</head>', `<link rel="canonical" href="https://${site.domain}/">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'PDFMy', url: `https://${site.domain}/`,
  applicationCategory: 'BusinessApplication', operatingSystem: 'Windows, macOS, Linux, Android, iOS (Browser)', browserRequirements: 'Chrome, Edge, Firefox oder Safari',
  description: 'Kostenlose PDF-Werkzeuge ohne Upload: scannen mit Texterkennung, zusammenfügen, verkleinern, schwärzen, unterschreiben, E-Rechnung, PDF/A.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, inLanguage: 'de',
  publisher: { '@type': 'Organization', name: op.company, address: { '@type': 'PostalAddress', streetAddress: op.street, addressLocality: 'Paderborn', postalCode: '33104', addressCountry: 'DE' } } }).replace(/</g, '\\u003c')}</script>
</head>`);
// Öffentliche Nutzungszahl (tools/site.json → stats): erst ab 1.000, abgerundet auf volle Tausend, nur belegte Zahlen
const stats = site.stats || {};
if (stats.count >= 1000) {
  const k = Math.floor(stats.count / 1000) * 1000;
  rep('<ul class="trust">', `<ul class="trust"><li title="Stand ${esc(stats.asOf || '')}">Über ${k.toLocaleString('de-DE')} ${esc(stats.label || 'Nutzer')}</li>`);
}
// Ladezeit: Chrome holte die rund 40 Skripte am Ende der Seite streng nacheinander (gemessen 09.11.2026: pdfmy.de 3–7 s, lokal 10 s bis
// „bereit“). Vorab-Hinweise im Kopf lassen den Browser alle parallel laden; die Reihenfolge der Ausführung bleibt die der <script>-Tags.
const preloadScripts = h => {
  const srcs = [...h.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(x => !/js\/(config|i18n)\.js$/.test(x));
  const at = '<script src="js/i18n.js"></script>';   // hinter die beiden Skripte im Kopf – die braucht die Seite zum Anzeigen zuerst
  if (srcs.length < 10 || !h.includes(at)) throw new Error('index.html: Skripte für Vorab-Laden nicht gefunden');
  return h.replace(at, at + '\n' + srcs.map(x => `<link rel="preload" as="script" href="${x}">`).join('\n'));
};
html = preloadScripts(html);
write('index.html', html);

// Manifest und Service Worker
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
Object.assign(man, { id: '/', name: 'PDFMy', short_name: 'PDFMy', description: 'PDF scannen, bearbeiten, zusammenfügen und schützen – direkt im Browser, ohne Upload.' });
write('manifest.webmanifest', JSON.stringify(man, null, 2) + '\n');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
write('sw.js', fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  .replace(/const VERSION = 'app-(v\d+)';/, (m, nr) => `const VERSION = 'pdfmy-${stamp}-${nr}';`)   // Zeitstempel + Versionsnummer (Statuszeile, Fehlerbericht)
  .replace("'js/tools.js',", "'js/tools.js', 'impressum.html', 'datenschutz.html', 'nutzungsbedingungen.html', 'barrierefreiheit.html', 'hilfe.html', 'hilfe.js', 'sprache.js',"));

// Rechtstexte und Infoseiten. multi: mehrsprachig (Hilfe, Scanner) – Sprachwahl oben rechts wie in der App, Wörterbuch i18n/site/<code>.json.
// Rechtstexte (Impressum, Datenschutz, Barrierefreiheit) bleiben ausschließlich deutsch.
const page = (title, body, head = '', multi = true) =>   // multi: Sprachauswahl und Übersetzung (alle Seiten)
 `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${title} – PDFMy</title>${head}${multi ? '<script src="js/i18n.js" data-dict="site"></script>' : ''}<link rel="icon" href="icons/mentor-192.png"><meta name="theme-color" content="#4B2FBF">
<style>
@font-face{font-family:"Bricolage Grotesque";src:url(vendor/fonts/bricolage-grotesque-latin-standard-normal.woff2) format("woff2");font-weight:200 800;font-stretch:75% 100%;font-display:swap}
@font-face{font-family:"Instrument Sans";src:url(vendor/fonts/instrument-sans-latin-wght-normal.woff2) format("woff2");font-weight:400 700;font-display:swap}
@font-face{font-family:"IBM Plex Mono";src:url(vendor/fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"IBM Plex Mono";src:url(vendor/fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2");font-weight:500;font-display:swap}
:root{--bg:#DDE5DC;--panel:#fff;--text:#1D1A33;--muted:#47485A;--accent:#4B2FBF;--line:#C3CEC2}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15141F;--panel:#1F1D2C;--text:#EEEDF5;--muted:#B5B3C6;--accent:#A99BFF;--line:#3D3A50}}
:root[data-theme="dark"]{--bg:#15141F;--panel:#1F1D2C;--text:#EEEDF5;--muted:#B5B3C6;--accent:#A99BFF;--line:#3D3A50}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 "Instrument Sans","Segoe UI",system-ui,sans-serif}
header{background:var(--panel);border-bottom:1px solid var(--line);padding:12px 20px}
.bugline{font-size:14px;color:var(--muted);margin:14px 4px}.bugline a{color:var(--accent)}
.brand{display:inline-flex;flex-direction:column;gap:3px;line-height:1;color:inherit;text-decoration:none}
.brand b{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:24px;letter-spacing:-.02em;color:var(--text)}
.brand span{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--muted)}
.brand img{height:13px;width:auto}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .brand img{background:#fff;padding:1px 3px;border-radius:2px}}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
.card{background:var(--panel);border:0;border-radius:20px;padding:28px}
h1,h2{font-family:"Bricolage Grotesque","Segoe UI",sans-serif} h1{font-size:40px;line-height:1.05;margin:8px 0 18px;font-weight:800;letter-spacing:-.02em}
h2{font-size:17px;margin:22px 0 6px} a{color:var(--accent)}
.back{display:inline-block;margin-bottom:8px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lang select{font:inherit;font-size:14px;max-width:46vw;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text)}
html.i18n-wait body{visibility:hidden}
html[lang="de"] .lang-note,html:not([lang]) .lang-note{display:none}.lang-note{border-left:4px solid #4B2FBF;padding:6px 12px;background:var(--bg)}
</style></head><body><header><a class="brand" href="./" translate="no"><b>PDFMy</b><span>powered by <img src="icons/mentor-group.png" alt="Mentor Group"></span></a>${multi ? '<span class="lang"><select id="siteLang" aria-label="Sprache"></select></span><script src="sprache.js"></script>' : ''}</header>
<main><a class="back" href="./">← zurück zu PDFMy</a><div class="card"><h1>${title}</h1>${body}</div><p class="bugline">Fehler gefunden oder eine Idee? <a href="./?melden">Fehler melden</a> – per E-Mail aus Ihrem Mailprogramm, ohne Dokumente.</p></main></body></html>
`;
const who = [op.company, op.name].filter(Boolean).map(esc).join('<br>');
const addr = `${who}<br>${esc(op.street)}<br>${esc(op.zipCity)}<br>${esc(op.country)}`;
write('impressum.html', page('Impressum', `
<p class="lang-note">Übersetzung zur Information – rechtlich maßgeblich ist die deutsche Fassung.</p>
<h2>Angaben gemäß § 5 DDG</h2><p>${addr}</p>
${op.representative ? `<p>Vertreten durch: ${esc(op.representative)}</p>` : ''}
<h2>Kontakt</h2><p>E-Mail: <a href="mailto:${esc(op.email)}">${esc(op.email)}</a>${op.phone ? `<br>Telefon: ${esc(op.phone)}` : ''}</p>
${op.register ? `<h2>Registereintrag</h2><p>${esc(op.register)}</p>` : ''}
${op.vatId ? `<h2>Umsatzsteuer-ID</h2><p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: ${esc(op.vatId)}</p>` : ''}
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>${esc(op.responsibleContent || op.name || op.company)}, Anschrift wie oben</p>
<h2>Verbraucherstreitbeilegung</h2><p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
<h2>Haftung</h2><p>pdfmy wird kostenlos und ohne Gewähr bereitgestellt. Bitte prüfen Sie erzeugte Dokumente vor der Weitergabe. Für Inhalte externer Links sind deren Betreiber verantwortlich.</p>`));

// Nutzungsbedingungen (Freigabe GF 15.11.2026, Grundlage docs/Nutzungsbedingungen.md) – nur deutsch, ohne Sprachwahl.
// Bei Änderungen: TERMS_DATE anpassen, docs/Nutzungsbedingungen.md gleichziehen, CHANGELOG-Eintrag.
const TERMS_DATE = '15.11.2026';
write('nutzungsbedingungen.html', page('Nutzungsbedingungen', `
<p>Stand: ${TERMS_DATE}</p>
<h2>§ 1 Anbieter und Geltungsbereich</h2>
<p>(1) PDFMy (${esc(site.domain)}) mit allen Bestandteilen wird angeboten von der ${esc(op.company)}, ${esc(op.street)}, ${esc(op.zipCity)} (${esc(op.register)}), vertreten durch den Geschäftsführer ${esc(op.responsibleContent)} („wir“). Zu den Bestandteilen gehören die Web-Anwendung, die installierbare App (PWA), das Hilfsprogramm „pdfmy Scan“ für Windows, macOS und Linux, die Browser-Erweiterung sowie die Add-ins und Erweiterungen für Microsoft 365, Teams, Thunderbird, LibreOffice, Nextcloud und ONLYOFFICE.</p>
<p>(2) Diese Bedingungen gelten für jede Nutzung von PDFMy. Abweichende Bedingungen der Nutzerinnen und Nutzer gelten nicht.</p>
<p>(3) PDFMy richtet sich an Verbraucher und Unternehmer. Regelungen, die nur für eine dieser Gruppen gelten, sind als solche gekennzeichnet.</p>
<h2>§ 2 Leistungen</h2>
<p>(1) PDFMy ist ein Werkzeug zum Bearbeiten, Erstellen, Prüfen und Ablegen von PDF-Dokumenten und Scans, unter anderem mit Texterkennung, Formularen, Unterschriften, Schwärzen, E-Rechnung und barrierefreier PDF/A-Ausgabe.</p>
<p>(2) <b>Die Verarbeitung findet ausschließlich auf dem Gerät der Nutzerin bzw. des Nutzers statt.</b> Dokumente werden nicht auf unsere Server hochgeladen. Wir sehen, speichern und prüfen keine Inhalte. Einzelheiten regelt die <a href="datenschutz.html">Datenschutzerklärung</a>.</p>
<p>(3) Die Nutzung ist unentgeltlich. Ein Anspruch auf eine bestimmte Funktion, Verfügbarkeit oder Weiterentwicklung besteht nicht. Wir dürfen Funktionen ändern, erweitern oder einstellen. Sollten wir künftig kostenpflichtige Leistungen anbieten, gelten dafür gesonderte Bedingungen, die vor einer Buchung mitgeteilt werden.</p>
<h2>§ 3 Zulässige Nutzung</h2>
<p>(1) PDFMy darf für eigene Dokumente genutzt werden. Für fremde Dokumente gilt das nur, soweit die Nutzerin bzw. der Nutzer zur Bearbeitung berechtigt ist, etwa durch Auftrag oder Einwilligung.</p>
<p>(2) Die Nutzerin bzw. der Nutzer ist für die bearbeiteten Inhalte und deren Weitergabe selbst verantwortlich. Erzeugte Dokumente sind vor der Verwendung zu prüfen. Das gilt besonders für automatisch erkannte Angaben wie Beträge, Fristen, IBAN und Absender.</p>
<h2>§ 4 Verbotene Nutzung</h2>
<p>(1) PDFMy darf nicht genutzt werden, um andere zu täuschen oder Rechte Dritter zu verletzen. Verboten ist insbesondere:</p>
<ol>
<li><b>Fälschen oder Verfälschen von Dokumenten</b>, um im Rechtsverkehr zu täuschen – vor allem von Urkunden, Zeugnissen, Ausweisen und Aufenthaltstiteln, amtlichen Bescheiden (etwa Steuer-, Renten- oder Bewilligungsbescheiden), Urteilen und Beschlüssen, notariellen Urkunden, Kontoauszügen, Gehalts- und Einkommensnachweisen, Auskünften von Auskunfteien, Bescheinigungen von Vermietern oder Arbeitgebern sowie Rechnungen, Quittungen und Belegen (siehe insbesondere §§ 267, 269, 271, 273, 275, 276 StGB);</li>
<li><b>Täuschung zur Erlangung von Vermögensvorteilen</b>, etwa bei Kredit-, Miet-, Versicherungs-, Spesen- oder Sozialleistungsanträgen (§§ 263, 263a, 264, 265b StGB, § 370 AO);</li>
<li><b>unbefugtes Verwenden fremder Unterschriften, Namen, Stempel oder Siegel;</b></li>
<li><b>unbefugtes Veröffentlichen oder Verbreiten personenbezogener Daten Dritter</b> oder urheberrechtlich geschützter Werke ohne Berechtigung;</li>
<li><b>Umgehen, Entfernen oder Unwirksammachen der Schutzfunktionen nach § 5</b>, insbesondere von Markierungen und Vermerken „nachträglich geändert“, sowie das Entfernen von Rechte-Einschränkungen fremder Dokumente ohne Berechtigung;</li>
<li><b>Eingriffe in PDFMy oder unsere Systeme</b>, etwa das Verändern, Nachbauen oder Wiederveröffentlichen von PDFMy unter Umgehung der Schutzfunktionen, automatisierte Massenabrufe der Website und Angriffe auf unsere Systeme. Rechte aus den Lizenzen nach § 8 bleiben unberührt.</li>
</ol>
<p>(2) Bei Verstößen dürfen wir die Nutzung einschränken, etwa durch Sperren der Browser-Erweiterung oder von Downloads. Soweit wir von Verstößen Kenntnis erlangen, dürfen wir Hinweise im gesetzlich zulässigen Rahmen an die zuständigen Behörden weitergeben. Weitergehende Ansprüche bleiben vorbehalten.</p>
<h2>§ 5 Schutz vor Fälschung</h2>
<p>(1) Um Missbrauch zu erschweren, erkennt PDFMy bestimmte Dokumentarten anhand ihres Textes:</p>
<ul>
<li><b>Urkunden, Zeugnisse, Ausweise, amtliche Bescheide und Gerichtsentscheidungen:</b> Die Funktionen zum Ersetzen oder Abdecken von Text sind gesperrt.</li>
<li><b>Kontoauszüge, Einkommensnachweise, Auskünfte, Rechnungen und ähnliche Belege:</b> Änderungen werden auf der Seite sichtbar markiert und mit dem Vermerk „nachträglich geändert“ versehen.</li>
<li><b>Alle Dokumente:</b> Wurde vorhandener Text ersetzt oder abgedeckt, wird dies in den Dokumenteigenschaften vermerkt.</li>
</ul>
<p>(2) Die Erkennung erfolgt automatisch und kann unvollständig sein. Wird eine Schutzfunktion nicht ausgelöst, bedeutet das keine Erlaubnis für eine nach § 4 verbotene Nutzung.</p>
<p>(3) Wer meint, dass ein Dokument zu Unrecht gesperrt wurde, kann uns dies melden (§ 10).</p>
<h2>§ 6 Verfügbarkeit, Datensicherung</h2>
<p>(1) Wir bemühen uns um eine störungsfreie Verfügbarkeit, schulden sie aber nicht.</p>
<p>(2) Da Dokumente nur auf dem eigenen Gerät verarbeitet werden, ist die Nutzerin bzw. der Nutzer für die Sicherung der Dokumente selbst verantwortlich. Das gilt auch für Daten im Browser-Speicher, etwa gespeicherte Unterschriften, das Posteingangsbuch und Einstellungen. Diese Daten können durch das Löschen von Browserdaten verloren gehen.</p>
<h2>§ 7 Haftung</h2>
<p>(1) Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit, für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit, nach dem Produkthaftungsgesetz sowie im Umfang einer übernommenen Garantie.</p>
<p>(2) Bei leichter Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen Pflicht, deren Erfüllung die ordnungsgemäße Nutzung von PDFMy überhaupt erst ermöglicht und auf deren Einhaltung die Nutzerin bzw. der Nutzer regelmäßig vertrauen darf; die Haftung ist dann auf den vorhersehbaren, typischerweise eintretenden Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen. Gesetzliche Haftungserleichterungen für unentgeltliche Leistungen bleiben unberührt.</p>
<p>(3) Automatisch erkannte Inhalte (etwa aus Texterkennung, Briefdaten oder Fristen) sind Hilfen, deren Richtigkeit wir nicht zusichern. Ob eine Unterschrift, Signatur oder E-Rechnung im Einzelfall rechtlich wirksam ist, hängt von den jeweiligen Vorschriften und Umständen ab; eine Prüfung im Einzelfall schulden wir nicht. Absatz 1 bleibt unberührt.</p>
<p>(4) Für die Inhalte verlinkter Seiten sind deren Betreiber verantwortlich.</p>
<h2>§ 8 Rechte an PDFMy, Open-Source-Bestandteile</h2>
<p>(1) PDFMy, insbesondere Gestaltung, Texte, Logos und eigener Programmcode, ist urheber- und markenrechtlich geschützt. Die Nutzung ist im Rahmen dieser Bedingungen gestattet. Der Quellcode steht unter der Lizenz PolyForm Noncommercial 1.0.0 auf <a href="https://github.com/haus-it/pdfmy" target="_blank" rel="noopener">GitHub</a> bereit; kommerzielle Nutzung des Quellcodes nur mit Lizenz der ${esc(op.company)}.</p>
<p>(2) PDFMy enthält Open-Source-Bestandteile, zum Beispiel pdf.js, pdf-lib, Tesseract und DejaVu-Schriften. Für diese gelten die jeweiligen Lizenzen; sie gehen diesen Bedingungen vor. Übersicht: <a href="https://github.com/haus-it/pdfmy/tree/main/vendor/licenses" target="_blank" rel="noopener">Lizenzen der verwendeten Bestandteile</a>.</p>
<h2>§ 9 Änderungen dieser Bedingungen</h2>
<p>Wir können diese Bedingungen mit Wirkung für die Zukunft ändern, etwa bei neuen Funktionen oder geänderter Rechtslage. Die jeweils aktuelle Fassung ist unter <a href="nutzungsbedingungen.html">${esc(site.domain)}/nutzungsbedingungen.html</a> abrufbar; das Datum oben zeigt den Stand.</p>
<h2>§ 10 Kontakt, Meldungen</h2>
<p>Fragen, Hinweise auf Missbrauch und Meldungen zu Unrecht gesperrter Dokumente: <a href="mailto:${esc(op.email)}">${esc(op.email)}</a> oder in PDFMy unter „Mehr → Problem melden“.</p>
<h2>§ 11 Schlussbestimmungen</h2>
<p>(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Für Verbraucher gilt dies nur, soweit ihnen dadurch nicht der Schutz zwingender Vorschriften des Staates ihres gewöhnlichen Aufenthalts entzogen wird.</p>
<p>(2) Ist die Nutzerin bzw. der Nutzer Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand Paderborn.</p>
<p>(3) Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
<p>(4) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.</p>`, '', false));

// Datum der letzten Barrierefreiheitsprüfung (axe-core, Tastatur) – bei neuer Prüfung anpassen
const A11Y_DATE = '19.10.2026';
write('barrierefreiheit.html', page('Erklärung zur Barrierefreiheit', `
<p>Die Mentor GmbH ist bestrebt, PDFMy (${esc(site.domain)}) barrierefrei zugänglich zu machen – nach den Web Content Accessibility Guidelines (<b>WCAG 2.1, Stufe AA</b>) bzw. EN 301 549, im Sinne des Barrierefreiheitsstärkungsgesetzes (BFSG).</p>
<h2>Stand der Vereinbarkeit</h2>
<p>PDFMy ist <b>weitgehend vereinbar</b> mit WCAG 2.1 AA. Die Bewertung beruht auf einer Selbstbewertung vom ${A11Y_DATE}: automatisierte Prüfung mit axe-core (Hell- und Dunkelmodus, Handy-Ansicht, alle Dialoge – ohne Befund) und manuelle Prüfung der Tastaturbedienung.</p>
<h2>Was wir umgesetzt haben</h2>
<ul>
<li>Vollständige Bedienung mit der Tastatur, sichtbarer Fokus, Sprunglink „Zum Inhalt springen“, Befehlssuche mit <kbd>Strg</kbd>+<kbd>K</kbd></li>
<li>Werkzeuge (Text, Notiz, Stempel, Unterschrift) per <kbd>Enter</kbd> setzen, mit <kbd>N</kbd> auswählen, mit Pfeiltasten verschieben, mit <kbd>Entf</kbd> löschen</li>
<li>Beschriftete Bedienelemente und Formulare, Statusmeldungen für Screenreader, ausreichende Kontraste im Hell- und Dunkelmodus, Unterstützung von „Bewegung reduzieren“</li>
<li><b>Barrierefreie PDFs:</b> Jede Ausgabe im Format PDF/A ist zugleich PDF/UA-1 (ISO 14289-1) – mit Lesereihenfolge, Sprache und Alternativtexten, geprüft mit veraPDF.</li>
</ul>
<h2>Nicht barrierefreie Inhalte</h2>
<ul>
<li><b>Freihand-Stift, Markieren, Schwärzen und Abdecken</b> durch Ziehen auf der Seite erfordern Maus, Stift oder Touch. Alternativen: Schwärzen-Vorschläge („Persönliche Daten finden“), Text- und Notiz-Werkzeug per Tastatur.</li>
<li><b>Zuschneiden</b> von Handyfotos (Ecken verschieben) erfordert Maus oder Touch; die automatische Blatterkennung macht es meist überflüssig.</li>
<li>Die <b>Kamera-Ansicht</b> zeigt den Erkennungsrahmen nur visuell; Hinweise werden zusätzlich als Text angezeigt, der Auslöser ist ein beschrifteter Knopf.</li>
<li>Im Format „PDF“ gespeicherte Dokumente aus fremden Quellen bleiben unverändert (ohne Struktur); für barrierefreie Ausgaben PDF/A wählen.</li>
</ul>
<h2>Feedback und Kontakt</h2>
<p>Sind Ihnen Mängel aufgefallen? Schreiben Sie uns: <a href="mailto:${esc(APPSUPPORT)}">${esc(APPSUPPORT)}</a> – oder in PDFMy unter „Mehr → Problem melden“. Wir antworten in der Regel innerhalb von zwei Wochen.</p>
<h2>Durchsetzung</h2>
<p>Erhalten Sie keine zufriedenstellende Antwort, können Sie sich an die für die Marktüberwachung nach dem BFSG zuständige Behörde wenden (Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen, MLBF).</p>
<p>Erstellt am ${A11Y_DATE}. Diese Erklärung wird bei wesentlichen Änderungen aktualisiert.</p>`));

write('datenschutz.html', page('Datenschutzerklärung', `
<p class="lang-note">Übersetzung zur Information – rechtlich maßgeblich ist die deutsche Fassung.</p>
<h2>1. Das Wichtigste in Kürze</h2>
<p><b>Ihre Dateien verlassen Ihr Gerät nicht.</b> pdfmy verarbeitet PDFs, Bilder und Scans ausschließlich in Ihrem Browser.
Dokumente, erkannter Text, Formulareingaben, Passwörter und Unterschriften werden weder an uns noch an Dritte übertragen.
Es gibt keine Cookies, kein Tracking, keine Werbenetzwerke und keine Einbindung externer Dienste. Auch die eingebaute KI (Texterkennung, Briefanalyse) läuft auf Ihrem Gerät, nicht bei einem KI-Dienst im Internet.</p>
<h2>2. Verantwortlicher</h2><p>${addr}<br>E-Mail: <a href="mailto:${esc(op.email)}">${esc(op.email)}</a></p>
<h2>3. Bereitstellung der Website (Hosting)</h2>
<p>Die Website wird bei der IONOS SE, Elgendorfer Str. 57, 56410 Montabaur, gehostet. Beim Aufruf übermittelt Ihr Browser technisch notwendige
Daten an den Server, die in Protokolldateien gespeichert werden können: IP-Adresse, Datum und Uhrzeit, aufgerufene Datei, übertragene Datenmenge,
Referrer-URL sowie Browser und Betriebssystem. Die Verarbeitung dient der sicheren und stabilen Bereitstellung der Website
(Art. 6 Abs. 1 lit. f DSGVO). Die Protokolldaten werden nach kurzer Zeit gelöscht oder anonymisiert und nicht mit anderen Daten zusammengeführt.
Mit IONOS besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.</p>
<p>Aus diesen Protokolldaten erstellt IONOS für uns zusammengefasste Zugriffsstatistiken (IONOS WebAnalytics) – etwa Zahl der Besucher, aufgerufene Seiten und Downloads. Dafür wird nichts in die Seite eingebunden, es gibt keine Cookies und keine Kennung, die Sie wiedererkennt
(Art. 6 Abs. 1 lit. f DSGVO; berechtigtes Interesse: Bedarf und Verbreitung des Angebots einschätzen). Damit Downloads von pdfmy Scan und der Browser-Erweiterung darin erscheinen, ruft PDFMy beim Herunterladen zusätzlich eine leere Seite
dieser Website ab (<code>/download/zaehlung/windows.html</code>, <code>mac.html</code>, <code>linux.html</code> bzw. <code>erweiterung.html</code>); dabei entstehen nur die oben genannten Protokolldaten.</p>
<p>Alle Programmteile, Schriften und die Sprachdaten der Texterkennung werden ausschließlich von ${esc(site.domain)} geladen, nicht von fremden Servern.</p>
<h2>4. Verarbeitung Ihrer Dokumente</h2>
<p>Öffnen, Texterkennung (OCR), Bearbeiten, Zusammenfügen, Komprimieren, Verschlüsseln und Speichern finden vollständig lokal in Ihrem Browser statt.
Gespeicherte Dateien legt Ihr Browser dort ab, wo Sie es auswählen. Wenn Sie einen Ordner freigeben („Scan-Ordner“, „Ablageordner“),
greift die Seite nur auf diesen Ordner zu und nur, solange die Seite geöffnet ist.</p>
<h2>5. Speicherung auf Ihrem Gerät</h2>
<p>Damit pdfmy schnell und auch offline funktioniert, speichert Ihr Browser die Programmdateien im Cache (Service Worker). Ihre Einstellungen
(z. B. Bildqualität) werden im lokalen Speicher Ihres Browsers abgelegt, Unterschrift, Kürzel und Firmenstempel (gezeichnet, getippt oder als Bild hochgeladen) nur, wenn Sie „Auf diesem Gerät merken“ aktivieren; hochgeladene Bilder werden dabei nur auf Ihrem Gerät verarbeitet. Die Handschrift-Schriften für getippte Unterschriften liefert pdfmy.de selbst aus – es werden keine Schriften von Dritten geladen.
Je nach genutzter Funktion speichert der Browser außerdem: das Posteingangsbuch (lokale Kopie) und einen Volltext-Index Ihrer abgelegten Briefe für die Suche,
gelernte Zuordnungen je Absender, Ihre eigene Anschrift und einen gewählten Briefbogen für Antwortbriefe, Ihre Firmendaten und die letzte Rechnungsnummer für E-Rechnungen, Vorlagen für Unterschriftsanfragen (Namen und E-Mail-Adressen der Personen, Felder, Nachricht),
Team-Adressen zum Weiterleiten, die Liste „Zuletzt geöffnet“ (nur Dateiname und ein Verweis auf die Datei, kein Inhalt), der Absturzschutz (eine Kopie noch nicht gespeicherter Dokumente, damit sie nach einem Absturz oder versehentlichem Schließen wiederhergestellt werden können; gelöscht beim Speichern oder Schließen, per „Verwerfen“ oder spätestens nach 7 Tagen) sowie ein von Ihnen gewähltes Signatur-Zertifikat (eine Zertifikatsdatei nur in der passwortgeschützten Form, bei Windows-Zertifikaten nur Name und Fingerabdruck; Passwort und PIN werden nie gespeichert).
Diese Daten bleiben in Ihrem Browser und werden nicht an uns übertragen.</p>
<p>Diese Speicherung ist für die von Ihnen gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Sie können sie jederzeit in PDFMy unter
„Einstellungen → Alle lokal gespeicherten Daten löschen“ oder über die Browser-Einstellungen („Websitedaten löschen“) entfernen. Dateien in Ihrem Ablageordner bleiben dabei erhalten.</p>
<h2>5a. Gerätefunktionen</h2>
<p><b>Kamera:</b> Beim Scannen mit dem Handy wird das Kamerabild nur im Browser verarbeitet und nicht übertragen. Den Zugriff erlauben Sie selbst und können ihn jederzeit entziehen.
<b>Mitteilungen:</b> Die Fristen-Erinnerung erzeugt Ihr Browser selbst; es gibt keinen Push-Dienst und keinen Server, der Ihre Fristen kennt.
<b>Vorlesen:</b> PDFMy nutzt nur Stimmen, die auf Ihrem Gerät installiert sind. Online-Stimmen, die den Text an einen fremden Server senden würden, werden bewusst nicht verwendet.
<b>Teilen und Weiterleiten:</b> Teilen Sie ein Dokument per E-Mail, Messenger oder Windows-Teilen, geht es über die von Ihnen gewählte App an den von Ihnen gewählten Empfänger; PDFMy selbst überträgt dabei nichts.</p>
<h2>6. Browser-Erweiterung „PDFMy – PDFs direkt öffnen“</h2>
<p>Die optionale Erweiterung für Chrome, Edge und Firefox lädt eine PDF, die Sie im Browser öffnen oder per Rechtsklick wählen, von der jeweiligen Webseite
und übergibt sie innerhalb Ihres Browsers an pdfmy. Dabei werden keine Daten an uns oder Dritte übertragen; es gibt keinen Verlauf, keine
Statistik und keine Fernkonfiguration. Gespeichert werden nur Ihre zwei Einstellungen (automatisch öffnen an/aus, Ziel) im Browser sowie für
wenige Minuten die Adresse der zuletzt übergebenen PDF, damit „Zurück“ nicht erneut umleitet (nur im Arbeitsspeicher des Browsers).
Den Zugriff auf Webseiten erteilen Sie ausdrücklich beim Einschalten; beim Ausschalten wird er entzogen.</p>
<h2>6a. Hilfsprogramm „pdfmy Scan“ (Windows, Mac und Linux)</h2>
<p>pdfmy Scan verbindet Ihren Scanner mit PDFMy. Es läuft auf Ihrem PC und ist nur von Ihrem eigenen Rechner aus erreichbar (127.0.0.1); Scans und Dokumente gehen direkt an PDFMy in Ihrem Browser.
Beim Signieren mit einem Windows-Zertifikat oder einer Signaturkarte bleibt der Schlüssel in Windows bzw. auf der Karte. Zur Update-Prüfung ruft pdfmy Scan beim Start und alle sechs Stunden eine Versionsdatei
von ${esc(site.domain)} ab; dabei entstehen nur die unter Nr. 3 genannten Server-Protokolldaten.
Richten Sie den Drucker „PDFMy“ ein, legt Windows gedruckte Dokumente in einem Ordner ab, auf den nur Ihr Benutzerkonto Zugriff hat (C:\\ProgramData\\PDFMy\\Druck); pdfmy Scan öffnet sie von dort in PDFMy und löscht sie nach 7 Tagen. Nichts davon wird übertragen. Wählen Sie „In Cloud-Ordner speichern“, legt pdfmy Scan die PDF in den Ordner Ihres Sync-Programms (z. B. Nextcloud, Dropbox, OneDrive) auf Ihrem Rechner; ob und wohin sie von dort übertragen wird, bestimmt allein Ihr Sync-Programm und Ihr Vertrag mit dessen Anbieter – PDFMy und pdfmy Scan selbst übertragen nichts.</p>
<p>pdfmy Scan für Mac arbeitet genauso: Es läuft auf Ihrem Mac, ist nur von dort aus erreichbar (127.0.0.1) und spricht mit Scannern in Ihrem lokalen Netzwerk. Öffnen Sie eine PDF per Doppelklick in PDFMy – oder wählen Sie im Druckdialog „PDF → In PDFMy öffnen“ –, wird die Datei mit einem Einmal-Kennwort direkt an PDFMy in Ihrem Browser übergeben; sie verlässt den Mac nicht. Bei der Einrichtung wird einmal das PDFMy-Symbol von ${esc(site.domain)} geladen; eine automatische Update-Prüfung gibt es nicht. pdfmy Scan für Linux arbeitet genauso (nur 127.0.0.1, Einrichtung nur für Ihren Benutzer, ohne Administratorrechte); als Standard für PDFs trägt es sich auf Ihren Wunsch in die Einstellungsdatei Ihrer Arbeitsoberfläche (mimeapps.list) ein.</p>
<h2>6b. Fehlerberichte und Kontakt per E-Mail</h2>
<p>„Fehler melden“, „Problem melden“ und „Herausforderung melden“ bereiten eine E-Mail in Ihrem eigenen Mailprogramm vor; gesendet wird erst, wenn Sie selbst auf „Senden“ klicken. Vorher sehen Sie genau,
was die E-Mail enthält (Versionen, Browser, Protokoll, aufgetretene Programmfehler und – wenn pdfmy Scan läuft – interne Netzwerkadresse und Rechnername; keine Dokumente). Dateinamen, Absender und E-Mail-Adressen werden standardmäßig unkenntlich gemacht.
Wir verwenden Ihre Nachricht nur, um das Problem zu lösen und Ihnen zu antworten (Art. 6 Abs. 1 lit. b und f DSGVO), und löschen sie, wenn sie dafür nicht mehr benötigt wird,
spätestens nach Ablauf gesetzlicher Aufbewahrungsfristen.</p>
<h2>6c. Hinweise auf eigene Angebote</h2>
<p>Auf der Startseite steht ein als Anzeige gekennzeichneter Hinweis auf ein Angebot der Mentor Group: Mentor GmbH (Haus iT, Haus iT Caller ID, mySupermail) oder Mertens GmbH (Mentor Consulting). Es ist ein einfacher Link ohne eingebundene Inhalte, Zählpixel oder Cookies. Welcher Hinweis erscheint, wird bei jedem Aufruf zufällig gewählt; dafür wird nichts auf Ihrem Gerät gespeichert. Erst wenn Sie ihn anklicken,
öffnet sich die jeweilige Website (www.haus-it.de, www.hausit-portal.de, www.mysupermail.app oder www.mentor-consulting.de) in einem neuen Tab; dabei wird keine Herkunftsadresse (Referrer) übermittelt. Für diese Website gilt die Datenschutzerklärung ihres Betreibers.</p>
<h2>6d. KI-Assistent</h2>
<p>Zusammenfassen, Fragen zum Dokument und Übersetzen nutzen die KI, die Ihr Browser mitbringt. Sie arbeitet auf Ihrem Gerät; der Text wird nicht übertragen. Das KI-Modell lädt Ihr Browser einmalig vom Browser-Hersteller, nicht von uns. Unter „… Mehr → KI-Assistent“ lässt sich die Funktion ausschalten. Auf eigenen Wunsch kann dort stattdessen ein KI-Programm auf Ihrem eigenen Rechner gewählt werden (z. B. Ollama oder LM Studio); PDFMy verbindet sich dann nur mit diesem Programm auf demselben Rechner (localhost) – der Text verlässt Ihren Rechner nicht, Adressen im Netz oder im Internet werden abgelehnt.</p>
<h2>6e. Erweiterungen für Microsoft 365 (Outlook, Word, Excel, PowerPoint, Teams), Thunderbird, LibreOffice, Nextcloud und ONLYOFFICE</h2>
<p>Das Add-in liest nur das geöffnete Dokument bzw. den Anhang, den Sie auswählen, und reicht ihn an PDFMy auf demselben Gerät weiter; beim Verfassen einer E-Mail hängt es auf Ihren Klick das fertige PDF an. Wir erhalten dabei keine Dokumente und keine E-Mail-Inhalte. Die Add-in-Seiten auf ${esc(site.domain)} laden die Office-Bibliothek <code>office.js</code> von Microsoft (appsforoffice.microsoft.com) – das schreibt Microsoft für Office-Add-ins vor; dabei verarbeitet Microsoft Ihre IP-Adresse wie bei der übrigen Nutzung von Microsoft 365 (Datenschutzerklärung von Microsoft). Die Teams-App zeigt PDFMy innerhalb von Teams. Die Thunderbird-Erweiterung öffnet PDFMy in einem Thunderbird-Tab und übergibt den Anhang dort direkt; sie überträgt nichts an uns. Die LibreOffice-Erweiterung speichert das Dokument als PDF in einen Arbeitsordner auf Ihrem Rechner (nach einem Tag gelöscht) und öffnet es über pdfmy Scan. Die Nextcloud-App und das ONLYOFFICE-Plugin laden die Datei von Ihrem eigenen Nextcloud- bzw. ONLYOFFICE-Server in Ihren Browser und reichen sie an PDFMy weiter; PDFMy fragt vorher, ob die Datei von dieser Adresse kommen darf. Speichern Sie zurück in Nextcloud, geht das Ergebnis nur an Ihren Nextcloud-Server. Wir erhalten in keinem Fall Dokumente.</p>
<h2>7. Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch gegen die
Verarbeitung (Art. 15–21 DSGVO). Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der für uns zuständigen Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2–4, 40213 Düsseldorf.</p>
<p>Da PDFMy Ihre Dokumente nicht erhält, liegen uns dazu keine Daten vor, über die wir Auskunft geben oder die wir löschen könnten; die lokal gespeicherten Daten verwalten Sie selbst.</p>
<p>Stand: ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p>`));

// Webserver-Konfiguration für IONOS (Apache)
write('.htaccess', `# pdfmy – Apache-Konfiguration (IONOS Webhosting)
Options -Indexes
DirectoryIndex index.html
<Files ".deploy-manifest.json">
  Require all denied
</Files>
ErrorDocument 404 /index.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Immer HTTPS und ohne www
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://${site.domain}%{REQUEST_URI} [R=301,L]
  RewriteCond %{HTTP_HOST} ^www\\. [NC]
  RewriteRule ^ https://${site.domain}%{REQUEST_URI} [R=301,L]
  # Teilen am Handy nimmt der Service Worker im Browser an; fehlt er (Websitedaten gelöscht),
  # sofort zurück zur App – der Server verarbeitet und speichert nichts
  RewriteRule ^teilen$ /?geteilt=0 [R=303,L]
</IfModule>

# Richtige Dateitypen; .gz NICHT als Content-Encoding ausliefern (die OCR entpackt selbst)
RemoveEncoding .gz
RemoveType .gz
AddType application/octet-stream .gz
AddType application/wasm .wasm
AddType application/manifest+json .webmanifest
AddType font/ttf .ttf
AddType application/vnd.iccprofile .icc
AddType text/javascript .js
AddType application/octet-stream .exe
# pdfmy Scan für Mac: Skript als Text ausliefern, nie auf dem Server ausführen
<FilesMatch "\\.(sh|pl|command)$">
  SetHandler default-handler
  ForceType "text/plain; charset=utf-8"
</FilesMatch>
<FilesMatch "\\.exe$">
  <IfModule mod_headers.c>
    Header set Content-Disposition "attachment"
  </IfModule>
</FilesMatch>
AddDefaultCharset utf-8

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/manifest+json font/ttf
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer"
  Header always set X-Frame-Options "DENY"
  Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"
  Header always set Strict-Transport-Security "max-age=31536000"
  # mysupermail.app und die Nextcloud-App reichen Dateien per Fenster-Nachricht herein (?quelle=…) – dafür muss das öffnende Fenster verbunden bleiben
  <If "%{QUERY_STRING} =~ /(^|&)quelle=(mysupermail|nextcloud|onlyoffice)(&|$)/">
    Header always set Cross-Origin-Opener-Policy "unsafe-none"
  </If>
  <Else>
    Header always set Cross-Origin-Opener-Policy "same-origin"
  </Else>
  Header always set Content-Security-Policy "${CSP}; frame-ancestors 'none'"
  <FilesMatch "\\.(html|webmanifest|js)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <If "%{REQUEST_URI} =~ m#^/(vendor|icons)/#">
    Header set Cache-Control "public, max-age=2592000"
  </If>
</IfModule>
`);
// Windows-Programm "pdfmy Scan" (Scanner direkt aus dem Browser)
const scanExe = path.join(ROOT, 'tools', 'pdfmy-scan', 'bin', 'Release', 'net48', 'pdfmy-Scan.exe');
// Eine Versionsnummer für Programm und Webseite: Abweichung = Build-Abbruch
const scanVer = (fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-scan', 'Program.cs'), 'utf8').match(/Version = "([\d.]+)"/) || [])[1];
const webVer = (fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').match(/const SCAN_LATEST = '([\d.]+)'/) || [])[1];
if (!scanVer || scanVer !== webVer) { console.error(`Versionskonflikt pdfmy Scan: Programm ${scanVer}, Webseite ${webVer}`); process.exit(1); }
const scanFile = `pdfmy-Scan-${scanVer}.exe`;
const scanKb = fs.existsSync(scanExe) ? Math.round(fs.statSync(scanExe).size / 1024) : 0;   // Downloadgröße auf der Scanner-Seite
const scanSha = fs.existsSync(scanExe) ? require('node:crypto').createHash('sha256').update(fs.readFileSync(scanExe)).digest('hex') : '';
// Freigabe in Stufen (Update-Strategie): rollout = Anteil der Installationen in %, die das Update automatisch angeboten bekommen
// (deploy.ps1 -ScanRollout 10 → erst 10 %, später 100 %); ohne Angabe 100. Ältere pdfmy-Scan-Versionen (< 1.13.0) kennen das Feld nicht.
const scanRollout = Math.max(0, Math.min(100, +(process.env.PDFMY_SCAN_ROLLOUT ?? site.scanRollout ?? 100) || 0));
write('download/version.json', JSON.stringify({ pdfmyScan: scanVer, file: scanFile, sha256: scanSha, rollout: scanRollout }) + '\n');   // Update-Prüfung + Integritätsprüfung in pdfmy Scan
if (fs.existsSync(scanExe)) {
  copy(path.relative(ROOT, scanExe), 'download/' + scanFile);
  copy(path.relative(ROOT, scanExe), 'download/pdfmy-Scan.exe');   // alter Link funktioniert weiter
}
else console.warn('Hinweis: pdfmy-Scan.exe nicht gebaut (dotnet build -c Release in tools/pdfmy-scan)');
// Download-Zähler (KONZEPT.md, 25.10.2026): leere Zählseiten ohne Skript; der Service Worker ruft sie beim Download ab,
// IONOS WebAnalytics zählt sie unter „Meist besuchte Seiten“ (/download/zaehlung/windows.html usw.)
for (const k of ['windows', 'mac', 'linux', 'erweiterung'])
  write(`download/zaehlung/${k}.html`, `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Download ${k}</title><p>Download-Zählung ${k} – ohne Cookie, ohne Kennung.</p></html>\n`);
// pdfmy Scan für Mac (tools/pdfmy-scan-mac): .command zum Doppelklicken (ZIP erhält das Ausführen-Recht) und als Skript für das Terminal
const MAC = path.join(ROOT, 'tools', 'pdfmy-scan-mac');
const lf = f => fs.readFileSync(path.join(MAC, f), 'utf8').replace(/\r\n/g, '\n');
const macPl = lf('pdfmy-scan.pl'), macVer = (macPl.match(/our \$VERSION = '([\d.]+)'/) || [])[1];
const macWeb = (fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').match(/const SCAN_MAC_LATEST = '([\d.]+)'/) || [])[1];
if (!macVer || macVer !== macWeb) { console.error(`Versionskonflikt pdfmy Scan für Mac: Programm ${macVer}, Webseite ${macWeb}`); process.exit(1); }
if (/^PDFMY_PERL_END$/m.test(macPl)) { console.error('pdfmy-scan.pl enthält die Endmarke PDFMY_PERL_END'); process.exit(1); }
const macInstall = lf('install.command').replace('__PDFMY_PERL__', () => macPl.trimEnd()).replace(/__PDFMY_VERSION__/g, macVer);
const macZip = 'pdfmy-Scan-Mac.zip', enc8 = s => new Uint8Array(Buffer.from(s, 'utf8'));
write('download/pdfmy-scan-mac.sh', macInstall);
write('download/' + macZip, Buffer.from(require(path.join(ROOT, 'js', 'tools.js')).zip([
  { name: 'pdfmy-Scan-Mac.command', data: enc8(macInstall), mode: 0o100755 },
  { name: 'pdfmy-Scan-Mac-entfernen.command', data: enc8(lf('uninstall.command')), mode: 0o100755 },
  { name: 'LIESMICH.txt', data: enc8(`pdfmy Scan für Mac ${macVer}\r\n\r\n1. „pdfmy-Scan-Mac.command“ doppelklicken.\r\n   Meldet macOS „kann nicht geöffnet werden“: Systemeinstellungen → Datenschutz & Sicherheit → unten „Dennoch öffnen“.\r\n2. Fertig: In PDFMy (pdfmy.de) heißt der Knopf oben jetzt „Scannen“. PDFs öffnen sich per Doppelklick in PDFMy, wenn Sie das bei der Einrichtung bestätigen.\r\n\r\nEntfernen: „pdfmy-Scan-Mac-entfernen.command“ doppelklicken.\r\nAnleitung: https://pdfmy.de/scanner.html#mac · Hilfe: wumertens@mentor-group.de\r\n`) },
], new Date(2026, 0, 1))));
// pdfmy Scan für Linux (tools/pdfmy-scan-linux): dasselbe Programm wie für Mac, Installer als Shell-Skript (ohne sudo)
const LNX = path.join(ROOT, 'tools', 'pdfmy-scan-linux');
const lfl = f => fs.readFileSync(path.join(LNX, f), 'utf8').replace(/\r\n/g, '\n');
const linuxSh = 'pdfmy-scan-linux.sh';
write('download/' + linuxSh, lfl('install.sh').replace('__PDFMY_PERL__', () => macPl.trimEnd()).replace(/__PDFMY_VERSION__/g, macVer));
write('download/pdfmy-scan-linux-entfernen.sh', lfl('uninstall.sh'));
const linuxSha = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(OUT, 'download', linuxSh))).digest('hex');
// Paket für Debian, Ubuntu, Mint (.deb): Doppelklick → Paketinstallation, meist ohne Terminal (Wunsch GF 14.11.2026; Ubuntu öffnet je nach Version keine Installation → Befehl als Ausweg, 15.11.2026). Für alle Benutzer:
// Programm in /opt/pdfmy-scan, Scan-Dienst als systemd-Benutzerdienst für jede Anmeldung, „PDFMy“ mit Logo im Anwendungsmenü.
const linuxDeb = 'pdfmy-scan-linux.deb', LDEB = f => fs.readFileSync(path.join(LNX, 'deb', f));
const linuxFiles = [
    { path: '/opt/pdfmy-scan/pdfmy-scan.pl', data: macPl, mode: 0o755 },
    { path: '/opt/pdfmy-scan/pdfmy-open', data: LDEB('pdfmy-open').toString(), mode: 0o755 },
    { path: '/usr/lib/systemd/user/pdfmy-scan.service', data: `[Unit]\nDescription=pdfmy Scan – Scanner für PDFMy (nur 127.0.0.1)\nAfter=network-online.target\n\n[Service]\nExecStart=/usr/bin/perl /opt/pdfmy-scan/pdfmy-scan.pl\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n` },
    { path: '/usr/share/applications/pdfmy.desktop', data: `[Desktop Entry]\nType=Application\nName=PDFMy\nGenericName=PDF-Programm\nComment=PDFs öffnen, bearbeiten, unterschreiben und scannen – im Browser, ohne Upload\nExec=/opt/pdfmy-scan/pdfmy-open %F\nIcon=pdfmy\nMimeType=application/pdf;application/vnd.openxmlformats-officedocument.wordprocessingml.document;application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;application/vnd.openxmlformats-officedocument.presentationml.presentation;application/vnd.oasis.opendocument.text;application/vnd.oasis.opendocument.spreadsheet;application/vnd.oasis.opendocument.presentation;application/rtf;text/csv;text/markdown;message/rfc822;application/vnd.ms-outlook;application/oxps;application/vnd.ms-xpsdocument;image/png;image/jpeg;image/gif;image/webp;image/bmp;image/tiff;image/heic;\nCategories=Office;Viewer;\nKeywords=PDF;Scan;Scanner;Unterschrift;OCR;\nTerminal=false\nStartupNotify=false\n` },
    { path: '/usr/share/metainfo/de.pdfmy.PDFMy.metainfo.xml', data: LDEB('de.pdfmy.PDFMy.metainfo.xml').toString() },
    { path: '/usr/share/icons/hicolor/192x192/apps/pdfmy.png', data: fs.readFileSync(path.join(ROOT, 'icons', 'app-192.png')) },
    { path: '/usr/share/icons/hicolor/512x512/apps/pdfmy.png', data: fs.readFileSync(path.join(ROOT, 'icons', 'app-512.png')) },
    { path: '/usr/share/doc/pdfmy-scan/copyright', data: `pdfmy Scan ${macVer} – Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de)\nLizenz: PolyForm Noncommercial 1.0.0 – https://polyformproject.org/licenses/noncommercial/1.0.0/\nQuelltext: https://github.com/haus-it/pdfmy\n` },
];
write('download/' + linuxDeb, require('./deb.js').buildDeb({
  control: { Package: 'pdfmy-scan', Version: macVer, Architecture: 'all', Maintainer: 'Mentor GmbH <wumertens@mentor-group.de>',
    Depends: 'perl, curl, xdg-utils', Recommends: 'avahi-utils, sane-utils, sane-airscan, ipp-usb, libnotify-bin', Section: 'graphics', Priority: 'optional', Homepage: 'https://pdfmy.de',
    Description: 'PDFMy – PDFs öffnen, bearbeiten, unterschreiben und scannen\npdfmy Scan von pdfmy.de (Mentor GmbH, Paderborn) verbindet Netzwerk- und\nUSB-Scanner mit PDFMy und legt „PDFMy“ im Anwendungsmenü an: PDF-Dateien\nöffnen sich per Doppelklick in PDFMy.\n\nAlles bleibt auf diesem Rechner – pdfmy Scan ist nur über 127.0.0.1\nerreichbar, Dokumente werden nicht hochgeladen.' },
  scripts: { postinst: LDEB('postinst').toString(), prerm: LDEB('prerm').toString(), postrm: LDEB('postrm').toString() },
  files: linuxFiles,
}));
// Dieselben Dateien als .rpm (Fedora, openSUSE, RHEL, Rocky, Alma, Mageia) und für Arch/Manjaro – Doppelklick öffnet die Softwareverwaltung
// (GNOME Software, KDE Discover, YaST, Pamac). Die Paketskripte liegen mit im Programmordner, damit alle drei Pakete dasselbe tun.
const linuxRpm = 'pdfmy-scan-linux.rpm', linuxArch = 'pdfmy-scan-linux.pkg.tar.gz';
const pkgFiles = linuxFiles.concat(['postinst', 'prerm'].map(f => ({ path: '/opt/pdfmy-scan/paket/' + f, data: LDEB(f).toString(), mode: 0o755 })));
const pkgDesc = 'PDFMy – PDFs öffnen, bearbeiten, unterschreiben und scannen';
const menuRefresh = 'command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications; command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t /usr/share/icons/hicolor; exit 0\n';
write('download/' + linuxRpm, require('./linuxpkg.js').buildRpm({
  name: 'pdfmy-scan', version: macVer, summary: pkgDesc, vendor: 'Mentor GmbH', packager: 'Mentor GmbH <wumertens@mentor-group.de>', url: 'https://pdfmy.de',
  license: 'LicenseRef-PolyForm-Noncommercial-1.0.0',
  description: 'pdfmy Scan von pdfmy.de (Mentor GmbH, Paderborn) verbindet Netzwerk- und USB-Scanner mit PDFMy und legt „PDFMy“ im Anwendungsmenü an: PDF-Dateien öffnen sich per Doppelklick in PDFMy. Alles bleibt auf diesem Rechner – pdfmy Scan ist nur über 127.0.0.1 erreichbar, Dokumente werden nicht hochgeladen.',
  // Dateipfade statt Paketnamen: gelten unter Fedora (curl-minimal, perl-interpreter) wie unter openSUSE; Perl-Module einzeln, weil Fedora sie aufteilt
  requires: ['/usr/bin/perl', '/usr/bin/curl', '/usr/bin/xdg-open', ...['JSON::PP', 'IO::Socket::INET', 'IO::Select', 'MIME::Base64', 'File::Temp', 'Encode', 'Unicode::Normalize', 'Time::HiRes', 'Socket'].map(m => `perl(${m})`)],
  recommends: ['sane-backends', 'sane-airscan', 'ipp-usb', 'avahi-tools', 'avahi-utils', 'libnotify', 'libnotify-tools'],
  scripts: { post: 'sh /opt/pdfmy-scan/paket/postinst configure; ' + menuRefresh, preun: '[ "$1" = 0 ] && sh /opt/pdfmy-scan/paket/prerm remove; exit 0\n', postun: menuRefresh },
  files: pkgFiles, ownDirs: ['/opt/pdfmy-scan', '/opt/pdfmy-scan/paket', '/usr/share/doc/pdfmy-scan'],
}));
write('download/' + linuxArch, require('./linuxpkg.js').buildPacman({
  name: 'pdfmy-scan', version: macVer, desc: pkgDesc + ' (Mentor GmbH)', url: 'https://pdfmy.de', packager: 'Mentor GmbH <wumertens@mentor-group.de>',
  license: 'LicenseRef-PolyForm-Noncommercial-1.0.0', depends: ['perl', 'curl', 'xdg-utils'],
  optdepends: ['sane: USB-Scanner', 'sane-airscan: Netzwerkscanner über SANE', 'ipp-usb: USB-Geräte mit AirScan', 'avahi: Scanner-Suche', 'libnotify: Meldungen'],
  install: 'post_install() { sh /opt/pdfmy-scan/paket/postinst configure; }\npost_upgrade() { post_install; }\npre_remove() { sh /opt/pdfmy-scan/paket/prerm remove; }\n',
  files: pkgFiles,
}));
// Browser-Erweiterung „PDFMy – PDFs direkt öffnen“ (tools/pdfmy-extension): ZIP zum Download und für den Chrome Web Store
const EXT = path.join(ROOT, 'tools', 'pdfmy-extension');
const extVer = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version;
const extFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name), rel = path.relative(EXT, full).split(path.sep).join('/');
    if (e.isDirectory()) { if (e.name !== 'test') walk(full); }
    else if (!/\.md$/i.test(e.name)) extFiles.push({ name: rel, data: new Uint8Array(fs.readFileSync(full)) });
  }
})(EXT);
const extZip = `pdfmy-erweiterung-${extVer}.zip`;
write('download/' + extZip, Buffer.from(require(path.join(ROOT, 'js', 'tools.js')).zip(extFiles, new Date(2026, 0, 1))));
// Firefox (app-v255): derselbe Code, eigenes Manifest – Hintergrundskript statt Service Worker, Kennung für Firefox-Add-ons,
// keine Datensammlung (data_collection_permissions). Installierbar in Firefox erst nach Signatur durch Mozilla (addons.mozilla.org).
const ffManifest = (() => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  delete m.minimum_chrome_version;
  m.background = { scripts: ['background.js'] };
  m.browser_specific_settings = { gecko: { id: 'pdfmy-erweiterung@mentor-group.de', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } }, gecko_android: { strict_min_version: '142.0' } };
  return m;
})();
const ffXpi = `pdfmy-firefox-${extVer}.xpi`;
write('download/' + ffXpi, Buffer.from(require(path.join(ROOT, 'js', 'tools.js')).zip(extFiles.map(f => f.name === 'manifest.json' ? { name: f.name, data: new Uint8Array(Buffer.from(JSON.stringify(ffManifest, null, 2))) } : f), new Date(2026, 0, 1))));
// Download-Ordner (Fehlerbericht 08.11.2026, „Ist keine .exe – man dreht sich im Kreis“): Eine noch offene ältere PDFMy-Fassung
// verlinkt die Datei der Vorversion, die beim Deploy gelöscht wird; der Server lieferte dafür die Startseite (ErrorDocument) aus,
// und die landete als „Download“ beim Nutzer. Jetzt: alte Versionsnummern → aktuelle Datei (302), sonst eine klare 404-Meldung.
write('download/.htaccess', `# Downloads: alte Versionen auf die aktuelle Datei umleiten, fehlende Dateien nie als Webseite ausliefern
ErrorDocument 404 "Datei nicht gefunden. Bitte auf https://${site.domain}/scanner.html neu herunterladen."
# Linux-Pakete: richtiger Typ, .pkg.tar.gz nie als „gzip-komprimiert“ ausliefern (sonst entpackt der Browser es beim Download)
AddType application/vnd.debian.binary-package .deb
AddType application/x-rpm .rpm
<FilesMatch "\\.pkg\\.tar\\.gz$">
  RemoveEncoding .gz
  ForceType application/octet-stream
  <IfModule mod_headers.c>
    Header unset Content-Encoding
  </IfModule>
</FilesMatch>
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteOptions Inherit
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^pdfmy-Scan-[0-9.]+\\.exe$ /download/${scanFile} [R=302,L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^pdfmy-erweiterung-[0-9.]+\\.zip$ /download/${extZip} [R=302,L]
</IfModule>
`);
// Erweiterungen für Microsoft 365 (Outlook, Word, Excel, PowerPoint, Teams) und Thunderbird (tools/addins.js, app-v254)
const ADD = require(path.join(ROOT, 'tools', 'addins.js'))({ ROOT, OUT, write, zip: require(path.join(ROOT, 'js', 'tools.js')).zip, domain: site.domain });
fs.appendFileSync(path.join(OUT, '.htaccess'), ADD.htaccess);
// Store-Verweise pdfmy.de/go/<store> → Store-Seite (nur für eingetragene Stores; sonst zur Erweiterungsseite)
fs.appendFileSync(path.join(OUT, '.htaccess'), `
# Store-Verweise (tools/site.json „stores“)
<IfModule mod_rewrite.c>
  RewriteEngine On
${['firefox', 'thunderbird', 'chrome', 'edge'].map(k => `  RewriteRule ^go/${k}/?$ ${STORE[k] || `https://${site.domain}/erweiterung.html`} [R=302,L]`).join(String.fromCharCode(10))}
</IfModule>
`);
// Für die IT: pdfmy Scan auf alle Rechner verteilen (Wettbewerbsvergleich 11/2026, Rang 5c) – Befehle, Erkennung, Richtlinien
const PSDIR = 'C:\\Program Files\\pdfmy Scan';
write('firmen.html', page('PDFMy in Firmen verteilen', `
<p><b>PDFMy selbst ist eine Web-App – auf den Rechnern muss dafür nichts installiert werden.</b> Für Scanner, „PDF per Doppelklick“, den Drucker „PDFMy“ und die Office-Anbindung verteilt die IT das kleine Programm <b>pdfmy Scan</b>: still, für alle Benutzer, ohne Rückfragen.</p>
<h2>Windows: pdfmy Scan für alle Benutzer</h2>
<ul>
<li>Datei: <a href="download/${scanFile}" download>${scanFile}</a> (signiert von der Mentor GmbH) · SHA-256 <code style="word-break:break-all">${scanSha || '–'}</code></li>
<li><b>Installieren</b> (als SYSTEM oder Administrator): <code>${scanFile} --install-all-users --quiet</code> – legt pdfmy Scan im Ordner <code>${PSDIR}</code> an, startet es bei jeder Anmeldung, trägt es ins Startmenü und unter „Installierte Apps“ ein. Rückgabewert 0 = erfolgreich.</li>
<li><b>Entfernen:</b> <code>"${PSDIR}\\pdfmy-Scan.exe" --uninstall-all-users --quiet</code> – die Einstellungen der Benutzer bleiben.</li>
<li><b>Erkennung</b> (Intune, SCCM/MECM): Registrierungsschlüssel <code>HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\pdfmy-scan-machine</code>, Wert <code>DisplayVersion</code> = ${scanVer}.</li>
<li><b>Updates:</b> Eine Installation für alle aktualisiert sich nicht selbst und zeigt keine Update-Hinweise – neue Versionen verteilt die IT mit demselben Befehl. Die aktuelle Version steht maschinenlesbar in <a href="download/version.json">download/version.json</a> (Felder <code>pdfmyScan</code> und <code>sha256</code>).</li>
<li>Hatte ein Benutzer pdfmy Scan schon selbst installiert, tritt seine Kopie zurück: Es startet die Fassung für alle.</li>
<li><b>Rechtsklick „In PDFMy öffnen“ und „Senden an → PDFMy“</b> (ab 1.18.0): für PDF, Word, Excel, PowerPoint, OpenDocument, Bilder, E-Mails (.eml, .msg) und Text – je Benutzer unter <code>HKCU\\Software\\Classes\\SystemFileAssociations\\&lt;Endung&gt;\\shell\\PDFMy.Open</code>; die Standardprogramme bleiben unverändert. Entfernen: <code>pdfmy-Scan.exe --unregister</code>.</li>
</ul>
<p><b>Intune:</b> Win32-App aus der .exe anlegen, Installations- und Deinstallationsbefehl wie oben, Installationsverhalten „System“, Erkennungsregel wie oben. <b>Gruppenrichtlinie:</b> Computer-Startskript mit dem Installationsbefehl. <b>Terminalserver:</b> geeignet – jeder Benutzer bekommt seinen eigenen Anschluss, Dokumente anderer Benutzer sind nicht erreichbar; den Drucker „PDFMy“ bietet pdfmy Scan dort nicht an.</p>
<h2>Richtlinien</h2>
<p>Unter <code>HKLM\\SOFTWARE\\Policies\\Mentor GmbH\\PDFMy</code> (oder für einzelne Benutzer unter HKCU), Typ DWORD, 1 = ein:</p>
<ul>
<li><code>DisableUpdates</code> – pdfmy Scan aktualisiert sich nicht selbst und bietet keine Updates an (auch bei Installationen einzelner Benutzer).</li>
<li>Ohne Richtlinie kann jeder Benutzer die automatische Installation im Menü von pdfmy Scan abschalten („Updates automatisch installieren“, ab 1.18.1); neue Versionen werden dann nur noch gemeldet.</li>
<li><code>DisablePrinter</code> – den Drucker „PDFMy“ nicht anbieten.</li>
</ul>
<pre style="overflow-x:auto;background:var(--bg);padding:10px">Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Mentor GmbH\\PDFMy]
"DisableUpdates"=dword:00000001</pre>
<h2>PDFMy als App für alle Benutzer (Chrome und Edge)</h2>
<p>Mit der Browser-Richtlinie <code>WebAppInstallForceList</code> erscheint PDFMy als App im Startmenü und auf dem Desktop:</p>
<pre style="overflow-x:auto;background:var(--bg);padding:10px">[{"url": "https://${site.domain}/", "default_launch_container": "window", "create_desktop_shortcut": true}]</pre>
<h2 id="m365">Microsoft 365: Outlook, Word, Excel, PowerPoint</h2>
<p>Mit dem Add-in <b>PDFMy</b> öffnen Benutzer Dokumente und Anhänge direkt aus Office in PDFMy – auf ihrem Gerät, ohne Upload:</p>
<ul>
<li><b>Outlook:</b> Knopf „PDFMy“ beim Lesen und Verfassen. PDF-Anhänge öffnen, bearbeiten, unterschreiben; beim Verfassen das bearbeitete PDF wieder anhängen oder ein neues PDF scannen und anhängen.</li>
<li><b>Outlook für iPhone und Android:</b> Knopf „PDFMy“ beim Lesen einer E-Mail; Anhänge öffnen sich in PDFMy direkt im Add-in (beim Verfassen erlaubt Microsoft auf Mobilgeräten keine Add-in-Knöpfe). Voraussetzung: Postfach in Microsoft 365 (Exchange Online).</li>
<li><b>Word, Excel, PowerPoint:</b> Knopf „In PDFMy öffnen“ auf der Registerkarte „Start“. Word und PowerPoint übergeben das Dokument als PDF, Excel als Arbeitsmappe (PDFMy wandelt sie um).</li>
</ul>
<p><b>An alle verteilen:</b> Microsoft 365 Admin Center → <i>Einstellungen → Integrierte Apps → Benutzerdefinierte Apps hochladen</i> → „Office-Add-in“ → Manifestdatei hochladen, Benutzer oder Gruppen wählen. Die Knöpfe erscheinen nach einigen Stunden bei allen gewählten Benutzern.</p>
<ul>
<li>Manifest für Outlook: <a href="download/pdfmy-outlook.xml" download>pdfmy-outlook.xml</a></li>
<li>Manifest für Word, Excel und PowerPoint: <a href="download/pdfmy-office.xml" download>pdfmy-office.xml</a></li>
</ul>
<p><b>Einzeln:</b> In Outlook <i>Add-Ins abrufen → Meine Add-Ins → Benutzerdefiniertes Add-In hinzufügen → Aus Datei hinzufügen</i>; in Word, Excel und PowerPoint im Web <i>Add-Ins → Meine Add-Ins → Eigenes Add-In hochladen</i>.</p>
<p><b>Datenschutz:</b> Das Add-in liest nur das geöffnete Dokument bzw. den gewählten Anhang und reicht ihn an PDFMy auf demselben Gerät weiter. Die Add-in-Seiten laden die Office-Bibliothek von Microsoft (Vorgabe von Microsoft für Office-Add-ins), sonst nur Dateien von ${esc(site.domain)}. Es gibt kein Konto, keinen Server und keine Telemetrie.</p>
<h2 id="teams">Microsoft Teams</h2>
<p>PDFMy als persönliche App in Teams: <a href="download/pdfmy-teams.zip" download>pdfmy-teams.zip</a>. Teams Admin Center → <i>Teams-Apps → Apps verwalten → Hochladen</i>, danach per Einrichtungsrichtlinie anheften. Einzeln (wenn erlaubt): Teams → <i>Apps → Apps verwalten → App hochladen</i>.</p>
<h2 id="thunderbird">Thunderbird</h2>
${STORE.thunderbird ? '<p><b>Am einfachsten:</b> PDFMy bei <a href="go/thunderbird" target="_blank" rel="noopener">Thunderbird-Add-ons</a> installieren – in Thunderbird unter „Extras → Add-ons und Themes“ nach „PDFMy“ suchen und „Zu Thunderbird hinzufügen“ klicken.</p>' : ''}
<p>Erweiterung <a href="download/${ADD.tbXpi}" download>${ADD.tbXpi}</a> (Thunderbird 115 oder neuer): Anhänge per Knopf „PDFMy“ oder Rechtsklick in PDFMy öffnen, beim Verfassen bearbeitete oder neue PDFs anhängen. Einzeln: <i>Extras → Add-ons und Themes → Zahnrad → Add-on aus Datei installieren</i>. Für alle: Richtlinie <code>ExtensionSettings</code> mit <code>"pdfmy@mentor-group.de": {"installation_mode": "force_installed", "install_url": "https://${site.domain}/download/${ADD.tbXpi}"}</code>.</p>
<h2 id="libreoffice">LibreOffice und Collabora Office</h2>
<p>Erweiterung <a href="download/${ADD.loOxt}" download>${ADD.loOxt}</a> (ab LibreOffice 7.0, Windows, Mac, Linux): <i>Datei → In PDFMy öffnen</i> und ein Symbol in der Symbolleiste. Writer, Calc, Impress und Draw speichern das Dokument als PDF in einen Arbeitsordner auf dem Rechner, pdfmy Scan öffnet es in PDFMy – ohne Upload. Ohne pdfmy Scan zeigt die Erweiterung den Ordner und öffnet pdfmy.de. Einzeln: Doppelklick auf die Datei oder <i>Extras → Extension Manager → Hinzufügen</i>. Für alle: <code>unopkg add --shared ${ADD.loOxt}</code> (als Administrator).</p>
<h2 id="nextcloud">Nextcloud</h2>
<p>App <a href="download/${ADD.ncZip}" download>${ADD.ncZip}</a> (Nextcloud 28 bis 35): In „Dateien“ steht bei PDFs, Bildern und Office-Dateien <i>In PDFMy öffnen</i>. PDFMy öffnet sich in einem neuen Tab und fragt einmal, ob die Datei von Ihrer Nextcloud kommen darf; <i>In Nextcloud speichern</i> legt eine PDF als neue Version derselben Datei ab (die alte bleibt in den Versionen), andere Formate als PDF daneben. Die Datei geht nur zwischen Browser und PDFMy. Einrichten: ZIP in den Ordner <code>custom_apps</code> (bzw. <code>apps</code>) der Nextcloud entpacken, dann <code>occ app:enable pdfmy</code> oder unter <i>Apps → Deaktivierte Apps</i> aktivieren.</p>
<h2 id="onlyoffice">ONLYOFFICE Docs</h2>
<p>Plugin <a href="download/${ADD.ooPlugin}" download>${ADD.ooPlugin}</a> (ONLYOFFICE Docs ab 7.4, z. B. in Nextcloud, ownCloud, Seafile oder DocSpace): Registerkarte <i>Plugins → PDFMy</i> → <i>In PDFMy öffnen</i>. ONLYOFFICE erzeugt das PDF auf Ihrem eigenen ONLYOFFICE-Server, PDFMy übernimmt es im Browser. Einrichten: <i>Plugins → Plugin-Manager → Plugin installieren</i> und die Datei wählen, oder für alle Benutzer entpackt in den Plugin-Ordner des Servers legen. In den ONLYOFFICE-Desktop-Programmen liefert ONLYOFFICE kein PDF an Plugins – dort <i>Datei → Drucken</i> mit dem Drucker „PDFMy“.</p>
<h2>Linux und Mac</h2>
<ul>
<li><b>Linux</b> (für alle Benutzer, z. B. per Ansible oder Puppet): <code>apt install ./${linuxDeb}</code> · <code>dnf install ./${linuxRpm}</code> · <code>zypper install ./${linuxRpm}</code> · <code>pacman -U ./${linuxArch}</code></li>
<li><b>Mac</b> (je Benutzer, z. B. als Skript der Geräteverwaltung im Benutzerkontext): <code>curl -fsSL https://${site.domain}/download/pdfmy-scan-mac.sh | bash</code></li>
</ul>
<h2>Datenschutz und Sicherheit</h2>
<p>Dokumente verlassen den Rechner nicht: PDFMy arbeitet im Browser, pdfmy Scan ist nur vom eigenen Rechner aus erreichbar (127.0.0.1) und beantwortet nur Anfragen des angemeldeten Benutzers. Es gibt keine Telemetrie und kein Benutzerkonto. Updates prüft pdfmy Scan per SHA-256 und Signatur der Mentor GmbH. Fragen zur Verteilung: <a href="mailto:${esc(APPSUPPORT)}?subject=PDFMy%20in%20Firmen%20verteilen">${esc(APPSUPPORT)}</a></p><p>Für IT-Sicherheit, Datenschutz und Beschaffung in Unternehmen und Behörden: <a href="sicherheit.html">Sicherheit und Compliance</a> · <a href="download/pdfmy-richtlinien-admx.zip">ADMX-Vorlagen</a> · <a href="download/pdfmy-sbom.cdx.json">SBOM</a></p>
`));
// Unternehmen und Behörden (15.11.2026): security.txt, SBOM (CycloneDX), ADMX-Vorlagen – tools/enterprise.js
const ENT = require(path.join(ROOT, 'tools', 'enterprise.js'))({ write, zip: require(path.join(ROOT, 'js', 'tools.js')).zip, domain: site.domain,
  company: op.company, email: op.email, webVersion: (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const VERSION = 'app-(v\d+)'/) || [])[1], scanVersion: scanVer,
  // weitere eigene Programme in der SBOM (15.11.2026): pdfmy Scan für Mac/Linux, Browser-Erweiterung, Nextcloud-App (AGPL)
  extra: [
    { ref: 'scan-unix', name: 'pdfmy Scan (Mac, Linux)', version: macVer, description: 'Lokaler Helfer (127.0.0.1) für Scanner und Dateiübergabe; nur Perl-Kernmodule und Bordmittel des Systems, keine Fremdbibliotheken' },
    { ref: 'extension', name: 'PDFMy Browser-Erweiterung (Chrome, Edge, Firefox)', version: JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-extension', 'manifest.json'), 'utf8')).version, description: 'PDFs aus dem Browser in PDFMy öffnen; keine Fremdbibliotheken' },
    { ref: 'nextcloud', name: 'PDFMy für Nextcloud', version: (fs.readFileSync(path.join(ROOT, 'tools', 'addins.js'), 'utf8').match(/NC_VERSION = '([\d.]+)'/) || [])[1], description: 'Dateiaktion „In PDFMy öffnen“; keine Fremdbibliotheken', license: 'AGPL-3.0-or-later' },
  ] });
fs.appendFileSync(path.join(OUT, '.htaccess'), ENT.htaccess);
// Steckbrief für IT-Sicherheit, Datenschutz und Beschaffung – nur deutsch (Prüfunterlage wie die Rechtstexte), ohne Sprachwahl
write('sicherheit.html', page('Sicherheit und Compliance', `
<p><b>Für IT-Sicherheit, Datenschutzbeauftragte und Beschaffung in Unternehmen und Behörden.</b> Diese Seite fasst zusammen, was für die Freigabe von PDFMy geprüft wird. Verteilung und Richtlinien: <a href="firmen.html">PDFMy in Firmen verteilen</a>.</p>
<h2>Auf einen Blick</h2>
<table class="facts">
<tr><th scope="row">Verarbeitung der Dokumente</th><td>ausschließlich auf dem Gerät (Browser bzw. pdfmy Scan auf 127.0.0.1) – kein Upload, auch nicht an uns</td></tr>
<tr><th scope="row">Konto, Telemetrie, Cookies</th><td>keine</td></tr>
<tr><th scope="row">Server</th><td>nur statische Dateien von ${esc(site.domain)}; Hosting: IONOS SE, Montabaur (Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO)</td></tr>
<tr><th scope="row">Fremddienste</th><td>keine; Ausnahmen nur auf Wunsch des Benutzers (siehe „Netzwerk“)</td></tr>
<tr><th scope="row">Kosten, Vertrag</th><td>kostenlos, ohne Lizenz je Benutzer, ohne Vertragsabschluss (<a href="nutzungsbedingungen.html">Nutzungsbedingungen</a>)</td></tr>
<tr><th scope="row">Anbieter</th><td>${esc(op.company)}, ${esc(op.street)}, ${esc(op.zipCity)} (${esc(op.register)})</td></tr>
<tr><th scope="row">Quellcode</th><td>öffentlich auf <a href="https://github.com/haus-it/pdfmy" target="_blank" rel="noopener">GitHub</a> (PolyForm Noncommercial 1.0.0)</td></tr>
</table>
<h2>Netzwerk und Proxy</h2>
<ul>
<li><b>Freizugeben:</b> <code>https://${esc(site.domain)}</code> (TCP 443). Darüber kommen App, Sprachdaten der Texterkennung, Schriften und die Update-Prüfung von pdfmy Scan (<code>/download/version.json</code>). Nach dem ersten Aufruf läuft PDFMy auch ohne Netz (Service Worker).</li>
<li><b>pdfmy Scan</b> lauscht nur auf <code>127.0.0.1</code>, Port 52880 (bei mehreren Benutzern auf einem Rechner 52881–52889), und nimmt nur Anfragen von PDFMy mit Herkunftsprüfung und Pflicht-Header an. Aus dem Netz ist es nicht erreichbar.</li>
<li><b>Scanner im eigenen Netz</b> (nur wenn der Benutzer einen Scanner sucht): mDNS (UDP 5353), WS-Discovery (UDP 3702), eSCL/WSD per HTTP(S) zu den Geräten (TCP 80, 443, 5357, 8080); zum Wecken schlafender Geräte kurze Verbindungsversuche auf TCP 80, 443, 631, 5357, 8080, 9100 und Wake-on-LAN – nur private Adressbereiche (10/8, 172.16/12, 192.168/16).</li>
<li><b>Zeitstempel</b> (nur wenn der Benutzer beim Signieren einen Zeitstempel wählt): RFC-3161-Dienst aus einer festen Liste, z. B. zeitstempel.dfn.de, timestamp.digicert.com, timestamp.sectigo.com, timestamp.globalsign.com, tsa.swisssign.net.</li>
<li><b>Add-ins für Microsoft 365</b> laden <code>office.js</code> von appsforoffice.microsoft.com (Vorgabe von Microsoft). Ohne Add-ins entfällt das.</li>
<li><b>KI-Assistent:</b> nutzt die KI des Browsers auf dem Gerät; das Modell lädt der Browser einmalig vom Browser-Hersteller. Abschaltbar in PDFMy unter „Mehr → KI-Assistent“ bzw. zentral über die Richtlinien des Browsers. Cloud-KI wird nicht angebunden.</li>
</ul>
<h2>Datenschutz</h2>
<ul>
<li>Dokumente, erkannter Text und Eingaben erreichen uns nicht. Nach unserer Einschätzung ist deshalb <b>kein Vertrag zur Auftragsverarbeitung</b> (Art. 28 DSGVO) nötig: Wir verarbeiten keine Daten in Ihrem Auftrag. Die Server-Protokolle beim Abruf der Website (IP-Adresse, Zeitpunkt, Datei) verarbeiten wir als eigener Verantwortlicher; Einzelheiten in der <a href="datenschutz.html">Datenschutzerklärung</a> (Nr. 3).</li>
<li>Im Browser gespeichert werden nur Einstellungen und Inhalte von Funktionen, die der Benutzer selbst nutzt (z. B. Unterschrift oder Posteingangsbuch) – ohne Kennung, mit einem Klick löschbar („Mehr → Alle lokal gespeicherten Daten löschen“). Für Werbung oder Hinweise wird nichts gespeichert (§ 25 Abs. 2 Nr. 2 TDDDG; DSK-Orientierungshilfe Digitale Dienste, Version 1.2). Eine Einwilligungsabfrage („Cookie-Banner“) ist deshalb nicht nötig.</li>
<li><b>Baustein für Ihr Verzeichnis von Verarbeitungstätigkeiten</b> (Art. 30 DSGVO): Bezeichnung „Bearbeiten, Scannen und Signieren von PDF-Dokumenten mit PDFMy“; Verarbeitung lokal auf dienstlichen Geräten; Empfänger: keine; Übermittlung in Drittländer: keine; technische Maßnahmen: keine Übertragung von Dokumenten, Verschlüsselung (TLS) beim Abruf der Anwendung, echtes Schwärzen, Löschfunktion.</li>
</ul>
<h2>Behörden, Kirchen, Wohlfahrtsverbände, Krankenhäuser und andere gemeinnützige Einrichtungen</h2>
<ul>
<li><b>Besondere Daten:</b> Sozialdaten (SGB X), Gesundheitsdaten (Art. 9 DSGVO) und Daten unter Schweigepflicht (§ 203 StGB) bleiben auf dem Gerät – es gibt keinen Dienstleister, dem sie offenbart würden. Das gilt gleichermaßen unter DSGVO, BDSG und Landesdatenschutzgesetzen wie unter kirchlichem Datenschutzrecht (KDG der katholischen Kirche, z. B. Caritas; DSG-EKD der evangelischen Kirche, z. B. Diakonie).</li>
<li><b>Krankenhäuser und Pflege:</b> Patientendaten verlassen das Gerät nicht – kein Cloud-Dienst, keine Auftragsverarbeitung. Aufklärungsbögen und Einwilligungen lassen sich am Tablet ausfüllen und unterschreiben, Befunde schwärzen; die Vorabprüfung hat ein Profil für die <b>elektronische Patientenakte (ePA)</b> (PDF/A, Größe). Für die IT-Sicherheit nach dem Stand der Technik (§ 391 SGB V bzw. BSI-Gesetz) liefern Netzwerk-Angaben, Signatur, Prüfsummen und SBOM oben die Grundlage für die Risikoanalyse.</li>
<li><b>Eigener Betrieb:</b> Die Lizenz des Quellcodes (PolyForm Noncommercial 1.0.0, Abschnitt „Noncommercial Organizations“) erlaubt die Nutzung ausdrücklich „charitable organization[s], educational institution[s], public research organization[s], public safety or health organization[s], environmental protection organization[s], or government institution[s]“ – unabhängig von der Finanzierung. Ob eine Einrichtung darunter fällt, prüft sie selbst; im Zweifel sprechen Sie uns an. Wer PDFMy im eigenen Netz betreiben möchte (z. B. ohne Internetzugang), spricht uns bitte an.</li>
<li><b>Ehrenamt und gemischte Geräte:</b> PDFMy braucht keine Installation, kein Konto und keine Lizenzverwaltung – es läuft auf dienstlichen wie privaten Geräten (Windows, Mac, Linux, Android, iPhone) im Browser.</li>
<li><b>Werbehinweis:</b> Auf der Startseite steht ein gekennzeichneter, statischer Hinweis auf Angebote der Mentor Group (ohne Zählung oder Cookies). Im geöffneten Dokument erscheint er nie.</li>
</ul>
<p class="muted">Keine Rechtsberatung – die Bewertung im Einzelfall trifft Ihre Datenschutzbeauftragte bzw. Ihr Datenschutzbeauftragter.</p>
<h2>Informationssicherheit</h2>
<ul>
<li>Sicherheitsrichtlinie (CSP): Verbindungen nur zu ${esc(site.domain)} und zum eigenen Rechner. Dazu HSTS, X-Frame-Options, nosniff, Referrer-Policy no-referrer, Permissions-Policy.</li>
<li>JavaScript in geöffneten PDFs wird nicht ausgeführt. Echtes Schwärzen entfernt auch den Text unter der Schwärzung.</li>
<li>pdfmy Scan für Windows ist von der <b>${esc(op.company)}</b> signiert (Authenticode, Microsoft Artifact Signing); Updates werden vor dem Start per SHA-256 und Signatur geprüft und lassen sich per Richtlinie abschalten.</li>
<li>Prüfsummen aller ausgelieferten Dateien je Version: <a href="pruefsummen.txt">pruefsummen.txt</a>. Software-Stückliste (SBOM, CycloneDX 1.5): <a href="${ENT.sbom}">pdfmy-sbom.cdx.json</a>.</li>
<li>Entwicklung mit automatisierten Tests als Freigabe-Bedingung, Release-Protokoll und Maßnahmen orientiert an ISO/IEC 27001 und ISO 9001 – Nachweis öffentlich: <a href="https://github.com/haus-it/pdfmy/blob/main/docs/ISO-Konformitaet.md" target="_blank" rel="noopener">ISO-Konformität</a>. PDFMy ist nicht zertifiziert.</li>
</ul>
<h2>Normen und Fachverfahren</h2>
<ul>
<li><b>Barrierefreiheit:</b> Oberfläche weitgehend vereinbar mit WCAG 2.1 AA / EN 301 549 (Selbstbewertung, <a href="barrierefreiheit.html">Erklärung</a>) – Grundlage auch für BITV 2.0. Ausgaben im Format PDF/A sind zugleich PDF/UA-1.</li>
<li><b>Archiv und E-Akte:</b> PDF/A-2b (ISO 19005-2), geprüft mit veraPDF; Prüfsummen und Versionen in der Ablage.</li>
<li><b>E-Rechnung:</b> XRechnung und ZUGFeRD/Factur-X anzeigen, prüfen und erstellen.</li>
<li><b>Justiz:</b> Prüfung für beA/elektronischen Rechtsverkehr nach ERVB 2025.</li>
<li><b>Signaturen:</b> PAdES (ETSI EN 319 142) mit eigenem Zertifikat; unter Windows mit pdfmy Scan auch Windows-Zertifikate und Signaturkarten, auch qualifiziert (eIDAS). Prüfung vorhandener Signaturen auf dem Gerät.</li>
</ul>
<h2>Verteilung und Verwaltung</h2>
<ul>
<li>Stille Installation für alle Benutzer, Erkennungsregel für Intune und SCCM/MECM, Terminalserver: <a href="firmen.html">PDFMy in Firmen verteilen</a>.</li>
<li>Gruppenrichtlinien (Updates, Drucker): Registrierung oder <b>ADMX-Vorlagen</b> (<a href="${ENT.admx}">pdfmy-richtlinien-admx.zip</a>, Deutsch und Englisch; in den Ordner PolicyDefinitions bzw. als ADMX-Import in Intune).</li>
<li>Add-ins für Microsoft 365, Teams, Thunderbird, LibreOffice, Nextcloud und ONLYOFFICE zentral verteilbar.</li>
</ul>
<h2>NIS2, Cyberresilienz und KI-Verordnung</h2>
<ul>
<li><b>NIS2 / BSI-Gesetz:</b> Einrichtungen unter dem BSI-Gesetz müssen die Sicherheit ihrer Lieferkette und von erworbenen IT-Komponenten berücksichtigen (§ 30 Abs. 2 Nr. 4 und 5 BSIG). Diese Seite, die SBOM, die Prüfsummen und der Meldeweg unten sind die Angaben dafür; Fragebögen beantworten wir gern.</li>
<li><b>Cyberresilienz-Verordnung (EU) 2024/2847:</b> Aktiv ausgenutzte Schwachstellen und schwere Sicherheitsvorfälle melden wir nach Art. 14 an die zuständigen Stellen und informieren betroffene Nutzer. Sicherheitsupdates von pdfmy Scan und der Erweiterungen sind kostenlos; die Web-App ist immer auf dem neuesten Stand.</li>
<li><b>KI-Verordnung (EU) 2024/1689:</b> Der KI-Assistent arbeitet nur auf dem Gerät und nur, wenn der Benutzer „Zusammenfassen“ oder „Übersetzen“ wählt; er lässt sich unter „Mehr → KI-Assistent“ ganz ausschalten. Ergebnisse sind als KI-erzeugt gekennzeichnet: im Dialog, beim Kopieren einer Zusammenfassung und in übersetzten PDFs sichtbar sowie in den Dokumenteigenschaften.</li>
</ul>
<h2 id="schwachstellen">Sicherheitslücken melden</h2>
<p>Bitte melden Sie vermutete Sicherheitslücken vertraulich an <a href="mailto:${esc(op.email)}?subject=PDFMy%20Sicherheit">${esc(op.email)}</a> (Deutsch oder Englisch), möglichst mit Schritten zum Nachvollziehen. Wir bestätigen den Eingang, beheben bestätigte Lücken vorrangig und nennen Sie auf Wunsch im Änderungsprotokoll. Bitte keine Tests, die andere Nutzer oder den Betrieb beeinträchtigen. Maschinenlesbar: <a href=".well-known/security.txt">security.txt</a>.</p>`, '<style>.facts{width:100%;border-collapse:collapse;font-size:15px}.facts th,.facts td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid var(--line)}.facts th{width:34%;font-weight:600}.muted{color:var(--muted);font-size:14px}@media (max-width:560px){.facts th,.facts td{display:block;width:auto;border:0;padding:2px 0}.facts td{padding-bottom:10px;border-bottom:1px solid var(--line)}}</style>', false));

write('erweiterung.html', page('PDFs direkt in PDFMy öffnen', `
<p><b>Ein Klick auf eine PDF im Browser – und sie ist in PDFMy offen.</b> Für PDFs aus Webportalen, Webmail, Behörden- und Bankseiten: ausfüllen, unterschreiben, schwärzen, speichern – ohne Umweg über den Download-Ordner. Die Datei wird <b>nicht hochgeladen</b>: Sie geht im Browser direkt an PDFMy.</p>
<div style="display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px">
<a href="download/${extZip}" download style="flex:1 1 260px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">Erweiterung herunterladen<br><small style="font-weight:400">Chrome und Edge · Windows und Mac</small></a>
${STORE.chrome ? `<a href="go/chrome" target="_blank" rel="noopener" style="flex:1 1 260px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">Zu Chrome hinzufügen<br><small style="font-weight:400">Chrome Web Store · ein Klick, ohne Entwicklermodus</small></a>` : ''}
${STORE.edge ? `<a href="go/edge" target="_blank" rel="noopener" style="flex:1 1 260px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">Zu Edge hinzufügen<br><small style="font-weight:400">Microsoft Edge-Add-ons · ein Klick</small></a>` : ''}
${STORE.firefox ? `<a href="go/firefox" target="_blank" rel="noopener" style="flex:1 1 260px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">Zu Firefox hinzufügen<br><small style="font-weight:400">Firefox-Add-ons · Windows, Mac, Linux</small></a>` : ''}
</div>
<p id="firefox"><b>Firefox:</b> ${STORE.firefox ? 'Die Erweiterung steht bei <a href="go/firefox" target="_blank" rel="noopener">Firefox-Add-ons</a> – „Zu Firefox hinzufügen“ klicken, fertig. Im Symbol „PDFMy“ den Schalter <b>Automatisch öffnen</b> einschalten und den Zugriff auf Webseiten erlauben.' : 'Die Firefox-Fassung ist fertig und wird bei Mozilla zur Prüfung eingereicht. Sobald sie bei Firefox-Add-ons freigegeben ist, steht hier der Knopf „Zu Firefox hinzufügen“.'}</p>
<p><b>Brauche ich das?</b> Nur, wenn Sie PDFs oft im Browser öffnen. PDFMy selbst funktioniert ohne Erweiterung; PDFs auf Ihrem PC öffnen sich mit <a href="scanner.html">pdfmy Scan</a> per Doppelklick in PDFMy.</p>
<h2>Installation (ca. 2 Minuten)</h2>
<ol>
<li><a href="download/${extZip}" download>PDFMy-Erweiterung ${extVer} herunterladen</a> (ZIP, ca. ${Math.round(fs.statSync(path.join(OUT, 'download', extZip)).size / 1024)} KB).</li>
<li>Im Ordner <i>Downloads</i> mit der rechten Maustaste auf die ZIP-Datei klicken → <b>Alle extrahieren …</b> → <b>Extrahieren</b> (am Mac genügt ein Doppelklick auf die ZIP-Datei). Es entsteht ein Ordner <i>pdfmy-erweiterung-${extVer}</i>.</li>
<li>In die Adresszeile <b>chrome://extensions</b> eingeben (in Edge: <b>edge://extensions</b>) und Enter drücken.</li>
<li>Rechts oben bzw. links unten den Schalter <b>Entwicklermodus</b> einschalten.</li>
<li>Auf <b>Entpackte Erweiterung laden</b> klicken und den Ordner aus Schritt 2 auswählen.</li>
<li>Es öffnet sich die Seite „Fast fertig“: auf <b>PDFs automatisch in PDFMy öffnen</b> klicken und die Rückfrage des Browsers mit <b>Zulassen</b> bestätigen.</li>
</ol>
<p><b>Keine Sorge wegen „Entwicklermodus“:</b> Der Schalter erlaubt dem Browser nur, eine Erweiterung aus einem Ordner zu laden statt aus dem Store – sonst ändert sich nichts. Sobald PDFMy im Chrome Web Store steht, entfällt dieser Schritt.</p>
<p>Fertig. Tipp: Über das Puzzle-Symbol neben der Adresszeile das PDFMy-Symbol <b>anheften</b> – dort schalten Sie das automatische Öffnen an und aus.
Den Ordner aus Schritt 2 bitte nicht löschen, der Browser lädt die Erweiterung daraus.</p>
<h2>Bedienung</h2>
<ul>
<li><b>PDF anklicken</b> – sie öffnet sich in PDFMy. Mit „Zurück“ sehen Sie die PDF wie bisher.</li>
<li><b>Rechtsklick auf einen Link → „In PDFMy öffnen“</b> – auch bei ausgeschaltetem automatischen Öffnen.</li>
<li>Downloads (Links, die eine Datei herunterladen) bleiben Downloads.</li>
</ul>
<h2>Datenschutz</h2>
<p>Die Erweiterung lädt nur die PDF, die Sie öffnen, und übergibt sie im Browser an PDFMy. Sie sendet keine Daten an uns oder Dritte, speichert keinen Verlauf und enthält keine Statistik.
Den Zugriff auf Webseiten erteilen Sie erst beim Einschalten des automatischen Öffnens; beim Ausschalten wird er wieder entzogen.</p>
<p>Demnächst auch im Chrome Web Store und bei Microsoft Edge-Add-ons – dann genügt ein Klick auf „Hinzufügen“.</p>`));
// Scanner-Anleitung mit Download des Einrichtungsskripts
copy('scanordner-einrichten.ps1', 'scanner/scanordner-einrichten.ps1');
copy('pdfmy-scan.ps1', 'scanner/pdfmy-scan.ps1');
write('scanner.html', page('Scanner einrichten', `
<p>pdfmy übernimmt Scans automatisch, sobald Ihr Scanner oder Multifunktionsgerät sie in einen Ordner auf Ihrem PC legt.
Das funktioniert mit jedem Hersteller (Brother, Canon, HP, Kyocera, Ricoh, Epson, Konica Minolta …). Einmal einrichten, danach gilt: <b>Papier einlegen, Scan drücken, fertig.</b></p>
<div style="display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px">
<a href="download/${scanFile}" download style="flex:1 1 220px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">pdfmy Scan für Windows ${scanVer}<br><small style="font-weight:400">Windows 10/11 · ca. ${scanKb} KB</small></a>
<a href="download/${macZip}" download style="flex:1 1 220px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">pdfmy Scan für Mac ${macVer}<br><small style="font-weight:400">macOS · ZIP, ca. ${Math.round(fs.statSync(path.join(OUT, 'download', macZip)).size / 1024)} KB</small></a>
<a href="download/${linuxSh}" download style="flex:1 1 220px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4B2FBF;border-radius:6px;padding:12px 16px">pdfmy Scan für Linux ${macVer}<br><small style="font-weight:400">Ubuntu, Debian, Mint, Fedora, openSUSE, Arch …</small></a>
</div>
<p style="margin:10px 0"><b>Gerät nicht dabei?</b> → <a href="#geraet-fehlt">Kurz melden – wir machen den Rest</a>.</p>
<p style="margin:10px 0"><b>Funktioniert mein Gerät?</b> → <a href="scanner-geraete.html">Geräteliste mit Suche</a>: Brother, Epson, HP, Canon, Kyocera, Ricoh, Konica Minolta, Sharp, Xerox, Lexmark, Dell, Samsung und Dokumentenscanner (ScanSnap, fi, Canon DR, Brother ADS, Epson DS) – mit Angabe zu beidseitigem Scannen.</p>
<div id="zertifizierung" style="border-left:4px solid #4B2FBF;background:var(--bg);padding:10px 14px;margin:14px 0">
<p style="margin:0 0 6px"><b>Windows:</b> pdfmy Scan ist digital signiert – Herausgeber <b>Mentor GmbH</b> (Microsoft Artifact Signing, öffentlich vertrauenswürdiges Zertifikat). Windows zeigt beim Öffnen „Mentor GmbH“ als verifizierten Herausgeber. <b>Mac:</b> Die Zertifizierung bei Apple ist in Vorbereitung; bis dahin warnt macOS beim ersten Mal. Das ist normal und kein Hinweis auf ein Problem. So geht es weiter:</p>
<p style="margin:6px 0 2px"><b>Windows</b></p>
<ul style="margin:0">
<li>Warnt der Browser beim Download („wird nicht häufig heruntergeladen“ bzw. „unbestätigte Datei“): auf <i>⋯</i> bzw. den Pfeil → <i>Behalten</i> → <i>Mehr anzeigen</i> → <i>Trotzdem behalten</i>.</li>
<li>Meldet Windows bei einer ganz neuen Version noch „Der Computer wurde durch Windows geschützt“: <i>Weitere Informationen</i> → prüfen, dass als Herausgeber „Mentor GmbH“ steht → <i>Trotzdem ausführen</i>. Die Meldung verschwindet, sobald Microsoft die Version kennt.</li>
<li>Fragt der Browser, ob pdfmy.de auf Geräte im lokalen Netzwerk zugreifen darf: <i>Zulassen</i>.</li>
</ul>
<p style="margin:8px 0 2px"><b>Mac</b></p>
<ul style="margin:0">
<li>Meldet macOS „„pdfmy-Scan-Mac.command“ kann nicht geöffnet werden“: auf <i>Fertig</i> bzw. <i>OK</i> klicken.</li>
<li><i>Systemeinstellungen → Datenschutz &amp; Sicherheit</i> → ganz unten <i>Dennoch öffnen</i> → mit Passwort oder Touch ID bestätigen → <i>Öffnen</i>.</li>
<li>Fragt macOS, ob „perl“ Geräte im lokalen Netzwerk finden darf: <i>Erlauben</i>. Die Meldung „Hintergrundobjekt hinzugefügt“ gehört zum Scan-Dienst.</li>
<li>Ohne diese Schritte geht es über das Terminal (dort prüft macOS nicht): <code>curl -fsSL https://${site.domain}/download/pdfmy-scan-mac.sh | bash</code></li>
</ul>
<p style="margin:8px 0 2px"><b>Linux</b></p>
<ul style="margin:0">
<li>Keine Warnung, keine Zertifizierung nötig: Die Pakete installiert die Softwareverwaltung Ihres Systems. Fragt sie nach einer „nicht vertrauenswürdigen Quelle“ oder einem „nicht signierten Paket“ (Fedora, openSUSE): bestätigen – das Paket kommt direkt von pdfmy.de, die Prüfsumme steht unten.</li>
</ul>
<p style="margin:8px 0 0;font-size:14px;color:var(--muted)">Echtheit prüfen (SHA-256): Windows ${esc(scanFile)} <code style="word-break:break-all">${scanSha || '–'}</code> · Mac ${esc(macZip)} <code style="word-break:break-all">${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(OUT, 'download', macZip))).digest('hex')}</code> · Linux ${linuxDeb} <code style="word-break:break-all">${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(OUT, 'download', linuxDeb))).digest('hex')}</code> · Linux ${linuxRpm} <code style="word-break:break-all">${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(OUT, 'download', linuxRpm))).digest('hex')}</code> · Linux ${linuxArch} <code style="word-break:break-all">${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(OUT, 'download', linuxArch))).digest('hex')}</code> · Linux ${linuxSh} <code style="word-break:break-all">${linuxSha}</code>. Signatur prüfen unter Windows: Rechtsklick auf die Datei → <i>Eigenschaften</i> → <i>Digitale Signaturen</i> → „Mentor GmbH“.</p>
</div>
<h2>Der einfachste Weg: pdfmy Scan (Windows)</h2>
<ol>
<li><a href="download/${scanFile}" download>pdfmy Scan ${scanVer} herunterladen</a> (ca. ${scanKb} KB) und öffnen. Das Programm ist von der Mentor GmbH signiert. Fragt Windows bei einer neuen Version noch nach („Der Computer wurde durch Windows geschützt“): <i>Weitere Informationen</i> → Herausgeber „Mentor GmbH“ → <i>Trotzdem ausführen</i>.</li>
<li>pdfmy Scan richtet sich selbst ein und läuft ab jetzt unauffällig im Infobereich der Taskleiste (startet mit Windows).</li>
<li>In <a href="./">pdfmy</a> heißt der Knopf oben jetzt <b>„Scannen“</b>: Scanner auswählen, Papier einlegen, <b>Scannen</b> – die Seiten erscheinen sofort.</li>
</ol>
<p>pdfmy Scan findet Netzwerk-Multifunktionsgeräte automatisch und <b>ohne Treiber</b> (eSCL/AirScan – unterstützen fast alle Geräte ab ca. 2015 – und WSD, z. B. Epson, Dell, Brother) sowie Scanner, die in Windows eingerichtet sind (USB). Gesucht wird über jede Netzwerkkarte (auch bei VPN oder WLAN und LAN gleichzeitig).
Wird Ihr Gerät nicht gefunden: im Scan-Fenster <i>„Gerät per IP-Adresse hinzufügen“</i> (die IP steht am Gerätedisplay unter Netzwerk/TCP-IP) und am Gerät ggf. „AirPrint“, „eSCL“ oder „Mopria“ einschalten.
Fragt der Browser „pdfmy.de möchte auf Geräte in Ihrem lokalen Netzwerk zugreifen“, bitte <b>Zulassen</b> wählen – so erreicht pdfmy das Programm auf Ihrem PC.</p>
<p><b>Für die IT:</b> pdfmy Scan still auf alle Rechner verteilen (Intune, Gruppenrichtlinie, SCCM), mit Richtlinien für Updates und Drucker – <a href="firmen.html">PDFMy in Firmen verteilen</a>.</p>
<h2 id="mac">Am Mac: pdfmy Scan für Mac</h2>
<ol>
<li><a href="download/${macZip}" download>pdfmy Scan für Mac ${macVer} herunterladen</a> (ZIP) und öffnen.</li>
<li><b>„pdfmy-Scan-Mac.command“</b> doppelklicken. Meldet macOS „kann nicht geöffnet werden“: <i>Systemeinstellungen → Datenschutz &amp; Sicherheit</i> → unten <i>„Dennoch öffnen“</i>. Fragt macOS, ob „perl“ Geräte im lokalen Netzwerk finden darf, bitte <b>Erlauben</b> wählen.</li>
<li>Die Einrichtung startet den Scan-Dienst im Hintergrund (startet mit dem Mac), legt die App <b>„PDFMy“</b> unter <i>Programme</i> an und fragt, ob PDF-Dateien künftig per Doppelklick in PDFMy geöffnet werden sollen.</li>
<li>In <a href="./">pdfmy</a> heißt der Knopf oben jetzt <b>„Scannen“</b> – wie unter Windows.</li>
</ol>
<p>pdfmy Scan für Mac findet Netzwerkscanner und Multifunktionsgeräte <b>ohne Treiber</b>: über AirScan/eSCL (fast alle Geräte ab ca. 2015) und über WSD (z. B. Dell Color MFP E525w und viele ältere Geräte). Es nutzt nur, was jeder Mac mitbringt, und ist nur vom eigenen Mac aus erreichbar.
Lieber ohne Doppelklick? Im Terminal: <code>curl -fsSL https://${site.domain}/download/pdfmy-scan-mac.sh | bash</code>. Entfernen: „pdfmy-Scan-Mac-entfernen.command“ aus der ZIP-Datei doppelklicken.</p>
<p><b>Ohne Zusatzprogramm:</b> Im Programm <i>„Digitale Bilder“</i> den Scanner wählen, bei <i>Scannen nach</i> einen Ordner einstellen und diesen Ordner in pdfmy unter „Scanner verbinden“ verbinden (Chrome oder Edge). Mit dem iPhone: Rechtsklick auf den Schreibtisch → <i>„Von iPhone oder iPad importieren“ → „Dokumente scannen“</i>.</p>
<h2 id="linux">Unter Linux: pdfmy Scan für Linux</h2>
<ol>
<li>Das Paket für Ihr System herunterladen: <a href="download/${linuxDeb}" download><b>Mint, Ubuntu, Debian</b> (.deb)</a> · <a href="download/${linuxRpm}" download><b>Fedora, openSUSE, RHEL</b> (.rpm)</a> · <a href="download/${linuxArch}" download><b>Arch, Manjaro</b> (.pkg.tar.gz)</a> – pdfmy Scan für Linux ${macVer}.</li>
<li>Die Datei doppelklicken, <i>„Installieren“</i> wählen (Softwareverwaltung, GNOME Software, Discover, YaST oder Pamac) und mit Ihrem Passwort bestätigen – meist ohne Terminal. Das Paket bringt die Scanner-Unterstützung (SANE, AirScan) gleich mit und gilt für alle Benutzer des Rechners.</li>
<li><b>Öffnet der Doppelklick keine Installation</b> (z. B. unter Ubuntu, je nach Version): Terminal öffnen (Strg+Alt+T), den Befehl für Ihr System eingeben und mit Ihrem Passwort bestätigen:<br>Mint, Ubuntu, Debian: <code translate="no">sudo apt install "$(xdg-user-dir DOWNLOAD)/pdfmy-scan-linux.deb"</code><br>Fedora, RHEL: <code translate="no">sudo dnf install "$(xdg-user-dir DOWNLOAD)/pdfmy-scan-linux.rpm"</code><br>openSUSE: <code translate="no">sudo zypper install "$(xdg-user-dir DOWNLOAD)/pdfmy-scan-linux.rpm"</code><br>Arch, Manjaro: <code translate="no">sudo pacman -U "$(xdg-user-dir DOWNLOAD)/pdfmy-scan-linux.pkg.tar.gz"</code></li>
<li><small>Anderes Linux oder kein Administrator-Passwort: <a href="download/${linuxSh}" download>Einrichtungsskript</a> mit <code>sh ~/Downloads/${linuxSh}</code> starten – es installiert das passende Paket per Passwort-Fenster oder richtet pdfmy Scan nur für Ihren Benutzer ein.</small></li>
<li>pdfmy Scan startet mit jeder Anmeldung, legt <b>„PDFMy“</b> mit Logo im Anwendungsmenü und unter „Öffnen mit“ an. PDFs per Doppelklick in PDFMy: in PDFMy <i>Menü → „Als Standard für PDFs festlegen …“</i>.</li>
<li>In <a href="./">pdfmy</a> heißt der Knopf oben jetzt <b>„Scannen“</b> – wie unter Windows und am Mac.</li>
</ol>
<p><b>Treiber?</b> Für Netzwerkscanner und Multifunktionsgeräte keine: pdfmy Scan spricht <b>AirScan/eSCL</b> (Suche über Avahi) und <b>WSD</b> direkt. Für <b>USB-Scanner und ältere Geräte</b> nutzt es <b>SANE</b>, wenn installiert:</p>
<ul>
<li>Debian, Ubuntu, Mint: <code>sudo apt install sane-utils sane-airscan ipp-usb avahi-utils</code></li>
<li>Fedora: <code>sudo dnf install sane-backends sane-airscan ipp-usb avahi-tools</code></li>
<li>openSUSE: <code>sudo zypper install sane-backends sane-airscan ipp-usb avahi-utils</code> · Arch: <code>sudo pacman -S sane sane-airscan ipp-usb avahi</code></li>
<li>Nur bei sehr alten Geräten ohne eSCL/WSD: Herstellertreiber – HP <code>hplip</code>, Brother <code>brscan4</code>/<code>brscan5</code>, Epson <code>epsonscan2</code>, Samsung/Xerox „Unified Linux Driver“.</li>
</ul>
<p>pdfmy Scan sucht über Bonjour/avahi, per WSD-Rundruf und fragt zusätzlich jede Adresse im eigenen Netz direkt (Port 80/443) – so findet es Geräte auch, wenn die Firewall Rundruf-Antworten verwirft (z. B. firewalld unter Fedora) oder das Paket <code>avahi-utils</code> fehlt. Das Protokoll im Scan-Fenster zeigt, welcher Weg was gefunden hat. Notfalls: <i>„Gerät per IP-Adresse hinzufügen“</i> – das geht immer. Entfernen: beim Paket in der Anwendungsverwaltung „pdfmy-scan“ entfernen; nach dem Skript <a href="download/pdfmy-scan-linux-entfernen.sh" download>pdfmy-scan-linux-entfernen.sh</a> herunterladen und mit <code>sh</code> starten.</p>
<h2 id="chromebook">Auf dem Chromebook (Chrome OS)</h2>
<p>Auf dem <b>Chromebook</b> braucht PDFMy kein Zusatzprogramm – pdfmy Scan läuft unter Chrome OS nicht, wird aber auch nicht gebraucht: Chrome OS steuert viele Netzwerk- und USB-Scanner selbst an (AirScan/eSCL, ohne Treiber). Scanner einrichten unter <i>Einstellungen → Erweitert → Drucken und Scannen</i>, dann mit der App <b>„Scannen“</b> als PDF oder JPG in einen Ordner scannen, z. B. <i>Meine Dateien › Scans</i>. In PDFMy im Scan-Fenster <i>„Diesen Ordner als Scan-Ordner verbinden“</i> – jeder neue Scan erscheint automatisch, mit Texterkennung. PDFMy über <i>„App herunterladen“</i> installieren: Dann öffnet die App „Dateien“ PDFs mit <i>Öffnen mit → PDFMy</i>; Drucken geht über <i>„Als PDF speichern“</i>, Google Drive ist in der App „Dateien“ eingebunden (als Ablageordner wählbar).</p>
<h2 id="geraet-fehlt">Ihr Drucker oder Scanner ist noch nicht dabei?</h2>
<div style="border-left:4px solid #4B2FBF;background:var(--bg);padding:10px 14px;margin:14px 0">
<p style="margin:0 0 8px"><b>Kein Problem – kurz Bescheid geben, wir machen den Rest.</b> Wir prüfen Ihr Modell, passen pdfmy Scan bei Bedarf an und melden uns mit einer Lösung. Kostenlos.</p>
<p style="margin:0 0 8px"><b>Am schnellsten:</b> in PDFMy <i>„… Mehr → Problem melden …“</i> – Versionen und Protokoll von pdfmy Scan sind dann automatisch dabei. Oder per E-Mail an <a href="mailto:${esc(APPSUPPORT)}?subject=Scanner%20fehlt%20in%20pdfmy%20Scan&amp;body=Hersteller und Modell: %0D%0ASystem (Windows/macOS/Linux, Version): %0D%0Apdfmy Scan Version: %0D%0AVerbindung (WLAN/Kabel/USB): %0D%0AIP-Adresse des Geräts: %0D%0AWas geht schon (Drucken? Hersteller-Software?): %0D%0AGlas oder Einzug, ein- oder beidseitig: %0D%0ARückruf unter: %0D%0A%0D%0AProtokoll aus dem Scan-Fenster:%0D%0A">${esc(APPSUPPORT)}</a> (die Vorlage füllt die E-Mail vor).</p>
<p style="margin:0 0 4px"><b>Diese Angaben helfen uns:</b></p>
<ol style="margin:0">
<li><b>Hersteller und genaues Modell</b> (Typenschild oder Gerätedisplay), z. B. „Dell Color MFP E525w“.</li>
<li><b>Ihr System:</b> Windows 10/11, macOS-Version (Apple-Menü → Über diesen Mac) oder Linux-Distribution.</li>
<li><b>Version von pdfmy Scan</b> – steht unten in der Statuszeile von PDFMy (z. B. „pdfmy Scan 1.8.6“).</li>
<li><b>Verbindung:</b> WLAN, Netzwerkkabel oder USB – und ob Computer und Gerät im selben Netz sind (kein Gast-WLAN, kein VPN dazwischen).</li>
<li><b>IP-Adresse des Geräts:</b> am Gerätedisplay unter Netzwerk/TCP-IP oder auf der gedruckten Netzwerkkonfigurationsseite; am Mac unter Systemeinstellungen → Drucker &amp; Scanner → Gerät → Optionen &amp; Zubehör.</li>
<li><b>Protokoll:</b> im Scan-Fenster auf <i>„Protokoll“</i> klicken, den Text kopieren und in die E-Mail einfügen.</li>
<li><b>Die genaue Meldung</b>, am besten als Bildschirmfoto.</li>
<li><b>Was schon geht:</b> Druckt das Gerät? Scannt es mit der Hersteller-Software oder der Scanfunktion von Windows bzw. macOS?</li>
<li><b>Was Sie scannen möchten:</b> Glas oder Einzug, ein- oder beidseitig.</li>
<li><b>Wie wir Sie erreichen</b> (Telefon, gute Zeiten) – auf Wunsch helfen wir per Fernwartung.</li>
</ol>
<p style="margin:8px 0 0;font-size:14px;color:var(--muted)">Bitte keine Kennwörter senden. Ihre Dokumente brauchen wir nicht.</p>
</div>
<h2 id="epson-l5290">Epson EcoTank L5290 (z. B. „EPSON2CBBCB“)</h2>
<p>Der L5290 hat ein Vorlagenglas und einen Einzug (einseitig) und scannt im Netzwerk über <b>AirScan/eSCL</b> bzw. <b>WSD</b> – ohne Treiber. Der Name im Netzwerk lautet „EPSON“ plus sechs Zeichen, z. B. <b>EPSON2CBBCB</b>.</p>
<ul>
<li><b>Windows, Mac und Linux:</b> pdfmy Scan findet den L5290 normalerweise automatisch. Falls nicht: im Scan-Fenster <i>„Gerät per IP-Adresse hinzufügen“</i> und die IP-Adresse <b>oder den Namen</b> eingeben, z. B. <code>EPSON2CBBCB</code> bzw. <code>EPSON2CBBCB.local</code> (Mac/Linux ergänzen „.local“ selbst). Gesucht wird über jede Netzwerkverbindung (WLAN, LAN, VPN) – wie unter Windows. Die IP steht am Gerät unter <i>Einstellungen → Netzwerkeinstellungen → Netzwerkstatus</i>.</li>
<li><b>Wird er trotzdem nicht gefunden:</b> Weboberfläche des Druckers öffnen (IP-Adresse oder <code>http://EPSON2CBBCB.local</code> in den Browser) → <i>Netzwerk</i> bzw. <i>Netzwerkdienste</i> → <b>Bonjour/AirPrint</b> und <b>WSD</b> einschalten.</li>
<li><b>Windows mit Epson-Software:</b> Ist „Epson Scan 2“ installiert, erscheint der L5290 zusätzlich als Windows-Scanner – beides funktioniert.</li>
<li><b>Linux per USB:</b> <code>sane-airscan</code> und <code>ipp-usb</code> (siehe oben) oder der Epson-Treiber <code>epsonscan2</code>.</li>
</ul>
<h2 id="dell-e525w">Dell Color MFP E525w</h2>
<p>Der E525w scannt über <b>WSD</b> („Web Services for Devices“), nicht über AirScan. So klappt es:</p>
<ul>
<li><b>Am Gerät:</b> Die Weboberfläche des Druckers öffnen (IP-Adresse in den Browser) und unter den Netzwerk-/Protokolleinstellungen <b>WSD</b> bzw. „WSD-Scan“ einschalten.</li>
<li><b>Windows:</b> pdfmy Scan (ab 1.7.0) findet den E525w über WSD direkt – ohne Treiber. Falls nicht: im Scan-Fenster „Gerät per IP-Adresse hinzufügen“. Alternativ in Windows unter Einstellungen → Bluetooth und Geräte → Drucker und Scanner → „Gerät hinzufügen“ einrichten; dann erscheint er zusätzlich als Windows-Scanner.</li>
<li><b>Mac und Linux:</b> pdfmy Scan für Mac bzw. Linux findet den E525w über WSD automatisch. Falls nicht: im Scan-Fenster „Gerät per IP-Adresse hinzufügen“.</li>
<li><b>Alternative für beide:</b> „Scan to Network Folder“ (SMB) direkt am Gerät in einen freigegebenen Ordner – siehe unten.</li>
</ul>
<h2 id="ordner">Alternative: Multifunktionsgerät scannt direkt in einen Ordner („Scan to Folder“)</h2>
<h2>Schritt 1 – Scan-Ordner auf dem PC anlegen (2 Minuten)</h2>
<ol>
<li><a href="scanner/scanordner-einrichten.ps1" download>Einrichtungsskript herunterladen</a> (PowerShell, für Windows 10/11).</li>
<li>Startmenü → „PowerShell“ mit Rechtsklick <b>als Administrator</b> öffnen und eingeben:<br>
<code>powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\scanordner-einrichten.ps1"</code></li>
<li>Das Skript legt <code>C:\\Scans\\Eingang</code> an, gibt ihn im Netzwerk frei und zeigt <b>Server, Freigabe, Benutzer und Passwort</b> an – notieren Sie diese Angaben.</li>
</ol>
<h2>Schritt 2 – Am Gerät „Scan to Folder“ (SMB) einrichten</h2>
<p>Öffnen Sie die Weboberfläche des Geräts (IP-Adresse des Geräts in den Browser eingeben) und legen Sie ein Scanziel an. Der Menüpunkt heißt je nach Hersteller
„Scan to Network / Netzwerkordner“ (Brother), „Adressbuch → Datei“ (Canon), „Scannen in Netzwerkordner“ (HP), „Adressbuch → SMB“ (Kyocera, Ricoh).</p>
<ul>
<li><b>Protokoll:</b> SMB / CIFS / Windows-Freigabe</li>
<li><b>Server, Freigabe, Benutzer, Passwort:</b> wie vom Skript angezeigt</li>
<li><b>Dateiformat:</b> PDF (mehrseitig) – <b>Auflösung:</b> 300 dpi – <b>Farbe:</b> Automatisch oder Graustufen</li>
<li><b>Mehrere Seiten:</b> Vorlageneinzug (ADF) verwenden, bei Bedarf „Duplex“. Leere Rückseiten entfernt pdfmy automatisch.</li>
</ul>
<h2>Schritt 3 – pdfmy verbinden</h2>
<p>In <a href="./">pdfmy</a> (Chrome oder Edge) auf <b>„Scanner verbinden“</b> klicken und <code>C:\\Scans\\Eingang</code> wählen. Ab jetzt erscheint jeder Scan nach etwa 2 Sekunden –
gerade gerichtet, kopfüber gescannte Seiten gedreht, Text erkannt, Briefdaten ausgefüllt. Beim Speichern wird automatisch kompakt komprimiert
(Schrift scharf, typischerweise 30–60 KB pro Seite). Beim nächsten Besuch genügt ein Klick auf „Scanner verbinden“.</p>
<h2>Mehrere Briefe auf einmal</h2>
<p>Legen Sie zwischen die Briefe je ein leeres Blatt und scannen Sie alles in einem Durchgang. Dann <b>Mehr → Stapel in einzelne Briefe trennen</b>:
jeder Brief wird einzeln erkannt, benannt und abgelegt.</p>
<h2>Probleme?</h2>
<ul>
<li>Gerät meldet Anmeldefehler: Benutzer als <code>PC-NAME\\scanner</code> eintragen; SMB-Version am Gerät auf SMB2/3 stellen.</li>
<li>Gerät findet den PC nicht: Netzwerkprofil des PCs auf „Privat“ stellen; statt Rechnername die IP-Adresse verwenden.</li>
<li>Nur „Scan to E-Mail“ möglich: Anhänge in einem Ordner speichern und diesen Ordner mit pdfmy verbinden.</li>
</ul>`, '', true));
// Werkzeug-Seiten für Suchmaschinen (tools/site/werkzeuge.json): je Werkzeug eine Seite mit Anleitung, Fragen und Sprung ins Werkzeug
const tools = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'site', 'werkzeuge.json'), 'utf8'));
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const toolTarget = t => t.target.startsWith('#') ? 'einv' : t.target;
const toolStyle = `<style>.lead{font-size:18px;line-height:1.55}.cta{display:inline-block;background:var(--accent);color:#fff!important;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;margin:6px 0 4px}.cta:hover{filter:brightness(1.08)}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .cta{color:#1B1D23!important}}:root[data-theme="dark"] .cta{color:#1B1D23!important}
.usp{padding-left:1.2em}.faqd{border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:8px 0}.faqd summary{cursor:pointer;font-weight:600}.more{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.more a{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:4px 12px;text-decoration:none}</style>`;
for (const t of tools) {
  const url = `https://${site.domain}/${t.slug}.html`;
  const head = `<meta name="description" content="${esc(t.description)}"><link rel="canonical" href="${url}"><meta property="og:title" content="${esc(t.title)}"><meta property="og:description" content="${esc(t.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="https://${site.domain}/icons/mentor-512.png">`
    + ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  write(t.slug + '.html', page(t.title, `${toolStyle}
<p class="lead">${esc(t.intro)}</p>
<p><a class="cta" href="./#werkzeug=${toolTarget(t)}">${esc(t.label)} – jetzt in PDFMy öffnen →</a></p>
<h2>So geht's</h2><ol>${t.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
<h2>Warum PDFMy?</h2><ul class="usp"><li><b>Kostenlos</b> – ohne Anmeldung, ohne Abo, ohne Seitenlimit.</li><li><b>Kein Upload</b> – Ihre Dateien bleiben auf Ihrem Gerät (datenschutzfreundlich nach DSGVO).</li><li><b>Überall</b> – im Browser oder als App, unter Windows, am Mac und auf dem Handy.</li><li><b>Aus Paderborn</b> – entwickelt von der Mentor GmbH (Mentor Group).</li></ul>
<h2>Häufige Fragen</h2>${t.faq.map(([q, a]) => `<details class="faqd"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
<h2>Weitere Werkzeuge</h2><ul class="more">${tools.filter(o => o !== t).map(o => `<li><a href="${o.slug}.html">${esc(o.label)}</a></li>`).join('')}<li><a href="werkzeuge.html">Alle Werkzeuge</a></li><li><a href="hilfe.html">Hilfe</a></li></ul>`, head));
}
// Erster Satz einer Beschreibung (Werkzeug-Übersicht) – Abkürzungen wie „bzw.“ oder „z. B.“ beenden keinen Satz
const firstSentence = d => d.replace(/\b(bzw|ca|ggf|evtl|inkl|usw|z\. B)\. /g, '$1.\u00a0').split(/ – |\. /)[0].replace(/\u00a0/g, ' ');
write('werkzeuge.html', page('Alle PDF-Werkzeuge', `${toolStyle}
<p class="lead">Alle Werkzeuge von PDFMy sind kostenlos und laufen direkt in Ihrem Browser – ohne Upload und ohne Anmeldung.</p>
<ul class="usp">${tools.map(t => `<li><a href="${t.slug}.html"><b>${esc(t.label)}</b></a> – ${esc(firstSentence(t.description))}</li>`).join('')}</ul>
<p><a class="cta" href="./">PDFMy öffnen →</a></p>`, `<meta name="description" content="Alle kostenlosen PDF-Werkzeuge von PDFMy: zusammenfügen, verkleinern, schwärzen, unterschreiben, OCR, E-Rechnung und mehr – ohne Upload."><link rel="canonical" href="https://${site.domain}/werkzeuge.html">`));

// Öffentlicher Hilfebereich (tools/site): Anleitungen, häufige Fragen, Suche
write('hilfe.html', page('Hilfe', fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.html'), 'utf8'), '', true));
copy('tools/site/hilfe.js', 'hilfe.js');
copy('tools/site/sprache.js', 'sprache.js');
// Wörterbücher der mehrsprachigen Webseiten (Hilfe, Scanner): i18n/site/<code>.json – erzeugt mit node tools/i18n-check.js --site merge <code>
for (const f of fs.readdirSync(path.join(ROOT, 'i18n', 'site')).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) copy('i18n/site/' + f);
// Geräteliste: welche Drucker/Scanner mit PDFMy funktionieren (Brother, Epson, HP, Canon, Büro, Dell, Dokumentenscanner)
write('presse.html', page('Presse', fs.readFileSync(path.join(ROOT, 'tools', 'site', 'presse.html'), 'utf8')));
fs.cpSync(path.join(ROOT, 'tools', 'site', 'presse'), path.join(OUT, 'presse'), { recursive: true });   // Pressetexte (Word) und Bilder
write('scanner-geraete.html', page('Welche Scanner funktionieren?', fs.readFileSync(path.join(ROOT, 'tools', 'site', 'geraete.html'), 'utf8')));
copy('tools/site/geraete.js', 'geraete.js');
// Suchmaschinen (SEO-Prüfung 17.11.2026): Infoseiten hatten weder kanonische Adresse noch Beschreibung – in allen Sprachfassungen.
// Beschreibung wird über i18n/site übersetzt (js/i18n.js übersetzt meta description), prerender.js setzt je Sprache die eigene kanonische Adresse.
const SEO_PAGES = {
  'hilfe.html': 'Hilfe zu PDFMy: Anleitungen und Antworten zu Scannen, Texterkennung, Unterschreiben, Formularen, E-Rechnung und Datenschutz – kostenlos, ohne Upload.',
  'scanner.html': 'Scanner mit PDFMy einrichten: Netzwerk- und USB-Scanner unter Windows, Mac und Linux, meist ohne Treiber. Die Dokumente bleiben auf Ihrem Rechner.',
  'scanner-geraete.html': 'Welche Scanner funktionieren mit PDFMy? Geräteliste mit Suche: Brother, Epson, HP, Canon, Kyocera, Ricoh und Dokumentenscanner, mit Duplex-Angabe.',
  'firmen.html': 'PDFMy in Firmen und Behörden verteilen: stille Installation per Intune oder SCCM, Gruppenrichtlinien mit ADMX-Vorlagen, SBOM – kostenlos, ohne Cloud.',
  'erweiterung.html': 'PDFs direkt in PDFMy öffnen: Browser-Erweiterung und Add-ins für Outlook, Word, Teams, Thunderbird, LibreOffice, ONLYOFFICE und Nextcloud.',
  'presse.html': 'Pressebereich von PDFMy: Informationen, Bilder und Pressetexte zur kostenlosen PDF-Software aus Paderborn, die ohne Upload im Browser arbeitet.',
  'sicherheit.html': 'Sicherheit und Compliance von PDFMy: lokale Verarbeitung, Netzwerk und Ports, SBOM, NIS2, Cyberresilienz-Verordnung, DSGVO – Angaben für IT und Beschaffung.',
  'impressum.html': '', 'datenschutz.html': '', 'barrierefreiheit.html': '', 'nutzungsbedingungen.html': '',
};
for (const [file, desc] of Object.entries(SEO_PAGES)) {
  const f = path.join(OUT, file); let h = fs.readFileSync(f, 'utf8');
  if (/rel="canonical"/.test(h)) continue;
  const url = `https://${site.domain}/${file}`;
  h = h.replace('</title>', `</title>${desc ? `<meta name="description" content="${esc(desc)}"><meta property="og:description" content="${esc(desc)}">` : ''}<link rel="canonical" href="${url}"><meta property="og:url" content="${url}">`);
  fs.writeFileSync(f, h);
}
// KI-Suchdienste (GEO): llms.txt nach llmstxt.org – Kurzbeschreibung und die wichtigsten Seiten als Klartext. Kein Standard von Google;
// gelesen wird sie u. a. von KI-Assistenten, die eine Website zusammenfassen. Nur Fakten, die auf den verlinkten Seiten belegt sind.
write('llms.txt', `# PDFMy

> PDFMy (https://${site.domain}) is a free PDF application by Mentor GmbH, Paderborn, Germany. It runs entirely in the web browser: documents are processed on the user's device and are not uploaded. No account, no cookies, no tracking. Interface in 40 languages.

Main functions: scan with OCR (text recognition), merge, split, compress, edit, redact, sign (handwritten and PAdES digital signatures), fill and create forms, convert PDF to Word, text and images, and Word, Excel and images to PDF, PDF/A and PDF/UA (accessibility), e-invoices (ZUGFeRD, XRechnung), compare PDFs. Works offline after the first visit (installable web app).

Licence: PolyForm Noncommercial 1.0.0; use by government institutions and charitable, educational and other noncommercial organisations is permitted by the licence. Source code: https://github.com/haus-it/pdfmy

## Deutsch
- [PDFMy öffnen](https://${site.domain}/): kostenlose PDF-Werkzeuge ohne Upload
- [Alle Werkzeuge](https://${site.domain}/werkzeuge.html)
- [Hilfe und häufige Fragen](https://${site.domain}/hilfe.html)
- [Scanner einrichten](https://${site.domain}/scanner.html) und [Geräteliste](https://${site.domain}/scanner-geraete.html)
- [Für Firmen und Behörden](https://${site.domain}/firmen.html) und [Sicherheit und Compliance](https://${site.domain}/sicherheit.html)
- [Erweiterungen und Add-ins](https://${site.domain}/erweiterung.html)
- [Presse](https://${site.domain}/presse.html)

## Tools
${tools.map(t => `- [${t.label}](https://${site.domain}/${t.slug}.html)`).join('\n')}

## English
- [Help (English)](https://${site.domain}/en-GB/hilfe.html)
- [All tools (English)](https://${site.domain}/en-GB/werkzeuge.html)
`);
copy('tools/site/google3c0638e01aa028c9.html', 'google3c0638e01aa028c9.html');
copy('tools/site/338cffd73ed849d192fa0f2825371a35.txt', '338cffd73ed849d192fa0f2825371a35.txt');   // IndexNow (Bing, Yandex, Seznam …): Schlüsseldatei – öffentlich gewollt, nicht entfernen; tools/deploy.py meldet geänderte Seiten   // Google Search Console: Inhaberschaft (nicht entfernen)
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: https://${site.domain}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://${site.domain}/</loc></url>\n  <url><loc>https://${site.domain}/hilfe.html</loc></url>\n  <url><loc>https://${site.domain}/scanner.html</loc></url>\n  <url><loc>https://${site.domain}/scanner-geraete.html</loc></url>\n  <url><loc>https://${site.domain}/erweiterung.html</loc></url>\n  <url><loc>https://${site.domain}/firmen.html</loc></url>\n  <url><loc>https://${site.domain}/werkzeuge.html</loc></url>\n  <url><loc>https://${site.domain}/presse.html</loc></url>\n  <url><loc>https://${site.domain}/sicherheit.html</loc></url>\n${tools.map(t => `  <url><loc>https://${site.domain}/${t.slug}.html</loc></url>\n`).join('')}</urlset>\n`);

// ---------------- Interne Edition: pdfmy.de/mentor im Mentor-Group-CI, mit Passwortschutz ----------------
// Gleicher Programmstand wie pdfmy.de, aber js/config.js der internen Version (Mentor-Theme). Bibliotheken und OCR-Daten
// teilt sie über ../vendor mit pdfmy.de; Mentor-Schriften, Logo und Symbole liegen nur hier.
// Seit 15.10.2026 abgeschaltet: /mentor wird nicht genutzt, pdfmy.de läuft selbst im Mentor-Design (Wunsch des Users).
// Zum Wiedereinschalten BUILD_MENTOR auf true setzen.
const BUILD_MENTOR = false;
const htpasswd = path.join(ROOT, '.deploy', 'htpasswd-mentor');
if (!BUILD_MENTOR || !fs.existsSync(htpasswd)) {
  if (BUILD_MENTOR) console.warn('Hinweis: /mentor nicht gebaut – zuerst tools\\mentor-passwort.ps1 ausführen (Passwort festlegen).');
} else {
  const MD = 'mentor', M = rel => path.join(MD, rel), read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const toVendor = t => t.split("'vendor/").join("'../vendor/").split('"vendor/').join('"../vendor/');
  write(M('js/app.js'), toVendor(read('js/app.js')));
  for (const f of ['js/letter.js', 'js/fristen.js', 'js/formdaten.js', 'js/kommentare.js', 'js/qrstempel.js', 'js/qr.js', 'js/patchcode.js', 'js/formdetect.js', 'js/formcalc.js', 'js/formprofile.js', 'js/reflow.js', 'js/preflight.js', 'js/hotfolder.js', 'js/a11ycheck.js', 'js/bank.js', 'js/pdfsign.js', 'js/pdfcrypt.js', 'js/sigreq.js', 'js/pdfinc.js', 'js/layout.js', 'js/textpdf.js', 'js/glyphless.js', 'js/office.js', 'js/pdfacheck.js', 'js/pptx.js', 'js/slides.js', 'js/pdfverify.js', 'js/docdetect.js', 'js/imaging.js', 'js/compactw.js', 'js/scanw.js', 'js/tools.js', 'js/journal.js', 'js/einvoice.js', 'js/einvoice-out.js', 'js/email.js', 'js/pro.js', 'js/camera.js', 'js/config.js']) copy(f, M(f));
  for (const f of ['icons/mentor-192.png', 'icons/mentor-512.png', 'icons/mentor-maskable-512.png', 'icons/mentor-group.png']) copy(f, M(f));
  fs.cpSync(path.join(ROOT, 'vendor', 'fonts'), path.join(OUT, MD, 'fonts'), { recursive: true });
  let mh = read('index.html').split('url(vendor/fonts/').join('url(fonts/').split('src="vendor/').join('src="../vendor/');
  if (!mh.includes('<title>PDFMy</title>')) throw new Error('mentor: Titel nicht gefunden');
  mh = mh.replace('<title>PDFMy</title>', `<title>PDFMy – powered by Mentor Group</title>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="robots" content="noindex, nofollow">`)
    .replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">');
  write(M('index.html'), preloadScripts(mh));
  const mm = JSON.parse(read('manifest.webmanifest')); Object.assign(mm, { id: '/mentor/', start_url: './', scope: './' });
  write(M('manifest.webmanifest'), JSON.stringify(mm, null, 2) + '\n');
  write(M('sw.js'), toVendor(read('sw.js').replace(/const VERSION = '[^']+';/, `const VERSION = 'mentor-${stamp}';`)));
  write(M('.htaccess'), `# mentor PDF – intern, nur mit Anmeldung
AuthType Basic
AuthName "PDFMy (intern)"
AuthUserFile ${site.webRoot}/mentor/.htpasswd
Require valid-user
<IfModule mod_headers.c>
  Header always set X-Robots-Tag "noindex, nofollow"
</IfModule>
`);
  fs.copyFileSync(htpasswd, path.join(OUT, MD, '.htpasswd'));
}

// Webseiten je Sprache vorab übersetzen (für Suchmaschinen, tools/prerender.js) – beim Ausrollen: deploy.ps1 setzt PDFMY_PRERENDER=1.
// Beim ersten Mal einige Minuten, danach nur geänderte Seiten. Fehler brechen den Build ab.
if (process.env.PDFMY_PRERENDER === '1') {
  try { require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools', 'prerender.js')], { stdio: 'inherit' }); }
  catch (e) { console.error(`Vorab-Übersetzung abgebrochen (${e.signal ? 'Signal ' + e.signal : 'Code ' + e.status}) – Protokoll: .deploy/logs/prerender-*.log`); process.exit(1); }
}

// Prüfsummenliste (ISO-Maßnahme M10): jede ausgelieferte Datei mit SHA-256, im Format von „sha256sum -c“.
// Ihr Fingerabdruck steht im Release-Protokoll auf GitHub – so lässt sich prüfen, dass pdfmy.de genau diesen Stand ausliefert.
{
  const sha = b => require('crypto').createHash('sha256').update(b).digest('hex'), list = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), rel = path.relative(OUT, p).split(path.sep).join('/');
      if (e.isDirectory()) walk(p); else if (!/^pruefsummen\.|(^|\/)\.ht/.test(rel)) list.push([rel, sha(fs.readFileSync(p))]);
    }
  })(OUT);
  list.sort((a, b) => a[0] < b[0] ? -1 : 1);
  const txt = list.map(([f, h]) => `${h}  ${f}`).join('\n') + '\n', stand = (fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8').match(/VERSION = '([^']+)'/) || [])[1];
  write('pruefsummen.txt', txt);
  write('pruefsummen.json', JSON.stringify({ stand, fingerabdruck: sha(txt), dateien: Object.fromEntries(list) }));
  console.log(`Prüfsummen: ${list.length} Dateien, Fingerabdruck ${sha(txt).slice(0, 16)}`);
}

let n = 0, size = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; size += fs.statSync(p).size; } } })(OUT);
console.log(`Web-Build fertig: ${OUT} (${n} Dateien, ${(size / 1048576).toFixed(1)} MB)`);
