// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Digitale Signatur mit eigenem Zertifikat (.p12/.pfx) – lokal im Browser, ohne Server. Eigene Umsetzung nach den offenen Normen
   ISO 32000-2 (PDF-Signaturen) und ETSI EN 319 142 (PAdES, europäischer Standard, eIDAS): SubFilter ETSI.CAdES.detached,
   CMS mit SHA-256 und signiertem Attribut signing-certificate-v2 (PAdES-Baseline B-B); das PDF bleibt PDF/A.
   Signatur über Windows-Zertifikat/Signaturkarte (pdfmy Scan): CMS kommt vom Hilfsprogramm – ab pdfmy Scan 1.8.0 ebenfalls PAdES B-B
   (signer.pades), bei älteren Versionen weiter der ISO-32000-Bezeichner adbe.pkcs7.detached. „Filter“ ist der in ISO 32000 festgelegte Name des Standard-Prüfverfahrens.
   Bausteine: node-forge (Zertifikat lesen, signieren), pdf-lib (Signaturfeld). Auch in Node-Tests nutzbar. */
(function (root) {
  'use strict';
  // forge wird erst beim ersten Signieren geladen – darum bei jedem Aufruf nachsehen
  let forge, PL; const libs = (needForge = true) => { forge = root.forge; PL = root.PDFLib; if (needForge && !forge) throw new Error('Signatur-Baustein nicht geladen.'); };
  const SIG_HEX = 24576;   // Platz für die Signatur (12 KB: Zertifikatskette + Signatur)
  const bin = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47';   // id-aa-signingCertificateV2 (RFC 5035)
  /* SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
     ESSCertIDv2 ::= SEQUENCE { certHash OCTET STRING (SHA-256, Standard – ohne hashAlgorithm), issuerSerial { issuer GeneralNames, serialNumber } } */
  /* CMS SignedData (RFC 5652), „detached“, nach PAdES-Baseline B-B (ETSI EN 319 142-1 / 319 122-1):
     signierte Attribute content-type, message-digest, signing-certificate-v2 – kein signing-time (Zeitpunkt steht in /M). */
  function cadesDetached(data, signer) {
    const A = forge.asn1, T = A.Type, U = A.Class.UNIVERSAL, O = forge.pki.oids;
    const seq = v => A.create(U, T.SEQUENCE, true, v), set = v => A.create(U, T.SET, true, v), oid = o => A.create(U, T.OID, false, A.oidToDer(o).getBytes());
    const algSha256 = seq([oid(O.sha256), A.create(U, T.NULL, false, '')]);
    const attr = (o, v) => seq([oid(o), set([v])]);
    const digest = forge.md.sha256.create().update(data).digest().getBytes();
    // DER: Elemente eines SET OF nach ihrer Kodierung sortieren
    const attrs = [attr(O.contentType, oid(O.data)), attr(O.messageDigest, A.create(U, T.OCTETSTRING, false, digest)), attr(OID_SIGNING_CERT_V2, essCertV2(signer.cert))]
      .map(a => ({ a, d: A.toDer(a).getBytes() })).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0).map(x => x.a);
    const signedAttrsDer = A.toDer(set(attrs)).getBytes();   // signiert wird die Kodierung als SET (Tag 0x31)
    const md = forge.md.sha256.create(); md.update(signedAttrsDer);
    const signature = signer.key.sign(md);
    const certAsn = c => forge.pki.certificateToAsn1(c);
    const signerInfo = seq([
      A.create(U, T.INTEGER, false, '\x01'),
      seq(issuerAndSerial(signer.cert)),   // IssuerAndSerialNumber – byte-genau aus dem Zertifikat
      algSha256,
      A.create(A.Class.CONTEXT_SPECIFIC, 0, true, attrs),   // [0] IMPLICIT SignedAttributes
      seq([oid(O.rsaEncryption), A.create(U, T.NULL, false, '')]),
      A.create(U, T.OCTETSTRING, false, signature),
    ]);
    const signedData = seq([
      A.create(U, T.INTEGER, false, '\x01'),
      set([algSha256]),
      seq([oid(O.data)]),   // eContent fehlt: „detached“
      A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [signer.cert, ...signer.chain].map(certAsn)),   // [0] IMPLICIT certificates
      set([signerInfo]),
    ]);
    return A.toDer(seq([oid(O.signedData), A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [signedData])])).getBytes();
  }
  // Aussteller (Name) und Seriennummer genau so, wie sie im Zertifikat kodiert sind – nur dann findet jede Prüfsoftware das Zertifikat
  function issuerAndSerial(cert) {
    const A = forge.asn1, tbs = cert.tbsCertificate || forge.pki.certificateToAsn1(cert).value[0];
    const k = tbs.value[0].tagClass === A.Class.CONTEXT_SPECIFIC ? 1 : 0;   // [0] version vorhanden?
    return [A.copy(tbs.value[k + 2]), A.copy(tbs.value[k])];   // issuer, serialNumber
  }
  function essCertV2(cert) {
    const A = forge.asn1, T = A.Type, U = A.Class.UNIVERSAL;
    const der = A.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const hash = forge.md.sha256.create().update(der).digest().getBytes();
    const [issuer, serial] = issuerAndSerial(cert);
    const issuerSerial = A.create(U, T.SEQUENCE, true, [A.create(U, T.SEQUENCE, true, [A.create(A.Class.CONTEXT_SPECIFIC, 4, true, [issuer])]), serial]);
    return A.create(U, T.SEQUENCE, true, [A.create(U, T.SEQUENCE, true, [A.create(U, T.SEQUENCE, true, [A.create(U, T.OCTETSTRING, false, hash), issuerSerial])])]);
  }

  /* Zertifikatsdatei öffnen: Schlüssel, Zertifikat (passend zum Schlüssel) und Kette */
  function readP12(bytes, password) {
    libs();
    let p12;
    try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin(bytes)), false, password); }
    catch (e) { throw new Error(/mac|password|invalid/i.test(e.message) ? 'Passwort falsch oder Datei beschädigt.' : 'Die Datei ist kein Zertifikat im Format .p12/.pfx.'); }
    const O = forge.pki.oids;
    const keys = [...(p12.getBags({ bagType: O.pkcs8ShroudedKeyBag })[O.pkcs8ShroudedKeyBag] || []), ...(p12.getBags({ bagType: O.keyBag })[O.keyBag] || [])].map(b => b.key).filter(Boolean);
    const certs = (p12.getBags({ bagType: O.certBag })[O.certBag] || []).map(b => b.cert).filter(Boolean);
    if (!keys.length) throw new Error('In der Datei ist kein privater Schlüssel enthalten.');
    if (!certs.length) throw new Error('In der Datei ist kein Zertifikat enthalten.');
    const key = keys[0];
    const cert = certs.find(c => c.publicKey && c.publicKey.n && key.n && c.publicKey.n.equals(key.n)) || certs[0];
    const attr = (c, n) => c.subject.getField(n)?.value || '';
    return {
      key, cert, chain: certs.filter(c => c !== cert),
      name: attr(cert, 'CN') || attr(cert, 'O') || 'Unbekannt',
      email: attr(cert, 'E') || '',
      issuer: cert.issuer.getField('CN')?.value || cert.issuer.getField('O')?.value || '',
      selfSigned: cert.isIssuer(cert),
      notBefore: cert.validity.notBefore, notAfter: cert.validity.notAfter,
    };
  }

  /* PDF signieren. signer = readP12(...); o: { reason, location, contact } */
  /* signer: aus readP12 (Schlüssel im Browser) – oder { name, notAfter, pades, cms: async bytes → CMS-DER } (z. B. Windows-Zertifikat/Signaturkarte über pdfmy Scan) */
  async function signPdf(pdfBytes, signer, o = {}) {
    libs(!signer.cms);
    const now = new Date();
    if (now > signer.notAfter) throw new Error(`Das Zertifikat ist am ${typeof I18N !== 'undefined' && I18N.fmtDate ? I18N.fmtDate(signer.notAfter) : signer.notAfter.toLocaleDateString('de-DE')} abgelaufen.`);
    // Schon signiert (andere Person): neue Signatur ANHÄNGEN (inkrementelles Update) – die vorhandenen Bytes bleiben unverändert,
    // damit frühere Signaturen gültig bleiben. Sonst wie bisher: Datei neu schreiben.
    const already = bin(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes)).includes('/ByteRange');
    const out = already ? await appendSigField(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes), signer, o, now) : await newSigField(pdfBytes, signer, o, now);
    return finishSig(out, signer);
  }
  function sigDict(ctx, signer, o, now) {
    return ctx.obj({
      Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: signer.cms && !signer.pades ? 'adbe.pkcs7.detached' : 'ETSI.CAdES.detached',
      ByteRange: [0, 1111111111, 2222222222, 3333333333],
      Contents: PL.PDFHexString.of('0'.repeat(SIG_HEX)),
      M: PL.PDFString.fromDate(now), Name: PL.PDFHexString.fromText(signer.name),
      ...(o.reason ? { Reason: PL.PDFHexString.fromText(o.reason) } : {}),
      ...(o.location ? { Location: PL.PDFHexString.fromText(o.location) } : {}),
      ...(o.contact ? { ContactInfo: PL.PDFHexString.fromText(o.contact) } : {}),
    });
  }
  /* Inkrementelles Update (ISO 32000, 7.5.6): neue Objekte (Signatur, Feld) und geänderte (Seite/Annots, AcroForm/Fields) hinten anhängen,
     mit eigenem Querverweis und /Prev auf den bisherigen. */
  async function appendSigField(orig, signer, o, now) {
    const doc = await PL.PDFDocument.load(orig, { updateMetadata: false, ignoreEncryption: false });
    const ctx = doc.context, page = doc.getPages()[0], N = PL.PDFName.of;
    const changed = new Map();   // Ref → Objekt (wird neu geschrieben)
    const sigRef = ctx.register(sigDict(ctx, signer, o, now));
    const count = (s => (s.match(/\/FT\s*\/Sig\b/g) || []).length)(bin(orig)) + 1;
    const widget = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], V: sigRef, T: PL.PDFHexString.fromText(`Signatur ${count} ${now.toISOString().slice(0, 19)}`), F: 132, P: page.ref });
    const wRef = ctx.register(widget);
    changed.set(sigRef, ctx.lookup(sigRef)); changed.set(wRef, widget);
    // Seite: Annots ergänzen (Array direkt in der Seite oder als eigenes Objekt)
    const annRaw = page.node.get(N('Annots'));
    if (annRaw instanceof PL.PDFRef) { const arr = ctx.lookup(annRaw); arr.push(wRef); changed.set(annRaw, arr); }
    else { if (annRaw instanceof PL.PDFArray) annRaw.push(wRef); else page.node.set(N('Annots'), ctx.obj([wRef])); changed.set(page.ref, page.node); }
    // AcroForm: Fields ergänzen, SigFlags 3
    const cat = doc.catalog, catRef = ctx.trailerInfo.Root;
    let formRaw = cat.get(N('AcroForm')), form, formRef = null;
    if (formRaw instanceof PL.PDFRef) { formRef = formRaw; form = ctx.lookup(formRaw); }
    else if (formRaw instanceof PL.PDFDict) form = formRaw;
    else { form = ctx.obj({}); formRef = ctx.register(form); cat.set(N('AcroForm'), formRef); changed.set(catRef, cat); }
    const fRaw = form.get(N('Fields'));
    if (fRaw instanceof PL.PDFRef) { const arr = ctx.lookup(fRaw); arr.push(wRef); changed.set(fRaw, arr); }
    else if (fRaw instanceof PL.PDFArray) fRaw.push(wRef); else form.set(N('Fields'), ctx.obj([wRef]));
    form.set(N('SigFlags'), PL.PDFNumber.of(3));
    if (formRef) changed.set(formRef, form); else changed.set(catRef, cat);
    // Objekte serialisieren und anhängen
    const enc = new TextEncoder(), parts = [], offsets = [];
    let pos = orig.length;
    const sep = orig[orig.length - 1] === 0x0a ? '' : '\n';
    if (sep) { parts.push(enc.encode(sep)); pos += 1; }
    const refs = [...changed.keys()].sort((a, b) => a.objectNumber - b.objectNumber);
    for (const r of refs) {
      const obj = changed.get(r), body = new Uint8Array(obj.sizeInBytes()); obj.copyBytesInto(body, 0);
      const head = enc.encode(`${r.objectNumber} ${r.generationNumber} obj\n`), tail = enc.encode('\nendobj\n');
      offsets.push([r, pos]); parts.push(head, body, tail); pos += head.length + body.length + tail.length;
    }
    const prev = +(/startxref\s+(\d+)\s*%%EOF\s*$/.exec(bin(orig.subarray(Math.max(0, orig.length - 2048)))) || [])[1];
    if (!Number.isFinite(prev)) throw new Error('Die Datei hat keinen gültigen Abschluss (startxref) – bitte zuerst ohne Signatur neu speichern.');
    let xref = 'xref\n';
    for (const [r, off] of offsets) xref += `${r.objectNumber} 1\n${String(off).padStart(10, '0')} ${String(r.generationNumber).padStart(5, '0')} n \n`;
    const ti = ctx.trailerInfo, size = ctx.largestObjectNumber + 1;
    const str = x => { const b = new Uint8Array(x.sizeInBytes()); x.copyBytesInto(b, 0); return new TextDecoder('latin1').decode(b); };
    xref += `trailer\n<< /Size ${size} /Root ${str(ti.Root)} /Prev ${prev}${ti.Info ? ' /Info ' + str(ti.Info) : ''}${ti.ID ? ' /ID ' + str(ti.ID) : ''} >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(enc.encode(xref));
    const total = parts.reduce((n, x) => n + x.length, orig.length), outB = new Uint8Array(total);
    outB.set(orig, 0); let at = orig.length; for (const x of parts) { outB.set(x, at); at += x.length; }
    return outB;
  }
  async function newSigField(pdfBytes, signer, o, now) {
    const doc = await PL.PDFDocument.load(pdfBytes, { updateMetadata: false });
    const ctx = doc.context, page = doc.getPages()[0];
    const sigRef = ctx.register(sigDict(ctx, signer, o, now));
    // Unsichtbares Signaturfeld (Rechteck 0×0, druckbar + gesperrt) – erlaubt in PDF/A
    const widget = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], V: sigRef, T: PL.PDFHexString.fromText('Signatur ' + now.toISOString().slice(0, 19)), F: 132, P: page.ref });
    const wRef = ctx.register(widget);
    const annots = page.node.lookup(PL.PDFName.of('Annots'));
    if (annots instanceof PL.PDFArray) annots.push(wRef); else page.node.set(PL.PDFName.of('Annots'), ctx.obj([wRef]));
    page.node.set(PL.PDFName.of('Tabs'), PL.PDFName.of('S'));   // PDF/UA: Tab-Reihenfolge nach Struktur auf Seiten mit Feldern
    let form = doc.catalog.lookup(PL.PDFName.of('AcroForm'));
    if (!(form instanceof PL.PDFDict)) { form = ctx.obj({}); doc.catalog.set(PL.PDFName.of('AcroForm'), ctx.register(form)); }
    const fields = form.lookup(PL.PDFName.of('Fields'));
    if (fields instanceof PL.PDFArray) fields.push(wRef); else form.set(PL.PDFName.of('Fields'), ctx.obj([wRef]));
    form.set(PL.PDFName.of('SigFlags'), PL.PDFNumber.of(3));   // signiert, nur Anhängen erlaubt
    return doc.save({ useObjectStreams: false });
  }
  // Bytebereiche eintragen und den Signaturwert (CMS) in den Platzhalter schreiben
  async function finishSig(out, signer) {

    // Platzhalter finden, Bytebereiche eintragen
    const s = bin(out), ph = '/ByteRange [ 0 1111111111 2222222222 3333333333 ]';
    const brAt = s.indexOf(ph); if (brAt < 0) throw new Error('Signatur-Platzhalter nicht gefunden.');
    const cStart = s.indexOf('<' + '0'.repeat(64), brAt > 0 ? s.lastIndexOf('obj', brAt) : 0);
    const cEnd = s.indexOf('>', cStart) + 1;
    if (cStart < 0 || cEnd - cStart !== SIG_HEX + 2) throw new Error('Signatur-Platzhalter beschädigt.');
    const br = `/ByteRange [ 0 ${cStart} ${cEnd} ${out.length - cEnd} ]`;
    if (br.length > ph.length) throw new Error('Datei zu groß für die Signatur.');
    const final = out.slice();
    for (let i = 0; i < ph.length; i++) final[brAt + i] = (br + ' '.repeat(ph.length - br.length)).charCodeAt(i);

    // CMS-Signatur über beide Bereiche (alles außer dem Signaturwert)
    let hex;
    if (signer.cms) {
      const covered = new Uint8Array(cStart + final.length - cEnd); covered.set(final.subarray(0, cStart)); covered.set(final.subarray(cEnd), cStart);
      const der = await signer.cms(covered); hex = Array.from(der, b => b.toString(16).padStart(2, '0')).join('');
    } else {
    const data = bin(final.subarray(0, cStart)) + bin(final.subarray(cEnd));
    hex = forge.util.bytesToHex(cadesDetached(data, signer));
    }
    if (hex.length > SIG_HEX) throw new Error('Zertifikatskette zu groß für den Signaturplatz.');
    const padded = hex + '0'.repeat(SIG_HEX - hex.length);
    for (let i = 0; i < padded.length; i++) final[cStart + 1 + i] = padded.charCodeAt(i);
    return final;
  }
  const api = { readP12, signPdf };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfSign = api;
})(typeof self !== 'undefined' ? self : globalThis);
