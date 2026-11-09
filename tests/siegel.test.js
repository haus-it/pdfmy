// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Abschluss versiegeln (app-v244): Dokumentzeitstempel (PAdES-DTS, ETSI.RFC3161) und angehängte PAdES-Signatur –
// die vorhandenen Bytes (frühere Fassungen der Unterschriftsanfrage) bleiben dabei unverändert.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js'), { makeP12 } = require('./pdfsign.test.js');
const forge = globalThis.forge, A = forge.asn1, T = A.Type, U = A.Class.UNIVERSAL;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');
const bin = u8 => Buffer.from(u8).toString('latin1');

// Zeitstempeldienst zum Testen (RFC 3161): beantwortet die Anfrage mit einem TimeStampToken über den gefragten Prüfwert
const tsaKeys = forge.pki.rsa.generateKeyPair(2048), tsaCert = forge.pki.createCertificate();
tsaCert.publicKey = tsaKeys.publicKey; tsaCert.serialNumber = '0c';
tsaCert.validity.notBefore = new Date(Date.now() - 864e5); tsaCert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
tsaCert.setSubject([{ name: 'commonName', value: 'Test-Zeitstempeldienst' }]); tsaCert.setIssuer([{ name: 'commonName', value: 'Test-Zeitstempeldienst' }]);
tsaCert.sign(tsaKeys.privateKey, forge.md.sha256.create());
let tsaCalls = 0;
async function fakeTsa(reqU8) {
  tsaCalls++;
  const q = A.fromDer(bin(reqU8)), mi = q.value[1], nonce = q.value[2];
  const g = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  const tst = A.create(U, T.SEQUENCE, true, [A.create(U, T.INTEGER, false, '\x01'), A.create(U, T.OID, false, A.oidToDer('1.2.3.4.1').getBytes()), mi,
    A.create(U, T.INTEGER, false, '\x2a'), A.create(U, T.GENERALIZEDTIME, false, g), nonce]);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(A.toDer(tst).getBytes());
  p7.addCertificate(tsaCert);
  p7.addSigner({ key: tsaKeys.privateKey, certificate: tsaCert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }] });
  p7.sign();
  const resp = A.create(U, T.SEQUENCE, true, [A.create(U, T.SEQUENCE, true, [A.create(U, T.INTEGER, false, '\x00')]), p7.toAsn1()]);
  return Buffer.from(A.toDer(resp).getBytes(), 'latin1');
}
async function pdf(text) { const d = await PDFLib.PDFDocument.create(); d.addPage([595, 842]).drawText(text, { x: 50, y: 780, size: 18 }); return d.save({ useObjectStreams: false }); }

test('Dokumentzeitstempel: angehängt, gültig, Zeitpunkt, Original unverändert enthalten', async () => {
  const orig = await pdf('Vertrag – alle haben unterschrieben');
  const { bytes, time } = await Sign.docTimestamp(orig, fakeTsa);
  assert.ok(time instanceof Date && Math.abs(time - Date.now()) < 120000);
  assert.deepEqual(bytes.subarray(0, orig.length), orig, 'die bisherigen Bytes müssen erhalten bleiben');
  const s = bin(bytes);
  assert.match(s, /\/Type \/DocTimeStamp/); assert.match(s, /\/SubFilter \/ETSI\.RFC3161/);
  const [r] = await Verify.verify(bytes);
  assert.equal(r.docTimestamp, true); assert.equal(r.intact, true); assert.equal(r.valid, true); assert.equal(r.wholeFile, true);
  assert.equal(r.signer.cn, 'Test-Zeitstempeldienst'); assert.ok(r.time instanceof Date);
  assert.deepEqual(r.problems, []);
});

test('Dokumentzeitstempel: Veränderung danach wird erkannt', async () => {
  const { bytes } = await Sign.docTimestamp(await pdf('Kaufvertrag 1.000 EUR'), fakeTsa);
  const bad = bytes.slice(), at = bin(bad).indexOf('1.000') >= 0 ? bin(bad).indexOf('MediaBox') : 20;
  bad[at] ^= 1;   // ein Byte im abgedeckten Bereich
  const [r] = await Verify.verify(bad);
  assert.equal(r.intact, false); assert.ok(r.problems.some(p => /verändert/.test(p)));
});

test('Dokumentzeitstempel: falscher Prüfwert vom Dienst wird abgelehnt', async () => {
  const evil = async req => { const q = A.fromDer(bin(req)); q.value[1].value[1].value = '\x00'.repeat(32); return fakeTsa(Buffer.from(A.toDer(q).getBytes(), 'latin1')); };
  await assert.rejects(Sign.docTimestamp(await pdf('X'), evil), /passt nicht/);
});

test('Versiegeln mit eigenem Zertifikat: append hängt an statt neu zu schreiben, mit Zeitstempel (B-T)', async () => {
  const orig = await pdf('Abschluss mit Zertifikat');
  const o = { reason: 'Abschluss versiegelt', append: true, tsa: fakeTsa };
  const out = await Sign.signPdf(orig, Sign.readP12(makeP12('pw'), 'pw'), o);
  assert.deepEqual(out.subarray(0, orig.length), orig);
  assert.ok(o.tsTime instanceof Date);
  const [r] = await Verify.verify(out);
  assert.equal(r.intact, true); assert.equal(r.valid, true); assert.equal(r.timestamp, true); assert.equal(r.reason, 'Abschluss versiegelt');
  assert.ok(!r.docTimestamp);
});

test('Signatur und danach Dokumentzeitstempel: beide gültig, die erste gilt als „danach weiter signiert“', async () => {
  const signed = await Sign.signPdf(await pdf('Zweistufig'), Sign.readP12(makeP12('pw'), 'pw'), { reason: 'Unterschrift' });
  const { bytes } = await Sign.docTimestamp(signed, fakeTsa);
  const [a, b] = await Verify.verify(bytes);
  assert.equal(a.intact && a.valid, true); assert.equal(a.laterSigned, true);
  assert.equal(b.docTimestamp, true); assert.equal(b.intact && b.valid && b.wholeFile, true);
  assert.ok(tsaCalls >= 3);
});
