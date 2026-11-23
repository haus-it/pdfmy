// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// pdfmy Scan 1.24.0 (Meldung 2026-0002): Brother-Geräte lehnen einen WSD-Einzugsauftrag bei leerem Einzug mit
// „ServerErrorNotAcceptingJobs“ ab. Bisher kam der Hinweis für Kyocera/Ricoh („WSD-Scan am Gerät starten“) – jetzt „Einzug leer“.
// Geprüft wird die echte pdfmy-Scan.exe (Schalter --wsd-test) gegen einen nachgebildeten WSD-Scanner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), EXE = path.join(ROOT, 'tools', 'pdfmy-scan', 'bin', 'Release', 'net48', 'pdfmy-Scan.exe');

function hasDotnet() { try { execFileSync('dotnet', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } }
const skip = process.platform !== 'win32' || !hasDotnet();

// Nachgebildeter Scan-Dienst: adf = 'leer' | 'ok'; Glas liefert immer eine Seite
function scanner(adf) {
  const calls = [];
  const img = Buffer.alloc(3000, 0xab).toString('base64');
  const srv = http.createServer((q, r) => {
    let b = ''; q.on('data', d => b += d); q.on('end', () => {
      const src = (/<sca:InputSource>(\w+)</.exec(b) || [])[1];
      if (/CreateScanJob/.test(b)) {
        calls.push('create:' + src);
        if (src === 'ADF' && adf === 'leer') { r.writeHead(500, { 'content-type': 'application/soap+xml' }); return r.end('<soap:Envelope><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value><soap:Subcode><soap:Value>wscn:ServerErrorNotAcceptingJobs</soap:Value></soap:Subcode></soap:Code></soap:Fault></soap:Body></soap:Envelope>'); }
        r.writeHead(200, { 'content-type': 'application/soap+xml' }); return r.end(`<soap:Envelope><soap:Body><sca:CreateScanJobResponse><sca:JobId>7</sca:JobId><sca:JobToken>t-${src}</sca:JobToken></sca:CreateScanJobResponse></soap:Body></soap:Envelope>`);
      }
      if (/RetrieveImage/.test(b)) {
        const n = calls.filter(c => c.startsWith('get')).length; calls.push('get');
        if (n === 0) { r.writeHead(200, { 'content-type': 'application/soap+xml' }); return r.end(`<soap:Envelope><soap:Body><sca:RetrieveImageResponse><sca:ScanData>${img}</sca:ScanData></sca:RetrieveImageResponse></soap:Body></soap:Envelope>`); }
        r.writeHead(500, { 'content-type': 'application/soap+xml' }); return r.end('<soap:Envelope><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Sender</soap:Value><soap:Subcode><soap:Value>wscn:ClientErrorNoImagesAvailable</soap:Value></soap:Subcode></soap:Code></soap:Fault></soap:Body></soap:Envelope>');
      }
      r.writeHead(404); r.end();
    });
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ srv, calls, url: `http://127.0.0.1:${srv.address().port}/scan` })));
}
function run(url, auto) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wsd-')), 'ergebnis.txt');
  return new Promise((res, rej) => {
    const { execFile } = require('node:child_process');
    execFile(EXE, ['--wsd-test', url, out, ...(auto ? ['--auto'] : [])], { timeout: 90000 }, err => {
      try { res(fs.readFileSync(out, 'utf8')); } catch (e) { rej(err || e); } finally { fs.rmSync(path.dirname(out), { recursive: true, force: true }); }
    });
  });
}

test('pdfmy Scan (Windows): leerer Einzug → „kein Papier“ statt Kyocera-Hinweis; Glas-Ausweichen und Normalfall bleiben', { skip, timeout: 240000 }, async () => {
  execFileSync('dotnet', ['build', path.join(ROOT, 'tools', 'pdfmy-scan', 'pdfmy-scan.csproj'), '-c', 'Release', '-nologo', '-v', 'q'], { stdio: 'ignore', timeout: 180000 });
  const leer = await scanner('leer');
  try {
    const r = await run(leer.url, false);
    assert.match(r, /^FEHLER Im Einzug liegt offenbar kein Papier/);
    assert.doesNotMatch(r, /Kyocera/);
    assert.ok(leer.calls.filter(c => c === 'create:ADF').length <= 4, 'nicht lange wiederholt: ' + leer.calls.join(','));
    const a = await run(leer.url, true);
    assert.match(a, /^OK 1/, 'automatisch: weiter zum Glas');
  } finally { leer.srv.close(); }
  const ok = await scanner('ok');
  try { assert.match(await run(ok.url, false), /^OK 1/); } finally { ok.srv.close(); }
});

test('pdfmy Scan (Mac/Linux): dieselbe Unterscheidung im Perl-Programm', () => {
  const pl = fs.readFileSync(path.join(ROOT, 'tools', 'pdfmy-scan-mac', 'pdfmy-scan.pl'), 'utf8');
  assert.match(pl, /if \(\$x =~ \/NotAcceptingJobs\/i\) \{ if \(\$src0 eq 'ADF'\) \{ \$adfref = 1; last if \$try >= 2; \} else \{ \$notacc = 1; \} \}/);
  assert.match(pl, /die "Im Einzug liegt offenbar kein Papier/);
  assert.ok(pl.indexOf('Im Einzug liegt offenbar kein Papier') < pl.indexOf('Bei Kyocera, Ricoh'), 'Einzug-Meldung vor dem Kyocera-Hinweis');
});
