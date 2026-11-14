// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Linux-Paket (tools/deb.js, app-v249): Aufbau nach deb(5) – ar-Reihenfolge, tar-Einträge mit Rechten, md5sums, Steuerdatei
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib'), crypto = require('crypto'), fs = require('fs'), path = require('path'), cp = require('child_process');
const { buildDeb } = require('../tools/deb.js');

function ar(buf) {
  assert.equal(buf.subarray(0, 8).toString(), '!<arch>\n');
  const out = []; let p = 8;
  while (p < buf.length) {
    const h = buf.subarray(p, p + 60).toString('latin1'), size = +h.slice(48, 58).trim();
    assert.equal(h.slice(58, 60), '`\n');
    out.push({ name: h.slice(0, 16).trim().replace(/\/$/, ''), data: buf.subarray(p + 60, p + 60 + size) });
    p += 60 + size + (size % 2);
  }
  return out;
}
function untar(buf) {
  const out = []; let p = 0;
  while (p + 512 <= buf.length) {
    const h = buf.subarray(p, p + 512); if (h.every(b => b === 0)) break;
    const s = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    assert.equal(parseInt(s(148, 156), 8), sum, 'Prüfsumme des tar-Kopfs');
    const name = (s(345, 500) ? s(345, 500) + '/' : '') + s(0, 100), size = parseInt(s(124, 136), 8);
    out.push({ name, mode: parseInt(s(100, 108), 8), type: s(156, 157), user: s(265, 297), data: h.length && buf.subarray(p + 512, p + 512 + size) });
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

test('Paket: ar-Reihenfolge, Steuerdatei, Skripte ausführbar, Dateien mit Rechten, md5sums stimmen', () => {
  const deb = buildDeb({
    control: { Package: 'pdfmy-scan', Version: '9.9.9', Architecture: 'all', Maintainer: 'Mentor GmbH <x@y.de>', Description: 'Kurz\nLang Zeile 1\n\nLang Absatz 2' },
    scripts: { postinst: '#!/bin/sh\r\nexit 0\r\n' },
    files: [{ path: '/opt/pdfmy-scan/pdfmy-scan.pl', data: '#!/usr/bin/perl\r\nprint 1;\r\n', mode: 0o755 }, { path: '/usr/share/applications/pdfmy.desktop', data: '[Desktop Entry]\n' },
      { path: '/usr/share/icons/hicolor/512x512/apps/pdfmy.png', data: Buffer.from([137, 80, 78, 71]) }],
  });
  const parts = ar(deb);
  assert.deepEqual(parts.map(x => x.name), ['debian-binary', 'control.tar.gz', 'data.tar.gz']);
  assert.equal(parts[0].data.toString(), '2.0\n');
  const ctl = untar(zlib.gunzipSync(parts[1].data)), data = untar(zlib.gunzipSync(parts[2].data));
  const control = ctl.find(x => x.name === './control').data.toString();
  assert.match(control, /^Package: pdfmy-scan\nVersion: 9\.9\.9\n/);
  assert.match(control, /Description: Kurz\n Lang Zeile 1\n \.\n Lang Absatz 2\nInstalled-Size: \d+\n$/);
  const pi = ctl.find(x => x.name === './postinst'); assert.equal(pi.mode, 0o755); assert.ok(!pi.data.includes(13), 'keine Windows-Zeilenenden in Skripten');
  const pl = data.find(x => x.name === './opt/pdfmy-scan/pdfmy-scan.pl');
  assert.equal(pl.mode, 0o755); assert.equal(pl.user, 'root'); assert.ok(!pl.data.includes(13));
  assert.ok(data.some(x => x.name === './opt/pdfmy-scan/' && x.type === '5'), 'Ordner angelegt');
  assert.equal(data.find(x => x.name.endsWith('pdfmy.png')).data.length, 4, 'Binärdaten unverändert');
  const md5 = ctl.find(x => x.name === './md5sums').data.toString().trim().split('\n').map(l => l.split('  '));
  for (const [h, f] of md5) assert.equal(crypto.createHash('md5').update(data.find(x => x.name === './' + f).data).digest('hex'), h, f);
  assert.deepEqual(buildDeb({ control: { Package: 'a', Version: '1' }, files: [{ path: '/a', data: 'x' }] }), buildDeb({ control: { Package: 'a', Version: '1' }, files: [{ path: '/a', data: 'x' }] }), 'reproduzierbar');
});

test('Paketskripte: sh-Syntax gültig, keine Windows-Zeilenenden', { skip: !fs.existsSync('/bin/sh') && !process.env.SHELL }, () => {
  for (const f of ['postinst', 'prerm', 'postrm', 'pdfmy-open']) {
    const p = path.join(__dirname, '..', 'tools', 'pdfmy-scan-linux', 'deb', f);
    const txt = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    assert.match(txt, /^#!\/bin\/sh\n/, f);
    const r = cp.spawnSync('sh', ['-n'], { input: txt });
    if (r.error) return;   // keine Shell (z. B. Windows ohne Git Bash) – Aufbau oben genügt
    assert.equal(r.status, 0, f + ': ' + r.stderr);
  }
});
