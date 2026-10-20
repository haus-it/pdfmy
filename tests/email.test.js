// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/email.js');

const enc = s => new TextEncoder().encode(s);
const u16 = s => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 255; b[i * 2 + 1] = s.charCodeAt(i) >> 8; } return b; };
const fakePdf = n => { const b = new Uint8Array(n); b.set(enc('%PDF-1.7\n')); for (let i = 9; i < n; i++) b[i] = (i * 31) & 255; return b; };

test('.eml: Anhänge (base64, RFC 2231/2047-Namen), Betreff, weitergeleitete E-Mail', () => {
  const pdf = Buffer.from(fakePdf(3000)).toString('base64').replace(/.{76}/g, '$&\r\n');
  const inner = ['From: a@b.de', 'Subject: innen', 'Content-Type: multipart/mixed; boundary="IN"', '', '--IN', 'Content-Type: text/plain', '', 'x', '--IN',
    'Content-Type: application/pdf; name="Mahnung.pdf"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="Mahnung.pdf"', '', pdf, '--IN--'].join('\r\n');
  const eml = ['From: =?utf-8?Q?Stadtwerke_M=C3=BCnster?= <info@sw.de>', 'Subject: =?utf-8?B?UmVjaG51bmcgU2VwdGVtYmVy?=', 'Date: Tue, 07 Oct 2026 10:00:00 +0200',
    'Content-Type: multipart/mixed;', '\tboundary="XYZ"', '', '--XYZ', 'Content-Type: multipart/alternative; boundary="ALT"', '', '--ALT', 'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable', '', 'Sehr geehrte Damen und Herren, anbei die Rechnung f=C3=BCr September.', '--ALT', 'Content-Type: text/html', '', '<p>html</p>', '--ALT--',
    '--XYZ', 'Content-Type: application/pdf', 'Content-Transfer-Encoding: base64', "Content-Disposition: attachment; filename*=utf-8''Rechnung%20M%C3%A4rz.pdf", '', pdf,
    '--XYZ', 'Content-Type: image/png; name="logo.png"', 'Content-Transfer-Encoding: base64', '', 'iVBORw0KGgo=',
    '--XYZ', 'Content-Type: message/rfc822', '', inner, '--XYZ--', ''].join('\r\n');
  const m = E.parseMail(enc(eml));
  assert.equal(m.kind, 'eml');
  assert.equal(m.subject, 'Rechnung September');
  assert.equal(m.from, 'Stadtwerke Münster <info@sw.de>');
  assert.match(m.body, /Rechnung für September/);
  assert.deepEqual(m.files.map(f => f.name), ['Rechnung März.pdf', 'Mahnung.pdf']);   // kleines Logo fällt weg
  assert.equal(m.files[0].data.length, 3000);
  assert.equal(new TextDecoder().decode(m.files[0].data.subarray(0, 8)), '%PDF-1.7');
  assert.equal(m.files[0].type, 'application/pdf');
});

/* Minimale OLE-Verbunddatei (CFB v3) mit Mini-Stream – wie Outlook sie für .msg schreibt */
function makeCfb(rootNode) {
  const E = [], END = 0xFFFFFFFE, FREE = 0xFFFFFFFF, NONE = 0xFFFFFFFF;
  (function add(node, type) {
    const e = { name: node.name, type, data: node.data || null, left: NONE, right: NONE, child: NONE, start: END, size: 0 }; E.push(e); const me = E.length - 1;
    if (node.children) { const ids = node.children.map(c => add(c, c.children ? 1 : 2)); ids.forEach((id, i) => { if (i < ids.length - 1) E[id].right = ids[i + 1]; }); if (ids.length) e.child = ids[0]; }
    return me;
  })(rootNode, 5);
  const mini = [], miniFat = [], big = [];
  for (const e of E) if (e.type === 2) {
    e.size = e.data.length;
    if (e.size < 4096) { const n = Math.ceil(e.size / 64), s = mini.length; for (let i = 0; i < n; i++) { const blk = new Uint8Array(64); blk.set(e.data.subarray(i * 64, i * 64 + 64)); mini.push(blk); miniFat.push(i < n - 1 ? s + i + 1 : END); } e.start = n ? s : END; }
    else big.push(e);
  }
  const ceil = (a, b) => Math.ceil(a / b);
  const dirS = ceil(E.length * 128, 512), mfS = ceil(miniFat.length * 4, 512), msS = ceil(mini.length * 64, 512), bigS = big.map(e => ceil(e.size, 512));
  const dataS = dirS + mfS + msS + bigS.reduce((a, b) => a + b, 0);
  let nFat = 1; while (nFat * 128 < nFat + dataS) nFat++;
  const total = nFat + dataS, fat = new Array(nFat * 128).fill(FREE), buf = new Uint8Array(512 * (total + 1)), dv = new DataView(buf.buffer);
  for (let i = 0; i < nFat; i++) fat[i] = 0xFFFFFFFD;
  let next = nFat; const alloc = n => { const s = next; for (let i = 0; i < n; i++) fat[s + i] = i < n - 1 ? s + i + 1 : END; next += n; return n ? s : END; };
  const dirStart = alloc(dirS), mfStart = alloc(mfS), msStart = alloc(msS);
  big.forEach((e, i) => { e.start = alloc(bigS[i]); buf.set(e.data, 512 * (e.start + 1)); });
  E[0].start = mini.length ? msStart : END; E[0].size = mini.length * 64;
  mini.forEach((b, i) => buf.set(b, 512 * (msStart + 1) + i * 64));
  miniFat.forEach((v, i) => dv.setUint32(512 * (mfStart + 1) + i * 4, v, true));
  for (let i = miniFat.length; i < mfS * 128; i++) dv.setUint32(512 * (mfStart + 1) + i * 4, FREE, true);
  E.forEach((e, i) => {
    const o = 512 * (dirStart + 1) + i * 128;
    for (let k = 0; k < e.name.length; k++) dv.setUint16(o + k * 2, e.name.charCodeAt(k), true);
    dv.setUint16(o + 64, (e.name.length + 1) * 2, true); buf[o + 66] = e.type; buf[o + 67] = 1;
    dv.setUint32(o + 68, e.left, true); dv.setUint32(o + 72, e.right, true); dv.setUint32(o + 76, e.child, true);
    dv.setUint32(o + 116, e.start, true); dv.setUint32(o + 120, e.size, true);
  });
  fat.forEach((v, i) => dv.setUint32(512 * (Math.floor(i / 128) + 1) + (i % 128) * 4, v, true));
  dv.setUint32(0, 0xE011CFD0, true); dv.setUint32(4, 0xE11AB1A1, true);
  dv.setUint16(24, 0x3E, true); dv.setUint16(26, 3, true); dv.setUint16(28, 0xFFFE, true); dv.setUint16(30, 9, true); dv.setUint16(32, 6, true);
  dv.setUint32(44, nFat, true); dv.setUint32(48, dirStart, true); dv.setUint32(56, 4096, true);
  dv.setUint32(60, miniFat.length ? mfStart : END, true); dv.setUint32(64, mfS, true); dv.setUint32(68, END, true); dv.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i < nFat ? i : FREE, true);
  return buf;
}
const sub = (id, data) => ({ name: '__substg1.0_' + id, data });
const xml = enc('<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"/>');

test('.msg (Outlook): Betreff, Absender, große und kleine Anhänge (Mini-Stream), eingebettete E-Mail', () => {
  const msg = makeCfb({ name: 'Root Entry', children: [
    sub('0037001F', u16('Ihre Rechnung 2026-48213')),
    sub('0C1A001F', u16('Stadtwerke Musterstadt')),
    sub('5D01001F', u16('rechnung@stadtwerke.example')),
    sub('1000001F', u16('Guten Tag, anbei Ihre Rechnung.')),
    { name: '__attach_version1.0_#00000000', children: [sub('3707001F', u16('Rechnung_2026-48213.pdf')), sub('37010102', fakePdf(9000))] },
    { name: '__attach_version1.0_#00000001', children: [sub('3707001F', u16('factur-x.xml')), sub('37010102', xml)] },
    { name: '__attach_version1.0_#00000002', children: [sub('3707001F', u16('image001.png')), sub('37010102', new Uint8Array(900))] },
    { name: '__attach_version1.0_#00000003', children: [{ name: '__substg1.0_3701000D', children: [
      sub('0037001F', u16('WG: Mahnung')),
      { name: '__attach_version1.0_#00000000', children: [sub('3704001F', u16('MAHNUNG.PDF')), sub('37010102', fakePdf(2000))] },
    ] }] },
  ] });
  const m = E.parseMail(msg);
  assert.equal(m.kind, 'msg');
  assert.equal(m.subject, 'Ihre Rechnung 2026-48213');
  assert.equal(m.from, 'Stadtwerke Musterstadt rechnung@stadtwerke.example');
  assert.match(m.body, /anbei Ihre Rechnung/);
  assert.deepEqual(m.files.map(f => f.name), ['Rechnung_2026-48213.pdf', 'factur-x.xml', 'MAHNUNG.PDF']);
  assert.equal(m.files[0].data.length, 9000);
  assert.equal(new TextDecoder().decode(m.files[0].data.subarray(0, 8)), '%PDF-1.7');
  assert.equal(m.files[2].data.length, 2000);
  assert.deepEqual([...m.files[1].data], [...xml]);
});

test('Keine E-Mail → verständlicher Fehler', () => {
  const bad = new Uint8Array(600); bad[0] = 0xD0; bad[1] = 0xCF;
  assert.throws(() => E.parseMail(bad), /keine Outlook-Nachricht/);
});
