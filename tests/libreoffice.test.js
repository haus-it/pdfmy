// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Originalgetreue Office-Umwandlung (app-v308): pdfmy Scan 1.22.0 / Mac und Linux 1.12.0 wandelt Word, Excel und PowerPoint
// mit einem installierten LibreOffice ohne Fenster in PDF um; ohne LibreOffice übernimmt die eigene Umwandlung im Browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const app = R('js', 'app.js'), cs = R('tools', 'pdfmy-scan', 'Office.cs'), prog = R('tools', 'pdfmy-scan', 'Program.cs'), pl = R('tools', 'pdfmy-scan-mac', 'pdfmy-scan.pl');
const FAITHFUL = new RegExp(app.match(/const OFFICE_FAITHFUL = \/(.+)\/;/)[1]);

test('App: Office-Dateien zuerst über LibreOffice, sonst eigene Umwandlung', () => {
  for (const n of ['a.docx', 'a.doc', 'a.odt', 'a.rtf', 'a.xlsx', 'a.xls', 'a.ods', 'a.pptx', 'a.ppt', 'a.odp']) assert.ok(FAITHFUL.test(n), n);
  for (const n of ['a.pdf', 'a.epub', 'a.txt', 'a.html', 'a.docx.zip']) assert.ok(!FAITHFUL.test(n), n);
  assert.match(app, /else if \(OFFICE_FAITHFUL\.test\(n\) && await officeViaHelper\(f\)\) \{/, 'vor den eigenen Umwandlungen');
  const i = app.indexOf('OFFICE_FAITHFUL.test(n) && await'), j = app.indexOf('await importOffice(f)');
  assert.ok(i > 0 && i < j, 'Rückfall auf importOffice danach');
  assert.match(app, /if \(!state\.scanConvert \|\| f\.size > 200e6\) return false;/, 'nur wenn pdfmy Scan LibreOffice meldet');
  assert.match(app, /state\.scanConvert = d\.convert === true;/);
  assert.match(app, /if \(!r\.ok \|\| !r\.data\) \{ console\.warn\('LibreOffice-Umwandlung:', r\.error\); return false; \}/, 'Fehler → Rückfall');
  assert.match(app, /const SCAN_LATEST = '1\.(2[2-9]|[3-9]\d)\.\d+'/); assert.match(app, /const SCAN_MAC_LATEST = '1\.(1[2-9]|[2-9]\d)\.\d+'/);   // mindestens 1.22.0 / 1.12.0
});

test('pdfmy Scan (Windows): Umwandlung ohne Fenster, eigenes Profil, einzeln, Arbeitsdateien gelöscht', () => {
  assert.match(cs, /--headless --invisible --norestore --nologo --nodefault --nolockcheck --convert-to pdf --outdir/);
  assert.match(cs, /-env:UserInstallation=\{url\}/);
  assert.match(cs, /lock \(convLock\)/);
  assert.match(cs, /finally \{ try \{ Directory\.Delete\(work, true\); \} catch \{ \} \}/);
  assert.match(cs, /WaitForExit\(180000\)/);
  assert.match(cs, /bytes\[0\] != '%' \|\| bytes\[1\] != 'P'/, 'nur echte PDFs zurückgeben');
  assert.match(prog, /p == "\/office\/convert" && method == "POST"/);
  assert.match(prog, /convert = OfficeApps\.Converter\(\) != null/);
  assert.match(prog, /Version = "1\.(2[2-9]|[3-9]\d)\.\d+"/);
  assert.match(prog, /path\.StartsWith\("\/office"\)/, 'große Dateien erlaubt');
});

test('pdfmy Scan (Mac/Linux): gleiche Umwandlung, Sperrdatei, Status-Meldung', () => {
  assert.match(pl, /our \$VERSION = '1\.(1[2-9]|[2-9]\d)\.\d+'/);
  assert.match(pl, /'--headless', '--invisible', '--norestore', '--nologo', '--nodefault', '--nolockcheck', '--convert-to', 'pdf'/);
  assert.match(pl, /flock\(\$lk, 2\)/);
  assert.match(pl, /\$p eq '\/office\/convert' && \$method eq 'POST'/);
  assert.match(pl, /convert => office_converter\(\) \? JSON::PP::true : JSON::PP::false/);
  assert.match(pl, /m\{\^\/\(office\|office\/convert\|cloud\)\$\}/, 'große Dateien erlaubt');
});
