// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Linux-Pakete für alle Systeme (tools/linuxpkg.js, app-v250): .rpm so zerlegt und geprüft, wie rpm es beim Einlesen tut
// (Lead, Regionen, Ausrichtung, SHA-256/MD5/Größe, Inhalts-Prüfsumme, cpio gegen Dateiliste), Arch-Paket mit .PKGINFO und .INSTALL
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib'), crypto = require('crypto');
const { buildRpm, buildPacman } = require('../tools/linuxpkg.js');

function readHeader(buf, at, region) {
  assert.deepEqual([...buf.subarray(at, at + 8)], [0x8e, 0xad, 0xe8, 1, 0, 0, 0, 0], 'Kopf-Magie');
  const il = buf.readUInt32BE(at + 8), dl = buf.readUInt32BE(at + 12), ds = at + 16 + il * 16, tags = {};
  const W = { 3: 2, 4: 4 };
  for (let i = 0; i < il; i++) {
    const p = at + 16 + i * 16, tag = buf.readUInt32BE(p), type = buf.readUInt32BE(p + 4), off = buf.readInt32BE(p + 8), cnt = buf.readUInt32BE(p + 12);
    assert.ok(off >= 0 && off < dl, 'Versatz im Datenteil ' + tag);
    if (W[type]) assert.equal(off % W[type], 0, 'Ausrichtung ' + tag);
    const d = buf.subarray(ds + off, ds + dl);
    let v;
    if (type === 3) v = Array.from({ length: cnt }, (_, k) => d.readUInt16BE(k * 2));
    else if (type === 4) v = Array.from({ length: cnt }, (_, k) => d.readUInt32BE(k * 4));
    else if (type === 7) v = d.subarray(0, cnt);
    else { v = d.toString('utf8').split('\0').slice(0, cnt); assert.equal(v.length, cnt, 'Zeichenketten ' + tag); }
    tags[tag] = { type, v, off };
  }
  // Region: erster Eintrag, Abschluss am Ende verweist auf alle Einträge
  assert.equal(buf.readUInt32BE(at + 16), region, 'Region zuerst');
  const tr = ds + tags[region].off;
  assert.equal(buf.readUInt32BE(tr), region); assert.equal(buf.readInt32BE(tr + 8), -il * 16, 'Region umfasst alle Einträge');
  assert.equal(tags[region].off + 16, dl, 'Region-Abschluss am Ende');
  return { tags, end: ds + dl };
}

test('rpm: Aufbau wie von rpm gelesen, Prüfsummen stimmen, cpio passt zur Dateiliste', () => {
  const rpm = buildRpm({ name: 'pdfmy-scan', version: '1.2.3', summary: 'S', description: 'D', license: 'L', url: 'https://pdfmy.de', vendor: 'Mentor GmbH', packager: 'M',
    requires: ['/usr/bin/perl', 'perl(JSON::PP)'], recommends: ['sane-airscan'], scripts: { post: 'echo a\r\n', preun: '[ "$1" = 0 ] && echo b\n' },
    files: [{ path: '/opt/pdfmy-scan/pdfmy-scan.pl', data: 'print 1;\r\n', mode: 0o755 }, { path: '/usr/share/icons/x.png', data: Buffer.from([137, 80, 13, 10]) }],
    ownDirs: ['/opt/pdfmy-scan'] });
  assert.deepEqual([...rpm.subarray(0, 6)], [0xed, 0xab, 0xee, 0xdb, 3, 0], 'Lead');
  assert.equal(rpm.readUInt16BE(78), 5, 'Signaturtyp');
  const sig = readHeader(rpm, 96, 62);
  const hs = sig.end + (8 - (sig.end - 96) % 8) % 8;
  const { tags: h, end } = readHeader(rpm, hs, 63);
  const hdr = rpm.subarray(hs, end), zpay = rpm.subarray(end);
  assert.equal(sig.tags[273].v[0], crypto.createHash('sha256').update(hdr).digest('hex'), 'SHA-256 des Kopfs');
  assert.equal(sig.tags[269].v[0], crypto.createHash('sha1').update(hdr).digest('hex'), 'SHA-1 des Kopfs');
  assert.equal(sig.tags[1000].v[0], rpm.length - hs, 'Größe');
  assert.deepEqual(sig.tags[1004].v, crypto.createHash('md5').update(rpm.subarray(hs)).digest(), 'MD5');
  assert.equal(h[5092].v[0], crypto.createHash('sha256').update(zpay).digest('hex'), 'Inhalts-Prüfsumme');
  assert.equal(h[1000].v[0], 'pdfmy-scan'); assert.equal(h[1022].v[0], 'noarch'); assert.ok(h[1044], 'SOURCERPM: Binärpaket');
  assert.ok(h[1049].v.includes('perl(JSON::PP)') && h[1049].v.includes('rpmlib(FileDigests)'));
  assert.equal(h[1049].v.length, h[1048].v.length); assert.equal(h[1049].v.length, h[1050].v.length);
  assert.equal(h[1024].v[0], 'echo a\n', 'Skript ohne Windows-Zeilenenden'); assert.equal(h[1086].v[0], '/bin/sh');
  const pay = zlib.gunzipSync(zpay); assert.equal(pay.length, sig.tags[1007].v[0], 'unkomprimierte Größe');
  // cpio „newc“
  const names = h[1117].v.map((b, i) => h[1118].v[h[1116].v[i]] + b), n = names.length;
  for (const t of [1028, 1030, 1033, 1034, 1035, 1036, 1037, 1039, 1040, 1045, 1095, 1096, 1097]) assert.equal(h[t].v.length, n, 'gleich viele Einträge ' + t);
  let p = 0, k = 0;
  for (;;) {
    const s = pay.subarray(p, p + 110).toString(); assert.equal(s.slice(0, 6), '070701');
    const f = i => parseInt(s.slice(6 + i * 8, 14 + i * 8), 16), ns = f(11), size = f(6);
    const name = pay.subarray(p + 110, p + 110 + ns - 1).toString(); p += 110 + ns; p += (4 - p % 4) % 4;
    if (name === 'TRAILER!!!') break;
    assert.equal(name, '.' + names[k], 'Reihenfolge'); assert.equal(f(1), h[1030].v[k], 'Rechte'); assert.equal(size, h[1028].v[k]); assert.equal(f(0), h[1096].v[k], 'inode');
    const data = pay.subarray(p, p + size); p += size; p += (4 - p % 4) % 4;
    if (h[1035].v[k]) assert.equal(crypto.createHash('sha256').update(data).digest('hex'), h[1035].v[k], 'Datei-Prüfsumme ' + name);
    k++;
  }
  assert.equal(k, n, 'alle Dateien im Inhalt');
  assert.deepEqual(names, ['/opt/pdfmy-scan', '/opt/pdfmy-scan/pdfmy-scan.pl', '/usr/share/icons/x.png']);
  assert.equal(h[1030].v[0], 0o40755); assert.equal(h[1030].v[1], 0o100755);
  assert.deepEqual(buildRpm({ name: 'a', version: '1', summary: 's', description: 'd', license: 'l', url: 'u', vendor: 'v', packager: 'p', files: [{ path: '/a', data: 'x' }] }),
    buildRpm({ name: 'a', version: '1', summary: 's', description: 'd', license: 'l', url: 'u', vendor: 'v', packager: 'p', files: [{ path: '/a', data: 'x' }] }), 'reproduzierbar');
});

test('Arch: .PKGINFO zuerst, .INSTALL, Ordner und Dateien ohne „./“, root', () => {
  const pkg = zlib.gunzipSync(buildPacman({ name: 'pdfmy-scan', version: '1.2.3', desc: 'D', url: 'u', packager: 'p', license: 'l', depends: ['perl'], optdepends: ['sane: x'],
    install: 'post_install() { :; }\r\n', files: [{ path: '/opt/pdfmy-scan/a.pl', data: 'x', mode: 0o755 }] }));
  const list = []; let p = 0;
  while (p + 512 <= pkg.length && pkg[p]) {
    const s = (a, b) => pkg.subarray(p + a, p + b).toString().replace(/\0.*$/s, ''), size = parseInt(s(124, 136), 8);
    list.push({ name: s(0, 100), mode: parseInt(s(100, 108), 8), user: s(265, 297), data: pkg.subarray(p + 512, p + 512 + size).toString() });
    p += 512 + Math.ceil(size / 512) * 512;
  }
  assert.deepEqual(list.map(x => x.name), ['.PKGINFO', '.INSTALL', 'opt/', 'opt/pdfmy-scan/', 'opt/pdfmy-scan/a.pl']);
  assert.match(list[0].data, /^pkgname = pdfmy-scan$/m); assert.match(list[0].data, /^pkgver = 1\.2\.3-1$/m); assert.match(list[0].data, /^arch = any$/m);
  assert.match(list[0].data, /^depend = perl$/m); assert.match(list[0].data, /^optdepend = sane: x$/m); assert.match(list[0].data, /^size = 1$/m);
  assert.ok(!list[1].data.includes('\r')); assert.equal(list[4].mode, 0o755); assert.ok(list.every(x => x.user === 'root'));
});
