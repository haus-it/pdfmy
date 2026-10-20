// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Inkrementelles Speichern (ISO 32000-2, 7.5.6) und Nachweis früherer Fassungen.
   Statt die PDF neu zu schreiben, werden nur neue und geänderte Objekte hinten angehängt (mit eigenem Querverweis und /Prev).
   Jede frühere Fassung bleibt so Byte für Byte am Anfang der Datei erhalten – ihre SHA-256-Prüfsumme lässt sich später
   nachrechnen („Echtheit prüfen“ bei Unterschriftsanfragen). Braucht pdf-lib (PDFLib). */
(function (root) {
  const PL = () => root.PDFLib;
  const latin1 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return s; };
  const ser = obj => { const b = new Uint8Array(obj.sizeInBytes()); obj.copyBytesInto(b, 0); return b; };
  const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
  const sha256 = async bytes => hex(await root.crypto.subtle.digest('SHA-256', bytes));

  // Letzter Querverweis der Originaldatei: Position und Art (klassische Tabelle oder Querverweis-Strom)
  function lastXref(orig) {
    const tail = latin1(orig.subarray(Math.max(0, orig.length - 2048)));
    const m = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(tail);
    if (!m) throw new Error('Die Datei hat keinen gültigen Abschluss (startxref).');
    const at = +m[1], head = latin1(orig.subarray(at, Math.min(orig.length, at + 64)));
    return { at, stream: !/^\s*xref\b/.test(head) };
  }

  // Höchste Objektnummer der Datei – auch Objekt-Container und Querverweis-Ströme, die pdf-lib beim Laden nicht mitzählt
  function maxObject(orig) {
    const s = latin1(orig); let max = 0, m;
    const re = /(?:^|[^\d])(\d{1,7})\s+\d{1,5}\s+obj\b/g; while ((m = re.exec(s))) max = Math.max(max, +m[1]);
    const sz = /\/Size\s+(\d+)/g; while ((m = sz.exec(s))) max = Math.max(max, +m[1] - 1);
    return max;
  }
  /* Zum Ändern laden: neue Objekte bekommen Nummern oberhalb aller vorhandenen – sonst überschriebe das Anhängen
     z. B. einen Objekt-Container der alten Fassung. */
  async function load(orig) {
    const doc = await PL().PDFDocument.load(orig, { updateMetadata: false });
    doc.context.largestObjectNumber = Math.max(doc.context.largestObjectNumber, maxObject(orig));
    return doc;
  }
  /* doc: das mit load(orig) geladene und danach veränderte Dokument. Ergebnis: orig + Änderungen (orig unverändert vorn). */
  async function save(orig, doc) {
    const L = PL();
    await doc.flush();   // eingebettete Schriften und Bilder anlegen
    const base = await L.PDFDocument.load(orig, { updateMetadata: false, ignoreEncryption: true });
    const bctx = base.context, ctx = doc.context, changed = [];
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      const old = bctx.lookup(ref), nb = ser(obj);
      if (!old || !same(nb, ser(old))) changed.push([ref, nb]);
    }
    if (!changed.length) return orig;
    changed.sort((a, b) => a[0].objectNumber - b[0].objectNumber);
    const prev = lastXref(orig), enc = new TextEncoder(), parts = [], offsets = [];
    let pos = orig.length;
    if (orig[orig.length - 1] !== 0x0a) { parts.push(enc.encode('\n')); pos += 1; }
    for (const [r, body] of changed) {
      const h = enc.encode(`${r.objectNumber} ${r.generationNumber} obj\n`), t = enc.encode('\nendobj\n');
      offsets.push([r, pos]); parts.push(h, body, t); pos += h.length + body.length + t.length;
    }
    const ti = ctx.trailerInfo, str = x => latin1(ser(x));
    const extra = `${ti.Info ? ' /Info ' + str(ti.Info) : ''}${ti.ID ? ' /ID ' + str(ti.ID) : ''}`;
    if (prev.stream) {
      // Querverweis-Strom (PDF 1.5+), unkomprimiert: Typ 1 Byte, Position 4 Byte, Generation 2 Byte
      const xnum = ctx.largestObjectNumber + 1, rows = [...offsets, [{ objectNumber: xnum, generationNumber: 0 }, pos]];
      const data = new Uint8Array(rows.length * 7);
      rows.forEach(([r, off], i) => { const o = i * 7; data[o] = 1; data[o + 1] = off >>> 24 & 255; data[o + 2] = off >>> 16 & 255; data[o + 3] = off >>> 8 & 255; data[o + 4] = off & 255; data[o + 5] = r.generationNumber >> 8 & 255; data[o + 6] = r.generationNumber & 255; });
      const index = rows.map(([r]) => `${r.objectNumber} 1`).join(' ');
      const h = enc.encode(`${xnum} 0 obj\n<< /Type /XRef /Size ${xnum + 1} /W [1 4 2] /Index [${index}] /Root ${str(ti.Root)}${extra} /Prev ${prev.at} /Length ${data.length} >>\nstream\n`);
      parts.push(h, data, enc.encode(`\nendstream\nendobj\nstartxref\n${pos}\n%%EOF\n`));
    } else {
      let x = 'xref\n';
      for (const [r, off] of offsets) x += `${r.objectNumber} 1\n${String(off).padStart(10, '0')} ${String(r.generationNumber).padStart(5, '0')} n \n`;
      x += `trailer\n<< /Size ${ctx.largestObjectNumber + 1} /Root ${str(ti.Root)}${extra} /Prev ${prev.at} >>\nstartxref\n${pos}\n%%EOF\n`;
      parts.push(enc.encode(x));
    }
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, orig.length));
    out.set(orig, 0); let at = orig.length; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  // Prüfsummen aller früheren Fassungen in der Datei: jede endet mit „%%EOF“ (ggf. mit Zeilenende dahinter)
  async function versionHashes(bytes) {
    const s = latin1(bytes), ends = new Set();
    for (let i = s.indexOf('%%EOF'); i >= 0; i = s.indexOf('%%EOF', i + 5)) {
      let e = i + 5; ends.add(e);
      if (s[e] === '\r') ends.add(++e);
      if (s[e] === '\n') ends.add(e + 1);
    }
    const out = new Map();
    for (const e of [...ends].sort((a, b) => a - b)) out.set(await sha256(bytes.subarray(0, e)), e);
    return out;   // Prüfsumme → Länge der Fassung
  }
  // Welche der genannten Prüfsummen stecken als unveränderte Fassung in der Datei?
  async function contains(bytes, hashes) {
    const v = await versionHashes(bytes);
    return hashes.map(h => !!h && v.has(String(h).toLowerCase()));
  }

  const api = { load, save, versionHashes, contains };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfInc = api;
})(typeof self !== 'undefined' ? self : globalThis);
