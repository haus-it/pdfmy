// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Baut die öffentliche Web-Version (pdfmy.de) nach dist/<domain>.
// Aufruf: node tools/build-web.js   (bricht ab, wenn Impressumsdaten in tools/site.json fehlen)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(__dirname, 'site.json'), 'utf8'));
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
for (const f of ['js/app.js', 'js/i18n.js', 'js/bea.js', 'js/letter.js', 'js/qr.js', 'js/formdetect.js', 'js/a11ycheck.js', 'js/bank.js', 'js/pdfsign.js', 'js/pdfcrypt.js', 'js/sigreq.js', 'js/pdfinc.js', 'js/layout.js', 'js/pdfverify.js', 'js/docdetect.js', 'js/imaging.js', 'js/camera.js', 'js/tools.js', 'js/journal.js', 'js/einvoice.js', 'js/einvoice-out.js', 'js/email.js', 'js/pro.js',
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
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self' blob: data: http://127.0.0.1:52880; " +
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
rep('<span id="msg" role="status">Bereit.</span>', `<span id="msg" role="status">Bereit.</span><nav class="legal"><a href="hilfe.html">${N.hilfe}</a> · <a href="werkzeuge.html">${N.werkzeuge}</a> · <span class="ext"><a href="erweiterung.html">${N.erweiterung}</a> · </span><a href="presse.html">${N.presse}</a> · <a href="impressum.html">${N.impressum}</a> · <a href="datenschutz.html">${N.datenschutz}</a> · <a href="barrierefreiheit.html">${N.barrierefreiheit}</a> · <a href="https://github.com/haus-it/pdfmy" target="_blank" rel="noopener">${N.quellcode}</a></nav>`);
rep('</style>', 'footer .legal a{color:var(--muted)} footer .legal{white-space:nowrap} @media (max-width:760px){footer .legal .ext{display:none}}\n</style>');
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
write('index.html', html);

// Manifest und Service Worker
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
Object.assign(man, { id: '/', name: 'PDFMy', short_name: 'PDFMy', description: 'PDF scannen, bearbeiten, zusammenfügen und schützen – direkt im Browser, ohne Upload.' });
write('manifest.webmanifest', JSON.stringify(man, null, 2) + '\n');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
write('sw.js', fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  .replace(/const VERSION = '[^']+';/, `const VERSION = 'pdfmy-${stamp}';`)
  .replace("'js/tools.js',", "'js/tools.js', 'impressum.html', 'datenschutz.html', 'barrierefreiheit.html', 'hilfe.html', 'hilfe.js', 'sprache.js',"));

// Rechtstexte und Infoseiten. multi: mehrsprachig (Hilfe, Scanner) – Sprachwahl oben rechts wie in der App, Wörterbuch i18n/site/<code>.json.
// Rechtstexte (Impressum, Datenschutz, Barrierefreiheit) bleiben ausschließlich deutsch.
const page = (title, body, head = '', multi = true) =>   // multi: Sprachauswahl und Übersetzung (alle Seiten)
 `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${title} – PDFMy</title>${head}${multi ? '<script src="js/i18n.js" data-dict="site"></script>' : ''}<link rel="icon" href="icons/mentor-192.png"><meta name="theme-color" content="#4A5280">
<style>
@font-face{font-family:"Archivo";src:url(vendor/fonts/archivo-latin-standard-italic.woff2) format("woff2");font-weight:100 900;font-stretch:62% 125%;font-style:italic;font-display:swap}
@font-face{font-family:"Archivo";src:url(vendor/fonts/archivo-latin-standard-normal.woff2) format("woff2");font-weight:100 900;font-stretch:62% 125%;font-style:normal;font-display:swap}
@font-face{font-family:"Source Sans 3";src:url(vendor/fonts/source-sans-3-latin-wght-normal.woff2) format("woff2");font-weight:200 900;font-display:swap}
:root{--bg:#F5F6F8;--panel:#fff;--text:#1B1D23;--muted:#50545F;--accent:#4A5280;--line:#E3E4E8}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171C;--panel:#1D2027;--text:#E8E9ED;--muted:#A6AAB6;--accent:#9AA3D9;--line:#343842}}
:root[data-theme="dark"]{--bg:#15171C;--panel:#1D2027;--text:#E8E9ED;--muted:#A6AAB6;--accent:#9AA3D9;--line:#343842}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 "Source Sans 3","Segoe UI",system-ui,sans-serif}
header{background:var(--panel);border-bottom:1px solid var(--line);padding:12px 20px}
.brand{display:inline-flex;flex-direction:column;gap:3px;line-height:1;color:inherit;text-decoration:none}
.brand b{font-family:"Archivo",sans-serif;font-style:italic;font-weight:900;font-stretch:125%;font-size:22px;letter-spacing:.3px;color:var(--accent)}
.brand span{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--muted)}
.brand img{height:13px;width:auto}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .brand img{background:#fff;padding:1px 3px;border-radius:2px}}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:20px 24px}
h1,h2{font-family:"Archivo","Segoe UI",sans-serif} h1{font-size:26px;margin:8px 0 16px;font-style:italic;font-weight:900;font-stretch:125%;text-transform:uppercase}
h2{font-size:17px;margin:22px 0 6px} a{color:var(--accent)}
.back{display:inline-block;margin-bottom:8px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lang select{font:inherit;font-size:14px;max-width:46vw;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text)}
html.i18n-wait body{visibility:hidden}
html[lang="de"] .lang-note,html:not([lang]) .lang-note{display:none}.lang-note{border-left:4px solid #4A5280;padding:6px 12px;background:var(--bg)}
</style></head><body><header><a class="brand" href="./" translate="no"><b>PDFMy</b><span>powered by <img src="icons/mentor-group.png" alt="Mentor Group"></span></a>${multi ? '<span class="lang"><select id="siteLang" aria-label="Sprache"></select></span><script src="sprache.js"></script>' : ''}</header>
<main><a class="back" href="./">← zurück zu PDFMy</a><div class="card"><h1>${title}</h1>${body}</div></main></body></html>
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
<p>Die optionale Erweiterung für Chrome und Edge lädt eine PDF, die Sie im Browser öffnen oder per Rechtsklick wählen, von der jeweiligen Webseite
und übergibt sie innerhalb Ihres Browsers an pdfmy. Dabei werden keine Daten an uns oder Dritte übertragen; es gibt keinen Verlauf, keine
Statistik und keine Fernkonfiguration. Gespeichert werden nur Ihre zwei Einstellungen (automatisch öffnen an/aus, Ziel) im Browser sowie für
wenige Minuten die Adresse der zuletzt übergebenen PDF, damit „Zurück“ nicht erneut umleitet (nur im Arbeitsspeicher des Browsers).
Den Zugriff auf Webseiten erteilen Sie ausdrücklich beim Einschalten; beim Ausschalten wird er entzogen.</p>
<h2>6a. Hilfsprogramm „pdfmy Scan“ (Windows, Mac und Linux)</h2>
<p>pdfmy Scan verbindet Ihren Scanner mit PDFMy. Es läuft auf Ihrem PC und ist nur von Ihrem eigenen Rechner aus erreichbar (127.0.0.1); Scans und Dokumente gehen direkt an PDFMy in Ihrem Browser.
Beim Signieren mit einem Windows-Zertifikat oder einer Signaturkarte bleibt der Schlüssel in Windows bzw. auf der Karte. Zur Update-Prüfung ruft pdfmy Scan beim Start und alle sechs Stunden eine Versionsdatei
von ${esc(site.domain)} ab; dabei entstehen nur die unter Nr. 3 genannten Server-Protokolldaten.</p>
<p>pdfmy Scan für Mac arbeitet genauso: Es läuft auf Ihrem Mac, ist nur von dort aus erreichbar (127.0.0.1) und spricht mit Scannern in Ihrem lokalen Netzwerk. Öffnen Sie eine PDF per Doppelklick in PDFMy, wird die Datei mit einem Einmal-Kennwort direkt an PDFMy in Ihrem Browser übergeben; sie verlässt den Mac nicht. Bei der Einrichtung wird einmal das PDFMy-Symbol von ${esc(site.domain)} geladen; eine automatische Update-Prüfung gibt es nicht. pdfmy Scan für Linux arbeitet genauso (nur 127.0.0.1, Einrichtung nur für Ihren Benutzer, ohne Administratorrechte); als Standard für PDFs trägt es sich auf Ihren Wunsch in die Einstellungsdatei Ihrer Arbeitsoberfläche (mimeapps.list) ein.</p>
<h2>6b. Fehlerberichte und Kontakt per E-Mail</h2>
<p>„Problem melden“ und „Herausforderung melden“ bereiten eine E-Mail in Ihrem eigenen Mailprogramm vor; gesendet wird erst, wenn Sie selbst auf „Senden“ klicken. Vorher sehen Sie genau,
was die E-Mail enthält (Versionen, Browser, Protokoll – keine Dokumente). Dateinamen, Absender und E-Mail-Adressen werden standardmäßig unkenntlich gemacht.
Wir verwenden Ihre Nachricht nur, um das Problem zu lösen und Ihnen zu antworten (Art. 6 Abs. 1 lit. b und f DSGVO), und löschen sie, wenn sie dafür nicht mehr benötigt wird,
spätestens nach Ablauf gesetzlicher Aufbewahrungsfristen.</p>
<h2>6c. Hinweis auf Haus iT</h2>
<p>Auf der Startseite steht ein als Anzeige gekennzeichneter Hinweis auf Haus iT. Es ist ein einfacher Link ohne eingebundene Inhalte, Zählpixel oder Cookies. Erst wenn Sie ihn anklicken,
öffnet sich www.haus-it.de in einem neuen Tab; dabei wird keine Herkunftsadresse (Referrer) übermittelt. Für diese Website gilt die Datenschutzerklärung ihres Betreibers.</p>
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
  Header always set Cross-Origin-Opener-Policy "same-origin"
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
write('download/version.json', JSON.stringify({ pdfmyScan: scanVer, file: scanFile, sha256: scanSha }) + '\n');   // Update-Prüfung + Integritätsprüfung in pdfmy Scan
if (fs.existsSync(scanExe)) {
  copy(path.relative(ROOT, scanExe), 'download/' + scanFile);
  copy(path.relative(ROOT, scanExe), 'download/pdfmy-Scan.exe');   // alter Link funktioniert weiter
}
else console.warn('Hinweis: pdfmy-Scan.exe nicht gebaut (dotnet build -c Release in tools/pdfmy-scan)');
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
write('erweiterung.html', page('PDFs direkt in PDFMy öffnen', `
<p>Mit der Browser-Erweiterung öffnen sich PDFs, die Sie in <b>Chrome</b> oder <b>Edge</b> anklicken – unter Windows und am <b>Mac</b> –, direkt in PDFMy – statt in einem anderen PDF-Programm oder im eingebauten Viewer.
Die Datei wird dabei <b>nicht hochgeladen</b>: Sie geht im Browser direkt an PDFMy.</p>
<h2>Installation (ca. 2 Minuten)</h2>
<ol>
<li><a href="download/${extZip}" download>PDFMy-Erweiterung ${extVer} herunterladen</a> (ZIP, ca. ${Math.round(fs.statSync(path.join(OUT, 'download', extZip)).size / 1024)} KB).</li>
<li>Im Ordner <i>Downloads</i> mit der rechten Maustaste auf die ZIP-Datei klicken → <b>Alle extrahieren …</b> → <b>Extrahieren</b> (am Mac genügt ein Doppelklick auf die ZIP-Datei). Es entsteht ein Ordner <i>pdfmy-erweiterung-${extVer}</i>.</li>
<li>In die Adresszeile <b>chrome://extensions</b> eingeben (in Edge: <b>edge://extensions</b>) und Enter drücken.</li>
<li>Rechts oben bzw. links unten den Schalter <b>Entwicklermodus</b> einschalten.</li>
<li>Auf <b>Entpackte Erweiterung laden</b> klicken und den Ordner aus Schritt 2 auswählen.</li>
<li>Es öffnet sich die Seite „Fast fertig“: auf <b>PDFs automatisch in PDFMy öffnen</b> klicken und die Rückfrage des Browsers mit <b>Zulassen</b> bestätigen.</li>
</ol>
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
<a href="download/${scanFile}" download style="flex:1 1 220px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4A5280;border-radius:6px;padding:12px 16px">pdfmy Scan für Windows ${scanVer}<br><small style="font-weight:400">Windows 10/11 · ca. ${scanKb} KB</small></a>
<a href="download/${macZip}" download style="flex:1 1 220px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4A5280;border-radius:6px;padding:12px 16px">pdfmy Scan für Mac ${macVer}<br><small style="font-weight:400">macOS · ZIP, ca. ${Math.round(fs.statSync(path.join(OUT, 'download', macZip)).size / 1024)} KB</small></a>
<a href="download/${linuxSh}" download style="flex:1 1 220px;text-align:center;font-weight:700;text-decoration:none;color:#fff;background:#4A5280;border-radius:6px;padding:12px 16px">pdfmy Scan für Linux ${macVer}<br><small style="font-weight:400">Ubuntu, Debian, Mint, Fedora, openSUSE, Arch …</small></a>
</div>
<p style="margin:10px 0"><b>Gerät nicht dabei?</b> → <a href="#geraet-fehlt">Kurz melden – wir machen den Rest</a>.</p>
<p style="margin:10px 0"><b>Funktioniert mein Gerät?</b> → <a href="scanner-geraete.html">Geräteliste mit Suche</a>: Brother, Epson, HP, Canon, Kyocera, Ricoh, Konica Minolta, Sharp, Xerox, Lexmark, Dell, Samsung und Dokumentenscanner (ScanSnap, fi, Canon DR, Brother ADS, Epson DS) – mit Angabe zu beidseitigem Scannen.</p>
<div id="zertifizierung" style="border-left:4px solid #4A5280;background:var(--bg);padding:10px 14px;margin:14px 0">
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
<li>Keine Warnung, keine Zertifizierung nötig: Die Einrichtung ist ein lesbares Shell-Skript, läuft ohne <code>sudo</code> und richtet alles nur für Ihren Benutzer ein.</li>
</ul>
<p style="margin:8px 0 0;font-size:14px;color:var(--muted)">Echtheit prüfen (SHA-256): Windows ${esc(scanFile)} <code style="word-break:break-all">${scanSha || '–'}</code> · Mac ${esc(macZip)} <code style="word-break:break-all">${require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(OUT, 'download', macZip))).digest('hex')}</code> · Linux ${linuxSh} <code style="word-break:break-all">${linuxSha}</code>. Signatur prüfen unter Windows: Rechtsklick auf die Datei → <i>Eigenschaften</i> → <i>Digitale Signaturen</i> → „Mentor GmbH“.</p>
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
<li><a href="download/${linuxSh}" download>pdfmy Scan für Linux ${macVer} herunterladen</a> und im Terminal starten: <code>sh ~/Downloads/${linuxSh}</code><br>
oder direkt: <code>curl -fsSL https://${site.domain}/download/${linuxSh} | sh</code> (ohne <code>sudo</code>).</li>
<li>Die Einrichtung startet den Scan-Dienst (systemd-Benutzerdienst, startet mit der Anmeldung), legt <b>„PDFMy“</b> im Anwendungsmenü und unter „Öffnen mit“ an und fragt, ob PDF-Dateien künftig per Doppelklick in PDFMy geöffnet werden sollen.</li>
<li>In <a href="./">pdfmy</a> heißt der Knopf oben jetzt <b>„Scannen“</b> – wie unter Windows und am Mac.</li>
</ol>
<p><b>Treiber?</b> Für Netzwerkscanner und Multifunktionsgeräte keine: pdfmy Scan spricht <b>AirScan/eSCL</b> (Suche über Avahi) und <b>WSD</b> direkt. Für <b>USB-Scanner und ältere Geräte</b> nutzt es <b>SANE</b>, wenn installiert:</p>
<ul>
<li>Debian, Ubuntu, Mint: <code>sudo apt install sane-utils sane-airscan ipp-usb avahi-utils</code></li>
<li>Fedora: <code>sudo dnf install sane-backends sane-airscan ipp-usb avahi-tools</code></li>
<li>openSUSE: <code>sudo zypper install sane-backends sane-airscan ipp-usb avahi-utils</code> · Arch: <code>sudo pacman -S sane sane-airscan ipp-usb avahi</code></li>
<li>Nur bei sehr alten Geräten ohne eSCL/WSD: Herstellertreiber – HP <code>hplip</code>, Brother <code>brscan4</code>/<code>brscan5</code>, Epson <code>epsonscan2</code>, Samsung/Xerox „Unified Linux Driver“.</li>
</ul>
<p>pdfmy Scan sucht über Bonjour/avahi, per WSD-Rundruf und fragt zusätzlich jede Adresse im eigenen Netz direkt (Port 80/443) – so findet es Geräte auch, wenn die Firewall Rundruf-Antworten verwirft (z. B. firewalld unter Fedora) oder das Paket <code>avahi-utils</code> fehlt. Das Protokoll im Scan-Fenster zeigt, welcher Weg was gefunden hat. Notfalls: <i>„Gerät per IP-Adresse hinzufügen“</i> – das geht immer. Entfernen: <a href="download/pdfmy-scan-linux-entfernen.sh" download>pdfmy-scan-linux-entfernen.sh</a> herunterladen und mit <code>sh</code> starten.</p>
<h2 id="geraet-fehlt">Ihr Drucker oder Scanner ist noch nicht dabei?</h2>
<div style="border-left:4px solid #4A5280;background:var(--bg);padding:10px 14px;margin:14px 0">
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
copy('tools/site/google3c0638e01aa028c9.html', 'google3c0638e01aa028c9.html');   // Google Search Console: Inhaberschaft (nicht entfernen)
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: https://${site.domain}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://${site.domain}/</loc></url>\n  <url><loc>https://${site.domain}/hilfe.html</loc></url>\n  <url><loc>https://${site.domain}/scanner.html</loc></url>\n  <url><loc>https://${site.domain}/scanner-geraete.html</loc></url>\n  <url><loc>https://${site.domain}/erweiterung.html</loc></url>\n  <url><loc>https://${site.domain}/werkzeuge.html</loc></url>\n  <url><loc>https://${site.domain}/presse.html</loc></url>\n${tools.map(t => `  <url><loc>https://${site.domain}/${t.slug}.html</loc></url>\n`).join('')}</urlset>\n`);

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
  for (const f of ['js/letter.js', 'js/qr.js', 'js/formdetect.js', 'js/a11ycheck.js', 'js/bank.js', 'js/pdfsign.js', 'js/pdfcrypt.js', 'js/sigreq.js', 'js/pdfinc.js', 'js/layout.js', 'js/pdfverify.js', 'js/docdetect.js', 'js/imaging.js', 'js/tools.js', 'js/journal.js', 'js/einvoice.js', 'js/einvoice-out.js', 'js/email.js', 'js/pro.js', 'js/camera.js', 'js/config.js']) copy(f, M(f));
  for (const f of ['icons/mentor-192.png', 'icons/mentor-512.png', 'icons/mentor-maskable-512.png', 'icons/mentor-group.png']) copy(f, M(f));
  fs.cpSync(path.join(ROOT, 'vendor', 'fonts'), path.join(OUT, MD, 'fonts'), { recursive: true });
  let mh = read('index.html').split('url(vendor/fonts/').join('url(fonts/').split('src="vendor/').join('src="../vendor/');
  if (!mh.includes('<title>PDFMy</title>')) throw new Error('mentor: Titel nicht gefunden');
  mh = mh.replace('<title>PDFMy</title>', `<title>PDFMy – powered by Mentor Group</title>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="robots" content="noindex, nofollow">`)
    .replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">');
  write(M('index.html'), mh);
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

let n = 0, size = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; size += fs.statSync(p).size; } } })(OUT);
console.log(`Web-Build fertig: ${OUT} (${n} Dateien, ${(size / 1048576).toFixed(1)} MB)`);
