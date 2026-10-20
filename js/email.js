// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* E-Mails ablegen: Anhänge (PDF, Bilder, E-Rechnungs-XML) aus gespeicherten E-Mails holen – lokal, ohne Server.
   .eml (MIME, z. B. Outlook im Web, Thunderbird, Apple Mail) und .msg (klassisches Outlook, OLE-Verbunddatei).
   Reine Funktionen auf Uint8Array, auch in Node-Tests nutzbar. */
(function (root) {
  'use strict';
  const latin1 = b => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
  const bytesOf = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const decodeText = (bytes, cs) => { try { return new TextDecoder(/^(utf-?8|)$/i.test(cs || '') ? 'utf-8' : cs).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); } };

  /* ---------------- .eml (MIME) ---------------- */
  // =?utf-8?B?...?= / =?iso-8859-1?Q?...?=
  function decodeWords(s) {
    return String(s || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (m, cs, enc, txt) => {
      try {
        const b = enc.toLowerCase() === 'b' ? b64(txt) : bytesOf(txt.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))));
        return decodeText(b, cs);
      } catch { return m; }
    });
  }
  function b64(s) {
    s = String(s).replace(/[^A-Za-z0-9+/]/g, '');
    if (typeof atob === 'function') return bytesOf(atob(s.slice(0, s.length - (s.length % 4))));
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  const qp = s => bytesOf(s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))));
  function headers(block) {
    const h = {};
    for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
      const i = line.indexOf(':'); if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = line.slice(i + 1).trim(); }
    }
    return h;
  }
  // Parameter wie name="…", filename*=utf-8''…, filename*0*=…
  function param(v, name) {
    v = v || '';
    const ext = [...v.matchAll(new RegExp(name + '\\*(\\d+)?\\*?=("([^"]*)"|[^;]*)', 'gi'))];
    if (ext.length) {
      let raw = ext.sort((a, b) => (+a[1] || 0) - (+b[1] || 0)).map(m => (m[3] ?? m[2]).trim()).join('');
      const m = raw.match(/^([^']*)'[^']*'(.*)$/);
      if (m) { try { return decodeText(bytesOf(unescape(m[2])), m[1]); } catch { return m[2]; } }
      return decodeWords(raw);
    }
    const m = v.match(new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*("([^"]*)"|[^;]+)', 'i'));
    return m ? decodeWords((m[2] ?? m[1]).trim()) : '';
  }
  function parseEml(bytes) {
    const text = latin1(bytes), out = { subject: '', from: '', date: '', body: '', attachments: [] };
    (function part(raw, depth) {
      const sep = raw.search(/\r?\n\r?\n/); if (sep < 0) return;
      const h = headers(raw.slice(0, sep)), body = raw.slice(sep).replace(/^\r?\n\r?\n/, '');
      if (depth === 0) { out.subject = decodeWords(h.subject); out.from = decodeWords(h.from); out.date = h.date || ''; }
      const ct = h['content-type'] || 'text/plain', type = ct.split(';')[0].trim().toLowerCase(), enc = (h['content-transfer-encoding'] || '').toLowerCase();
      if (type.startsWith('multipart/')) {
        const bd = param(ct, 'boundary'); if (!bd || depth > 8) return;
        const pieces = body.split(new RegExp('\\r?\\n?--' + bd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*\\r?\\n?'));
        for (const p of pieces.slice(1)) if (p.trim()) part(p, depth + 1);
        return;
      }
      const data = enc === 'base64' ? b64(body) : enc === 'quoted-printable' ? qp(body) : bytesOf(body);
      if (type === 'message/rfc822') { const inner = parseEml(data); out.attachments.push(...inner.attachments); return; }   // weitergeleitete E-Mail
      const name = param(h['content-disposition'], 'filename') || param(ct, 'name');
      const disp = (h['content-disposition'] || '').toLowerCase();
      if (name || disp.startsWith('attachment')) out.attachments.push({ name: name || 'Anhang', type, data });
      else if (type === 'text/plain' && !out.body) out.body = decodeText(data, param(ct, 'charset'));
      else if (type === 'text/html' && !out.body) out.body = decodeText(data, param(ct, 'charset')).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    })(text, 0);
    return out;
  }

  /* ---------------- .msg (OLE/CFB, MS-OXMSG) ---------------- */
  function readCfb(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw new Error('keine Outlook-Nachricht (.msg)');
    const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
    const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true);
    const off = s => (s + 1) * ss;
    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(76 + i * 4, true));
    for (let d = difStart, guard = 0; d < 0xFFFFFFFA && fatSecs.length < nFat && guard++ < 1e5; ) {
      for (let i = 0; i < ss / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(off(d) + i * 4, true));
      d = dv.getUint32(off(d) + ss - 4, true);
    }
    const fat = []; for (const s of fatSecs) for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true));
    const chain = (start, table) => { const c = []; for (let s = start, g = 0; s < 0xFFFFFFFA && g++ < 1e6; s = table[s]) c.push(s); return c; };
    const readChain = (start, size) => { const c = chain(start, fat), b = new Uint8Array(c.length * ss); c.forEach((s, i) => b.set(bytes.subarray(off(s), off(s) + ss), i * ss)); return size == null ? b : b.subarray(0, size); };
    const dirBytes = readChain(dirStart), dirs = [];
    for (let i = 0; i + 128 <= dirBytes.length; i += 128) {
      const e = new DataView(dirBytes.buffer, dirBytes.byteOffset + i, 128), nl = e.getUint16(64, true);
      let name = ''; for (let k = 0; k < Math.max(0, nl / 2 - 1); k++) name += String.fromCharCode(e.getUint16(k * 2, true));
      dirs.push({ name, type: e.getUint8(66), left: e.getUint32(68, true), right: e.getUint32(72, true), child: e.getUint32(76, true), start: e.getUint32(116, true), size: e.getUint32(120, true) });
    }
    const rootE = dirs[0], miniStream = rootE && rootE.start < 0xFFFFFFFA ? readChain(rootE.start, rootE.size) : new Uint8Array(0);
    const miniFat = miniFatStart < 0xFFFFFFFA ? (b => { const t = []; for (let i = 0; i + 4 <= b.length; i += 4) t.push(new DataView(b.buffer, b.byteOffset + i, 4).getUint32(0, true)); return t; })(readChain(miniFatStart)) : [];
    const stream = e => {
      if (e.size < cutoff) { const c = chain(e.start, miniFat), b = new Uint8Array(c.length * mss); c.forEach((s, i) => b.set(miniStream.subarray(s * mss, s * mss + mss), i * mss)); return b.subarray(0, e.size); }
      return readChain(e.start, e.size);
    };
    const children = id => { const out = []; (function walk(i, g) { if (i >= dirs.length || i === 0xFFFFFFFF || g > 1e5) return; const d = dirs[i]; walk(d.left, g + 1); out.push(d); walk(d.right, g + 1); })(dirs[id]?.child ?? 0xFFFFFFFF, 0); return out; };
    return { dirs, stream, children };
  }
  function parseMsg(bytes) {
    const c = readCfb(bytes), out = { subject: '', from: '', date: '', body: '', attachments: [] };
    const props = id => { const m = {}; for (const d of c.children(id)) { const k = d.name.match(/^__substg1\.0_([0-9A-F]{4})([0-9A-F]{4})$/i); if (k && d.type === 2) m[k[1].toUpperCase() + k[2].toUpperCase()] = d; } return m; };
    const str = (p, id) => { const u = p[id + '001F'], a = p[id + '001E']; if (u) return new TextDecoder('utf-16le').decode(c.stream(u)).replace(/\0+$/, ''); if (a) return decodeText(c.stream(a), 'windows-1252').replace(/\0+$/, ''); return ''; };
    const top = props(0);
    out.subject = str(top, '0037'); out.from = [str(top, '0C1A'), str(top, '5D01') || str(top, '0C1F')].filter(Boolean).join(' '); out.body = str(top, '1000');
    for (const d of c.children(0)) {
      if (d.type !== 1 || !/^__attach_version1\.0_/i.test(d.name)) continue;
      const p = props(c.dirs.indexOf(d)), data = p['37010102'];
      if (data) { out.attachments.push({ name: str(p, '3707') || str(p, '3704') || 'Anhang', type: str(p, '370E'), data: c.stream(data) }); continue; }
      // eingebettete E-Mail (weitergeleitet): Unterordner __substg1.0_3701000D
      const sub = c.children(c.dirs.indexOf(d)).find(x => /^__substg1\.0_3701000D$/i.test(x.name));
      if (sub) for (const a of c.children(c.dirs.indexOf(sub))) {
        if (a.type !== 1 || !/^__attach_version1\.0_/i.test(a.name)) continue;
        const q = props(c.dirs.indexOf(a)); if (q['37010102']) out.attachments.push({ name: str(q, '3707') || str(q, '3704') || 'Anhang', type: str(q, '370E'), data: c.stream(q['37010102']) });
      }
    }
    return out;
  }

  // Für PDFMy relevante Anhänge: PDF, Bilder, E-Rechnungs-XML (keine Signaturen, Logos aus der Signatur < 15 KB)
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', xml: 'application/xml', tif: 'image/tiff', tiff: 'image/tiff' };
  function usable(list) {
    return list.map(a => ({ ...a, ext: (a.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '' }))
      .filter(a => a.ext === 'pdf' || a.ext === 'xml' || (/^(jpe?g|png)$/.test(a.ext) && a.data.length > 15000))
      .map(a => ({ name: a.name, type: MIME[a.ext] || a.type, data: a.data }));
  }
  function parseMail(bytes, name = '') {
    const isMsg = bytes[0] === 0xD0 && bytes[1] === 0xCF;
    const m = isMsg ? parseMsg(bytes) : parseEml(bytes);
    return { ...m, kind: isMsg ? 'msg' : 'eml', files: usable(m.attachments) };
  }
  const api = { parseEml, parseMsg, parseMail, readCfb, decodeWords };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Email = api;
})(typeof self !== 'undefined' ? self : this);
