// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Langzeitprüfdaten (app-v311): OCSP-Anfrage nach RFC 6960, Sperrauskunft je Zertifikat, /DSS als inkrementelles Update,
// Signatur bleibt gültig; mit Dokumentzeitstempel darüber (B-LTA) deckt die letzte Signatur die ganze Datei ab.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js');
const forge = globalThis.forge, A = forge.asn1;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

const name = cn => [{ name: 'commonName', value: cn }, { name: 'countryName', value: 'DE' }];
function mkCert(subj, iss, pub, key, serial, ext) {
  const c = forge.pki.createCertificate(); c.publicKey = pub; c.serialNumber = serial;
  c.validity.notBefore = new Date(Date.now() - 864e5 * 30); c.validity.notAfter = new Date(Date.now() + 864e5 * 365);
  c.setSubject(subj); c.setIssuer(iss); if (ext) c.setExtensions(ext); c.sign(key, forge.md.sha256.create()); return c;
}
// Erweiterungen von Hand: AIA (OCSP + Aussteller) und CRL-Verteilpunkt
const C = A.Class.UNIVERSAL, T = A.Type, uri = u => A.create(A.Class.CONTEXT_SPECIFIC, 6, false, u);
const aia = A.create(C, T.SEQUENCE, true, [A.create(C, T.SEQUENCE, true, [A.create(C, T.OID, false, A.oidToDer('1.3.6.1.5.5.7.48.1').getBytes()), uri('http://ocsp.example.org/')])]);
const dp = A.create(C, T.SEQUENCE, true, [A.create(C, T.SEQUENCE, true, [A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [uri('http://crl.example.org/ca.crl')])])])]);
const ext = [{ id: '1.3.6.1.5.5.7.1.1', value: A.toDer(aia).getBytes() }, { id: '2.5.29.31', value: A.toDer(dp).getBytes() }];
const caKeys = forge.pki.rsa.generateKeyPair(2048), userKeys = forge.pki.rsa.generateKeyPair(2048);
const ca = mkCert(name('Test-CA'), name('Test-CA'), caKeys.publicKey, caKeys.privateKey, '01');
const user = mkCert(name('Erika Muster'), name('Test-CA'), userKeys.publicKey, caKeys.privateKey, '0c3d', ext);
const der = c => A.toDer(forge.pki.certificateToAsn1(c)).getBytes();

// gültige OCSP-Antwort (Aufbau wie RFC 6960, Inhalt für den Test ausreichend)
const ocspResp = () => {
  const basic = A.create(C, T.SEQUENCE, true, [A.create(C, T.SEQUENCE, true, []), A.create(C, T.SEQUENCE, true, [A.create(C, T.OID, false, A.oidToDer('1.2.840.113549.1.1.11').getBytes())]), A.create(C, T.BITSTRING, false, '\0abc'),
    A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [A.create(C, T.SEQUENCE, true, [forge.pki.certificateToAsn1(ca)])])]);
  return Uint8Array.from(A.toDer(A.create(C, T.SEQUENCE, true, [A.create(C, T.ENUMERATED, false, '\0'), A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [A.create(C, T.SEQUENCE, true, [A.create(C, T.OID, false, A.oidToDer('1.3.6.1.5.5.7.48.1.1').getBytes()), A.create(C, T.OCTETSTRING, false, A.toDer(basic).getBytes())])])])).getBytes(), ch => ch.charCodeAt(0));
};
async function signed() {
  const p12 = A.toDer(forge.pkcs12.toPkcs12Asn1(userKeys.privateKey, [user, ca], 'pw', { algorithm: '3des' })).getBytes();
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]).drawText('Vertrag', { x: 50, y: 780, size: 20 });
  return Sign.signPdf(await doc.save(), Sign.readP12(Uint8Array.from(p12, c => c.charCodeAt(0)), 'pw'), { reason: 'Freigabe' });
}

test('OCSP-Anfrage: CertID mit SHA-1 über Ausstellername und -schlüssel, Seriennummer', () => {
  const c = Sign.certParts(der(user)), i = Sign.certParts(der(ca)), q = A.fromDer(Sign.ocspRequest(c, i));
  const id = q.value[0].value[0].value[0].value[0];
  assert.equal(A.derToOid(id.value[0].value[0].value), '1.3.14.3.2.26');
  const sha1 = s => crypto.createHash('sha1').update(Buffer.from(s, 'binary')).digest('binary');
  assert.equal(id.value[1].value, sha1(c.issuer)); assert.equal(id.value[2].value, sha1(i.key));
  assert.equal(forge.util.bytesToHex(id.value[3].value), '0c3d');
  assert.deepEqual([c.ocsp, c.crl], [['http://ocsp.example.org/'], ['http://crl.example.org/ca.crl']]);
});

test('Sperrauskunft holen, /DSS anhängen, Signatur bleibt gültig', async () => {
  const asks = [], s = await signed();
  const r = await Sign.addLtv(s, async q => { asks.push(q); if (q.kind === 'ocsp') return ocspResp(); throw new Error('nicht erreichbar'); });
  assert.deepEqual(asks.map(a => [a.kind, a.url]), [['ocsp', 'http://ocsp.example.org/']], 'nur die eine OCSP-Anfrage, kein Dokument');
  assert.ok(asks[0].data.length < 200, 'nur die kleine OCSP-Anfrage geht hinaus');
  assert.equal(r.ocsp, 1); assert.ok(r.certs >= 2);
  assert.equal(Buffer.from(r.bytes.subarray(0, s.length)).equals(Buffer.from(s)), true, 'Original bleibt Byte für Byte erhalten');
  const tail = Buffer.from(r.bytes.subarray(s.length)).toString('latin1');
  assert.match(tail, /\/DSS \d+ 0 R/); assert.match(tail, /\/OCSPs \[/); assert.match(tail, /\/Certs \[/);
  const doc = await PDFLib.PDFDocument.load(r.bytes); assert.ok(doc.catalog.lookup(PDFLib.PDFName.of('DSS')));
  const [v] = await Verify.verify(r.bytes);
  assert.equal(v.intact, true); assert.equal(v.valid, true);
});

test('OCSP fällt aus: Sperrliste aus dem Verteilpunkt', async () => {
  const s = await signed();
  const r = await Sign.addLtv(s, async q => { if (q.kind === 'crl') return Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x01]); throw new Error('aus'); });
  assert.equal(r.crl, 1); assert.equal(r.ocsp, 0);
});

test('Nichts erreichbar: Fehler, damit die App die Fassung mit Zeitstempel behält', async () => {
  await assert.rejects(Sign.addLtv(await signed(), async () => { throw new Error('offline'); }), /Keine Sperrauskunft/);
});

test('pdfmy Scan: Sperrauskunft nur an öffentliche Adressen, Standard-Ports, mit Weiterleitungsprüfung', () => {
  const fs = require('node:fs'), path = require('node:path');
  const cs = fs.readFileSync(path.join(__dirname, '..', 'tools', 'pdfmy-scan', 'Revocation.cs'), 'utf8');
  const pl = fs.readFileSync(path.join(__dirname, '..', 'tools', 'pdfmy-scan-mac', 'pdfmy-scan.pl'), 'utf8');
  for (const src of [cs, pl]) assert.match(src, /Adresse im eigenen Netz – aus Sicherheitsgründen nicht abgefragt/);
  assert.match(cs, /AllowAutoRedirect = false/); assert.match(cs, /for \(int hop = 0; hop < 4; hop\+\+\)/);
  assert.match(pl, /'--resolve', "\$host:\$port:\$pin"/, 'curl auf die geprüfte Adresse festgelegt');
  assert.match(pl, /'--proto', '=http,https'/);
});

test('Prüfung erkennt eingebettete Langzeitprüfdaten; App koppelt LTV an „mit Zeitstempel“', async () => {
  const s = await signed(), r = await Sign.addLtv(s, async q => { if (q.kind === 'ocsp') return ocspResp(); throw new Error('x'); });
  const [v] = await Verify.verify(r.bytes); assert.equal(v.ltv, true);
  const [w] = await Verify.verify(s); assert.equal(w.ltv, undefined);
  const fs = require('node:fs'), path = require('node:path'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  new (require('node:vm').Script)(src);
  assert.match(src, /if \(!so\.tsa \|\| !state\.scanRev \|\| so\.docTs\) return out;/);
  assert.match(src, /const l = await PdfSign\.addLtv\(out, revCall\), t = await PdfSign\.docTimestamp\(l\.bytes, so\.tsa\);/);
  assert.equal((src.match(/await withLtv\(await PdfSign\.signPdf\(/g) || []).length, 2, 'beide Signaturwege (Windows-Zertifikat und Datei)');
  assert.match(src, /toast\('Langzeitprüfdaten konnten nicht eingebettet werden – die Signatur ist mit Zeitstempel gültig\.'/);
});
