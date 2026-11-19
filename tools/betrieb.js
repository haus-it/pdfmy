// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Betriebsprüfung von pdfmy.de (Update-Strategie, docs/Update-Strategie.md Abschnitt 10/12; ISO 27001 A.8.16 Überwachung, A.8.8).
   Prüft die LIVE-Website von außen – täglich per Aufgabenplanung (tools/betrieb-einrichten.ps1) und nach Bedarf:
     Integrität   Fingerabdruck der live ausgelieferten pruefsummen.txt = Fingerabdruck im Release-Protokoll (docs/RELEASES.md)
                  → erkennt jede Änderung auf dem Webspace, die nicht über deploy.ps1 kam
     Stand        live ausgelieferte Version = letzte Veröffentlichung im Release-Protokoll
     Signaturen   Kanäle „aktuell“/„stabil“ für eigene Server, Mac/Linux-Update von pdfmy Scan; Windows-Programm = Prüfsumme in version.json
     Fristen      HTTPS-Zertifikat (Warnung unter 21 Tagen), security.txt „Expires“ (Warnung unter 30 Tagen)
     Probelauf    tools/smoke.js gegen die Live-Adresse (mit --kurz übersprungen)
   Ausgabe: Zeilen ✓/⚠/✗, Protokoll in .deploy/logs/betrieb-JJJJMMTT.log, Rückgabewert 1 bei einem Fehler (✗), 0 sonst.
     node tools/betrieb.js [--kurz] [--url https://pdfmy.de/] */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), tls = require('node:tls'), cp = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'site.json'), 'utf8'));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg('--url') || `https://${site.domain}/`).replace(/\/?$/, '/');
const KURZ = process.argv.includes('--kurz');
const zeilen = []; let fehler = 0, warnungen = 0;
const ok = t => zeilen.push('✓ ' + t), warn = t => { warnungen++; zeilen.push('⚠ ' + t); }, bad = t => { fehler++; zeilen.push('✗ ' + t); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const holen = async (rel, bin = false) => { const r = await fetch(new URL(rel, BASE) + (rel.includes('?') ? '&' : '?') + 'betrieb=' + Date.now(), { cache: 'no-store', redirect: 'follow' }); if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`); return bin ? Buffer.from(await r.arrayBuffer()) : r.text(); };
const PRAEFIX = 'pdfmy-selfhost-v1\n';
const verify = (data, sigB64, pub) => crypto.verify('sha256', Buffer.isBuffer(data) ? data : Buffer.from(data), { key: pub, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(sigB64).trim(), 'base64'));

// letzte Veröffentlichung im Release-Protokoll: { stand, finger }
function letzteFreigabe(text = fs.readFileSync(path.join(ROOT, 'docs', 'RELEASES.md'), 'utf8')) {
  const rows = text.split(/\r?\n/).filter(l => /^\| \d{4}-\d\d-\d\d /.test(l));
  for (const l of rows.reverse()) {
    const c = l.split('|').map(s => s.trim());
    if (/^pdfmy-\d+-v\d+$/.test(c[2])) return { stand: c[2], finger: c[8], datum: c[1] };
    // Rückweg: Fingerabdruck der zurückgeholten Fassung (deploy.ps1 trägt ihn seit 19.11.2026 mit ein, sonst aus ihrer Veröffentlichungszeile)
    const m = c[2].match(/^Rückweg auf (pdfmy-\d+-v\d+)$/);
    if (m) {
      const eigen = /^[0-9a-f]{16}$/.test(c[8]) ? c[8] : null;
      const frueher = eigen || (rows.find(r => r.split('|').map(s => s.trim())[2] === m[1]) || '').split('|').map(s => s.trim())[8];
      return { stand: m[1], finger: /^[0-9a-f]{16}$/.test(frueher || '') ? frueher : null, datum: c[1], rueckweg: true };
    }
  }
  return null;
}
function zertifikat(host) {
  return new Promise((res, rej) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => { const c = s.getPeerCertificate(); s.end(); res(c); });
    s.on('error', rej); s.on('timeout', () => { s.destroy(); rej(new Error('Zeitüberschreitung')); });
  });
}

module.exports = { letzteFreigabe };
if (require.main === module) (async () => {
  const start = new Date(), host = new URL(BASE).hostname;
  // 1. Integrität und Stand
  try {
    const rel = letzteFreigabe(), txt = await holen('pruefsummen.txt'), finger = sha(txt), stand = (await holen('sw.js')).match(/VERSION = '([^']+)'/)?.[1];
    if (!rel) warn('Release-Protokoll ohne Eintrag');
    else if (stand !== rel.stand) bad(`Live-Stand ${stand} ≠ letzte Veröffentlichung ${rel.stand} (${rel.datum}) – Änderung am Webspace außerhalb von deploy.ps1?`);
    else ok(`Stand ${stand} wie im Release-Protokoll`);
    if (rel?.finger) { if (finger.startsWith(rel.finger)) ok(`Integrität: Fingerabdruck ${finger.slice(0, 16)} wie im Release-Protokoll`); else bad(`Integrität: Fingerabdruck ${finger.slice(0, 16)} ≠ Release-Protokoll ${rel.finger} – ausgelieferte Dateien weichen ab`); }
    else if (rel?.rueckweg) warn('Letzter Eintrag ist ein Rückweg – Fingerabdruck nicht im Protokoll, Integrität nicht prüfbar');
    // Stichprobe: Programmdateien gegen die live veröffentlichte Liste (index.html, sw.js, app.js)
    const liste = JSON.parse(await holen('pruefsummen.json')).dateien, falsch = [];
    for (const f of ['index.html', 'js/app.js', 'js/pro.js', 'js/pdfsign.js', 'js/pdfverify.js']) if (liste[f] && sha(await holen(f, true)) !== liste[f]) falsch.push(f);
    falsch.length ? bad(`Dateien weichen von der eigenen Prüfsummenliste ab: ${falsch.join(', ')}`) : ok('Stichprobe Programmdateien = Prüfsummenliste');
  } catch (e) { bad('Integrität/Stand nicht prüfbar: ' + e.message); }

  // 2. Signaturen der Update-Wege
  try {
    const pem = await holen('selfhost/pdfmy-update-schluessel.pem'), pub = crypto.createPublicKey(pem);
    const lokal = path.join(ROOT, 'tools', 'signing', 'unix-update.pem');
    if (fs.existsSync(lokal) && crypto.createPublicKey(crypto.createPrivateKey(fs.readFileSync(lokal))).export({ type: 'spki', format: 'pem' }).trim() !== pem.trim()) bad('Veröffentlichter Update-Schlüssel ≠ Schlüssel auf dem Build-Rechner');
    for (const k of ['aktuell', 'stabil']) {
      const m = await holen(`selfhost/${k}/latest.json`), sig = await holen(`selfhost/${k}/latest.json.sig`), j = JSON.parse(m);
      if (!verify(PRAEFIX + m, sig, pub)) { bad(`Eigene Server, Kanal ${k}: Signatur ungültig`); continue; }
      const r = await fetch(new URL(`selfhost/${k}/${j.datei}`, BASE), { method: 'HEAD' });
      const len = +r.headers.get('content-length');
      r.ok && (!len || len === +j.groesse) ? ok(`Eigene Server, Kanal ${k}: v${j.nr} signiert, Paket vorhanden`) : bad(`Eigene Server, Kanal ${k}: Paket ${j.datei} fehlt oder falsche Größe`);
    }
    const unix = JSON.parse(await holen('download/pdfmy-scan-unix.json')), pl = await holen('download/pdfmy-scan-unix.pl', true);
    sha(pl) === unix.sha256 && verify(pl, unix.sig, pub) ? ok(`pdfmy Scan Mac/Linux ${unix.version}: Prüfsumme und Signatur gültig`) : bad('pdfmy Scan Mac/Linux: Prüfsumme oder Signatur ungültig');
    const ver = JSON.parse(await holen('download/version.json')), exe = await holen('download/' + ver.file, true);
    sha(exe) === ver.sha256 ? ok(`pdfmy Scan Windows ${ver.pdfmyScan}: Prüfsumme stimmt`) : bad(`pdfmy Scan Windows ${ver.pdfmyScan}: Prüfsumme stimmt nicht`);
  } catch (e) { bad('Signaturen nicht prüfbar: ' + e.message); }

  // 2b. Sicherheits-Kopfzeilen der Startseite (gehen sie verloren – geänderte .htaccess, Hosterwechsel –, fällt es hier auf)
  try {
    const h = (await fetch(BASE, { method: 'GET', cache: 'no-store' })).headers, fehlt = [];
    const csp = h.get('content-security-policy') || '';
    if (!/max-age=\d{7,}/.test(h.get('strict-transport-security') || '')) fehlt.push('Strict-Transport-Security');
    if (!/default-src 'self'/.test(csp) || !/frame-ancestors 'none'/.test(csp) || !/object-src 'none'/.test(csp)) fehlt.push('Content-Security-Policy');
    if (!/nosniff/i.test(h.get('x-content-type-options') || '')) fehlt.push('X-Content-Type-Options');
    if (!/no-referrer/i.test(h.get('referrer-policy') || '')) fehlt.push('Referrer-Policy');
    if (!h.get('permissions-policy')) fehlt.push('Permissions-Policy');
    fehlt.length ? bad('Sicherheits-Kopfzeilen fehlen oder sind schwächer: ' + fehlt.join(', ')) : ok('Sicherheits-Kopfzeilen vollständig (HSTS, CSP, nosniff, Referrer-, Permissions-Policy)');
    // die CSP erlaubt nur pdfmy.de selbst und den eigenen Rechner (Leitplanke 2)
    const fremd = (csp.match(/https?:\/\/[^\s;]+/g) || []).filter(u => !/^http:\/\/(127\.0\.0\.1|localhost):\*$/.test(u));
    fremd.length ? bad('CSP erlaubt fremde Adressen: ' + fremd.join(', ')) : ok('CSP ohne fremde Adressen (nur pdfmy.de und der eigene Rechner)');
  } catch (e) { bad('Kopfzeilen nicht prüfbar: ' + e.message); }

  // 3. Fristen
  try {
    const c = await zertifikat(host), tage = Math.floor((Date.parse(c.valid_to) - Date.now()) / 864e5);
    tage < 7 ? bad(`HTTPS-Zertifikat läuft in ${tage} Tagen ab`) : tage < 21 ? warn(`HTTPS-Zertifikat läuft in ${tage} Tagen ab`) : ok(`HTTPS-Zertifikat noch ${tage} Tage gültig`);
  } catch (e) { bad('HTTPS-Zertifikat nicht prüfbar: ' + e.message); }
  try {
    const st = await holen('.well-known/security.txt'), ex = Date.parse((st.match(/^Expires:\s*(.+)$/m) || [])[1]);
    const tage = Math.floor((ex - Date.now()) / 864e5);
    !ex ? bad('security.txt ohne gültiges „Expires“') : tage < 0 ? bad('security.txt abgelaufen') : tage < 30 ? warn(`security.txt läuft in ${tage} Tagen ab – neu veröffentlichen`) : ok(`security.txt gültig (noch ${tage} Tage)`);
  } catch (e) { bad('security.txt nicht prüfbar: ' + e.message); }

  // 4. Probelauf im Browser gegen die Live-Adresse
  if (!KURZ) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--url', BASE], { encoding: 'utf8', timeout: 600000 });
    const sum = (r.stdout.match(/Probelauf (bestanden|fehlgeschlagen)[^\n]*/i) || [])[0] || 'ohne Ergebnis';
    r.status === 0 ? ok('Live-Probelauf: ' + sum) : bad('Live-Probelauf: ' + sum + ' ' + (r.stdout + r.stderr).split('\n').filter(l => /^✗/.test(l)).join(' · '));
  }

  const kopf = `Betriebsprüfung ${BASE} – ${start.toLocaleString('de-DE')} – ${fehler ? `${fehler} Fehler` : 'ohne Fehler'}${warnungen ? `, ${warnungen} Warnung(en)` : ''}`;
  const text = [kopf, ...zeilen].join('\n') + '\n';
  process.stdout.write(text);
  try {
    const dir = path.join(ROOT, '.deploy', 'logs'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `betrieb-${start.toISOString().slice(0, 10).replace(/-/g, '')}.log`), text + '\n');
    fs.writeFileSync(path.join(dir, 'betrieb-letzte.json'), JSON.stringify({ zeit: start.toISOString(), fehler, warnungen, zeilen }, null, 1));
  } catch {}
  process.exit(fehler ? 1 : 0);
})();
