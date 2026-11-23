// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stufe der Signatur nach eIDAS (app-v336): QES, qualifiziertes Siegel, fortgeschritten mit qualifiziertem Zertifikat, fortgeschritten –
// aus den QCStatements (ETSI EN 319 412-5), den Zertifikatsrichtlinien (EN 319 411-2) und der EU-Vertrauensliste.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js');
const forge = globalThis.forge, A = forge.asn1;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

const name = (cn, o) => [{ name: 'commonName', value: cn }, { name: 'organizationName', value: o }, { name: 'countryName', value: 'DE' }];
const oid = o => A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer(o).getBytes());
const seq = v => A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, v);
// QCStatements: compliance, sscd, type (esign/eseal) – je nach Wunsch
function qcExt({ compliance = true, sscd = true, type = null }) {
  const st = [];
  if (compliance) st.push(seq([oid('0.4.0.1862.1.1')]));
  if (sscd) st.push(seq([oid('0.4.0.1862.1.4')]));
  if (type) st.push(seq([oid('0.4.0.1862.1.6'), seq([oid({ esign: '0.4.0.1862.1.6.1', eseal: '0.4.0.1862.1.6.2', web: '0.4.0.1862.1.6.3' }[type])])]));
  return { id: '1.3.6.1.5.5.7.1.3', critical: false, value: A.toDer(seq(st)).getBytes() };
}
const polExt = p => ({ id: '2.5.29.32', critical: false, value: A.toDer(seq([seq([oid(p)])])).getBytes() });
const caKeys = forge.pki.rsa.generateKeyPair(2048), userKeys = forge.pki.rsa.generateKeyPair(2048);
function mkCert(subj, issuer, pub, key, serial, exts) {
  const c = forge.pki.createCertificate(); c.publicKey = pub; c.serialNumber = serial;
  c.validity.notBefore = new Date(Date.now() - 864e5 * 30); c.validity.notAfter = new Date(Date.now() + 864e5 * 365);
  c.setSubject(subj); c.setIssuer(issuer); if (exts) c.setExtensions(exts);
  c.sign(key, forge.md.sha256.create()); return c;
}
const caCert = mkCert(name('Test-qCA 2', 'Vertrauen GmbH'), name('Test-qCA 2', 'Vertrauen GmbH'), caKeys.publicKey, caKeys.privateKey, '01', [{ name: 'basicConstraints', cA: true }]);
const spki = Buffer.from(A.toDer(forge.pki.publicKeyToAsn1(caKeys.publicKey)).getBytes(), 'binary').toString('base64');
const list = (u = ['s', 'e'], st = 'g') => ({ stand: '2026-11-19', dienste: [{ c: 'DE', p: 'Vertrauen GmbH', n: 'QC', cn: 'Test-qCA 2', k: spki, st, from: '2016-07-01', to: null, u }] });

async function signedWith(exts, serial) {
  const cert = mkCert(name('Erika Muster', 'Mentor GmbH'), name('Test-qCA 2', 'Vertrauen GmbH'), userKeys.publicKey, caKeys.privateKey, serial, exts);
  const p12 = A.toDer(forge.pkcs12.toPkcs12Asn1(userKeys.privateKey, [cert, caCert], 'pw', { algorithm: '3des' })).getBytes();
  const doc = await PDFLib.PDFDocument.create(); doc.addPage([595, 842]);
  const [r] = await Verify.verify(await Sign.signPdf(await doc.save(), Sign.readP12(Uint8Array.from(p12, c => c.charCodeAt(0)), 'pw'), {}));
  return r;
}

test('QES: qualifiziertes Zertifikat + QSCD + Aussteller in der EU-Liste für Signaturen', async () => {
  const r = await signedWith([qcExt({ type: 'esign' })], '0a01');
  assert.deepEqual(r.qcs, { compliance: true, qscd: true, type: 'esign', policy: null });
  r.trust = await Verify.trust(r, list());
  assert.equal(Verify.level(r), 'qes');
  r.trust = await Verify.trust(r, list(['e']));   // Dienst nur für Siegel gelistet
  assert.equal(Verify.level(r), 'ades', 'Signatur über einen reinen Siegeldienst ist nicht qualifiziert');
  r.trust = await Verify.trust(r, list(['s'], 'w')); r.trust.atTime = false;
  assert.equal(Verify.level(r), 'ades', 'Dienst zum Signaturzeitpunkt nicht qualifiziert');
});

test('Ohne QSCD: fortgeschritten mit qualifiziertem Zertifikat; Siegel: qualifiziertes Siegel', async () => {
  const a = await signedWith([qcExt({ sscd: false })], '0a02'); a.trust = await Verify.trust(a, list());
  assert.equal(Verify.level(a), 'adesqc');
  const s = await signedWith([qcExt({ type: 'eseal' })], '0a03'); s.trust = await Verify.trust(s, list());
  assert.equal(Verify.level(s), 'qeseal');
  const w = await signedWith([qcExt({ type: 'web' })], '0a04'); w.trust = await Verify.trust(w, list(['s', 'e', 'w']));
  assert.equal(Verify.level(w), 'adesqc', 'Website-Zertifikat ergibt keine QES');
});

test('Zertifikatsrichtlinien statt QCStatements: QCP-n-qscd → QES, QCP-l → Siegel ohne QSCD', async () => {
  const n = await signedWith([polExt('0.4.0.194112.1.2')], '0a05');
  assert.deepEqual(n.qcs, { compliance: false, qscd: true, type: null, policy: 'n' });
  n.trust = await Verify.trust(n, list()); assert.equal(Verify.level(n), 'qes');
  const l = await signedWith([polExt('0.4.0.194112.1.1')], '0a06'); l.trust = await Verify.trust(l, list());
  assert.equal(Verify.level(l), 'adesqc');
});

test('Ohne Kennzeichen oder ohne Liste: fortgeschritten; ungültig: keine Stufe', async () => {
  const r = await signedWith(null, '0a07');
  assert.deepEqual(r.qcs, { compliance: false, qscd: false, type: null, policy: null });
  r.trust = await Verify.trust(r, list()); assert.equal(Verify.level(r), 'ades');
  const q = await signedWith([qcExt({ type: 'esign' })], '0a08'); q.trust = null;
  assert.equal(Verify.level(q), 'ades', 'ohne Liste nie „qualifiziert“');
  assert.equal(Verify.level({ ...q, valid: false }), null);
});

test('App: Stufe in Leiste und Details angezeigt', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(src, /PdfVerify\.level\(r\)/);
  assert.match(src, /Qualifizierte elektronische Signatur \(QES\)/);
});
