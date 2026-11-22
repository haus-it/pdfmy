// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Meldungen direkt an pdfmy.de (app-v329, Entscheidung GF 22.11.2026): Empfänger tools/site/melden.php mit dem eingebauten
// PHP-Server durchgespielt (übersprungen, wenn kein PHP installiert ist). Prüft: Annahme ohne IP-Adresse, Nummer und Token,
// Statusabfrage nur mit Token, Betreiberzugang nur mit Schlüssel, Begrenzung, Größengrenze, gesperrter Ordner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), crypto = require('node:crypto');
const php = (() => { try { return cp.spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null; } catch { return null; } })();
const SRC = path.join(__dirname, '..', 'tools', 'site', 'melden.php');

test('melden.php: Annahme, Stand, Betreiber, Grenzen', { skip: !php && 'PHP nicht installiert' }, async () => {
  const web = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-melden-')), ablage = path.join(web, 'meldungen');
  // Testschlüssel statt des echten: Hash im Skript für den Test ersetzen
  const key = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(web, 'melden.php'), fs.readFileSync(SRC, 'utf8').replace(/const ADMIN_HASH = '[0-9a-f]{64}';/, `const ADMIN_HASH = '${crypto.createHash('sha256').update(key).digest('hex')}';`));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = cp.spawn(php, ['-S', `127.0.0.1:${port}`, '-t', web], { env: { ...process.env, PDFMY_MELDUNGEN_DIR: ablage }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/melden.php`;
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(url); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const post = (body, q = '', h = {}) => fetch(url + q, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    // 1) neue Meldung
    let r = await post({ art: 'bug', betreff: 'PDFMy Fehlerbericht – Test', text: 'Art: Fehler\nWas ist passiert: Scanner findet nichts', email: 'tester@example.org', app: 'v329', sprache: 'de' });
    assert.equal(r.status, 200); const a = await r.json();
    assert.match(a.id, /^\d{4}-0001$/); assert.match(a.token, /^[0-9a-f]{32}$/);
    const datei = JSON.parse(fs.readFileSync(path.join(ablage, a.id + '.json'), 'utf8'));
    assert.equal(datei.status, 'neu'); assert.equal(datei.email, 'tester@example.org');
    assert.notEqual(datei.token, a.token, 'nur der Hash des Tokens wird gespeichert');
    assert.doesNotMatch(JSON.stringify(datei), /127\.0\.0\.1/, 'keine IP-Adresse in der Meldung');
    assert.ok(fs.existsSync(path.join(ablage, '.htaccess')) && /Require all denied/.test(fs.readFileSync(path.join(ablage, '.htaccess'), 'utf8')), 'Ordner gesperrt');
    // 2) Stand nur mit Token
    assert.equal((await fetch(`${url}?id=${a.id}&t=falsch`)).status, 404);
    let s = await (await fetch(`${url}?id=${a.id}&t=${a.token}`)).json();
    assert.equal(s.status, 'neu'); assert.equal(s.email, undefined, 'Stand verrät keine E-Mail-Adresse'); assert.equal(s.text, undefined);
    // 3) Betreiber nur mit Schlüssel
    assert.equal((await post({}, '?admin=liste', { 'x-melde-key': 'falsch' })).status, 403);
    const liste = await (await post({ offen: true }, '?admin=liste', { 'x-melde-key': key })).json();
    assert.equal(liste.meldungen.length, 1); assert.equal(liste.meldungen[0].token, undefined);
    r = await post({ id: a.id, status: 'erledigt', version: 'app-v330', antwort: 'Behoben: Der Scanner wird jetzt gefunden.' }, '?admin=status', { 'x-melde-key': key });
    assert.equal(r.status, 200);
    s = await (await fetch(`${url}?id=${a.id}&t=${a.token}`)).json();
    assert.deepEqual([s.status, s.version, s.antwort], ['erledigt', 'app-v330', 'Behoben: Der Scanner wird jetzt gefunden.']);
    assert.equal((await post({ id: a.id, status: 'kaputt' }, '?admin=status', { 'x-melde-key': key })).status, 400);
    // 4) Grenzen: leer, ungültige E-Mail, zu groß, mehr als 10 je Stunde
    assert.equal((await post({ text: 'kurz' })).status, 400);
    assert.equal((await post({ text: 'genug Text hier drin', email: 'keine-adresse' })).status, 400);
    assert.equal((await post('x'.repeat(70000))).status, 413);
    let letzte = 0; for (let i = 0; i < 10; i++) letzte = (await post({ text: 'Meldung Nummer ' + i })).status;
    assert.equal(letzte, 429, 'Begrenzung greift nach 10 Meldungen je Stunde');
    // 5) laufende Nummer
    const ids = fs.readdirSync(ablage).filter(f => /^\d{4}-\d+\.json$/.test(f)).sort();
    assert.equal(ids.length, 10); assert.match(ids[9], /-0010\.json$/);
  } finally { srv.kill(); }
});

test('melden.php: im echten Skript steht nur der Hash des Schlüssels, nie der Schlüssel', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /const ADMIN_HASH = '[0-9a-f]{64}';/);
  const keyFile = path.join(__dirname, '..', '.deploy', 'melde-key.txt');
  if (fs.existsSync(keyFile)) {
    const k = fs.readFileSync(keyFile, 'utf8').trim();
    assert.ok(!src.includes(k), 'Schlüssel nicht im Quelltext');
    assert.ok(src.includes(crypto.createHash('sha256').update(k).digest('hex')), 'Hash passt zum lokalen Schlüssel');
  }
});

test('PDFMy: „Direkt senden“ angebunden, Rückfall auf den Mail-Weg, Datenschutzerklärung nennt den Meldeweg', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  const web = fs.readFileSync(path.join(__dirname, '..', 'tools', 'build-web.js'), 'utf8');
  assert.match(html, /class="primary" id="repDirekt"/); assert.match(html, /id="repEmail" type="email"/); assert.match(html, /id="repDankDlg"/);
  assert.match(src, /const MELDE_URL = 'melden\.php';/, 'gleiche Herkunft (CSP connect-src self)');
  assert.match(src, /LS\.set\('meineMeldungen'/); assert.match(src, /Direkt senden ist gerade nicht möglich – bitte „E-Mail-Programm“ wählen/);
  assert.match(web, /copy\('tools\/site\/melden\.php', 'melden\.php'\)/);
  assert.match(web, /<b>Direkt senden:<\/b>.*Ihre IP-Adresse speichern wir nicht mit der Meldung/);
  assert.match(web, /löschen wir Bericht und E-Mail-Adresse nach 90 Tagen/);
});
