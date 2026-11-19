// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Offline-Betrieb und laufender Betrieb (19.11.2026): Offline-Vorrat (Sprachen, Office-Schriften, CJK-Schrift vorab laden),
// Speicheranzeige, kein stiller Ausfall ohne Internet; Betriebsprüfung der Live-Website (tools/betrieb.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = R('js/app.js'), sw = R('sw.js'), html = R('index.html');

test('Offline-Vorrat: Auswahl wird gemerkt und bei jedem Start vollständig gehalten', () => {
  assert.match(html, /<button type="button" id="offState" class="offstate"/, '„Offline bereit“ ist anklickbar');
  assert.match(html, /<dialog id="offDlg"/); for (const id of ['offHeavy', 'offCjk', 'offLangs', 'offGo', 'offSpeicher']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(app, /heavy: heavy \|\| v\.heavy, cjk: v\.cjk/, 'Start-Abgleich nimmt die gemerkte Auswahl mit');
  assert.match(app, /LS\.set\('offVorrat', \{ langs, heavy: \$\('#offHeavy'\)\.checked, cjk: \$\('#offCjk'\)\.checked \}\)/);
  assert.match(sw, /\.\.\.\(d\.cjk \? \['vendor\/cjk\/PDFMyCJK-Regular\.ttf\.gz'\] : \[\]\)/, 'Service Worker lädt die CJK-Schrift in den Vorrat');
  // Sprachkürzel werden im Service Worker geprüft (kein beliebiger Pfad)
  assert.match(sw, /filter\(l => \/\^\[a-z_\]\{3,8\}\$\/\.test\(l\)\)/);
});

test('Offline-Vorrat: „Jetzt laden“ wartet auf die Antwort genau seiner Anfrage', () => {
  assert.match(sw, /postMessage\(\{ type: 'pdfmy:offline', id: d\.id,/);
  assert.match(app, /e\.data\?\.type === 'pdfmy:offline' && e\.data\.id === id/);
  assert.match(app, /navigator\.storage\?\.estimate\?\.\(\)/); assert.match(app, /navigator\.storage\?\.persisted\?\.\(\)/);
});

test('Kein stiller Ausfall: fehlt offline die CJK-Schrift, sagt PDFMy warum und wie es künftig klappt', () => {
  assert.match(app, /Ohne Internet fehlt die Schrift für chinesische, japanische und koreanische Zeichen/);
});

test('Betriebsprüfung: letzte Veröffentlichung aus dem Release-Protokoll, auch nach einem Rückweg', () => {
  const { letzteFreigabe } = require('../tools/betrieb.js');
  const r = letzteFreigabe();
  assert.match(r.stand, /^pdfmy-\d{12}-v\d+$/); assert.match(r.finger, /^[0-9a-f]{16}$/);
  const b = R('tools/betrieb.js');
  for (const k of ['pruefsummen.txt', 'selfhost/${k}/latest.json', 'download/pdfmy-scan-unix.json', 'download/version.json', '.well-known/security.txt', "'smoke.js'"]) assert.ok(b.includes(k), k);
  assert.match(b, /process\.exit\(fehler \? 1 : 0\)/, 'Rückgabewert für die Aufgabenplanung');
  // nach einem Rückweg: Stand und Fingerabdruck der zurückgeholten Fassung (auch aus ihrer früheren Zeile)
  const P = '| 2026-11-19 05:00 | pdfmy-202611190400-v298 | 1.20.1 | x… | ok | 1 | A | aaaaaaaaaaaaaaaa |\n| 2026-11-19 06:00 | pdfmy-202611190500-v299 | 1.20.1 | x… | ok | 1 | A | bbbbbbbbbbbbbbbb |\n';
  assert.deepEqual(letzteFreigabe(P + '| 2026-11-19 07:00 | Rückweg auf pdfmy-202611190400-v298 | – | – | Probelauf bestanden | 3 | A | – |\n'),
    { stand: 'pdfmy-202611190400-v298', finger: 'aaaaaaaaaaaaaaaa', datum: '2026-11-19 07:00', rueckweg: true });
  assert.equal(letzteFreigabe(P).stand, 'pdfmy-202611190500-v299');
});

test('Rückweg (deploy.ps1): Ziel nach Live-Stand, zurückgezogene Fassungen nie wieder, bei -Test nichts protokolliert; Archiv schützt „stabil“', () => {
  const d = R('tools/deploy.ps1'), s = R('tools/selfhost.js');
  assert.match(d, /\$n -lt \$liveNr -and -not \$zurueck\[\$n\]/, 'nächste ältere, nicht zurückgezogene Fassung');
  assert.match(d, /--zurueckgezogen \$liveNr/, 'die Live-Fassung wird zurückgezogen, nicht „neuestes ZIP“');
  assert.match(d, /if \(-not \$DryRun -and -not \$Test\) \{   # -Test lädt nichts hoch/);
  assert.match(s, /if \(x\.nr !== st\.nr && x\.nr !== nr && !jung\(x\)\) fs\.rmSync/, 'stabil und junge Fassungen bleiben im Archiv');
  assert.match(s, /ist schon veröffentlicht .* bitte VERSION in sw\.js erhöhen/, 'veröffentlichte Nummer nie neu bauen');
});
