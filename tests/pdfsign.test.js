// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js');
const forge = globalThis.forge;
// Browser-Build von forge in Node: Zufall aus Node-crypto
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

// Test-Zertifikat (selbst signiert) als .p12 – wie es eine Zertifizierungsstelle oder Windows exportiert
function makeP12(password, algorithm = '3des', days = 365) {
  const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + days * 864e5);
  const attrs = [{ name: 'commonName', value: 'Wolfgang Test' }, { name: 'organizationName', value: 'Mertens GmbH' }];
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm })).getBytes();
  return Uint8Array.from(der, c => c.charCodeAt(0));
}
const p12 = makeP12('Geheim-123'), p12aes = makeP12('Geheim-123', 'aes256');
module.exports = { makeP12 };

test('Zertifikat lesen: Name, Aussteller, falsches Passwort', () => {
  const s = Sign.readP12(p12, 'Geheim-123');
  assert.equal(s.name, 'Wolfgang Test'); assert.equal(s.selfSigned, true);
  assert.equal(Sign.readP12(p12aes, 'Geheim-123').name, 'Wolfgang Test');   // AES-verschlüsselte .p12 (neuere Windows-Exporte)
  assert.throws(() => Sign.readP12(p12, 'falsch'), /Passwort falsch/);
});

test('PDF signieren: Bytebereiche decken alles außer der Signatur ab, Prüfsumme stimmt', async () => {
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]).drawText('Vertrag', { x: 50, y: 780, size: 20 });
  const signed = await Sign.signPdf(await doc.save(), Sign.readP12(p12, 'Geheim-123'), { reason: 'Freigabe', location: 'Paderborn' });
  const s = Buffer.from(signed).toString('latin1');
  const [, a, b, c, d] = s.match(/\/ByteRange \[ (\d+) (\d+) (\d+) (\d+) \]/).map(Number);
  assert.equal(a, 0); assert.equal(c + d, signed.length);
  assert.equal(s[b], '<'); assert.equal(s[c - 1], '>');
  const covered = Buffer.concat([Buffer.from(signed.subarray(0, b)), Buffer.from(signed.subarray(c))]);
  // messageDigest im CMS = SHA-256 der abgedeckten Bytes
  const der = Buffer.from(s.slice(b + 1, c - 1).replace(/0+$/, m => m.length % 2 ? m.slice(1) : m), 'hex');
  const want = crypto.createHash('sha256').update(covered).digest();
  assert.ok(der.includes(want), 'messageDigest stimmt nicht');
  assert.match(s, /\/SubFilter \/ETSI\.CAdES\.detached/);
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'pdfmy-signiert.pdf'), signed);
});

test('Abgelaufenes Zertifikat wird abgelehnt', async () => {
  const old = makeP12('x', '3des', -1), doc = await PDFLib.PDFDocument.create(); doc.addPage();
  await assert.rejects(Sign.signPdf(await doc.save(), Sign.readP12(old, 'x')), /abgelaufen/);
});

test('Windows-Zertifikat (pdfmy Scan): SubFilter je nach Fähigkeit des Helfers', async () => {
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]);
  const bytes = await doc.save(), cms = async () => new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]);
  const base = { name: 'Karte', notAfter: new Date(Date.now() + 864e5), cms };
  const sub = async signer => Buffer.from(await Sign.signPdf(bytes, signer)).toString('latin1').match(/\/SubFilter \/([\w.]+)/)[1];
  assert.equal(await sub({ ...base, pades: true }), 'ETSI.CAdES.detached');   // ab pdfmy Scan 1.8.0 (signing-certificate-v2)
  assert.equal(await sub(base), 'adbe.pkcs7.detached');                      // ältere Helfer: bisheriges Format
});

test('Zeitstempel: Fehler des Dienstes bricht ab, gleichzeitige Signaturen stören sich nicht', async () => {
  const s = Sign.readP12(p12, 'Geheim-123');
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]);
  const bytes = await doc.save();
  await assert.rejects(Sign.signPdf(bytes, s, { tsa: async () => { throw new Error('TSA aus'); } }), /TSA aus/);
  await assert.rejects(Sign.signPdf(bytes, s, { tsa: async () => new Uint8Array([0x30, 0x03, 0x30, 0x01, 0x02]) }), /./);
  // ohne Zeitstempel neben einem laufenden Vorgang mit großem Platzhalter: beide bleiben in sich stimmig
  const slow = Sign.signPdf(bytes, s, { tsa: () => new Promise((_, no) => setTimeout(() => no(new Error('langsam')), 50)) }).catch(e => e);
  const plain = await Sign.signPdf(bytes, s, {});
  assert.match(Buffer.from(plain).toString('latin1'), /\/ByteRange \[ 0 \d+ \d+ \d+ \]/);
  assert.match((await slow).message, /langsam/);
});
