// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Linux-Pakete für Fedora/openSUSE/RHEL (.rpm) und Arch/Manjaro (.pkg.tar.gz) ohne fremde Werkzeuge – auch unter Windows.
   .rpm nach dem RPM-v4-Format (rpm.org „File format“): Lead (96 Byte), Signatur-Kopf (Region 62, SHA-1/SHA-256/MD5/Größe),
   Haupt-Kopf (Region 63) und cpio-Inhalt („newc“, gzip). .pkg.tar.gz nach alpm/makepkg: tar mit .PKGINFO, .INSTALL und Dateien.
   Feste Zeitstempel: gleiche Eingabe → gleiche Datei. */
'use strict';
const crypto = require('crypto');
const { tarHeader, gz, MTIME } = require('./deb.js');
const T = { INT16: 3, INT32: 4, STRING: 6, BIN: 7, ARRAY: 8, I18N: 9 };
const ALIGN = { 3: 2, 4: 4 };
const lf = d => Buffer.isBuffer(d) ? d : Buffer.from(String(d).replace(/\r\n/g, '\n'), 'utf8');

/* Kopfstruktur: entries [[tag, typ, wert]] → Buffer. Region-Eintrag (61–63) zuerst, sein Abschluss am Ende des Datenteils. */
function header(region, entries) {
  entries = entries.slice().sort((a, b) => a[0] - b[0]);
  const idx = [], store = [];
  let len = 0;
  const put = b => { store.push(b); len += b.length; };
  for (const [tag, type, val] of entries) {
    const a = ALIGN[type] || 1;
    if (len % a) put(Buffer.alloc(a - len % a));
    let data, count;
    if (type === T.INT16 || type === T.INT32) {
      const v = [].concat(val), w = type === T.INT16 ? 2 : 4; data = Buffer.alloc(v.length * w); count = v.length;
      v.forEach((n, i) => w === 2 ? data.writeUInt16BE(n & 0xffff, i * 2) : data.writeUInt32BE(n >>> 0, i * 4));
    } else if (type === T.STRING) { data = Buffer.from(val + '\0', 'utf8'); count = 1; }
    else if (type === T.BIN) { data = val; count = val.length; }
    else { const v = [].concat(val); data = Buffer.from(v.map(s => s + '\0').join(''), 'utf8'); count = v.length; }
    idx.push([tag, type, len, count]); put(data);
  }
  const il = idx.length + 1, trailer = Buffer.alloc(16);
  trailer.writeUInt32BE(region, 0); trailer.writeUInt32BE(T.BIN, 4); trailer.writeInt32BE(-il * 16, 8); trailer.writeUInt32BE(16, 12);
  idx.unshift([region, T.BIN, len, 16]); put(trailer);
  const head = Buffer.alloc(16 + il * 16);
  Buffer.from([0x8e, 0xad, 0xe8, 0x01, 0, 0, 0, 0]).copy(head, 0);
  head.writeUInt32BE(il, 8); head.writeUInt32BE(len, 12);
  idx.forEach(([t, ty, o, c], i) => { const p = 16 + i * 16; head.writeUInt32BE(t, p); head.writeUInt32BE(ty, p + 4); head.writeUInt32BE(o, p + 8); head.writeUInt32BE(c, p + 12); });
  return Buffer.concat([head, ...store]);
}

/* Alle Einträge (Ordner werden nur für die eigenen Pfade angelegt, die gemeinsamen wie /usr gehören dem System). */
function entries(files, ownDirs) {
  const out = ownDirs.map(d => ({ path: d, dir: true, mode: 0o40755, data: Buffer.alloc(0) }));
  for (const f of files) out.push({ path: f.path, mode: 0o100000 | (f.mode || 0o644), data: lf(f.data) });
  return out.sort((a, b) => a.path < b.path ? -1 : 1);
}
function cpio(list) {
  const parts = []; let n = 0;
  const rec = (name, mode, data, ino, nlink) => {
    const nm = Buffer.from(name + '\0', 'utf8');
    const h = '070701' + [ino, mode, 0, 0, nlink, MTIME, data.length, 0, 0, 0, 0, nm.length, 0].map(x => x.toString(16).padStart(8, '0')).join('');
    const b = Buffer.concat([Buffer.from(h), nm]); parts.push(b, Buffer.alloc((4 - b.length % 4) % 4), data, Buffer.alloc((4 - data.length % 4) % 4));
  };
  list.forEach((e, i) => rec('.' + e.path, e.mode, e.data, i + 1, e.dir ? 2 : 1));
  rec('TRAILER!!!', 0, Buffer.alloc(0), 0, 1);
  for (const p of parts) n += p.length;
  const all = Buffer.concat(parts);
  return Buffer.concat([all, Buffer.alloc((512 - n % 512) % 512)]);
}
/* Abhängigkeiten: [name, version?, flags?] – RPMSENSE: LESS 2, GREATER 4, EQUAL 8, RPMLIB 0x1000000 */
function buildRpm({ name, version, release = '1', summary, description, license, url, vendor, packager, group = 'Applications/Productivity',
  requires = [], recommends = [], scripts = {}, files, ownDirs = [] }) {
  const list = entries(files, ownDirs);
  const payload = cpio(list), zpay = gz(payload);
  const dirs = [], dirIdx = [], base = [];
  for (const e of list) { const i = e.path.lastIndexOf('/'), d = e.path.slice(0, i + 1); let k = dirs.indexOf(d); if (k < 0) { k = dirs.length; dirs.push(d); } dirIdx.push(k); base.push(e.path.slice(i + 1)); }
  const evr = `${version}-${release}`;
  const req = [['rpmlib(CompressedFileNames)', '3.0.4-1', 0x1000000 | 10], ['rpmlib(FileDigests)', '4.6.0-1', 0x1000000 | 10],
    ['rpmlib(PayloadFilesHavePrefix)', '4.0-1', 0x1000000 | 10], ['/bin/sh', '', 0], ...requires.map(r => [].concat(r))];
  const tags = [
    [100, T.ARRAY, ['C']], [1000, T.STRING, name], [1001, T.STRING, version], [1002, T.STRING, release],
    [1004, T.I18N, [summary]], [1005, T.I18N, [description]], [1006, T.INT32, MTIME], [1007, T.STRING, 'pdfmy.de'],
    [1009, T.INT32, list.reduce((s, e) => s + e.data.length, 0)], [1011, T.STRING, vendor], [1014, T.STRING, license],
    [1015, T.STRING, packager], [1016, T.I18N, [group]], [1020, T.STRING, url], [1021, T.STRING, 'linux'], [1022, T.STRING, 'noarch'],
    [1028, T.INT32, list.map(e => e.data.length)], [1030, T.INT16, list.map(e => e.mode)], [1033, T.INT16, list.map(() => 0)],
    [1034, T.INT32, list.map(() => MTIME)], [1035, T.ARRAY, list.map(e => e.dir ? '' : crypto.createHash('sha256').update(e.data).digest('hex'))],
    [1036, T.ARRAY, list.map(() => '')], [1037, T.INT32, list.map(() => 0)], [1039, T.ARRAY, list.map(() => 'root')],
    [1040, T.ARRAY, list.map(() => 'root')], [1044, T.STRING, `${name}-${evr}.src.rpm`], [1045, T.INT32, list.map(() => 0xffffffff)],
    [1047, T.ARRAY, [name]], [1048, T.INT32, req.map(r => r[2] || 0)], [1049, T.ARRAY, req.map(r => r[0])], [1050, T.ARRAY, req.map(r => r[1] || '')],
    [1064, T.STRING, '4.18.0'], [1095, T.INT32, list.map(() => 1)], [1096, T.INT32, list.map((e, i) => i + 1)], [1097, T.ARRAY, list.map(() => '')],
    [1112, T.INT32, [8]], [1113, T.ARRAY, [evr]], [1116, T.INT32, dirIdx], [1117, T.ARRAY, base], [1118, T.ARRAY, dirs],
    [1124, T.STRING, 'cpio'], [1125, T.STRING, 'gzip'], [1126, T.STRING, '9'], [1132, T.STRING, 'noarch-redhat-linux-gnu'],
    [5011, T.INT32, 8], [5092, T.ARRAY, [crypto.createHash('sha256').update(zpay).digest('hex')]], [5093, T.INT32, 8],
  ];
  if (recommends.length) tags.push([5046, T.ARRAY, recommends], [5047, T.ARRAY, recommends.map(() => '')], [5048, T.INT32, recommends.map(() => 0)]);
  // Skripte: %post 1024, %preun 1025, %postun 1026 mit Interpreter 1086–1088
  for (const [k, tag, prog] of [['post', 1024, 1086], ['preun', 1025, 1087], ['postun', 1026, 1088]]) if (scripts[k]) tags.push([tag, T.STRING, lf(scripts[k]).toString()], [prog, T.STRING, '/bin/sh']);
  const hdr = header(63, tags), body = Buffer.concat([hdr, zpay]);
  let sig = header(62, [[269, T.STRING, crypto.createHash('sha1').update(hdr).digest('hex')], [273, T.STRING, crypto.createHash('sha256').update(hdr).digest('hex')],
    [1000, T.INT32, body.length], [1004, T.BIN, crypto.createHash('md5').update(body).digest()], [1007, T.INT32, payload.length]]);
  sig = Buffer.concat([sig, Buffer.alloc((8 - sig.length % 8) % 8)]);
  const lead = Buffer.alloc(96);
  Buffer.from([0xed, 0xab, 0xee, 0xdb, 3, 0]).copy(lead, 0); lead.writeUInt16BE(0, 6); lead.writeUInt16BE(0, 8);
  lead.write(`${name}-${evr}`.slice(0, 65), 10); lead.writeUInt16BE(1, 76); lead.writeUInt16BE(5, 78);
  return Buffer.concat([lead, sig, body]);
}

/* Arch/Manjaro: .PKGINFO + .INSTALL + Dateien (ohne „./“), Ordner mit 755, alles root:root */
function buildPacman({ name, version, release = '1', desc, url, packager, license, depends = [], optdepends = [], install, files }) {
  const parts = [], dirs = new Set(), size = files.reduce((s, f) => s + lf(f.data).length, 0);
  const info = [`# pdfmy.de – gebaut mit tools/linuxpkg.js`, `pkgname = ${name}`, `pkgbase = ${name}`, `pkgver = ${version}-${release}`, `pkgdesc = ${desc}`,
    `url = ${url}`, `builddate = ${MTIME}`, `packager = ${packager}`, `size = ${size}`, `arch = any`, `license = ${license}`,
    ...depends.map(d => `depend = ${d}`), ...optdepends.map(d => `optdepend = ${d}`)].join('\n') + '\n';
  const add = (p, data, mode) => { parts.push(tarHeader(p, data.length, mode, '0'), data, Buffer.alloc((512 - data.length % 512) % 512)); };
  add('.PKGINFO', Buffer.from(info), 0o644);
  if (install) add('.INSTALL', lf(install), 0o644);
  for (const f of files.slice().sort((a, b) => a.path < b.path ? -1 : 1)) {
    const segs = f.path.slice(1).split('/');
    for (let i = 1; i < segs.length; i++) { const d = segs.slice(0, i).join('/') + '/'; if (!dirs.has(d)) { dirs.add(d); parts.push(tarHeader(d, 0, 0o755, '5')); } }
    add(f.path.slice(1), lf(f.data), f.mode || 0o644);
  }
  parts.push(Buffer.alloc(1024));
  return gz(Buffer.concat(parts));
}
module.exports = { buildRpm, buildPacman, header, cpio };
