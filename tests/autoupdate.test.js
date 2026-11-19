// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Updates ohne Bestätigung (19.11.2026): Web-App im ersten ruhigen Moment, geöffnete PDFs werden mitgenommen;
// pdfmy Scan versucht es bei laufender Arbeit nach 15 Minuten erneut statt nach 6 Stunden.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = R('js/app.js'), cs = R('tools/pdfmy-scan/Program.cs'), pl = R('tools/pdfmy-scan-mac/pdfmy-scan.pl');

test('Web-App: Update im ruhigen Moment, nie bei ungespeicherter Arbeit, Dokument wird wieder geöffnet', () => {
  assert.match(app, /function quietUpdate\(\) \{\s*if \(!upd\.ready \|\| busyNow\(\)\) return;/, 'nichts, solange gearbeitet wird');
  assert.match(app, /if \(!state\.pages\.length\) return applyUpdateNow\(null\);/, 'nichts offen → sofort');
  assert.match(app, /hiddenSince && Date\.now\(\) - hiddenSince > 60 \* 1000\) \|\| Date\.now\(\) - lastInput > 10 \* 60 \* 1000/, 'im Hintergrund oder nicht bedient');
  assert.match(app, /function resumable\(\) \{\s*if \(state\.dirty\) return null;/, 'ungespeicherte Arbeit wird nie neu geladen');
  assert.match(app, /if \(!d\?\.bytes \|\| d\.unlocked \|\| d\.filled \|\| d\.repaired \|\| p\.rotation \|\| p\.annots\.length\) return null;/, 'nur unveränderte PDFs');
  assert.match(app, /await idb\.put\('updResume'/); assert.match(app, /catch \(e\) \{ console\.warn\('Update: Dokument merken', e\); return; \}/, 'ohne Merken kein Neuladen');
  assert.match(app, /window\.pdfmyHandles\.set\(file, f\.handle\)/, 'Verweis auf die Originaldatei bleibt');
  assert.match(app, /Date\.now\(\) - s\.at > 10 \* 60 \* 1000\) return;/, 'alte Reste werden nicht geöffnet');
  assert.match(app, /setInterval\(quietUpdate, 20 \* 1000\)/);
});

test('pdfmy Scan: automatisch ohne Meldung, bei laufender Arbeit nach 15 Minuten erneut, nach Fehler nach 1 Stunde', () => {
  assert.match(cs, /public const string Version = "1\.(2[1-9]|[3-9]\d)\.\d+";/); assert.match(R('tools/pdfmy-scan/pdfmy-scan.csproj'), /<Version>1\.(2[1-9]|[3-9]\d)\.\d+<\/Version>/);
  assert.match(cs, /else if \(auto\) \{ updateTimer\.Interval = 15 \* 60 \* 1000;/);
  assert.match(cs, /updateTimer\.Interval = 60 \* 60 \* 1000;/);
  assert.match(cs, /if \(manual \|\| \(offered != latest && Updater\.AutoOff\)\)/, 'Meldung nur, wenn automatische Updates aus sind');
  assert.match(cs, /if \(Machine\.UpdatesManaged\)/, 'von der IT verteilt: unverändert keine Selbstaktualisierung');
  assert.match(pl, /^our \$VERSION = '1\.(1[1-9]|[2-9]\d)\.\d+';/m);
  assert.match(pl, /\(\$why \/\/ ''\) eq 'Scan läuft' \? 900 : \(!defined \$v && \$why\) \? 3600 :/);
  assert.match(app, /const SCAN_LATEST = '1\.(2[1-9]|[3-9]\d)\.\d+';/); assert.match(app, /const SCAN_MAC_LATEST = '1\.(1[1-9]|[2-9]\d)\.\d+';/);
});
