// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EU-Vertrauensliste (app-v310): Aussteller des Unterzeichner-Zertifikats wird kryptografisch gegen den Schlüssel eines
// qualifizierten Zertifizierungsdienstes aus dem Schnappschuss geprüft – nicht nur am Namen.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js'), EUTL = require('../tools/eutl.js');
const forge = globalThis.forge;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

const name = (cn, o) => [{ name: 'commonName', value: cn }, { name: 'organizationName', value: o }, { name: 'countryName', value: 'DE' }];
function mkCert(subj, issuer, pub, signKey, serial, ca) {
  const c = forge.pki.createCertificate(); c.publicKey = pub; c.serialNumber = serial;
  c.validity.notBefore = new Date(Date.now() - 864e5 * 30); c.validity.notAfter = new Date(Date.now() + 864e5 * 365);
  c.setSubject(subj); c.setIssuer(issuer); if (ca) c.setExtensions([{ name: 'basicConstraints', cA: true }]);
  c.sign(signKey, forge.md.sha256.create()); return c;
}
const caKeys = forge.pki.rsa.generateKeyPair(2048), userKeys = forge.pki.rsa.generateKeyPair(2048), otherKeys = forge.pki.rsa.generateKeyPair(2048);
const caCert = mkCert(name('Test-qCA 1', 'Vertrauen GmbH'), name('Test-qCA 1', 'Vertrauen GmbH'), caKeys.publicKey, caKeys.privateKey, '01', true);
const userCert = mkCert(name('Erika Muster', 'Mentor GmbH'), name('Test-qCA 1', 'Vertrauen GmbH'), userKeys.publicKey, caKeys.privateKey, '0b2c');
const spkiB64 = k => Buffer.from(forge.asn1.toDer(forge.pki.publicKeyToAsn1(k)).getBytes(), 'binary').toString('base64');
const list = (k, st = 'g', from = '2016-07-01', to = null) => ({ stand: '2026-11-19', dienste: [{ c: 'DE', p: 'Vertrauen GmbH', n: 'Qualifizierte Zertifikate', cn: 'Test-qCA 1', k, st, from, to, u: ['s'] }] });

async function signed() {
  const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(userKeys.privateKey, [userCert, caCert], 'pw', { algorithm: '3des' })).getBytes();
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]);
  return Sign.signPdf(await doc.save(), Sign.readP12(Uint8Array.from(p12, c => c.charCodeAt(0)), 'pw'), { reason: 'Freigabe' });
}

test('Aussteller in der Liste (echter Schlüssel): qualifizierter Dienst erkannt', async () => {
  const [r] = await Verify.verify(await signed());
  assert.equal(r.valid, true); assert.equal(r.issuer.cn, 'Test-qCA 1');
  const t = await Verify.trust(r, list(spkiB64(caKeys.publicKey)));
  assert.deepEqual({ c: t.c, p: t.p, atTime: t.atTime }, { c: 'DE', p: 'Vertrauen GmbH', atTime: true });
  assert.deepEqual(t.u, ['s']);
});

test('Gleicher Name, falscher Schlüssel: nicht vertraut (Fälschung des Ausstellernamens)', async () => {
  const [r] = await Verify.verify(await signed());
  assert.equal(await Verify.trust(r, list(spkiB64(otherKeys.publicKey))), null);
});

test('Dienst erst nach der Signatur erteilt bzw. vorher entzogen: atTime false', async () => {
  const [r] = await Verify.verify(await signed());
  assert.equal((await Verify.trust(r, list(spkiB64(caKeys.publicKey), 'g', '2099-01-01'))).atTime, false);
  assert.equal((await Verify.trust(r, list(spkiB64(caKeys.publicKey), 'w', '2016-01-01', '2020-01-01'))).atTime, false);
});

test('Liste fehlt oder Signatur selbst ausgestellt: kein Ergebnis, kein Fehler', async () => {
  const [r] = await Verify.verify(await signed());
  assert.equal(await Verify.trust(r, null), null);
  assert.equal(JSON.stringify(r).includes('_path'), false, 'Zertifikatspfad wird nicht mitgespeichert');
});

test('Werkzeug liest nationale Liste: nur CA/QC, Status, Verlauf, Verwendung', () => {
  const cert = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(caCert)).getBytes(), 'binary').toString('base64');
  const svc = (type, status, ext, hist = '') => `<tsl:TSPService><tsl:ServiceInformation><tsl:ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/${type}</tsl:ServiceTypeIdentifier><tsl:ServiceName><tsl:Name xml:lang="de">Dienst</tsl:Name><tsl:Name xml:lang="en">Service &amp; Co</tsl:Name></tsl:ServiceName><tsl:ServiceDigitalIdentity><tsl:DigitalId><tsl:X509Certificate>${cert}</tsl:X509Certificate></tsl:DigitalId></tsl:ServiceDigitalIdentity><tsl:ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/${status}</tsl:ServiceStatus><tsl:StatusStartingTime>2021-05-01T00:00:00Z</tsl:StatusStartingTime><tsl:ServiceInformationExtensions>${ext}</tsl:ServiceInformationExtensions></tsl:ServiceInformation>${hist}</tsl:TSPService>`;
  const hist = '<tsl:ServiceHistory><tsl:ServiceHistoryInstance><tsl:ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/granted</tsl:ServiceStatus><tsl:StatusStartingTime>2017-01-01T00:00:00Z</tsl:StatusStartingTime></tsl:ServiceHistoryInstance></tsl:ServiceHistory>';
  const xml = `<tsl:TrustServiceProvider><tsl:TSPInformation><tsl:TSPName><tsl:Name xml:lang="en">Vertrauen GmbH</tsl:Name></tsl:TSPName></tsl:TSPInformation>${svc('CA/QC', 'granted', 'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/ForeSignatures')}${svc('TSA/QTST', 'granted', '')}${svc('CA/QC', 'withdrawn', 'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/ForeSeals', hist)}</tsl:TrustServiceProvider>`;
  const s = EUTL.services(xml, 'DE');
  assert.equal(s.length, 2, 'Zeitstempeldienst nicht aufgenommen');
  assert.deepEqual([s[0].p, s[0].n, s[0].cn, s[0].st, s[0].from, s[0].u], ['Vertrauen GmbH', 'Service & Co', 'Test-qCA 1', 'g', '2021-05-01', ['s']]);
  assert.deepEqual([s[1].st, s[1].from, s[1].to, s[1].u], ['w', '2017-01-01', '2021-05-01', ['e']]);
  assert.equal(s[0].k, spkiB64(caKeys.publicKey));
});

test('Anzeige in der App: Leiste und Details, Liste nur bei gültiger fremder Signatur geladen', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  new (require('node:vm').Script)(src);   // übersetzbar
  assert.match(src, /const sigs = await PdfVerify\.verify\(bytes\);\r?\n    await eutlCheck\(sigs\);/);
  assert.match(src, /const todo = sigs\.filter\(r => !r\.usageRights && !r\.selfSigned && r\.valid\); if \(!todo\.length\) return;/);
  assert.match(src, /fetch\('vendor\/eutl\/eutl\.json'\)/);
  assert.match(src, /\$\{trustLine\(r\)\}/);
  assert.match(src, /if \(!bad\.length && trustOk\(last\)\) t \+= ` Aussteller laut EU-Vertrauensliste qualifiziert/);
});

test('Schnappschuss liegt bei und ist plausibel', () => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'eutl', 'eutl.json'), 'utf8'));
  assert.ok(j.laender >= 20 && j.dienste.length > 500);
  assert.ok(j.dienste.some(d => d.c === 'DE' && d.st === 'g'));
  assert.ok(j.dienste.every(d => d.k && d.c && (d.st === 'g' || d.st === 'w')));
});

// Signaturen der Listen (app-v337): LOTL mit verankertem Zertifikat, Länderlisten mit dem Zertifikat aus der LOTL, ganzes Dokument signiert.
test('Signaturprüfung der Listen: Entscheidungsregel und Zertifikate aus der LOTL', () => {
  const ok = { ok: true, whole: true, cert: 'AB12' };
  assert.equal(EUTL.accept(ok, ['ab12']), true);
  assert.equal(EUTL.accept({ ...ok, whole: false }, ['ab12']), false, 'nur Teil signiert (Signature Wrapping)');
  assert.equal(EUTL.accept({ ...ok, ok: false }, ['ab12']), false, 'Signatur ungültig');
  assert.equal(EUTL.accept(ok, ['cd34']), false, 'Zertifikat nicht von der LOTL genannt');
  assert.equal(EUTL.accept(undefined, ['ab12']), false);
  const b64 = Buffer.from('zertifikat').toString('base64');
  const lotl = `<OtherTSLPointer><ServiceDigitalIdentities><ServiceDigitalIdentity><DigitalId><X509Certificate>${b64}</X509Certificate></DigitalId></ServiceDigitalIdentity></ServiceDigitalIdentities><TSLLocation>https://x/tl.xml</TSLLocation><AdditionalInformation><SchemeTerritory>DE</SchemeTerritory><MimeType>application/vnd.etsi.tsl+xml</MimeType></AdditionalInformation></OtherTSLPointer>`;
  const [p] = EUTL.pointers(lotl);
  assert.deepEqual([p.terr, p.loc, p.certs], ['DE', 'https://x/tl.xml', [crypto.createHash('sha256').update('zertifikat').digest('hex')]]);
  const anker = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'eutl-anker.json'), 'utf8'));
  assert.ok(anker.lotl.length >= 1 && anker.lotl.every(h => /^[0-9a-f]{64}$/.test(h)), 'Anker: SHA-256 der LOTL-Zertifikate');
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'eutl', 'eutl.json'), 'utf8'));
  assert.equal(snap.signaturen, 'geprüft', 'Schnappschuss mit geprüften Signaturen erzeugt');
});

test('XML-Signatur echt prüfen (Windows, .NET): gültig, ganzes Dokument; ein geändertes Zeichen → ungültig', { skip: process.platform !== 'win32' }, () => {
  const os = require('os'), { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmlsig-')), good = path.join(dir, 'gut.xml'), bad = path.join(dir, 'boese.xml'), list = path.join(dir, 'l.txt');
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'tl-signiert.xml'), 'utf8');
  fs.writeFileSync(good, xml); fs.writeFileSync(bad, xml.replace('Vertrauen GmbH', 'Vertrauen GmbX')); fs.writeFileSync(list, good + '\n' + bad + '\n');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'tools', 'xmlsig.ps1'), '-List', list], { encoding: 'utf8', timeout: 120000 });
    const [g, b] = out.trim().split(/\r?\n/).map(l => JSON.parse(l));
    assert.deepEqual([g.ok, g.whole, /^[0-9a-f]{64}$/.test(g.cert)], [true, true, true]);
    assert.equal(b.ok, false, 'Manipulation erkannt');
    assert.equal(EUTL.accept(g, [g.cert]), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
