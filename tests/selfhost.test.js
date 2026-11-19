// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PDFMy auf dem eigenen Server: signierte Kanäle, Paket und die Aktualisierer für Linux (bash) und Windows (PowerShell) –
// durchgespielt gegen einen lokalen Testspiegel mit eigenem Testschlüssel (nie mit dem echten Update-Schlüssel).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), crypto = require('node:crypto'), cp = require('node:child_process');
const SH = require('../tools/selfhost.js');
const ROOT = path.join(__dirname, '..');

const { privateKey: key } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const sk = SH.skripte(ROOT, { domain: 'pdfmy.test', version: 'test', key });

test('Versionsdatei: Signatur mit Präfix, Fälschung und fremder Schlüssel fallen auf', () => {
  const m = SH.manifest({ nr: 291, version: 'pdfmy-selfhost-x-v291', datei: 'pdfmy-selfhost-v291.tar.gz', sha: 'ab', groesse: 5, datum: '2026-11-19T00:00:00Z', kanal: 'aktuell' });
  const sig = SH.signiere(m, key), pub = crypto.createPublicKey(key);
  assert.ok(SH.pruefe(m, sig, pub));
  assert.ok(!SH.pruefe(m.replace('291', '999'), sig, pub), 'geänderte Nummer');
  assert.ok(!SH.pruefe(m, SH.signiere(m, other), pub), 'fremder Schlüssel');
  // ohne Präfix signiert (z. B. eine Signatur für pdfmy Scan) gilt hier nicht
  const roh = crypto.sign('sha256', Buffer.from(m), { key, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64');
  assert.ok(!SH.pruefe(m, roh, pub), 'Signatur eines anderen Zwecks');
  assert.match(m, /^\{"format":"1","kanal":"aktuell","nr":"291",/);
});

test('Kanal „stabil“: 7 Tage veröffentlicht, nie zurückgezogen, nie unveröffentlicht', () => {
  const tag = 864e5, jetzt = Date.parse('2026-12-20T12:00:00Z');
  const x = (nr, tageAlt, extra = {}) => ({ nr, info: { veroeffentlicht: tageAlt == null ? undefined : new Date(jetzt - tageAlt * tag).toISOString(), ...extra } });
  assert.equal(SH.stabilWahl([x(300, 1), x(299, 3), x(298, 8), x(297, 20)], jetzt).nr, 298);
  assert.equal(SH.stabilWahl([x(300, 1), x(299, 9, { zurueckgezogen: 'ja' }), x(298, 12)], jetzt).nr, 298, 'zurückgezogen wird übersprungen');
  assert.equal(SH.stabilWahl([x(301, null), x(300, 2), x(299, 4)], jetzt).nr, 299, 'Start: älteste veröffentlichte');
  assert.equal(SH.stabilWahl([x(301, null)], jetzt), null);
  assert.equal(SH.stabilWahl([x(300, 1, { sicherheit: true }), x(299, 9)], jetzt).nr, 300, 'Sicherheitsupdate sofort stabil');
  assert.equal(SH.stabilWahl([x(300, 1, { sicherheit: true, zurueckgezogen: 'ja' }), x(299, 9)], jetzt).nr, 299);
});

test('Skripte: Platzhalter ersetzt, öffentlicher Schlüssel drin, Syntax gültig', () => {
  const pem = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }).trim();
  assert.ok(sk.sh.includes(pem)); assert.ok(!/__[A-Z]+__/.test(sk.sh + sk.ps1));
  assert.ok(sk.sh.includes('https://pdfmy.test/selfhost/$KANAL'));
  assert.ok(!sk.sh.includes('\r'), 'bash-Skript mit LF');
  const bash = bashExe(); if (bash) { const f = path.join(os.tmpdir(), `pdfmy-n-${process.pid}.sh`); fs.writeFileSync(f, sk.sh); const r = cp.spawnSync(bash, ['-n', f]); fs.rmSync(f, { force: true }); assert.equal(r.status, 0, String(r.stderr)); }
  if (process.platform === 'win32') {
    const f = path.join(os.tmpdir(), `pdfmy-sh-${process.pid}.ps1`); fs.writeFileSync(f, sk.ps1);
    const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${f}',[ref]$null,[ref]$e);$e.Count`], { encoding: 'utf8' });
    fs.rmSync(f, { force: true }); assert.equal(r.stdout.trim(), '0', 'PowerShell-Syntax: ' + r.stdout + r.stderr);
  }
});

// ---------- Durchspielen gegen einen Testspiegel ----------
function bashExe() {
  if (process.platform !== 'win32') return fs.existsSync('/bin/bash') ? '/bin/bash' : null;
  return ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'].find(p => fs.existsSync(p)) || null;   // nicht WSL-bash
}
function spiegel() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-spiegel-'));
  const srv = http.createServer((q, s) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '')); if (!f.startsWith(dir) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.end(fs.readFileSync(f)); });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ dir, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
// Fassung nr auf den Spiegel legen; mod(manifest) erlaubt Fälschungen
function lege(sp, nr, { mod, sigKey = key, kaputt = false } = {}) {
  const tgz = SH.paket([{ path: 'index.html', data: `<!doctype html><title>v${nr}</title>` }, { path: 'sw.js', data: `const VERSION='v${nr}';` }, { path: 'js/app.js', data: `// v${nr}` }],
    { nr, stand: `pdfmy-selfhost-test-v${nr}`, domain: 'pdfmy.test', sh: sk.sh, ps1: sk.ps1 });
  const datei = `pdfmy-selfhost-v${nr}.tar.gz`; fs.writeFileSync(path.join(sp.dir, datei), kaputt ? Buffer.concat([tgz, Buffer.from('x')]) : tgz);
  let m = SH.manifest({ nr, version: `pdfmy-selfhost-test-v${nr}`, datei, sha: crypto.createHash('sha256').update(tgz).digest('hex'), groesse: tgz.length, datum: '2026-11-19T00:00:00Z', kanal: 'aktuell' });
  const sig = SH.signiere(m, sigKey); if (mod) m = mod(m);
  fs.writeFileSync(path.join(sp.dir, 'latest.json'), m); fs.writeFileSync(path.join(sp.dir, 'latest.json.sig'), sig);
}
const titel = ziel => (fs.readFileSync(path.join(ziel, 'index.html'), 'utf8').match(/<title>(v\d+)/) || [])[1];

function ablauf(name, run) {
  test(`Aktualisierer ${name}: Installation, Update mit eigenen Dateien, Fälschungen, kein Rückschritt, zurück`, { skip: !run.ok && `${name} nicht verfügbar` }, async () => {
    const sp = await spiegel(), base = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-ziel-')), ziel = path.join(base, 'pdfmy');
    try {
      lege(sp, 290);
      let r = await run('aktualisieren', ziel, sp.url); assert.equal(r.status, 0, r.out);
      assert.equal(titel(ziel), 'v290'); assert.match(fs.readFileSync(path.join(ziel, '.pdfmy-version'), 'utf8'), /^nr=290$/m);
      fs.writeFileSync(path.join(ziel, 'impressum.html'), 'eigen'); fs.writeFileSync(path.join(ziel, 'eigene-links.json'), '[]');
      r = await run('aktualisieren', ziel, sp.url); assert.equal(r.status, 0); assert.match(r.out, /aktuell/);
      lege(sp, 291);
      r = await run('pruefen', ziel, sp.url); assert.equal(r.status, 10, r.out); assert.equal(titel(ziel), 'v290', 'pruefen ändert nichts');
      r = await run('aktualisieren', ziel, sp.url); assert.equal(r.status, 0, r.out);
      assert.equal(titel(ziel), 'v291');
      assert.equal(fs.readFileSync(path.join(ziel, 'impressum.html'), 'utf8'), 'eigen', 'eigene Datei bleibt');
      assert.ok(fs.existsSync(path.join(ziel, 'eigene-links.json')));
      assert.ok(fs.existsSync(path.join(base, '.pdfmy.vorher')), 'vorige Fassung aufbewahrt');
      assert.deepEqual(fs.readdirSync(base).filter(n => n.startsWith('.pdfmy-arbeit')), [], 'Arbeitsordner aufgeräumt');
      // Fälschungen: alles bleibt, wie es ist
      lege(sp, 292, { mod: m => m.replace('"nr":"292"', '"nr":"293"') });
      r = await run('aktualisieren', ziel, sp.url); assert.notEqual(r.status, 0); assert.match(r.out, /Signatur ungültig/); assert.equal(titel(ziel), 'v291');
      lege(sp, 292, { sigKey: other });
      r = await run('aktualisieren', ziel, sp.url); assert.notEqual(r.status, 0); assert.equal(titel(ziel), 'v291');
      lege(sp, 292, { kaputt: true });
      r = await run('aktualisieren', ziel, sp.url); assert.notEqual(r.status, 0); assert.match(r.out, /Prüfsumme/); assert.equal(titel(ziel), 'v291');
      // ältere, korrekt signierte Fassung (Wiedereinspielen): kein Rückschritt
      lege(sp, 289);
      r = await run('aktualisieren', ziel, sp.url); assert.equal(r.status, 0); assert.equal(titel(ziel), 'v291');
      // zurück: vorige Fassung, eigene Datei ist auch dort (wurde beim Update mitgenommen? – nein, sie entstand danach), Tausch umkehrbar
      r = await run('zurueck', ziel, sp.url); assert.equal(r.status, 0, r.out); assert.equal(titel(ziel), 'v290');
      r = await run('zurueck', ziel, sp.url); assert.equal(r.status, 0); assert.equal(titel(ziel), 'v291');
    } finally { sp.close(); fs.rmSync(sp.dir, { recursive: true, force: true }); fs.rmSync(base, { recursive: true, force: true }); }
  });
}

const bash = bashExe();
// asynchron starten: der Testspiegel läuft im selben Prozess und muss währenddessen antworten können
const lauf = (exe, args, env) => new Promise(res => {
  const p = cp.spawn(exe, args, { env: { ...process.env, ...env } }); let out = '';
  const t = setTimeout(() => p.kill(), 120000);
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', status => { clearTimeout(t); res({ status, out }); });
});
const runBash = (cmd, ziel, url) => {
  const f = path.join(os.tmpdir(), `pdfmy-selfhost-${process.pid}.sh`); fs.writeFileSync(f, sk.sh);
  return lauf(bash, [f, cmd, ziel.replace(/\\/g, '/')], { PDFMY_QUELLE: url });
};
runBash.ok = !!bash && cp.spawnSync(bash, ['-c', 'command -v curl && command -v openssl && command -v tar'], { encoding: 'utf8' }).status === 0;
ablauf('Linux (bash)', runBash);

const runPs = (cmd, ziel, url) => {
  const f = path.join(os.tmpdir(), `pdfmy-selfhost-${process.pid}.ps1`); fs.writeFileSync(f, sk.ps1);
  return lauf('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f, cmd, ziel, '-Quelle', url], {});
};
runPs.ok = process.platform === 'win32' && fs.existsSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe'));
ablauf('Windows (PowerShell)', runPs);

test('Freigabefenster (Update-Strategie Abschnitt 4): Werktage 8–16 Uhr, Freitagnachmittag, Feiertage und Vortag, Ruhezeit', { skip: process.platform !== 'win32' && 'nur Windows' }, () => {
  const faelle = { '2026-12-01 10:00': '', '2026-12-04 11:00': '', '2026-12-04 13:00': 'Freitag', '2026-12-05 10:00': 'Wochenende', '2026-12-02 17:00': 'außerhalb',
    '2026-12-22 10:00': 'Ruhezeit', '2027-01-07 09:00': '', '2027-03-25 10:00': 'Tag vor', '2027-03-26 10:00': 'Feiertag', '2027-03-29 10:00': 'Feiertag',
    '2027-05-05 10:00': 'Tag vor', '2027-05-06 10:00': 'Feiertag', '2027-10-04 10:00': '', '2027-12-31 10:00': 'Ruhezeit' };
  const ps = `. '${path.join(ROOT, 'tools', 'freigabefenster.ps1')}'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ` + Object.keys(faelle).map(d => `'${d}=' + [string](Test-Freigabefenster ([datetime]'${d}'))`).join('; ');
  const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  const got = Object.fromEntries(r.stdout.trim().split(/\r?\n/).map(l => l.split('=')));
  for (const [d, want] of Object.entries(faelle)) assert.ok(want ? (got[d] || '').includes(want) : got[d] === '', `${d}: erwartet „${want || 'im Fenster'}“, bekommen „${got[d]}“`);
  // 2027: Ostern 28.03. → Karfreitag 26.03., Ostermontag 29.03., Himmelfahrt 06.05.
});

test('Build und Auslieferung: Paket ohne Website-Seiten, deploy vermerkt Veröffentlichung und Rücknahme, App liest eigene Links', () => {
  const b = fs.readFileSync(path.join(ROOT, 'tools', 'build-web.js'), 'utf8'), d = fs.readFileSync(path.join(ROOT, 'tools', 'deploy.ps1'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(b, /files: files\.filter\(f => \/\^\(js\|vendor\|icons\|i18n\)\\\/\/\.test\(f\.path\)\)/, 'nur App-Ordner');
  assert.match(b, /edition: 'selfhost'/);
  assert.match(d, /selfhost\.js'\) --veroeffentlicht \$webNr/); assert.match(d, /selfhost\.js'\) --zurueckgezogen \$offNr/);
  assert.match(app, /if \(APP\.edition === 'selfhost'\) fetch\('eigene-links\.json'/);
  // Lizenzbedingungen auf GitHub: Firmen-Seite, LIESMICH im Paket, beide Skripte (Kopf und beim Installieren)
  const LIC = 'https://github.com/haus-it/pdfmy/blob/main/LICENSE';
  assert.ok(b.includes(`<b>Lizenzbedingungen beachten:</b>`) && b.includes(LIC));
  for (const s of [sk.sh, sk.ps1]) assert.ok((s.split(LIC).length - 1) >= 2, 'Kopf und Ausgabe beim Installieren');
  assert.match(fs.readFileSync(path.join(ROOT, 'tools', 'selfhost.js'), 'utf8'), /LIZENZBEDINGUNGEN BEACHTEN/);
  assert.match(d, /\[switch\]\$Sicherheit/);
  assert.match(app, /\^\(https\?:\\\/\\\/\|\\\/\|\\\.\\\/\|\[\\w-\]\+\\\.html\?\(#\.\*\)\?\$\)/, 'nur http(s) oder relative Links');
});
