// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Vorhandene leere Signaturfelder (app-v322): Verträge und Behördenformulare bringen oft Felder „Hier signieren“ mit.
// PDFMy signiert wie Acrobat dort hinein (Stempel im Feldrechteck), die zweite Person ins zweite Feld; beide Signaturen gültig.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js');
const forge = globalThis.forge, PL = globalThis.PDFLib, N = PL.PDFName.of;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

function signer(cn) {
  const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '0d';
  cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: 'commonName', value: cn }]; cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'pw', { algorithm: '3des' })).getBytes();
  return Sign.readP12(Uint8Array.from(der, c => c.charCodeAt(0)), 'pw');
}
const look = name => ({ pageIndex: -1, at: [{ x: 0.6, y: 0.1 }], w: 196, h: 54, draw: (w, h) => `q 0 0.5 0 RG 0.4 0.4 ${w - 0.8} ${h - 0.8} re S Q`, alt: 'Digital signiert von ' + name });

// Vertrag mit zwei leeren Signaturfeldern auf Seite 2: „Auftraggeber“ als Feld mit Widget-Kind, „Auftragnehmer“ zusammengelegt
async function vertrag() {
  const doc = await PL.PDFDocument.create(), ctx = doc.context; doc.addPage([595, 842]); const p2 = doc.addPage([595, 842]);
  p2.drawText('Unterschriften', { x: 50, y: 300, size: 14 });
  const w1 = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', Rect: [50, 180, 260, 240], F: 4, P: p2.ref }));
  const f1 = ctx.register(ctx.obj({ FT: 'Sig', T: PL.PDFHexString.fromText('Auftraggeber'), Kids: [w1] }));
  ctx.lookup(w1).set(N('Parent'), f1);
  const f2 = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PL.PDFHexString.fromText('Auftragnehmer'), Rect: [320, 180, 545, 240], F: 4, P: p2.ref }));
  p2.node.set(N('Annots'), ctx.obj([w1, f2]));
  doc.catalog.set(N('AcroForm'), ctx.register(ctx.obj({ Fields: [f1, f2] })));
  return doc.save({ useObjectStreams: false });
}
const sigs = async bytes => {
  const doc = await PL.PDFDocument.load(bytes), ctx = doc.context, out = [];
  doc.getPages().forEach((pg, pi) => (pg.node.lookup(N('Annots'))?.asArray?.() || []).forEach(r => {
    const a = ctx.lookup(r), fd = a.get(N('T')) ? a : a.lookup(N('Parent'));
    if (String(fd.get(N('FT'))) !== '/Sig') return;
    out.push({ page: pi, name: fd.lookup(N('T')).decodeText(), signed: !!fd.get(N('V')), rect: a.lookup(N('Rect')).asArray().map(n => n.asNumber()), ap: !!a.lookup(N('AP')) });
  }));
  return { out, fields: doc.getForm().getFields().length };
};

test('Leere Signaturfelder: erste Person ins erste Feld, zweite ins zweite – kein zusätzliches Feld, beide gültig', async () => {
  const src = await vertrag();
  const o1 = { look: look('Erika Muster') }, a = await Sign.signPdf(src, signer('Erika Muster'), o1);
  assert.equal(o1.inField, 'Auftraggeber'); assert.equal(o1.lookShown, true);
  let s = await sigs(a);
  assert.equal(s.out.length, 2, 'kein neues Feld');
  assert.deepEqual(s.out.map(x => [x.name, x.signed, x.page]), [['Auftraggeber', true, 1], ['Auftragnehmer', false, 1]]);
  assert.deepEqual(s.out[0].rect, [50, 180, 260, 240], 'Stempel im vorgesehenen Feld'); assert.equal(s.out[0].ap, true);
  const o2 = { look: look('Max Beispiel') }, b = await Sign.signPdf(a, signer('Max Beispiel'), o2);
  assert.equal(o2.inField, 'Auftragnehmer');
  assert.equal(Buffer.compare(Buffer.from(b.subarray(0, a.length)), Buffer.from(a)), 0, 'angehängt');
  s = await sigs(b);
  assert.equal(s.out.length, 2); assert.ok(s.out.every(x => x.signed));
  const rs = await Verify.verify(b);
  assert.deepEqual(rs.map(r => r.signer.cn), ['Erika Muster', 'Max Beispiel']);
  for (const r of rs) { assert.equal(r.intact, true); assert.equal(r.valid, true); }
  // dritte Person: alle Felder belegt → eigenes Feld wie bisher
  const o3 = { look: look('Dritte') }, c = await Sign.signPdf(b, signer('Dritte Person'), o3);
  assert.equal(o3.inField, undefined); assert.equal((await sigs(c)).out.length, 3);
});

test('Ohne Stempel bzw. zu kleines Feld: trotzdem ins Feld signieren, Feld druckbar und gesperrt', async () => {
  const doc = await PL.PDFDocument.create(), ctx = doc.context, p = doc.addPage([595, 842]);
  const f = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PL.PDFHexString.fromText('Sig1'), Rect: [50, 50, 90, 60], F: 2, P: p.ref }));
  p.node.set(N('Annots'), ctx.obj([f])); doc.catalog.set(N('AcroForm'), ctx.register(ctx.obj({ Fields: [f] })));
  const o = { look: look('Erika') }, out = await Sign.signPdf(await doc.save(), signer('Erika'), o);
  assert.equal(o.inField, 'Sig1'); assert.equal(o.lookShown, undefined, 'zu klein für den Stempel');
  const d2 = await PL.PDFDocument.load(out), w = d2.context.lookup(d2.getPages()[0].node.lookup(N('Annots')).get(0));
  assert.equal(w.lookup(N('F')).asNumber(), 132); assert.ok(w.get(N('V')));
  assert.equal((await Verify.verify(out))[0].intact, true);
  const oo = { useField: false }, own = await Sign.signPdf(await doc.save(), signer('Erika'), oo);
  assert.equal(oo.inField, undefined);
});
