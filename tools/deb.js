// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Debian-Paket (.deb) ohne fremde Werkzeuge bauen – auch unter Windows (Build von pdfmy.de).
   Aufbau nach deb(5): ar-Archiv mit „debian-binary“ (2.0), „control.tar.gz“ und „data.tar.gz“; tar im ustar-Format (POSIX.1-1988).
   Dateien gehören root:root, Zeitstempel fest (gleiche Eingabe → gleiche Datei, kein unnötiges Hochladen beim Ausrollen). */
'use strict';
const zlib = require('zlib'), crypto = require('crypto');
const MTIME = 1763078400;   // 14.11.2025 00:00 UTC – fester Zeitstempel für reproduzierbare Pakete
const oct = (n, w) => n.toString(8).padStart(w - 1, '0') + '\0';
function tarHeader(name, size, mode, type) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', 154); prefix = name.slice(0, i); name = name.slice(i + 1); }
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error('Pfad zu lang für tar: ' + prefix + '/' + name);
  h.write(name, 0); h.write(oct(mode, 8), 100); h.write(oct(0, 8), 108); h.write(oct(0, 8), 116);
  h.write(oct(size, 12), 124); h.write(oct(MTIME, 12), 136); h.write('        ', 148); h.write(type, 156);
  h.write('ustar\0', 257); h.write('00', 263); h.write('root', 265); h.write('root', 297); h.write(prefix, 345);
  let sum = 0; for (const b of h) sum += b; h.write(oct(sum, 7) + ' ', 148);
  return h;
}
// entries: [{ path: './opt/x', data: Buffer|string, mode }] – Ordner werden automatisch angelegt
function tar(entries) {
  const parts = [], dirs = new Set();
  const addDir = p => { const segs = p.split('/'); for (let i = 2; i < segs.length; i++) { const d = segs.slice(0, i).join('/') + '/'; if (!dirs.has(d)) { dirs.add(d); parts.push(tarHeader(d, 0, 0o755, '5')); } } };
  if (!dirs.has('./')) { dirs.add('./'); parts.push(tarHeader('./', 0, 0o755, '5')); }
  for (const e of entries) {
    addDir(e.path);
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    parts.push(tarHeader(e.path, data.length, e.mode || 0o644, '0'), data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
const gz = b => zlib.gzipSync(b, { level: 9, mtime: 0 });
function arEntry(name, data) {
  const h = Buffer.alloc(60, ' ');
  h.write(name + '/', 0); h.write(String(MTIME), 16); h.write('0', 28); h.write('0', 34); h.write('100644', 40); h.write(String(data.length), 48); h.write('`\n', 58);
  return Buffer.concat([h, data, data.length % 2 ? Buffer.from('\n') : Buffer.alloc(0)]);
}
/* control: Felder als Objekt (Reihenfolge bleibt), scripts: { postinst, prerm, postrm }, files: [{ path: '/opt/…', data, mode }] */
function buildDeb({ control, scripts = {}, files }) {
  const data = files.map(f => ({ path: '.' + f.path, data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data.replace(/\r\n/g, '\n'), 'utf8'), mode: f.mode }));
  const size = Math.ceil(data.reduce((n, f) => n + f.data.length, 0) / 1024);
  const md5 = data.map(f => `${crypto.createHash('md5').update(f.data).digest('hex')}  ${f.path.slice(2)}\n`).join('');
  const ctl = Object.entries({ ...control, 'Installed-Size': String(size) }).map(([k, v]) => `${k}: ${String(v).replace(/\n/g, '\n ').replace(/\n \n/g, '\n .\n')}`).join('\n') + '\n';
  const ctrl = [{ path: './control', data: Buffer.from(ctl) }, { path: './md5sums', data: Buffer.from(md5) },
    ...Object.entries(scripts).map(([k, v]) => ({ path: './' + k, data: Buffer.from(v.replace(/\r\n/g, '\n')), mode: 0o755 }))];
  return Buffer.concat([Buffer.from('!<arch>\n'), arEntry('debian-binary', Buffer.from('2.0\n')), arEntry('control.tar.gz', gz(tar(ctrl))), arEntry('data.tar.gz', gz(tar(data)))]);
}
module.exports = { buildDeb, tar };
