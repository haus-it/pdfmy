// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Digitale Signaturen in PDFs prüfen – lokal im Browser (wie die Signaturleiste in Acrobat).
   Unterstützt CMS/PKCS#7 (adbe.pkcs7.detached, ETSI.CAdES.detached, adbe.pkcs7.sha1) mit RSA (PKCS#1 v1.5) und ECDSA.
   Prüft: (1) signierte Bytes unverändert (Prüfsumme = messageDigest), (2) kryptografische Signatur mit dem Zertifikat (WebCrypto),
   (3) Zertifikat zum Signaturzeitpunkt gültig, (4) wurde nach der Signatur etwas angehängt? Vertrauen in den Aussteller: trust() gleicht
   gegen den statischen Schnappschuss der EU-Vertrauensliste ab (app-v310); fehlt der Aussteller dort, wird das ehrlich so angezeigt. Bausteine: node-forge (ASN.1), WebCrypto. Auch in Node nutzbar. */
(function (root) {
  'use strict';
  const OID = {
    md: '1.2.840.113549.1.9.4', time: '1.2.840.113549.1.9.5', tsa: '1.2.840.113549.1.9.16.2.14',
    sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
    rsa: '1.2.840.113549.1.1.1', rsaSha1: '1.2.840.113549.1.1.5', rsaSha256: '1.2.840.113549.1.1.11', rsaSha384: '1.2.840.113549.1.1.12', rsaSha512: '1.2.840.113549.1.1.13', pss: '1.2.840.113549.1.1.10',
    ec: '1.2.840.10045.2.1', ecSha1: '1.2.840.10045.4.1', ecSha256: '1.2.840.10045.4.3.2', ecSha384: '1.2.840.10045.4.3.3', ecSha512: '1.2.840.10045.4.3.4',
    p256: '1.2.840.10045.3.1.7', p384: '1.3.132.0.34', p521: '1.3.132.0.35', qc: '1.3.6.1.5.5.7.1.3',
    cn: '2.5.4.3', o: '2.5.4.10', email: '1.2.840.113549.1.9.1', c: '2.5.4.6',
  };
  const HASH = { [OID.sha1]: 'SHA-1', [OID.sha256]: 'SHA-256', [OID.sha384]: 'SHA-384', [OID.sha512]: 'SHA-512' };
  const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const fromBin = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const subtle = () => (root.crypto && root.crypto.subtle) || (typeof require === 'function' ? require('crypto').webcrypto.subtle : null);
  const pdfStr = s => s ? s.replace(/\\(\d{3})/g, (m, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, '$1') : '';
  const decodeText = s => { if (!s) return ''; if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) { let o = ''; for (let i = 2; i + 1 < s.length; i += 2) o += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1)); return o; } return s; };
  const pdfDate = s => { const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(s || ''); if (!m) return null; const p = [+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0, +m[6] || 0]; if (!m[7]) return new Date(...p); const off = m[7] === '+' || m[7] === '-' ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0; return new Date(Date.UTC(...p) - off * 60000); };

  // Alle Signaturen finden: /ByteRange [a b c d]; die Signatur (Hex) steht genau zwischen den beiden Bereichen
  function find(u8) {
    const s = latin1(u8), out = [], re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g; let m;
    while ((m = re.exec(s))) {
      const [o1, l1, o2, l2] = m.slice(1, 5).map(Number);
      if (o1 !== 0 || o2 <= l1 || o2 + l2 > u8.length) continue;
      const hex = s.slice(l1, o2).replace(/[<>\s]/g, '');
      if (!/^[0-9a-f]+$/i.test(hex)) continue;
      // Wörterbuch der Signatur grob abgrenzen (rund um /ByteRange) für SubFilter, Name, Grund, Ort, Datum
      const from = s.lastIndexOf('obj', m.index), to = s.indexOf('endobj', m.index), dict = s.slice(from < 0 ? m.index - 4000 : from, to < 0 ? m.index + 4000 : to).replace(/<[0-9a-fA-F\s]{2000,}>/g, '<…>');   // nur den Signaturwert ausblenden – Grund/Name in UTF-16 (Hex) können einige hundert Zeichen lang sein
      const val = k => {   // Literal (…) oder Hex <…>
        const r = new RegExp('/' + k + '\\s*\\(((?:\\\\.|[^\\\\)])*)\\)').exec(dict); if (r) return decodeText(pdfStr(r[1]));
        const h = new RegExp('/' + k + '\\s*<([0-9a-fA-F\\s]*)>').exec(dict); if (!h) return '';
        const hx = h[1].replace(/\s/g, ''); let t = ''; for (let i = 0; i + 1 < hx.length; i += 2) t += String.fromCharCode(parseInt(hx.slice(i, i + 2), 16)); return decodeText(t);
      };
      const sub = (/\/SubFilter\s*\/([\w.]+)/.exec(dict) || [])[1] || '';
      // Nutzungsrechte-Signatur (UR/UR3): technische Freischaltung von Reader-Funktionen durch einen Software-Hersteller,
      // keine Unterschrift einer Person – wird nicht als „Signiert von …“ angezeigt
      const objNo = (/(\d+)\s+\d+\s+obj\s*$/.exec(s.slice(Math.max(0, from - 30), from + 3)) || [])[1];
      const usageRights = /\/TransformMethod\s*\/UR3?\b/.test(dict) || (!!objNo && new RegExp('/Perms\\s*<<[^>]*/UR3?\\s+' + objNo + '\\s+0\\s+R').test(s));
      out.push({ range: [o1, l1, o2, l2], hex, subFilter: sub, usageRights, name: val('Name'), reason: val('Reason'), location: val('Location'), m: pdfDate(val('M')), end: o2 + l2 });
    }
    return out;
  }

  const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  function nameOf(forge, asn) { const o = {}; try { for (const a of forge.pki.RDNAttributesAsArray(asn)) o[a.type] = a.value; } catch {} return { cn: o[OID.cn] || '', o: o[OID.o] || '', email: o[OID.email] || '', c: o[OID.c] || '' }; }
  const timeOf = (forge, n) => n.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(n.value) : forge.asn1.generalizedTimeToDate(n.value);
  // Zertifikat ohne RSA-Beschränkung von forge lesen: Seriennummer, Aussteller, Inhaber, Gültigkeit, öffentlicher Schlüssel (SPKI)
  /* eIDAS-Kennzeichen im Zertifikat (app-v336, ETSI EN 319 412-5 und 319 412-2):
     QCStatements (1.3.6.1.5.5.7.1.3): QcCompliance 0.4.0.1862.1.1 (EU-qualifiziert), QcSSCD 0.4.0.1862.1.4 (Schlüssel in einer
     qualifizierten Signaturerstellungseinheit, QSCD), QcType 0.4.0.1862.1.6 mit .1 Signatur / .2 Siegel / .3 Website;
     Zertifikatsrichtlinien (2.5.29.32): QCP-n 0.4.0.194112.1.0, QCP-l .1.1, QCP-n-qscd .1.2, QCP-l-qscd .1.3.
     Ergebnis: { compliance, qscd, type: 'esign'|'eseal'|'web'|null, policy: 'n'|'l'|null } */
  const QC = { compliance: '0.4.0.1862.1.1', sscd: '0.4.0.1862.1.4', type: '0.4.0.1862.1.6', types: { '0.4.0.1862.1.6.1': 'esign', '0.4.0.1862.1.6.2': 'eseal', '0.4.0.1862.1.6.3': 'web' },
    pol: { '0.4.0.194112.1.0': ['n', false], '0.4.0.194112.1.1': ['l', false], '0.4.0.194112.1.2': ['n', true], '0.4.0.194112.1.3': ['l', true] }, cp: '2.5.29.32' };
  function qcStatements(forge, ext) {
    const r = { compliance: false, qscd: false, type: null, policy: null };
    if (!ext) return r;
    try {
      for (const e of ext.value[0].value) {
        const id = forge.asn1.derToOid(e.value[0].value), oct = e.value[e.value.length - 1];
        if (id !== OID.qc && id !== QC.cp) continue;
        const inner = forge.asn1.fromDer(oct.value, { strict: false });
        for (const st of inner.value) {
          const sid = forge.asn1.derToOid(st.value[0].value);
          if (id === QC.cp) { const p = QC.pol[sid]; if (p) { r.policy = p[0]; if (p[1]) r.qscd = true; } continue; }
          if (sid === QC.compliance) r.compliance = true;
          else if (sid === QC.sscd) r.qscd = true;
          else if (sid === QC.type && st.value[1]) for (const t of st.value[1].value || []) { const k = QC.types[forge.asn1.derToOid(t.value)]; if (k && !r.type) r.type = k; }
        }
      }
    } catch (e) { /* unlesbare Erweiterung: keine Kennzeichen */ }
    return r;
  }
  /* Stufe der Signatur nach eIDAS (vereinfachte Fassung von ETSI TS 119 615 / EN 319 102-1), nur wenn die Signatur selbst gültig ist:
     'qes'    qualifizierte elektronische Signatur: Aussteller zum Signaturzeitpunkt qualifiziert für Signaturen (EU-Liste), Zertifikat
              EU-qualifiziert (QcCompliance oder QCP-n), Schlüssel in einer QSCD (QcSSCD oder QCP-*-qscd), Art Signatur;
     'qeseal' qualifiziertes elektronisches Siegel (dasselbe für juristische Personen, QcType eseal bzw. QCP-l);
     'adesqc' fortgeschritten mit qualifiziertem Zertifikat (ohne QSCD-Nachweis);
     'ades'   fortgeschritten (gültig, aber kein qualifiziertes Zertifikat bzw. Aussteller nicht in der Liste); null = nicht gültig. */
  function level(r) {
    if (!r || !r.intact || !r.valid) return null;
    const q = r.qcs || {}, t = r.trust, okAt = !!t && t.atTime !== false;
    const seal = q.type === 'eseal' || (!q.type && q.policy === 'l');
    const use = t && t.u && t.u.length ? t.u : ['s', 'e'];   // ältere Listen ohne Angabe: beides zulassen
    const qualified = okAt && (q.compliance || !!q.policy) && use.includes(seal ? 'e' : 's');
    if (qualified && q.qscd && q.type !== 'web') return seal ? 'qeseal' : 'qes';
    if (qualified) return 'adesqc';
    return 'ades';
  }
  function certInfo(forge, c) {
    const tbs = c.value[0], v = tbs.value, k = v[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC ? 1 : 0;
    const spki = v[k + 5], algo = spki.value[0].value, ext = v.find(x => x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 3);
    let qc = false; if (ext) { try { qc = latin1(fromBin(forge.asn1.toDer(ext).getBytes())).includes(latin1(fromBin(forge.asn1.oidToDer(OID.qc).getBytes()))); } catch {} }
    const qcs = qcStatements(forge, ext);
    return {
      serial: forge.util.bytesToHex(v[k].value), issuer: nameOf(forge, v[k + 2]), subject: nameOf(forge, v[k + 4]),
      from: timeOf(forge, v[k + 3].value[0]), to: timeOf(forge, v[k + 3].value[1]),
      spki: fromBin(forge.asn1.toDer(spki).getBytes()), keyAlg: forge.asn1.derToOid(algo[0].value), curve: algo[1] && algo[1].type === forge.asn1.Type.OID ? forge.asn1.derToOid(algo[1].value) : null, qc, qcs,
      // für die Prüfung gegen die EU-Vertrauensliste: signierter Teil, Verfahren und Signatur des Ausstellers (BIT STRING ohne Füllbyte)
      ...issuerSig(forge, c, tbs),
    };
  }
  // Signatur des Ausstellers aus dem Zertifikat – direkt aus dem DER des BIT STRING (forge zerlegt ihn bei ECDSA in ASN.1);
  // darf nie scheitern, sonst fiele das ganze Zertifikat weg
  function issuerSig(forge, c, tbs) {
    try {
      const d = fromBin(forge.asn1.toDer(c.value[2]).getBytes()), hdr = d[1] < 0x80 ? 2 : 2 + (d[1] & 0x7f);
      return { tbs: fromBin(forge.asn1.toDer(tbs).getBytes()), certSigAlg: forge.asn1.derToOid(c.value[1].value[0].value), certSig: d.subarray(hdr + 1) };
    } catch { return {}; }
  }
  /* Hat der Aussteller mit diesem Schlüssel (SPKI, DER) das Zertifikat child signiert? RSA (PKCS#1 v1.5) und ECDSA; RSA-PSS → null */
  const CERT_HASH = { [OID.rsaSha1]: 'SHA-1', [OID.rsaSha256]: 'SHA-256', [OID.rsaSha384]: 'SHA-384', [OID.rsaSha512]: 'SHA-512', [OID.ecSha1]: 'SHA-1', [OID.ecSha256]: 'SHA-256', [OID.ecSha384]: 'SHA-384', [OID.ecSha512]: 'SHA-512' };
  async function signedBy(forge, child, spki) {
    const S = subtle(), hash = CERT_HASH[child.certSigAlg]; if (!S || !hash) return null;
    try {
      if (child.certSigAlg.startsWith('1.2.840.113549')) {
        const key = await S.importKey('spki', ab(spki), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
        return await S.verify('RSASSA-PKCS1-v1_5', key, ab(child.certSig), ab(child.tbs));
      }
      for (const [curve, size] of [['P-256', 32], ['P-384', 48], ['P-521', 66]]) {
        let key; try { key = await S.importKey('spki', ab(spki), { name: 'ECDSA', namedCurve: curve }, false, ['verify']); } catch { continue; }
        return await S.verify({ name: 'ECDSA', hash }, key, ab(ecRaw(forge, latin1(child.certSig), size)), ab(child.tbs));
      }
    } catch { return false; }
    return null;
  }
  const b64u8 = b => typeof atob === 'function' ? fromBin(atob(b)) : new Uint8Array(Buffer.from(b, 'base64'));
  /* Prüfung gegen die EU-Vertrauensliste (vendor/eutl/eutl.json, statischer Schnappschuss von pdfmy.de): Ist das Zertifikat des
     Unterzeichners – direkt oder über eine Zwischenstelle aus der Signatur – von einem qualifizierten Zertifizierungsdienst ausgestellt,
     dessen Schlüssel in der Liste steht? Geprüft wird kryptografisch (Signatur des Zertifikats), nicht nur am Namen.
     Ergebnis: { c: Land, p: Anbieter, n: Dienst, atTime: zum Signaturzeitpunkt erteilt, u: Verwendung } oder null. */
  async function trust(r, list) {
    const forge = root.forge, path = r && r._path; if (!forge || !path || !path.length || !list || !list.dienste) return null;
    const when = r.time || r.m || new Date(), day = when instanceof Date && !isNaN(when) ? when.toISOString().slice(0, 10) : null;
    const signer = path[0], steps = [signer, ...path.slice(1).filter(c => c !== signer && c.subject.cn === signer.issuer.cn && c.subject.cn !== c.issuer.cn)];
    for (const x of steps) {
      for (const s of list.dienste.filter(s => s.cn && s.cn === x.issuer.cn)) {
        if (!(await signedBy(forge, x, b64u8(s.k)))) continue;
        if (x !== signer && !(await signedBy(forge, signer, x.spki))) continue;   // Zwischenstelle muss den Unterzeichner wirklich ausgestellt haben
        const atTime = !day ? null : s.st === 'g' ? !s.from || day >= s.from : !!s.from && day >= s.from && (!s.to || day < s.to);
        return { c: s.c, p: s.p, n: s.n, u: s.u || [], atTime, stand: list.stand };
      }
    }
    return null;
  }
  // ECDSA-Signatur (DER: SEQUENCE{r,s}) → r||s für WebCrypto
  function ecRaw(forge, der, size) {
    const a = forge.asn1.fromDer(der), pad = b => { b = b.replace(/^\x00+/, ''); return '\x00'.repeat(Math.max(0, size - b.length)) + b; };
    return fromBin(pad(a.value[0].value) + pad(a.value[1].value));
  }

  async function verifyOne(forge, u8, sig) {
    const r = { ...sig, intact: false, valid: false, problems: [] };
    const [o1, l1, o2, l2] = sig.range;
    r.wholeFile = sig.end >= u8.length - 2;   // nach der Signatur nichts angehängt (ein Zeilenende darf folgen)
    // Nicht die Null-Auffüllung abschneiden: endet die Signatur selbst auf 00-Bytes, wäre sie sonst verstümmelt.
    // Das ASN.1-Objekt bringt seine Länge mit; alles danach (Auffüllung) wird beim Lesen ignoriert.
    let der = sig.hex; if (der.length % 2) der += '0';
    let p7; try { p7 = forge.asn1.fromDer(forge.util.hexToBytes(der), { parseAllBytes: false, strict: false }); } catch (e) { r.problems.push('Signatur ist nicht lesbar'); return r; }
    // ContentInfo → SignedData { version, digestAlgorithms, contentInfo, [0] certificates, [1] crls, signerInfos }
    const sd = p7.value[1].value[0], parts = sd.value;
    const certsNode = parts.find(x => x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 0);
    const certs = certsNode ? certsNode.value.filter(x => x.type === forge.asn1.Type.SEQUENCE).map(c => { try { return certInfo(forge, c); } catch { return null; } }).filter(Boolean) : [];
    const si = parts[parts.length - 1].value[0], sv = si.value;
    const sid = sv[1], serial = sid.type === forge.asn1.Type.SEQUENCE ? forge.util.bytesToHex(sid.value[1].value) : null;
    const cert = certs.find(c => c.serial === serial) || certs[0];
    const digestOid = forge.asn1.derToOid(sv[2].value[0].value), hash = HASH[digestOid];
    let i = 3, signed = null; if (sv[i].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && sv[i].type === 0) signed = sv[i++];
    const sigAlg = forge.asn1.derToOid(sv[i].value[0].value), signature = fromBin(sv[i + 1].value);
    const unsigned = sv.find((x, k) => k > i + 1 && x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 1);
    r.timestamp = !!unsigned && latin1(fromBin(forge.asn1.toDer(unsigned).getBytes())).includes(latin1(fromBin(forge.asn1.oidToDer(OID.tsa).getBytes())));
    r.algorithm = hash || '?';
    if (cert) Object.assign(r, { signer: cert.subject, issuer: cert.issuer, certFrom: cert.from, certTo: cert.to, selfSigned: cert.issuer.cn === cert.subject.cn && cert.issuer.o === cert.subject.o, qualified: cert.qc, qcs: cert.qcs });
    if (cert) Object.defineProperty(r, '_path', { value: [cert, ...certs.filter(c => c !== cert)], enumerable: false });   // für trust() – nicht mitspeichern
    if (!hash) { r.problems.push('Unbekanntes Prüfsummenverfahren'); return r; }
    const S = subtle(); if (!S) { r.problems.push('Prüfung im Browser nicht möglich'); return r; }
    // (1) Prüfsumme der signierten Bytes
    const data = new Uint8Array(l1 + l2); data.set(u8.subarray(o1, o1 + l1), 0); data.set(u8.subarray(o2, o2 + l2), l1);
    // Dokumentzeitstempel (ETSI.RFC3161): Der Dienst bestätigt den Prüfwert der Datei im TSTInfo (messageImprint);
    // seine Signatur gilt dem TSTInfo. Also: (a) messageImprint = Prüfwert der Bytes, (b) messageDigest = Prüfwert des TSTInfo.
    let mdOver = data, imprintOk = true;
    if (sig.subFilter === 'ETSI.RFC3161') {
      r.docTimestamp = true;
      const encap = sd.value[2]; let c = encap.value[1].value[0];
      const content = c.constructed ? c.value.map(x => x.value).join('') : c.value;
      const tst = forge.asn1.fromDer(content, { strict: false }), mi = tst.value[2], ih = HASH[forge.asn1.derToOid(mi.value[0].value[0].value)];
      if (!ih) { r.problems.push('Unbekanntes Prüfsummenverfahren'); return r; }
      const fileHash = latin1(new Uint8Array(await S.digest(ih, data)));
      imprintOk = mi.value[1].value === fileHash;
      try { const g = tst.value[4].value; r.time = new Date(Date.UTC(+g.slice(0, 4), +g.slice(4, 6) - 1, +g.slice(6, 8), +g.slice(8, 10), +g.slice(10, 12), +g.slice(12, 14))); } catch {}
      r.timestamp = true; mdOver = fromBin(content);
    }
    const digest = new Uint8Array(await S.digest(hash, mdOver));
    let toVerify = mdOver;
    if (signed) {
      let md = null;
      for (const at of signed.value) {
        const oid = forge.asn1.derToOid(at.value[0].value), v0 = at.value[1].value[0];
        if (oid === OID.md) md = fromBin(v0.value);
        if (oid === OID.time) { try { r.time = timeOf(forge, v0); } catch {} }
      }
      r.intact = imprintOk && !!md && md.length === digest.length && md.every((b, k) => b === digest[k]);
      // signierte Attribute als SET (Tag 0x31) – das ist, was tatsächlich signiert wurde
      const derAttrs = fromBin(forge.asn1.toDer(signed).getBytes()); derAttrs[0] = 0x31; toVerify = derAttrs;
    } else r.intact = imprintOk;   // ohne Attribute wird direkt über die Daten signiert (wird unten mitgeprüft)
    if (!r.intact) r.problems.push('Das Dokument wurde nach dem Signieren verändert');
    // (2) Kryptografische Signatur
    if (!cert) { r.problems.push('Kein Zertifikat in der Signatur'); return r; }
    try {
      const rsa = [OID.rsa, OID.rsaSha1, OID.rsaSha256, OID.rsaSha384, OID.rsaSha512].includes(sigAlg) && cert.keyAlg === OID.rsa;
      const ec = [OID.ec, OID.ecSha1, OID.ecSha256, OID.ecSha384, OID.ecSha512].includes(sigAlg) || cert.keyAlg === OID.ec;
      if (rsa) {
        const key = await S.importKey('spki', ab(cert.spki), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
        r.valid = await S.verify('RSASSA-PKCS1-v1_5', key, ab(signature), ab(toVerify));
      } else if (ec) {
        const curve = { [OID.p256]: ['P-256', 32], [OID.p384]: ['P-384', 48], [OID.p521]: ['P-521', 66] }[cert.curve];
        if (!curve) throw new Error('Kurve wird nicht unterstützt');
        const key = await S.importKey('spki', ab(cert.spki), { name: 'ECDSA', namedCurve: curve[0] }, false, ['verify']);
        r.valid = await S.verify({ name: 'ECDSA', hash }, key, ab(ecRaw(forge, latin1(signature), curve[1])), ab(toVerify));
      } else { r.problems.push(sigAlg === OID.pss ? 'RSA-PSS wird noch nicht geprüft' : 'Signaturverfahren wird nicht unterstützt'); return r; }
    } catch (e) { r.problems.push('Signatur nicht prüfbar: ' + e.message); return r; }
    if (!r.valid) r.problems.push('Die Signatur passt nicht zum Zertifikat');
    // (3) Zertifikat zum Signaturzeitpunkt gültig?
    const when = r.time || sig.m || new Date();
    r.certValidAtTime = !!cert.from && when >= cert.from && when <= cert.to;
    if (!r.certValidAtTime) r.problems.push('Das Zertifikat war zum Signaturzeitpunkt nicht gültig');
    if (!r.wholeFile) r.problems.push('Nach dem Signieren wurden Änderungen angehängt');
    return r;
  }

  async function verify(bytes) {
    const forge = root.forge; if (!forge) throw new Error('Signatur-Baustein nicht geladen.');
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const sigs = find(u8), out = [];
    for (const s of sigs) { try { out.push(await verifyOne(forge, u8, s)); } catch (e) { out.push({ ...s, intact: false, valid: false, problems: ['Signatur nicht prüfbar: ' + e.message] }); } }
    // Nur die letzte Signatur darf das ganze Dokument abdecken; frühere decken ihre Fassung ab – „angehängt“ ist dort normal
    out.forEach((r, k) => { if (k < out.length - 1 && !r.wholeFile) { r.laterSigned = true; r.problems = r.problems.filter(p => !/angehängt/.test(p)); } });
    // Langzeitprüfdaten (PAdES B-LT): Document Security Store mit Sperrauskünften bzw. Sperrlisten eingebettet
    if (out.length && scanNames(u8, ['DSS']).has('DSS')) { const t = latin1(u8.subarray(Math.max(0, u8.length - 4000000))); const rev = /\/(OCSPs|CRLs)\s*\[/.test(t); out.forEach(r => { if (!r.docTimestamp && !r.usageRights) r.ltv = rev; }); }
    return out;
  }
  /* PDF-Namen (/ByteRange, /Highlight …) direkt in den Bytes suchen – ohne die ganze Datei in eine Zeichenkette zu wandeln
     (bei 100 MB sonst mehrere hundert MB Speicher). Ein Durchlauf für alle gesuchten Namen; ein Name zählt nur, wenn danach ein
     PDF-Trennzeichen folgt (/Highlight ja, /HighlightX nein). Liefert die Menge der gefundenen Namen ohne Schrägstrich. */
  const DELIM = new Uint8Array(256); for (const c of [0, 9, 10, 12, 13, 32, 40, 41, 60, 62, 91, 93, 123, 125, 47, 37]) DELIM[c] = 1;   // Leerraum und ( ) < > [ ] { } / %
  function scanNames(bytes, names) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), want = names.map(n => [n, Uint8Array.from(n, c => c.charCodeAt(0))]), hit = new Set();
    const first = new Uint8Array(256); for (const [, t] of want) first[t[0]] = 1;
    for (let i = u8.indexOf(47); i >= 0 && hit.size < want.length; i = u8.indexOf(47, i + 1)) {   // indexOf: im Browser gut doppelt so schnell wie eine eigene Schleife
      if (!first[u8[i + 1]]) continue;
      for (const [n, t] of want) {
        if (hit.has(n) || i + t.length + 1 > u8.length) continue;
        let k = 0; while (k < t.length && u8[i + 1 + k] === t[k]) k++;
        if (k === t.length && (i + 1 + k === u8.length || DELIM[u8[i + 1 + k]])) hit.add(n);
      }
    }
    return hit;
  }
  const hasSignature = bytes => scanNames(bytes, ['ByteRange']).has('ByteRange');
  /* Sichtbare Signaturfelder: Seite und Lage (Anteile der Seite, oben links, nach Drehung rot° im Uhrzeigersinn wie in pdf.js) –
     zugeordnet zur Signatur über ihren Bytebereich (range wie in find/verify). Damit führt ein Klick auf den Stempel auf der Seite
     zu genau dieser Signatur. Unsichtbare Felder (0×0) fehlen. rotOf(i) = Drehung der Seite i in der Anzeige. */
  async function fields(PL, bytes, rotOf = () => 0) {
    const doc = await PL.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }), ctx = doc.context, N = PL.PDFName.of, out = [];
    const num = o => o?.asNumber?.() ?? NaN;
    doc.getPages().forEach((pg, i) => {
      const ann = pg.node.lookup(N('Annots')); if (!(ann instanceof PL.PDFArray)) return;
      const box = pg.getCropBox(), rot = ((rotOf(i) % 360) + 360) % 360;
      for (const ref of ann.asArray()) {
        const a = ref instanceof PL.PDFRef ? ctx.lookup(ref) : ref; if (!(a instanceof PL.PDFDict)) continue;
        let ft = a.get(N('FT')), par = a.lookup(PL.PDFName.of('Parent')), v = a.lookup(N('V'));
        if (!ft && par instanceof PL.PDFDict) { ft = par.get(N('FT')); v = v || par.lookup(N('V')); }
        if (String(ft) !== '/Sig' || !(v instanceof PL.PDFDict)) continue;
        const br = v.lookup(N('ByteRange')), R = a.lookup(N('Rect'));
        if (!(br instanceof PL.PDFArray) || !(R instanceof PL.PDFArray)) continue;
        const r = R.asArray().map(num); if (r.length < 4 || r.some(n => !Number.isFinite(n))) continue;
        const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]);
        if (x1 - x0 < 1 || y1 - y0 < 1) continue;
        // ungedreht: u nach rechts, v von oben
        const f = { x: (x0 - box.x) / box.width, y: (box.y + box.height - y1) / box.height, w: (x1 - x0) / box.width, h: (y1 - y0) / box.height };
        out.push({ page: i, ...drehen(f, rot), range: br.asArray().map(num) });
      }
    });
    return out;
  }
  // Lage {x,y,w,h} (Anteile, oben links) einer ungedrehten Seite in die Anzeige mit Drehung rot° im Uhrzeigersinn (wie pdf.js) umrechnen –
  // die Anzeige ruft das bei jedem Zeichnen mit der aktuellen Drehung auf (Seite nach der Prüfung gedreht: Flächen sitzen trotzdem richtig)
  function drehen({ x, y, w, h }, rot = 0) {
    rot = ((rot % 360) + 360) % 360;
    if (rot === 90) return { x: 1 - y - h, y: x, w: h, h: w };
    if (rot === 180) return { x: 1 - x - w, y: 1 - y - h, w, h };
    if (rot === 270) return { x: y, y: 1 - x - w, w: h, h: w };
    return { x, y, w, h };
  }
  const sameRange = (a, b) => !!a && !!b && a.length === 4 && a.every((n, k) => n === b[k]);

  const api = { verify, trust, level, qcStatements, find, hasSignature, scanNames, fields, sameRange, drehen };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfVerify = api;
})(typeof self !== 'undefined' ? self : globalThis);
