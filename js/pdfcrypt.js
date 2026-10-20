// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Passwortschutz mit AES-256 nach ISO 32000-2 (Standard-Sicherheitsverfahren, Revision 6) – lokal im Browser (WebCrypto).
   Die Dateiverschlüsselung (AESV3, zufälliger 256-Bit-Dateischlüssel) übernimmt pdf-lib; hier entstehen die Passwort-Einträge
   U/UE/O/OE mit dem iterierten Hash-Verfahren 2.B (SHA-256/384/512). Revision 5 (nur SHA-256) gilt seit ISO 32000-2 als veraltet. */
(function (root) {
  const subtle = globalThis.crypto.subtle, NONE = new Uint8Array(0), IV0 = new Uint8Array(16);
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const rnd = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
  // Passwort: Unicode normalisiert (NFKC als Näherung an SASLprep), UTF-8, höchstens 127 Byte
  const pwBytes = pw => new TextEncoder().encode(String(pw || '').normalize('NFKC')).slice(0, 127);
  // AES-CBC ohne Auffüllung (Eingabe ist ein Vielfaches von 16 Byte; WebCrypto hängt sonst einen Füllblock an)
  async function aesCbc(key, iv, data) {
    const k = await subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
    return new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv }, k, data)).slice(0, data.length);
  }
  // ISO 32000-2, Algorithmus 2.B
  async function hash2B(pw, salt, udata) {
    let K = new Uint8Array(await subtle.digest('SHA-256', cat(pw, salt, udata))), E = null;
    for (let i = 0; i < 64 || E[E.length - 1] > i - 32; i++) {
      const unit = cat(pw, K, udata), K1 = new Uint8Array(unit.length * 64);
      for (let j = 0; j < 64; j++) K1.set(unit, j * unit.length);
      E = await aesCbc(K.slice(0, 16), K.slice(16, 32), K1);
      let s = 0; for (let j = 0; j < 16; j++) s += E[j];
      K = new Uint8Array(await subtle.digest(['SHA-256', 'SHA-384', 'SHA-512'][s % 3], E));
    }
    return K.slice(0, 32);
  }
  // Algorithmen 8 und 9: Einträge für Benutzer- und Eigentümerpasswort zum gegebenen Dateischlüssel
  async function entries(userPw, ownerPw, fileKey) {
    const u = pwBytes(userPw), o = pwBytes(ownerPw), uvs = rnd(8), uks = rnd(8), ovs = rnd(8), oks = rnd(8);
    const U = cat(await hash2B(u, uvs, NONE), uvs, uks);
    const UE = await aesCbc(await hash2B(u, uks, NONE), IV0, fileKey);
    const O = cat(await hash2B(o, ovs, U), ovs, oks);
    const OE = await aesCbc(await hash2B(o, oks, U), IV0, fileKey);
    return { U, UE, O, OE };
  }
  // Algorithmus 11/12 + Entschlüsseln von UE/OE: Dateischlüssel aus Passwort zurückgewinnen (für Tests und Gegenprobe)
  async function fileKeyFor(pw, { U, UE, O, OE }) {
    const p = pwBytes(pw), eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    let key = null, enc = null;
    if (eq(await hash2B(p, U.slice(32, 40), NONE), U.slice(0, 32))) { key = await hash2B(p, U.slice(40, 48), NONE); enc = UE; }
    else if (eq(await hash2B(p, O.slice(32, 40), U.slice(0, 48)), O.slice(0, 32))) { key = await hash2B(p, O.slice(40, 48), U.slice(0, 48)); enc = OE; }
    if (!key) return null;
    const k = await subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
    // CBC ohne Auffüllung entschlüsseln: gültigen Füllblock anhängen (verschlüsselt mit dem letzten Chiffreblock als IV)
    const pad = await aesCbc(key, enc.slice(16, 32), new Uint8Array(16).fill(16));
    return new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: IV0 }, k, cat(enc, pad.slice(0, 16))));
  }
  const api = { hash2B, entries, fileKeyFor, pwBytes };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfCrypt = api;
})(typeof self !== 'undefined' ? self : globalThis);
