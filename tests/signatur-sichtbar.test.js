// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sichtbarer Signaturstempel „Digital signiert von …“: jeder Empfänger soll in jedem PDF-Programm sehen, wer signiert hat –
// auch wer mitunterzeichnet hat. Frühere Signaturen bleiben gültig, getaggte PDFs (PDF/UA) bleiben vollständig getaggt.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.forge = require('../vendor/forge.min.js');
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
const Sign = require('../js/pdfsign.js'), Verify = require('../js/pdfverify.js');
const forge = globalThis.forge, PL = globalThis.PDFLib, N = PL.PDFName.of;
forge.random.seedFileSync = n => crypto.randomBytes(n).toString('latin1');

function signer(cn) {
  const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '0c';
  cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: 'commonName', value: cn }]; cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'pw', { algorithm: '3des' })).getBytes();
  return Sign.readP12(Uint8Array.from(der, c => c.charCodeAt(0)), 'pw');
}
const look = name => ({ pageIndex: -1, at: [{ x: 0.6, y: 0.8 }, { x: 0.1, y: 0.8 }, { x: 0.1, y: 0.6 }], w: 196, h: 54,
  draw: (w, h) => `q 0 0.5 0 RG 0.4 0.4 ${w - 0.8} ${h - 0.8} re S Q`, alt: 'Digital signiert von ' + name });

// Getaggte PDF wie aus „PDF barrierefrei machen“: StructTreeRoot → Document → P, flacher ParentTree
async function taggedPdf() {
  const doc = await PL.PDFDocument.create(), ctx = doc.context, page = doc.addPage([595, 842]);
  page.drawText('Vertrag', { x: 50, y: 780, size: 20 }); doc.addPage([595, 842]);
  const rootRef = ctx.nextRef(), docRef = ctx.nextRef();
  const p = ctx.register(ctx.obj({ Type: 'StructElem', S: 'P', P: docRef, Pg: page.ref, K: 0 }));
  ctx.assign(docRef, ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: [p] }));
  ctx.assign(rootRef, ctx.obj({ Type: 'StructTreeRoot', K: docRef, ParentTree: ctx.obj({ Nums: [0, ctx.obj([p])] }), ParentTreeNextKey: 1 }));
  doc.catalog.set(N('StructTreeRoot'), rootRef); doc.catalog.set(N('MarkInfo'), ctx.obj({ Marked: true }));
  page.node.set(N('StructParents'), PL.PDFNumber.of(0));
  return doc.save();
}
const widgets = async bytes => {
  const doc = await PL.PDFDocument.load(bytes), ctx = doc.context, out = [];
  doc.getPages().forEach((pg, pi) => (pg.node.lookup(N('Annots'))?.asArray?.() || []).forEach(r => {
    const a = ctx.lookup(r); if (String(a.get(N('FT'))) !== '/Sig') return;
    out.push({ page: pi, rect: a.lookup(N('Rect')).asArray().map(n => n.asNumber()), ap: !!a.lookup(N('AP')), sp: a.lookup(N('StructParent'))?.asNumber?.(), tu: a.lookup(N('TU'))?.decodeText?.() });
  }));
  return { doc, out };
};

test('Signaturstempel: sichtbar auf der letzten Seite, zweite Person daneben, beide Signaturen gültig', async () => {
  const src = await PL.PDFDocument.create(); src.addPage([595, 842]); src.addPage([595, 842]).drawText('Seite 2', { x: 50, y: 780, size: 12 });
  const o1 = { reason: 'Freigabe', look: look('Erika Muster') };
  const first = await Sign.signPdf(await src.save(), signer('Erika Muster'), o1);
  assert.equal(o1.lookShown, true);
  const o2 = { look: look('Max Beispiel') };
  const second = await Sign.signPdf(first, signer('Max Beispiel'), o2);
  assert.equal(o2.lookShown, true);
  assert.equal(Buffer.compare(Buffer.from(second.subarray(0, first.length)), Buffer.from(first)), 0, 'angehängt, nicht neu geschrieben');
  const rs = await Verify.verify(second);
  assert.deepEqual(rs.map(r => r.signer.cn), ['Erika Muster', 'Max Beispiel']);
  for (const r of rs) { assert.equal(r.intact, true); assert.equal(r.valid, true); assert.deepEqual(r.problems, []); }
  const { out } = await widgets(second);
  assert.equal(out.length, 2);
  assert.ok(out.every(w => w.page === 1 && w.ap), 'beide auf der letzten Seite, mit Erscheinungsbild');
  const [a, b] = out.map(w => w.rect);
  assert.equal(Math.round(a[2] - a[0]), 196); assert.equal(Math.round(a[3] - a[1]), 54);
  assert.ok(b[2] <= a[0] || b[0] >= a[2] || b[3] <= a[1] || b[1] >= a[3], 'zweiter Stempel überdeckt den ersten nicht');
  assert.equal(out[1].tu, 'Digital signiert von Max Beispiel', 'Text für Screenreader');
});

test('Signaturstempel: ohne freien Platz oder ohne Wunsch bleibt die Signatur unsichtbar', async () => {
  const src = await PL.PDFDocument.create(); src.addPage([595, 842]);
  const o = { look: { ...look('X'), at: [{ x: 0.9, y: 0.9 }] } };   // ragt über den Rand
  const s = await Sign.signPdf(await src.save(), signer('X'), o);
  assert.ok(!o.lookShown);
  const { out } = await widgets(s); assert.deepEqual(out[0].rect, [0, 0, 0, 0]); assert.equal(out[0].ap, false);
  const { out: o2 } = await widgets(await Sign.signPdf(await src.save(), signer('Y'), {}));
  assert.deepEqual(o2[0].rect, [0, 0, 0, 0]);
});

test('Signaturstempel in getaggter PDF (PDF/UA): Feld bekommt Strukturelement „Form“ – auch beim Mitunterzeichnen', async () => {
  const first = await Sign.signPdf(await taggedPdf(), signer('Erika Muster'), { look: look('Erika Muster') });
  const second = await Sign.signPdf(first, signer('Max Beispiel'), { look: look('Max Beispiel') });
  for (const r of await Verify.verify(second)) { assert.equal(r.intact, true); assert.equal(r.valid, true); }
  const { doc, out } = await widgets(second), ctx = doc.context;
  assert.deepEqual(out.map(w => w.sp), [1, 2], 'StructParent je Feld');
  const root = doc.catalog.lookup(N('StructTreeRoot')), nums = root.lookup(N('ParentTree')).lookup(N('Nums')).asArray();
  assert.equal(root.lookup(N('ParentTreeNextKey')).asNumber(), 3);
  for (const key of [1, 2]) {
    const i = nums.findIndex((n, k) => k % 2 === 0 && n.asNumber() === key), el = ctx.lookup(nums[i + 1]);
    assert.equal(String(el.get(N('S'))), '/Form');
    assert.equal(String(el.lookup(N('K')).get(N('Type'))), '/OBJR');
  }
  const docEl = root.lookup(N('K')), kids = docEl.lookup(N('K')).asArray().map(r => String(ctx.lookup(r).get(N('S'))));
  assert.deepEqual(kids, ['/P', '/Form', '/Form'], 'im Element Document eingehängt');
});

test('Stempel anklickbar: Lage auf der Seite und Zuordnung zur Signatur über den Bytebereich, auch gedreht', async () => {
  const src = await PL.PDFDocument.create(); src.addPage([595, 842]);
  const first = await Sign.signPdf(await src.save(), signer('Erika Muster'), { look: look('Erika Muster') });
  const second = await Sign.signPdf(first, signer('Max Beispiel'), { look: look('Max Beispiel') });
  const rs = await Verify.verify(second), fs0 = await Verify.fields(PL, second);
  assert.equal(fs0.length, 2);
  const who = fs0.map(f => rs.find(r => Verify.sameRange(r.range, f.range))?.signer.cn);
  assert.deepEqual(who, ['Erika Muster', 'Max Beispiel'], 'jeder Stempel gehört zu seiner Signatur');
  const e = fs0[0];   // erster Wunschplatz: x 0.6, y 0.8 (oben links des Stempels)
  assert.ok(Math.abs(e.x - 0.6) < 0.01 && Math.abs(e.y - 0.8) < 0.01, JSON.stringify(e));
  assert.ok(Math.abs(e.w - 196 / 595) < 0.01 && Math.abs(e.h - 54 / 842) < 0.01);
  // Ansicht um 90° im Uhrzeigersinn gedreht: links oben wandert nach rechts oben
  const [r90] = await Verify.fields(PL, second, () => 90);
  assert.ok(Math.abs(r90.x - (1 - e.y - e.h)) < 1e-9 && Math.abs(r90.y - e.x) < 1e-9 && Math.abs(r90.w - e.h) < 1e-9);
  const [r180] = await Verify.fields(PL, second, () => 180);
  assert.ok(Math.abs(r180.x - (1 - e.x - e.w)) < 1e-9 && Math.abs(r180.y - (1 - e.y - e.h)) < 1e-9);
  // unsichtbare Signatur: kein Stempel
  assert.deepEqual(await Verify.fields(PL, await Sign.signPdf(await src.save(), signer('Y'), {})), []);
});

test('PDFMy: Stempel im Speichern-Dialog an, Leiste nennt alle Unterzeichner', () => {
  const pro = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<input id="x-sign-vis" type="checkbox" checked>/);
  assert.equal((pro.match(/if \(\$\('#x-sign-vis'\)\.checked\) so\.look = await sigLook\(/g) || []).length, 2, 'Datei-Zertifikat und Windows/Signaturkarte');
  assert.match(pro, /\$\{all\.length\} Signaturen, alle gültig: \$\{sigNames\(all\)\}/);
});
