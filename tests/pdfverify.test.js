// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// Signaturprüfung (js/pdfverify.js): gültig, verändert, nachträglich angehängt, fremde Signaturen (OpenSSL: RSA und ECDSA)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js');
const forge = globalThis.forge;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

function p12(cn, days = 365) {
  const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '0a1b';
  cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + days * 864e5);
  const attrs = [{ name: 'commonName', value: cn }, { name: 'organizationName', value: 'Mentor GmbH' }];
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
  return Uint8Array.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'pw', { algorithm: '3des' })).getBytes(), c => c.charCodeAt(0));
}
async function signedPdf() {
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]).drawText('Vertrag über Wartung', { x: 50, y: 780, size: 20 });
  return Sign.signPdf(await doc.save(), Sign.readP12(p12('Erika Muster'), 'pw'), { reason: 'Freigabe', location: 'Paderborn' });
}

test('Gültige Signatur: unverändert, Signatur passt, Name, Grund, ganzes Dokument', async () => {
  const [r] = await Verify.verify(await signedPdf());
  assert.equal(r.intact, true); assert.equal(r.valid, true); assert.equal(r.wholeFile, true);
  assert.equal(r.signer.cn, 'Erika Muster'); assert.equal(r.signer.o, 'Mentor GmbH');
  assert.equal(r.reason, 'Freigabe'); assert.equal(r.selfSigned, true); assert.equal(r.certValidAtTime, true);
  assert.deepEqual(r.problems, []);
});

test('Nach dem Signieren verändert: wird erkannt', async () => {
  const s = await signedPdf(), t = Buffer.from(s), i = t.indexOf('Vertrag'.split('').map(c => c.charCodeAt(0).toString(16)).join('')) ;
  // ein Byte im abgedeckten Bereich ändern (am Anfang, im Kopf)
  const k = t.indexOf('/Type'); t[k + 1] = 'X'.charCodeAt(0);
  const [r] = await Verify.verify(new Uint8Array(t));
  assert.equal(r.intact, false); assert.ok(r.problems.some(p => /verändert/.test(p)));
});

test('Nachträglich angehängt (inkrementelles Update): wird gemeldet', async () => {
  const s = await signedPdf(), more = Buffer.from('\n% Nachtrag nach der Signatur\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
  const [r] = await Verify.verify(new Uint8Array(Buffer.concat([Buffer.from(s), more])));
  assert.equal(r.intact, true); assert.equal(r.valid, true); assert.equal(r.wholeFile, false);
  assert.ok(r.problems.some(p => /angehängt/.test(p)));
});

test('Ohne Signatur: nichts gefunden', async () => {
  const doc = await PDFLib.PDFDocument.create(); doc.addPage();
  assert.deepEqual(await Verify.verify(await doc.save()), []);
});

// Fremde Signaturen: dieselbe PDF, die CMS-Signatur aber von OpenSSL erzeugt (anderer Kodierer, mit signierten Attributen)
const hasOpenssl = (() => { try { cp.execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
async function opensslSigned(kind) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfmy-verify-')), f = n => path.join(dir, n);
  const keyArgs = kind === 'ec' ? ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256'] : ['-newkey', 'rsa:2048'];
  cp.execFileSync('openssl', ['req', '-x509', ...keyArgs, '-nodes', '-keyout', f('k.pem'), '-out', f('c.pem'), '-days', '30', '-subj', `/CN=OpenSSL ${kind.toUpperCase()} Test/O=Fremd AG`], { stdio: 'ignore' });
  const pdf = Buffer.from(await signedPdf()), s = pdf.toString('latin1');
  const [, a, b, c, d] = s.match(/\/ByteRange \[ (\d+) (\d+) (\d+) (\d+) \]/).map(Number);
  fs.writeFileSync(f('data.bin'), Buffer.concat([pdf.subarray(0, b), pdf.subarray(c)]));
  cp.execFileSync('openssl', ['cms', '-sign', '-binary', '-in', f('data.bin'), '-signer', f('c.pem'), '-inkey', f('k.pem'), '-outform', 'DER', '-out', f('sig.der'), '-md', 'sha256'], { stdio: 'ignore' });
  const hex = fs.readFileSync(f('sig.der')).toString('hex'), room = c - b - 2;
  assert.ok(hex.length <= room, 'Signatur zu groß');
  Buffer.from(hex + '0'.repeat(room - hex.length), 'latin1').copy(pdf, b + 1);
  return new Uint8Array(pdf);
}
test('Fremde Signatur (OpenSSL, RSA): gültig', { skip: !hasOpenssl && 'OpenSSL fehlt' }, async () => {
  const [r] = await Verify.verify(await opensslSigned('rsa'));
  assert.equal(r.intact, true); assert.equal(r.valid, true, r.problems.join('; ')); assert.equal(r.signer.cn, 'OpenSSL RSA Test');
});
test('Fremde Signatur (OpenSSL, ECDSA P-256): gültig', { skip: !hasOpenssl && 'OpenSSL fehlt' }, async () => {
  const [r] = await Verify.verify(await opensslSigned('ec'));
  assert.equal(r.intact, true); assert.equal(r.valid, true, r.problems.join('; ')); assert.equal(r.signer.cn, 'OpenSSL EC Test'); assert.equal(r.signer.o, 'Fremd AG');
});

test('Nutzungsrechte-Signatur (UR3) wird als solche erkannt, normale Signatur nicht', () => {
  const mk = extra => {
    const hex = 'ab'.repeat(32);
    const head = `%PDF-1.7\n1 0 obj\n<< /Type /Sig /SubFilter /adbe.pkcs7.sha1 ${extra}/ByteRange [0 AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC] /Contents <`;
    const tail = `> >>\nendobj\n%%EOF\n`;
    let s = head + hex + tail;
    const l1 = head.length - 1, o2 = head.length + hex.length + 1, l2 = s.length - o2;
    s = s.replace('AAAAAAAAAA', String(l1).padEnd(10)).replace('BBBBBBBBBB', String(o2).padEnd(10)).replace('CCCCCCCCCC', String(l2).padEnd(10));
    return new Uint8Array(Buffer.from(s, 'latin1'));
  };
  const [ur] = Verify.find(mk('/Reference [ << /Type /SigRef /TransformMethod /UR3 >> ] '));
  const [nor] = Verify.find(mk(''));
  assert.equal(ur.usageRights, true);
  assert.equal(nor.usageRights, false);
});

test('Mehrere Personen signieren nacheinander: alle Signaturen bleiben gültig (inkrementelles Update)', async () => {
  const first = await signedPdf();                                              // Erika Muster
  const second = await Sign.signPdf(first, Sign.readP12(p12('Max Beispiel'), 'pw'), { reason: 'Gegenzeichnung' });
  // die ersten Bytes sind unverändert – angehängt, nicht neu geschrieben
  assert.equal(Buffer.compare(Buffer.from(second.subarray(0, first.length)), Buffer.from(first)), 0);
  const third = await Sign.signPdf(second, Sign.readP12(p12('Dritte Person'), 'pw'), { reason: 'Kenntnisnahme' });
  const rs = await Verify.verify(third);
  assert.equal(rs.length, 3);
  assert.deepEqual(rs.map(r => r.signer.cn), ['Erika Muster', 'Max Beispiel', 'Dritte Person']);
  for (const r of rs) { assert.equal(r.intact, true); assert.equal(r.valid, true); assert.deepEqual(r.problems, []); }
  assert.equal(rs[2].wholeFile, true); assert.equal(rs[0].laterSigned, true); assert.equal(rs[1].laterSigned, true);
  // pdf-lib kann die Datei weiterhin lesen (Querverweise in Ordnung)
  const doc = await PDFLib.PDFDocument.load(third);
  assert.equal(doc.getPageCount(), 1);
});
