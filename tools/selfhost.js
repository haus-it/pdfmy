// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PDFMy auf dem eigenen Server (19.11.2026; Update-Strategie ab 01.12.2026: docs/Update-Strategie.md).
   Bei jedem Web-Build entsteht ein Paket nur mit der App – ohne Website, Impressum, Datenschutzseite oder Zählseiten von pdfmy.de –
   und zwei signierte Kanäle für die Aktualisierung auf fremden Servern:
     /selfhost/aktuell/latest.json(.sig)  jede veröffentlichte Fassung sofort
     /selfhost/stabil/latest.json(.sig)   die neueste Fassung, die seit STABIL_TAGE Tagen auf pdfmy.de läuft und nicht zurückgezogen ist
   Signiert wird „pdfmy-selfhost-v1\n“ + latest.json mit dem Update-Schlüssel der Mentor GmbH (tools/signing/unix-update.pem, RSA-3072,
   SHA-256, PKCS#1 v1.5). Das Präfix trennt diese Signaturen von denen der pdfmy-Scan-Updates (gleicher Schlüssel, anderer Zweck).
   Die Aktualisierer (tools/selfhost/pdfmy-selfhost.sh für Linux, .ps1 für Windows/IIS) tragen den öffentlichen Schlüssel selbst.
   Archiv: dist/selfhost-archiv/<nr>/ (außerhalb der Ausgabe, bleibt über Builds) – info.json mit veroeffentlicht (setzt
   tools/deploy.ps1 nach erfolgreichem Hochladen: node tools/selfhost.js --veroeffentlicht 291) und zurueckgezogen (deploy.ps1 -Rollback). */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { tar, gz } = require('./deb.js');

const STABIL_TAGE = 7, BEHALTEN = 12;   // so viele Fassungen bleiben im Archiv
const PRAEFIX = 'pdfmy-selfhost-v1\n';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const ARCHIV = root => path.join(root, 'dist', 'selfhost-archiv');

// Versionsdatei (kompakt, nur Zeichenketten – die Skripte lesen sie ohne JSON-Werkzeug) und ihre Signatur
// datum = Veröffentlichung auf pdfmy.de: die Aktualisierer im Kanal „stabil“ rechnen damit die 7 Tage selbst nach (auch ohne neues
// Ausrollen); sicherheit '1' = Sicherheitsfassung, sofort auch für „stabil“
function manifest({ nr, version, datei, sha, groesse, datum, kanal, sicherheit = false }) {
  return JSON.stringify({ format: '1', kanal, nr: String(nr), version, datei, sha256: sha, groesse: String(groesse), datum, ...(sicherheit ? { sicherheit: '1' } : {}) }) + '\n';
}
const signiere = (text, key) => crypto.sign('sha256', Buffer.concat([Buffer.from(PRAEFIX), Buffer.from(text)]), { key, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64') + '\n';
const pruefe = (text, sigB64, pub) => crypto.verify('sha256', Buffer.concat([Buffer.from(PRAEFIX), Buffer.from(text)]), { key: pub, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(sigB64).trim(), 'base64'));

// Skripte mit Domain, Version und öffentlichem Schlüssel füllen
function skripte(root, { domain, version, key }) {
  const pub = crypto.createPublicKey(key), jwk = pub.export({ format: 'jwk' });
  const pem = pub.export({ type: 'spki', format: 'pem' }).trim();
  const lf = f => fs.readFileSync(path.join(root, 'tools', 'selfhost', f), 'utf8').replace(/\r\n/g, '\n');
  const sh = lf('pdfmy-selfhost.sh').replace(/__DOMAIN__/g, domain).replace('__VERSION__', version).replace('__PUBKEY__', pem);
  const ps1 = lf('pdfmy-selfhost.ps1').replace(/__DOMAIN__/g, domain).replace('__VERSION__', version)
    .replace('__MODULUS__', Buffer.from(jwk.n, 'base64url').toString('base64')).replace('__EXPONENT__', Buffer.from(jwk.e, 'base64url').toString('base64'))
    .replace(/\n/g, '\r\n').replace(/^/, '﻿');   // BOM: Windows PowerShell 5.1 liest UTF-8 sonst als ANSI (Umlaute)
  if (/__[A-Z]+__/.test(sh + ps1)) throw new Error('selfhost: Platzhalter in den Skripten nicht ersetzt');
  return { sh, ps1, pem: pem + '\n' };
}

/* Paket bauen. files: [{ path: 'index.html', data: Buffer }] – die App-Dateien; dazu kommen pruefsummen.json, Skripte, Hinweise. */
function paket(files, { nr, stand, domain, sh, ps1 }) {
  const all = files.map(f => ({ path: f.path, data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data) }));
  const liste = Object.fromEntries(all.map(f => [f.path, sha256(f.data)]).sort((a, b) => a[0] < b[0] ? -1 : 1));
  all.push({ path: 'pruefsummen.json', data: Buffer.from(JSON.stringify({ stand, dateien: liste })) });
  all.push({ path: 'pdfmy-selfhost.sh', data: Buffer.from(sh), mode: 0o755 }, { path: 'pdfmy-selfhost.ps1', data: Buffer.from(ps1) });
  all.push({ path: 'eigene-links.beispiel.json', data: Buffer.from(JSON.stringify([{ text: 'Impressum', url: 'https://intranet.example/impressum' }, { text: 'Datenschutz', url: 'https://intranet.example/datenschutz' }], null, 2) + '\n') });
  all.push({ path: 'LIESMICH.txt', data: Buffer.from(liesmich({ nr, stand, domain })) });
  return gz(tar(all.map(f => ({ path: './' + f.path, data: f.data, mode: f.mode }))));
}
function liesmich({ nr, stand, domain }) {
  return `PDFMy ${stand} (v${nr}) – für den eigenen Server
========================================================

Dieser Ordner ist die komplette App PDFMy als statische Dateien. Er braucht keinen Server-Code, keine Datenbank und
keinen Zugriff ins Internet. Dokumente werden im Browser der Nutzer verarbeitet und nie an den Server geschickt.

Ausliefern: per HTTPS (für den Offline-Betrieb über den Service Worker nötig), z. B. nginx, Apache oder IIS. Die
Sicherheits-Kopfzeilen (Content-Security-Policy, nosniff, Referrer-, Permissions-Policy, Schutz vor Einbetten in fremde
Seiten) und die Zwischenspeicher-Regeln liegen bei: .htaccess (Apache, mit mod_headers), web.config (IIS) und
nginx-pdfmy.conf (Vorlage für nginx). HSTS (Strict-Transport-Security) bitte auf Serverebene setzen – im Unterordner
gälte es sonst für den ganzen Server.

Aktualisieren (empfohlen: automatisch, signiert, ohne Ausfallzeit):
  Linux:   sudo ./pdfmy-selfhost.sh installieren /var/www/pdfmy
  Windows: .\\pdfmy-selfhost.ps1 installieren C:\\inetpub\\pdfmy      (PowerShell als Administrator)
Danach prüft der Server täglich zwischen 3 und 6 Uhr, ob es eine neue Fassung gibt (Kanal „stabil“: erst nach
${STABIL_TAGE} Tagen ohne Rücknahme auf ${domain}; „--kanal=aktuell“ bzw. „-Kanal aktuell“: sofort). Installiert wird nur
eine von der Mentor GmbH signierte Fassung mit passender Prüfsumme; die vorige bleibt für „zurueck“ erhalten.
Eigene Dateien und Ordner im Hauptordner (z. B. impressum.html) bleiben bei Updates erhalten – nicht aber
eigene Dateien in den Ordnern des Pakets (js/, vendor/, i18n/, icons/). Eigene Links in der Fußzeile der App
(Impressum, Datenschutz, Hilfe des Hauses): Datei eigene-links.json nach dem Muster eigene-links.beispiel.json anlegen.

Anleitung, Webserver-Beispiele, Prüfsummen: https://${domain}/firmen.html#eigener-server
Update-Strategie (Kanäle, Fristen, Sicherheitsupdates): https://github.com/haus-it/pdfmy/blob/main/docs/Update-Strategie.md

LIZENZBEDINGUNGEN BEACHTEN
Für den Betrieb auf einem eigenen Server gelten die Lizenzbedingungen auf GitHub:
  https://github.com/haus-it/pdfmy/blob/main/LICENSE  (PolyForm Noncommercial License 1.0.0, Kopie: LICENSE)
  https://github.com/haus-it/pdfmy/blob/main/NOTICE   (Hinweise und Bestandteile anderer Hersteller, Kopie: NOTICE)
Bitte vor der Installation prüfen, ob Ihre Nutzung davon gedeckt ist. Andere Nutzung, etwa im Unternehmen, bitte mit der
Mentor GmbH klären (https://${domain}/firmen.html#eigener-server).
`;
}

// IIS: Dateitypen, die ältere IIS-Fassungen nicht kennen; sw.js und pruefsummen.json nicht zwischenspeichern
const WEB_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".wasm" /><mimeMap fileExtension=".wasm" mimeType="application/wasm" />
      <remove fileExtension=".webmanifest" /><mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
      <remove fileExtension=".mjs" /><mimeMap fileExtension=".mjs" mimeType="text/javascript" />
      <remove fileExtension=".json" /><mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".gz" /><mimeMap fileExtension=".gz" mimeType="application/gzip" />
      <remove fileExtension=".traineddata" /><mimeMap fileExtension=".traineddata" mimeType="application/octet-stream" />
      <remove fileExtension=".ttf" /><mimeMap fileExtension=".ttf" mimeType="font/ttf" />
      <remove fileExtension=".woff2" /><mimeMap fileExtension=".woff2" mimeType="font/woff2" />
      <remove fileExtension=".icc" /><mimeMap fileExtension=".icc" mimeType="application/octet-stream" />
    </staticContent>
    <httpProtocol><customHeaders>
      <remove name="X-Content-Type-Options" /><add name="X-Content-Type-Options" value="nosniff" />
      <remove name="Referrer-Policy" /><add name="Referrer-Policy" value="no-referrer" />
      <remove name="X-Frame-Options" /><add name="X-Frame-Options" value="SAMEORIGIN" />
      <remove name="Permissions-Policy" /><add name="Permissions-Policy" value="camera=(self), microphone=(), geolocation=(), payment=()" />
      <remove name="Content-Security-Policy" /><add name="Content-Security-Policy" value="__CSP__" />
    </customHeaders></httpProtocol>
  </system.webServer>
  <location path="sw.js"><system.webServer><staticContent><clientCache cacheControlMode="DisableCache" /></staticContent></system.webServer></location>
  <location path="pruefsummen.json"><system.webServer><staticContent><clientCache cacheControlMode="DisableCache" /></staticContent></system.webServer></location>
</configuration>
`;

/* Apache (.htaccess) und nginx (Vorlage): dieselben Sicherheits-Kopfzeilen wie pdfmy.de – CSP wie im <meta>-Tag plus frame-ancestors 'self'
   (Einbetten nur im eigenen Intranet-Portal derselben Adresse). HSTS bewusst NICHT: im Unterordner gälte es für den ganzen Server des
   Betreibers – das entscheidet er auf Serverebene (LIESMICH). Ohne mod_headers wirken die Zeilen nicht, schaden aber nicht. */
const HTACCESS = csp => `# PDFMy (eigener Server): Sicherheits-Kopfzeilen und Zwischenspeicher – wird bei Updates ersetzt; eigene Regeln bitte im Server/VirtualHost
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"
  Header always set Content-Security-Policy "${csp}"
  <FilesMatch "^(sw\\.js|pruefsummen\\.json|index\\.html)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
<IfModule mod_mime.c>
  AddType application/wasm .wasm
  AddType application/manifest+json .webmanifest
</IfModule>
`;
const NGINX = csp => `# PDFMy (eigener Server) – Vorlage für nginx: in den server { … }-Block übernehmen, Pfad anpassen.
# HSTS (Strict-Transport-Security) bitte auf Serverebene setzen, wenn der ganze Host nur HTTPS spricht.
location /pdfmy/ {
  alias /var/www/pdfmy/;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()" always;
  add_header Content-Security-Policy "${csp}" always;
  location ~ /pdfmy/(sw\\.js|pruefsummen\\.json|index\\.html)$ { add_header Cache-Control "no-cache"; add_header X-Content-Type-Options "nosniff" always; }
}
types { application/wasm wasm; application/manifest+json webmanifest; }
`;

// Archiv lesen: [{ nr, dir, info }] absteigend nach Nummer
function archiv(root) {
  const d = ARCHIV(root); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(n => /^\d+$/.test(n)).map(n => ({ nr: +n, dir: path.join(d, n), info: JSON.parse(fs.readFileSync(path.join(d, n, 'info.json'), 'utf8')) }))
    .sort((a, b) => b.nr - a.nr);
}
/* Kanal „stabil“: neueste veröffentlichte, nicht zurückgezogene Fassung, die seit STABIL_TAGE Tagen läuft. Gibt es noch keine
   (Start, oder alle jünger), dann die älteste veröffentlichte – nie eine unveröffentlichte. */
function stabilWahl(list, jetzt = Date.now()) {
  const ok = list.filter(x => x.info.veroeffentlicht && !x.info.zurueckgezogen);
  // Sicherheitsupdate (deploy.ps1 -Sicherheit): sofort stabil, ohne Wartezeit (docs/Update-Strategie.md, Abschnitt 8)
  return ok.find(x => x.info.sicherheit || jetzt - Date.parse(x.info.veroeffentlicht) >= STABIL_TAGE * 864e5) || ok[ok.length - 1] || null;
}

/* Aufruf aus tools/build-web.js. files: App-Dateien; write(rel, data) schreibt in die Ausgabe. */
function build({ root, write, domain, nr, stand, files, appVersion, csp = "default-src 'self'" }) {
  const cspSelf = csp.replace(/;?s*$/, '') + "; frame-ancestors 'self'";
  const keyFile = path.join(root, 'tools', 'signing', 'unix-update.pem');
  if (!fs.existsSync(keyFile)) throw new Error('Signaturschlüssel fehlt: tools/signing/unix-update.pem');
  const key = crypto.createPrivateKey(fs.readFileSync(keyFile));
  const sk = skripte(root, { domain, version: appVersion, key });
  const lic = ['LICENSE', 'NOTICE'].filter(f => fs.existsSync(path.join(root, f))).map(f => ({ path: f, data: fs.readFileSync(path.join(root, f)) }));
  const tgz = paket([...files, ...lic, { path: 'web.config', data: Buffer.from(WEB_CONFIG.replace('__CSP__', cspSelf.replace(/"/g, '&quot;'))) }, { path: '.htaccess', data: Buffer.from(HTACCESS(cspSelf)) }, { path: 'nginx-pdfmy.conf', data: Buffer.from(NGINX(cspSelf)) }], { nr, stand, domain, sh: sk.sh, ps1: sk.ps1 });
  const datei = `pdfmy-selfhost-v${nr}.tar.gz`;
  // ins Archiv (gleiche Nummer erneut gebaut: Paket ersetzen, Veröffentlichungsdatum bleibt)
  const ad = path.join(ARCHIV(root), String(nr)); fs.mkdirSync(ad, { recursive: true });
  const altInfo = fs.existsSync(path.join(ad, 'info.json')) ? JSON.parse(fs.readFileSync(path.join(ad, 'info.json'), 'utf8')) : {};
  fs.writeFileSync(path.join(ad, datei), tgz);
  const sicherheit = process.env.PDFMY_SICHERHEIT === '1' || !!altInfo.sicherheit;   // deploy.ps1 -Sicherheit
  fs.writeFileSync(path.join(ad, 'info.json'), JSON.stringify({ ...altInfo, nr, version: stand, datei, sha256: sha256(tgz), groesse: tgz.length, gebaut: new Date().toISOString(), ...(sicherheit ? { sicherheit: true } : {}) }, null, 1) + '\n');
  for (const x of archiv(root).slice(BEHALTEN)) fs.rmSync(x.dir, { recursive: true, force: true });   // ältere Fassungen aufräumen
  const kanal = (name, x) => {
    const data = x.nr === nr ? tgz : fs.readFileSync(path.join(x.dir, x.info.datei));
    const m = manifest({ nr: x.nr, version: x.info.version, datei: x.info.datei, sha: sha256(data), groesse: data.length, datum: x.info.veroeffentlicht || new Date().toISOString(), kanal: name, sicherheit: !!x.info.sicherheit });
    write(`selfhost/${name}/${x.info.datei}`, data);
    write(`selfhost/${name}/latest.json`, m);
    write(`selfhost/${name}/latest.json.sig`, signiere(m, key));
  };
  const list = archiv(root);
  kanal('aktuell', list.find(x => x.nr === nr));
  // stabil: die gewählte Fassung; vor der allerersten Veröffentlichung (leeres Archiv) die aktuelle
  // Sicherheitsupdate: die gerade gebaute Fassung gleich auch in „stabil“
  const st = (sicherheit && list.find(x => x.nr === nr)) || stabilWahl(list) || list.find(x => x.nr === nr);
  kanal('stabil', st);
  write('selfhost/pdfmy-selfhost.sh', sk.sh); write('selfhost/pdfmy-selfhost-sh.sig', crypto.sign('sha256', Buffer.from(sk.sh), { key, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64') + '\n');
  write('selfhost/pdfmy-selfhost.ps1', sk.ps1); write('selfhost/pdfmy-selfhost-ps1.sig', crypto.sign('sha256', Buffer.from(sk.ps1), { key, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64') + '\n');
  write('selfhost/pdfmy-update-schluessel.pem', sk.pem);
  // Versionsdateien nie lange zwischenspeichern (Proxys, Browser) – sonst sähen Server ein Update erst Tage später
  write('selfhost/.htaccess', `<IfModule mod_headers.c>\n  <FilesMatch "^(latest\\.json|latest\\.json\\.sig)$">\n    Header set Cache-Control "no-cache, max-age=0"\n  </FilesMatch>\n</IfModule>\n<IfModule mod_mime.c>\n  AddType text/plain .sh .ps1 .sig\n  AddType application/gzip .gz\n</IfModule>\n`);
  return { datei, groesse: tgz.length, sha: sha256(tgz), stabil: st.nr, stabilVersion: st.info.version, shSha: sha256(sk.sh), ps1Sha: sha256(Buffer.from(sk.ps1)), pem: sk.pem };
}

module.exports = { build, manifest, signiere, pruefe, paket, skripte, stabilWahl, archiv, STABIL_TAGE, PRAEFIX, WEB_CONFIG, HTACCESS, NGINX };

// Kommandozeile (tools/deploy.ps1): Veröffentlichung bzw. Rücknahme im Archiv vermerken
if (require.main === module) {
  const root = path.join(__dirname, '..'), [, , cmd, nrArg] = process.argv, d = path.join(ARCHIV(root), String(+nrArg || ''), 'info.json');
  if (!['--veroeffentlicht', '--zurueckgezogen'].includes(cmd) || !fs.existsSync(d)) { console.error('Aufruf: node tools/selfhost.js --veroeffentlicht|--zurueckgezogen <nr>'); process.exit(2); }
  const info = JSON.parse(fs.readFileSync(d, 'utf8'));
  if (cmd === '--veroeffentlicht' && !info.veroeffentlicht) info.veroeffentlicht = new Date().toISOString();
  if (cmd === '--zurueckgezogen') info.zurueckgezogen = new Date().toISOString();
  fs.writeFileSync(d, JSON.stringify(info, null, 1) + '\n');
  console.log(`Selbstbetrieb: v${+nrArg} ${cmd === '--veroeffentlicht' ? 'veröffentlicht' : 'zurückgezogen'} (${d})`);
}
