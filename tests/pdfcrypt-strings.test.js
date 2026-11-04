// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Verschlüsselte PDF (RC4, 128 Bit, leeres Öffnen-Passwort) mit Literal-Strings voller Escape-Folgen (\311 …):
   pdf-lib-crypt muss die Escapes vor dem Entschlüsseln auflösen – sonst werden z. B. CIDSystemInfo-Angaben zu Datenmüll
   und pdf.js zeichnet die Schrift als Kästchen (Fehlerbericht 03.11.2026, Rechnung als PDF eines Warenwirtschaftsprogramms). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const C = require('../vendor/pdf-lib-crypt.min.js');

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const md5 = (...b) => crypto.createHash('md5').update(Buffer.concat(b)).digest();
function rc4(key, data) {
  const S = [...Array(256).keys()]; let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = Buffer.alloc(data.length); let i = 0; j = 0;
  for (let k = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]]; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return out;
}
// Literal-String mit oktalen Escapes für alle Bytes außerhalb von Buchstaben und Ziffern
const lit = b => '(' + [...b].map(c => /[A-Za-z0-9]/.test(String.fromCharCode(c)) ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0')).join('') + ')';

function encryptedPdf(title, hex) {
  const id = Buffer.from('ADEDEA5E9F4FD21CC854AC325F9E0C2D', 'hex'), P = -1324;
  let ok = rc4(md5(PAD).subarray(0, 16), PAD); for (let i = 0; i < 50; i++) ok = md5(ok); // Algorithmus 3, Besitzer = Benutzer = leer
  let o = rc4(ok, PAD); for (let i = 1; i < 20; i++) o = rc4(Buffer.from(ok.map(c => c ^ i)), o);
  const pb = Buffer.alloc(4); pb.writeInt32LE(P);
  let key = md5(PAD, o, pb, id); for (let i = 0; i < 50; i++) key = md5(key);
  let u = rc4(key, md5(PAD, id)); for (let i = 1; i < 20; i++) u = rc4(Buffer.from(key.map(c => c ^ i)), u);
  u = Buffer.concat([u, Buffer.alloc(16)]);
  const objKey = n => md5(key, Buffer.from([n & 255, (n >> 8) & 255, 0, 0, 0])).subarray(0, 16);
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    `<< /Title ${(enc => hex ? `<${enc.toString('hex')}>` : lit(enc))(rc4(objKey(4), Buffer.from(title, 'latin1')))} >>`,
    `<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${P} /O <${o.toString('hex')}> /U <${u.toString('hex')}> >>`];
  let s = '%PDF-1.4\n'; const off = [];
  objs.forEach((x, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${x}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 4 0 R /Encrypt 5 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

test('pdf-lib-crypt: Literal-Strings mit Escapes werden richtig entschlüsselt', async () => {
  const doc = await C.PDFDocument.load(encryptedPdf('Adobe-Identity (Test)'), { ignoreEncryption: true, password: '', updateMetadata: false });
  assert.equal(doc.getTitle(), 'Adobe-Identity (Test)');
});

test('pdf-lib-crypt: Hex-Strings werden richtig entschlüsselt', async () => {
  const doc = await C.PDFDocument.load(encryptedPdf('Adobe-Identity (Test)', true), { ignoreEncryption: true, password: '', updateMetadata: false });
  assert.equal(doc.getTitle(), 'Adobe-Identity (Test)');
});
