// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
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
  const SIG_HEX_TS = 49152;   // mit Zeitstempel (24 KB: zusätzlich Token und Zertifikate des Zeitstempeldienstes)
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

  /* Zeitstempel nach RFC 3161 als unsigniertes Attribut signature-time-stamp (RFC 3161 Anh. A, id-aa-timeStampToken) → PAdES-Baseline B-T
     (ETSI EN 319 142-1, 5.3). Der Zeitstempel gilt dem Hashwert des Signaturwerts; die Signatur selbst bleibt unverändert.
     fetchTs: async (TimeStampReq als Uint8Array) → TimeStampResp als Uint8Array (im Browser über pdfmy Scan, da Zeitstempeldienste kein CORS erlauben) */
  const OID_TST = '1.2.840.113549.1.9.16.2.14';
  // nur diese Dienste leitet pdfmy Scan weiter (gleiche Liste in Program.cs und pdfmy-scan.pl)
  const TSA = ['http://timestamp.digicert.com', 'http://timestamp.sectigo.com', 'http://zeitstempel.dfn.de', 'https://freetsa.org/tsr'];
  const u8 = s => Uint8Array.from(s, c => c.charCodeAt(0));
  function tsRequest(hashBin) {
    const A = forge.asn1, T = A.Type, U = A.Class.UNIVERSAL, O = forge.pki.oids;
    const seq = v => A.create(U, T.SEQUENCE, true, v);
    const r = forge.random.getBytesSync(8), nonce = String.fromCharCode((r.charCodeAt(0) & 0x7f) | 0x01) + r.slice(1);   // positive Zufallszahl
    const der = A.toDer(seq([
      A.create(U, T.INTEGER, false, '\x01'),
      seq([seq([A.create(U, T.OID, false, A.oidToDer(O.sha256).getBytes()), A.create(U, T.NULL, false, '')]), A.create(U, T.OCTETSTRING, false, hashBin)]),
      A.create(U, T.INTEGER, false, nonce),
      A.create(U, T.BOOLEAN, false, '\xff'),   // certReq: Zertifikat des Dienstes mitliefern (für die Prüfung)
    ])).getBytes();
    return { der, nonce };
  }
  // Antwort prüfen: Status „granted“, Hashwert und Nonce stimmen → TimeStampToken (ContentInfo) und Zeitpunkt
  function tsToken(respBin, hashBin, nonce) {
    const A = forge.asn1, resp = A.fromDer(respBin, { strict: false, decodeBitStrings: false });
    const st = resp.value[0].value[0].value.charCodeAt(0);
    if (st > 1 || !resp.value[1]) throw new Error('Der Zeitstempeldienst hat die Anfrage abgelehnt (Status ' + st + ').');
    const token = resp.value[1], sd = token.value[1].value[0], encap = sd.value[2];
    let content = encap.value[1].value[0]; if (content.constructed) content = { value: content.value.map(x => x.value).join('') };
    const tst = A.fromDer(content.value, { decodeBitStrings: false });
    const imprint = tst.value[2].value[1].value;
    if (imprint !== hashBin) throw new Error('Der Zeitstempel passt nicht zur Signatur.');
    const n = tst.value.find((x, i) => i > 4 && x.tagClass === A.Class.UNIVERSAL && x.type === A.Type.INTEGER);
    if (n && n.value.replace(/^\x00/, '') !== nonce.replace(/^\x00/, '')) throw new Error('Der Zeitstempel gehört nicht zu dieser Anfrage.');
    const g = tst.value[4].value, time = new Date(Date.UTC(+g.slice(0, 4), +g.slice(4, 6) - 1, +g.slice(6, 8), +g.slice(8, 10), +g.slice(10, 12), +g.slice(12, 14)));
    return { token, time };
  }
  async function addTimestamp(cmsBin, fetchTs) {
    libs();
    const A = forge.asn1, T = A.Type, U = A.Class.UNIVERSAL;
    const ci = A.fromDer(cmsBin, { strict: false, decodeBitStrings: false }), sd = ci.value[1].value[0], si = sd.value[sd.value.length - 1].value[0];
    const sig = [...si.value].reverse().find(v => v.tagClass === U && v.type === T.OCTETSTRING);
    if (!sig) throw new Error('Signaturwert nicht gefunden.');
    const hash = forge.md.sha256.create().update(sig.value).digest().getBytes();
    const q = tsRequest(hash);
    const { token, time } = tsToken(bin(await fetchTs(u8(q.der))), hash, q.nonce);
    const attr = A.create(U, T.SEQUENCE, true, [A.create(U, T.OID, false, A.oidToDer(OID_TST).getBytes()), A.create(U, T.SET, true, [token])]);
    si.value = si.value.filter(v => !(v.tagClass === A.Class.CONTEXT_SPECIFIC && v.type === 1));   // vorhandene unsignierte Attribute ersetzen
    si.value.push(A.create(A.Class.CONTEXT_SPECIFIC, 1, true, [attr]));
    return { der: A.toDer(ci).getBytes(), time };
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

  /* PDF signieren. signer = readP12(...); o: { reason, location, contact, tsa: fetchTs (Zeitstempel, siehe addTimestamp) } */
  /* signer: aus readP12 (Schlüssel im Browser) – oder { name, notAfter, pades, cms: async bytes → CMS-DER } (z. B. Windows-Zertifikat/Signaturkarte über pdfmy Scan) */
  async function signPdf(pdfBytes, signer, o = {}) {
    libs(!signer.cms || !!o.tsa);
    o.sigHex = o.tsa ? SIG_HEX_TS : SIG_HEX;   // Platz je Vorgang (nicht global: zwei Signaturen gleichzeitig dürfen sich nicht stören)
    const now = new Date();
    if (now > signer.notAfter) throw new Error(`Das Zertifikat ist am ${typeof I18N !== 'undefined' && I18N.fmtDate ? I18N.fmtDate(signer.notAfter) : signer.notAfter.toLocaleDateString('de-DE')} abgelaufen.`);
    // Schon signiert (andere Person): neue Signatur ANHÄNGEN (inkrementelles Update) – die vorhandenen Bytes bleiben unverändert,
    // damit frühere Signaturen gültig bleiben. Sonst wie bisher: Datei neu schreiben.
    // o.append: immer anhängen (z. B. Abschluss einer Unterschriftsanfrage – die empfangenen Fassungen müssen Byte für Byte erhalten bleiben)
    const already = o.append || bin(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes)).includes('/ByteRange');
    const out = already ? await appendSigField(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes), signer, o, now) : await newSigField(pdfBytes, signer, o, now);
    return finishSig(out, signer, o);
  }
  function sigDict(ctx, signer, o, now) {
    // Dokumentzeitstempel (ISO 32000-2, 12.8.5; ETSI EN 319 142-1, PAdES-DTS): kein Zertifikat einer Person, nur Zeitpunkt + Prüfwert
    if (o.docTs) return ctx.obj({ Type: 'DocTimeStamp', Filter: 'Adobe.PPKLite', SubFilter: 'ETSI.RFC3161', ByteRange: [0, 1111111111, 2222222222, 3333333333], Contents: PL.PDFHexString.of('0'.repeat(o.sigHex || SIG_HEX_TS)) });
    return ctx.obj({
      Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: signer.cms && !signer.pades ? 'adbe.pkcs7.detached' : 'ETSI.CAdES.detached',
      ByteRange: [0, 1111111111, 2222222222, 3333333333],
      Contents: PL.PDFHexString.of('0'.repeat(o.sigHex || SIG_HEX)),
      M: PL.PDFString.fromDate(now), Name: PL.PDFHexString.fromText(signer.name),
      ...(o.reason ? { Reason: PL.PDFHexString.fromText(o.reason) } : {}),
      ...(o.location ? { Location: PL.PDFHexString.fromText(o.location) } : {}),
      ...(o.contact ? { ContactInfo: PL.PDFHexString.fromText(o.contact) } : {}),
    });
  }
  /* Sichtbarer Signaturstempel („Digital signiert von …“ – wie in Acrobat): jeder Empfänger sieht in jedem PDF-Programm auf der Seite,
     wer signiert hat. o.look = { pageIndex (−1 = letzte Seite), at: [{ x, y }] (Anteile der Seite, linke obere Ecke, in Wunschreihenfolge),
     w, h (pt), draw: (w, h) → Inhaltsstrom (nur Pfade, keine Schrift – unproblematisch für PDF/A), alt: Text für Screenreader }.
     Der Stempel kommt an den ersten Platz ohne vorhandene Anmerkung (zweite Person: daneben); sonst bleibt die Signatur unsichtbar. */
  function lookRect(ctx, page, look) {
    if (!look || page.getRotation().angle % 360) return null;
    const box = page.getCropBox(), N = PL.PDFName.of, taken = [];
    const ann = page.node.lookup(N('Annots'));
    if (ann instanceof PL.PDFArray) for (const r of ann.asArray()) {
      const a = r instanceof PL.PDFRef ? ctx.lookup(r) : r, R = a?.lookup?.(N('Rect'));
      if (R instanceof PL.PDFArray) { const v = R.asArray().map(n => n.asNumber?.() ?? 0); if (Math.abs(v[2] - v[0]) > 1 && Math.abs(v[3] - v[1]) > 1) taken.push([Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])]); }
    }
    for (const c of look.at || []) {
      const x0 = box.x + c.x * box.width, y1 = box.y + box.height - c.y * box.height, r = [x0, y1 - look.h, x0 + look.w, y1];
      if (r[0] < box.x || r[1] < box.y || r[2] > box.x + box.width || r[3] > box.y + box.height) continue;
      if (taken.some(t => r[0] < t[2] + 4 && r[2] > t[0] - 4 && r[1] < t[3] + 4 && r[3] > t[1] - 4)) continue;
      return r.map(v => +v.toFixed(2));
    }
    return null;
  }
  // Erscheinungsbild an das Signaturfeld; in getaggten PDFs (PDF/UA) zusätzlich ein Strukturelement „Form“ mit Verweis auf das Feld.
  // touch(ref): bei inkrementellem Update geänderte Objekte merken. false = Struktur nicht sicher erweiterbar → unsichtbar lassen.
  function applyLook(ctx, cat, page, widget, wRef, look, rect, touch) {
    const N = PL.PDFName.of, rootRaw = cat.get(N('StructTreeRoot'));
    if (rootRaw && !widget.get(N('StructParent'))) {   // vorhandenes Feld ist schon in der Struktur verankert
      const root = rootRaw instanceof PL.PDFRef ? ctx.lookup(rootRaw) : rootRaw; if (!(root instanceof PL.PDFDict) || !(rootRaw instanceof PL.PDFRef)) return false;
      const ptRaw = root.get(N('ParentTree')), pt = ptRaw instanceof PL.PDFRef ? ctx.lookup(ptRaw) : ptRaw;
      const numsRaw = pt instanceof PL.PDFDict ? pt.get(PL.PDFName.of('Nums')) : null, nums = numsRaw instanceof PL.PDFRef ? ctx.lookup(numsRaw) : numsRaw;
      if (!(nums instanceof PL.PDFArray)) return false;   // verzweigter Elternbaum (Kids) – nicht anfassen
      const keys = nums.asArray().filter((_, k) => k % 2 === 0).map(n => n.asNumber?.() ?? 0), next = root.lookup(N('ParentTreeNextKey'));
      const key = Math.max(next instanceof PL.PDFNumber ? next.asNumber() : 0, keys.length ? Math.max(...keys) + 1 : 0);
      // Elternelement: das Element „Document“ (falls die Wurzel genau eines hat), sonst die Wurzel selbst
      const rk = root.get(N('K')); let parentRef = rootRaw, parent = root;
      if (rk instanceof PL.PDFRef) { const d = ctx.lookup(rk); if (d instanceof PL.PDFDict) { parentRef = rk; parent = d; } }
      const elRef = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Form', P: parentRef, Pg: page.ref, Alt: PL.PDFHexString.fromText(look.alt || ''), K: ctx.obj({ Type: 'OBJR', Obj: wRef, Pg: page.ref }) }));
      touch(elRef);
      const kRaw = parent.get(N('K')), kArr = kRaw instanceof PL.PDFRef ? ctx.lookup(kRaw) : kRaw;
      if (kArr instanceof PL.PDFArray) { kArr.push(elRef); touch(kRaw instanceof PL.PDFRef ? kRaw : parentRef); }
      else { parent.set(N('K'), kRaw ? ctx.obj([kRaw, elRef]) : ctx.obj([elRef])); touch(parentRef); }
      nums.push(PL.PDFNumber.of(key)); nums.push(elRef);
      touch(numsRaw instanceof PL.PDFRef ? numsRaw : ptRaw instanceof PL.PDFRef ? ptRaw : rootRaw);
      root.set(N('ParentTreeNextKey'), PL.PDFNumber.of(key + 1)); touch(rootRaw);
      widget.set(N('StructParent'), PL.PDFNumber.of(key));
    }
    const w = +(rect[2] - rect[0]).toFixed(2), h = +(rect[3] - rect[1]).toFixed(2);
    const ap = ctx.register(ctx.stream(look.draw(w, h), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h], Resources: ctx.obj({}) }));
    touch(ap);
    widget.set(N('Rect'), ctx.obj(rect)); widget.set(N('AP'), ctx.obj({ N: ap }));
    if (look.alt) { widget.set(N('TU'), PL.PDFHexString.fromText(look.alt)); widget.set(N('Contents'), PL.PDFHexString.fromText(look.alt)); }
    return true;
  }
  const lookPage = (doc, look) => { const ps = doc.getPages(), i = look?.pageIndex ?? -1; return ps[i >= 0 && i < ps.length ? i : ps.length - 1]; };

  /* Inkrementelles Update (ISO 32000, 7.5.6): neue Objekte (Signatur, Feld) und geänderte (Seite/Annots, AcroForm/Fields) hinten anhängen,
     mit eigenem Querverweis und /Prev auf den bisherigen. */
  async function appendSigField(orig, signer, o, now) {
    const doc = await PL.PDFDocument.load(orig, { updateMetadata: false, ignoreEncryption: false });
    const ctx = doc.context, N = PL.PDFName.of;
    // neue Objekte nie unter einer Nummer, die die Vorfassung als frei führt (/Size der letzten Querverweistabelle)
    const prevSize = Math.max(0, ...[...bin(orig.subarray(Math.max(0, orig.length - 4096))).matchAll(/\/Size\s+(\d+)/g)].map(m => +m[1]));
    if (prevSize - 1 > ctx.largestObjectNumber) ctx.largestObjectNumber = prevSize - 1;
    const ef = !o.docTs && o.useField !== false ? emptySigField(doc, o) : null;
    if (ef) {   // in das vorgesehene leere Signaturfeld (mitunterzeichnen in Verträgen mit zwei Feldern)
      const changed = new Map(), touch = r => changed.set(r, ctx.lookup(r)), sigRef = ctx.register(sigDict(ctx, signer, o, now));
      changed.set(sigRef, ctx.lookup(sigRef));
      fillSigField(ctx, doc.catalog, ef, sigRef, o, touch);
      const formRaw = doc.catalog.get(N('AcroForm')), form = formRaw instanceof PL.PDFRef ? ctx.lookup(formRaw) : formRaw;
      form.set(N('SigFlags'), PL.PDFNumber.of(3)); changed.set(formRaw instanceof PL.PDFRef ? formRaw : ctx.trailerInfo.Root, formRaw instanceof PL.PDFRef ? form : doc.catalog);
      return appendObjects(orig, ctx, changed);
    }
    const lp = o.look && !o.docTs ? lookPage(doc, o.look) : null, rect = lp && lookRect(ctx, lp, o.look), page = rect ? lp : doc.getPages()[0];
    const changed = new Map();   // Ref → Objekt (wird neu geschrieben)
    const sigRef = ctx.register(sigDict(ctx, signer, o, now));
    const count = (s => (s.match(/\/FT\s*\/Sig\b/g) || []).length)(bin(orig)) + 1;
    const widget = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], V: sigRef, T: PL.PDFHexString.fromText(`Signatur ${count} ${now.toISOString().slice(0, 19)}`), F: 132, P: page.ref });
    const wRef = ctx.register(widget);
    changed.set(sigRef, ctx.lookup(sigRef)); changed.set(wRef, widget);
    if (rect) o.lookShown = applyLook(ctx, doc.catalog, page, widget, wRef, o.look, rect, r => changed.set(r, ctx.lookup(r)));
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
    return appendObjects(orig, ctx, changed);
  }
  // Inkrementelles Update: geänderte bzw. neue Objekte (Map Ref → Objekt) samt Querverweistabelle an die unveränderte Datei anhängen
  function appendObjects(orig, ctx, changed) {
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
  /* Leeres Signaturfeld der Vorlage (app-v322; Vertrag, Behördenformular, „Hier signieren“): wie Acrobat dort hinein signieren statt
     ein eigenes Feld anzulegen – sonst bliebe das vorgesehene Feld leer. Alle Felder /FT /Sig ohne /V in Formularreihenfolge,
     je { field, fRef, widget, wRef, page, pageIndex, rect, name }. Gewählt wird o.field (Name, von PDFMy passend zur Person
     ermittelt – app-v323), sonst das erste freie Feld. */
  function emptySigFields(doc) {
    const out = [];
    const ctx = doc.context, N = PL.PDFName.of, form = doc.catalog.lookup(N('AcroForm'));
    if (!(form instanceof PL.PDFDict)) return out;
    const fields = form.lookup(N('Fields')); if (!(fields instanceof PL.PDFArray)) return out;
    const seen = new Set(), at = (ref) => ref instanceof PL.PDFRef ? ctx.lookup(ref) : ref;
    const pageOf = (widget, wRef) => {
      const p = widget.get(N('P')), pages = doc.getPages();
      if (p instanceof PL.PDFRef) { const hit = pages.find(pg => pg.ref === p || (pg.ref.objectNumber === p.objectNumber)); if (hit) return hit; }
      return pages.find(pg => { const a = pg.node.lookup(N('Annots')); return a instanceof PL.PDFArray && a.asArray().some(r => r instanceof PL.PDFRef && r.objectNumber === wRef.objectNumber); }) || null;
    };
    const walk = (ref, ft, depth) => {
      const d = at(ref); if (!(d instanceof PL.PDFDict) || seen.has(d) || depth > 20) return null; seen.add(d);
      const t = d.get(N('FT')) || ft, kids = d.lookup(N('Kids')), kidArr = kids instanceof PL.PDFArray ? kids.asArray() : [];
      const sub = kidArr.filter(k => at(k)?.get?.(N('T'))), widgets = kidArr.filter(k => !at(k)?.get?.(N('T')));
      for (const k of sub) walk(k, t, depth + 1);
      if (t !== N('Sig') && String(t) !== '/Sig') return null;
      if (d.get(N('V'))) return null;   // schon signiert
      const wRef = d.get(N('Subtype')) ? ref : widgets[0], widget = wRef ? at(wRef) : null;
      if (!(widget instanceof PL.PDFDict) || !(ref instanceof PL.PDFRef) || !(wRef instanceof PL.PDFRef)) return null;
      const page = pageOf(widget, wRef); if (!page) return null;
      const R = widget.lookup(N('Rect')), v = R instanceof PL.PDFArray ? R.asArray().map(n => n.asNumber?.() ?? 0) : [0, 0, 0, 0];
      const rect = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
      const T = d.lookup(N('T')), name = T ? (T.decodeText?.() ?? String(T)) : '';
      out.push({ field: d, fRef: ref, widget, wRef, page, pageIndex: doc.getPages().indexOf(page), rect, name });
      return null;
    };
    for (const f of fields.asArray()) walk(f, undefined, 0);
    return out;
  }
  const emptySigField = (doc, o = {}) => { const l = emptySigFields(doc); return (o.field != null && l.find(f => f.name === o.field)) || l[0] || null; };
  // Für die App: freie Signaturfelder einer PDF (Name, Seite ab 0, Rechteck in pt, Seitengröße) – zur Wahl des passenden Felds
  async function freeSigFields(pdfBytes) {
    libs(false);
    const doc = await PL.PDFDocument.load(pdfBytes, { updateMetadata: false, ignoreEncryption: true });
    return emptySigFields(doc).map(f => { const b = f.page.getCropBox(); return { name: f.name, page: f.pageIndex, rect: f.rect, box: [b.x, b.y, b.width, b.height] }; });
  }
  /* Passendes Feld zur Person (app-v323, besser als Acrobat: dort muss man das richtige Feld selbst anklicken): Teile des Namens
     aus dem Zertifikat im Feldnamen („Unterschrift Müller“) oder im Text direkt über, unter oder neben dem Feld („Max Müller,
     Geschäftsführer“). words: { [Seite]: [{ t, x, y, w, h }] } als Anteile der Seite, oben links. Liefert den Feldnamen oder null. */
  const normName = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  function pickSigField(fields, signerName, words = {}) {
    if (!fields?.length) return null;
    const skip = new Set(['dr', 'prof', 'med', 'dipl', 'ing', 'herr', 'frau', 'von', 'van', 'der', 'den', 'und', 'gmbh', 'mbh', 'e.v']);
    const toks = [...new Set(normName(signerName).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !skip.has(t)))];
    if (!toks.length) return null;
    const hits = (text, t) => new RegExp('(^|[^a-z0-9])' + t + '($|[^a-z0-9])').test(text);
    let best = null, bestScore = 0, tie = false;
    for (const f of fields) {
      const [bx, by, bw, bh] = f.box || [0, 0, 595.28, 841.89];
      const fx0 = (f.rect[0] - bx) / bw, fx1 = (f.rect[2] - bx) / bw, fy0 = 1 - (f.rect[3] - by) / bh, fy1 = 1 - (f.rect[1] - by) / bh;
      const near = (words[f.page] || []).filter(w => w.x < fx1 + 0.03 && w.x + w.w > fx0 - 0.03 && w.y + w.h > fy0 - 0.07 && w.y < fy1 + 0.06).map(w => w.t).join(' ');
      const fn = normName(f.name), nt = normName(near);
      const score = toks.reduce((s, t) => s + (hits(fn, t) ? 2 : 0) + (hits(nt, t) ? 1 : 0), 0);
      if (score > bestScore) { best = f.name; bestScore = score; tie = false; } else if (score && score === bestScore) tie = true;
    }
    return bestScore && !tie ? best : null;   // unklar (gleich gut) → wie bisher das erste freie Feld
  }
  // Signatur in das leere Feld eintragen; Stempel im Feldrechteck, wenn es groß genug ist und die Seite nicht gedreht ist
  function fillSigField(ctx, cat, ef, sigRef, o, touch) {
    const N = PL.PDFName.of;
    ef.field.set(N('V'), sigRef); touch(ef.fRef);
    const f = ef.widget.lookup(N('F')), flags = f instanceof PL.PDFNumber ? f.asNumber() : 0;
    ef.widget.set(N('F'), PL.PDFNumber.of((flags | 4 | 128) & ~(1 | 2 | 32))); touch(ef.wRef);   // druckbar, gesperrt, nicht versteckt
    const w = ef.rect[2] - ef.rect[0], h = ef.rect[3] - ef.rect[1];
    if (o.look && w >= 60 && h >= 18 && !(ef.page.getRotation().angle % 360)) o.lookShown = applyLook(ctx, cat, ef.page, ef.widget, ef.wRef, o.look, ef.rect.map(n => +n.toFixed(2)), touch);
    o.inField = ef.name || true;
  }
  async function newSigField(pdfBytes, signer, o, now) {
    const doc = await PL.PDFDocument.load(pdfBytes, { updateMetadata: false });
    const ctx = doc.context;
    const ef = !o.docTs && o.useField !== false ? emptySigField(doc, o) : null;
    if (ef) {
      fillSigField(ctx, doc.catalog, ef, ctx.register(sigDict(ctx, signer, o, now)), o, () => {});
      const form = doc.catalog.lookup(PL.PDFName.of('AcroForm')); form.set(PL.PDFName.of('SigFlags'), PL.PDFNumber.of(3));
      return doc.save({ useObjectStreams: false });
    }
    const lp = o.look && !o.docTs ? lookPage(doc, o.look) : null, rect = lp && lookRect(ctx, lp, o.look), page = rect ? lp : doc.getPages()[0];
    const sigRef = ctx.register(sigDict(ctx, signer, o, now));
    // Signaturfeld: mit Stempel sichtbar (o.look), sonst unsichtbar (Rechteck 0×0); druckbar + gesperrt – erlaubt in PDF/A
    const widget = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], V: sigRef, T: PL.PDFHexString.fromText('Signatur ' + now.toISOString().slice(0, 19)), F: 132, P: page.ref });
    const wRef = ctx.register(widget);
    if (rect) o.lookShown = applyLook(ctx, doc.catalog, page, widget, wRef, o.look, rect, () => {});
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
  async function finishSig(out, signer, o = {}) {
    const sigHex = o.sigHex || SIG_HEX;

    // Platzhalter finden, Bytebereiche eintragen
    const s = bin(out), ph = '/ByteRange [ 0 1111111111 2222222222 3333333333 ]';
    const brAt = s.indexOf(ph); if (brAt < 0) throw new Error('Signatur-Platzhalter nicht gefunden.');
    const cStart = s.indexOf('<' + '0'.repeat(64), brAt > 0 ? s.lastIndexOf('obj', brAt) : 0);
    const cEnd = s.indexOf('>', cStart) + 1;
    if (cStart < 0 || cEnd - cStart !== sigHex + 2) throw new Error('Signatur-Platzhalter beschädigt.');
    const br = `/ByteRange [ 0 ${cStart} ${cEnd} ${out.length - cEnd} ]`;
    if (br.length > ph.length) throw new Error('Datei zu groß für die Signatur.');
    const final = out.slice();
    for (let i = 0; i < ph.length; i++) final[brAt + i] = (br + ' '.repeat(ph.length - br.length)).charCodeAt(i);

    // CMS-Signatur über beide Bereiche (alles außer dem Signaturwert)
    let der;
    if (o.docTs) {   // Dokumentzeitstempel: der Dienst bestätigt den SHA-256 der abgedeckten Bytes; das TimeStampToken ist der Inhalt
      const md = forge.md.sha256.create(); md.update(bin(final.subarray(0, cStart))); md.update(bin(final.subarray(cEnd)));
      const hash = md.digest().getBytes(), q = tsRequest(hash), t = tsToken(bin(await o.docTs(u8(q.der))), hash, q.nonce);
      der = forge.asn1.toDer(t.token).getBytes(); o.tsTime = t.time;
    } else if (signer.cms) {
      const covered = new Uint8Array(cStart + final.length - cEnd); covered.set(final.subarray(0, cStart)); covered.set(final.subarray(cEnd), cStart);
      der = bin(await signer.cms(covered));
    } else der = cadesDetached(bin(final.subarray(0, cStart)) + bin(final.subarray(cEnd)), signer);
    if (o.tsa && !o.docTs) { const t = await addTimestamp(der, o.tsa); der = t.der; o.tsTime = t.time; }   // PAdES B-T
    const hex = Array.from(der, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    if (hex.length > sigHex) throw new Error('Zertifikatskette zu groß für den Signaturplatz.');
    const padded = hex + '0'.repeat(sigHex - hex.length);
    for (let i = 0; i < padded.length; i++) final[cStart + 1 + i] = padded.charCodeAt(i);
    return final;
  }
  /* Dokumentzeitstempel anhängen (PAdES-DTS): versiegelt den Stand der Datei ohne eigenes Zertifikat. Übertragen wird nur der
     SHA-256-Prüfwert. fetchTs wie bei signPdf (o.tsa). Liefert { bytes, time }. */
  async function docTimestamp(pdfBytes, fetchTs) {
    libs();
    const o = { append: true, docTs: fetchTs, sigHex: SIG_HEX_TS };
    const out = await appendSigField(pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes), { name: 'Dokumentzeitstempel' }, o, new Date());
    return { bytes: await finishSig(out, {}, o), time: o.tsTime };
  }
  /* ---------- Langzeitprüfdaten (PAdES B-LT / B-LTA, app-v311) ----------
     Nach der Signatur mit Zeitstempel: Zertifikate aus der letzten Signatur und ihrem Zeitstempel lesen, je Zertifikat die
     Sperrauskunft (OCSP, ersatzweise die Sperrliste) der ausstellenden Stelle holen und alles als /DSS (Document Security Store,
     ISO 32000-2 12.8.4.3) anhängen; darüber ein Dokumentzeitstempel (B-LTA). So bleibt die Signatur prüfbar, auch wenn das
     Zertifikat abgelaufen ist oder die Stelle ihren Dienst einstellt. fetchRev({ kind: 'ocsp'|'crl', url, data? }) → Antwort (Bytes),
     läuft über pdfmy Scan. Übertragen werden nur OCSP-Anfragen (Prüfwerte des Ausstellers, Seriennummer), nie das Dokument. */
  const O = { aia: '1.3.6.1.5.5.7.1.1', ocsp: '1.3.6.1.5.5.7.48.1', caIss: '1.3.6.1.5.5.7.48.2', crlDp: '2.5.29.31', sha1: '1.3.14.3.2.26', sd: '1.2.840.113549.1.7.2', tst: '1.2.840.113549.1.9.16.2.14' };
  const derOf = n => forge.asn1.toDer(n).getBytes();
  // Zertifikate (DER) aus einem CMS SignedData – auch aus dem eingebetteten Zeitstempel (unsignierte Attribute)
  function cmsCerts(der) {
    const out = [], walk = (ci) => {
      const sd = ci.value[1].value[0], certs = sd.value.find(x => x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 0);
      if (certs) for (const c of certs.value) out.push(derOf(c));
      const si = sd.value[sd.value.length - 1].value[0], ua = si && si.value.find(x => x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 1);
      if (ua) for (const at of ua.value) { try { if (forge.asn1.derToOid(at.value[0].value) === O.tst) walk(at.value[1].value[0]); } catch {} }
    };
    walk(forge.asn1.fromDer(der, { strict: false, parseAllBytes: false }));   // dahinter folgen die Füllnullen des Platzhalters
    return [...new Set(out)];
  }
  // Teile eines Zertifikats: Aussteller- und Inhabername (DER), Seriennummer, Schlüssel (BIT-STRING-Inhalt), Adressen für OCSP/CRL/Aussteller
  function certParts(der) {
    const c = forge.asn1.fromDer(der, { strict: false }), tbs = c.value[0].value, k = tbs[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC ? 1 : 0;
    const spki = tbs[k + 5], keyBits = derOf(spki.value[1]), hdr = keyBits.charCodeAt(1) < 0x80 ? 2 : 2 + (keyBits.charCodeAt(1) & 0x7f);
    const r = { der, serial: tbs[k].value, issuer: derOf(tbs[k + 2]), subject: derOf(tbs[k + 4]), key: keyBits.slice(hdr + 1), ocsp: [], crl: [], caIssuers: [] };
    const ext = tbs.find(x => x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 3);
    const uris = (n, acc) => { if (n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 6 && typeof n.value === 'string') acc.push(n.value); else if (Array.isArray(n.value)) n.value.forEach(x => uris(x, acc)); return acc; };
    if (ext) for (const e of ext.value[0].value) {
      const oid = forge.asn1.derToOid(e.value[0].value), val = forge.asn1.fromDer(e.value[e.value.length - 1].value, { strict: false });
      if (oid === O.aia) for (const ad of val.value) { const m = forge.asn1.derToOid(ad.value[0].value), u = uris(ad.value[1], [])[0]; if (u && /^https?:/i.test(u)) (m === O.ocsp ? r.ocsp : m === O.caIss ? r.caIssuers : []).push(u); }
      if (oid === O.crlDp) r.crl.push(...uris(val, []).filter(u => /^https?:/i.test(u)));
    }
    return r;
  }
  // OCSP-Anfrage (RFC 6960) für ein Zertifikat und seinen Aussteller: CertID mit SHA-1 (von allen Diensten unterstützt)
  function ocspRequest(cert, issuer) {
    const A = forge.asn1, T = A.Type, C = A.Class.UNIVERSAL, h = s => { const m = forge.md.sha1.create(); m.update(s); return m.digest().getBytes(); };
    const certId = A.create(C, T.SEQUENCE, true, [
      A.create(C, T.SEQUENCE, true, [A.create(C, T.OID, false, A.oidToDer(O.sha1).getBytes()), A.create(C, T.NULL, false, '')]),
      A.create(C, T.OCTETSTRING, false, h(cert.issuer)), A.create(C, T.OCTETSTRING, false, h(issuer.key)), A.create(C, T.INTEGER, false, cert.serial)]);
    return derOf(A.create(C, T.SEQUENCE, true, [A.create(C, T.SEQUENCE, true, [A.create(C, T.SEQUENCE, true, [A.create(C, T.SEQUENCE, true, [certId])])])]));
  }
  // OCSP-Antwort erfolgreich? (responseStatus 0) – und Zertifikate des Antwortdienstes für die Kette
  function ocspOk(der) {
    try {
      const r = forge.asn1.fromDer(der, { strict: false });
      if (r.value[0].value.charCodeAt(0) !== 0 || !r.value[1]) return null;
      const basic = forge.asn1.fromDer(r.value[1].value[0].value[1].value, { strict: false }), certs = basic.value.find(x => x.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && x.type === 0);
      return { certs: certs ? certs.value[0].value.map(derOf) : [] };
    } catch { return null; }
  }
  async function addLtv(pdfBytes, fetchRev) {
    libs();
    const orig = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes), s = bin(orig);
    const brs = [...s.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)]; if (!brs.length) throw new Error('Keine Signatur gefunden.');
    const [, l1, o2] = brs[brs.length - 1].slice(1).map(Number), hex = s.slice(l1 + 1, o2 - 1);
    const certs = cmsCerts(forge.util.hexToBytes(hex)).map(d => { try { return certParts(d); } catch { return null; } }).filter(Boolean);
    const all = new Map(certs.map(c => [c.der, c])), ocsps = [], crls = [], missing = [];
    const ask = async (kind, url, data) => { const r = await fetchRev({ kind, url, data: data && u8(data) }); return bin(r instanceof Uint8Array ? r : new Uint8Array(r)); };
    for (const c of certs) {
      if (c.issuer === c.subject) continue;   // Wurzel: keine Sperrauskunft
      let iss = [...all.values()].find(x => x.subject === c.issuer);
      if (!iss) for (const u of c.caIssuers) { try { const d = await ask('crl', u); iss = certParts(d); all.set(d, iss); break; } catch {} }
      let done = false;
      if (iss) for (const u of c.ocsp) {
        try { const d = await ask('ocsp', u, ocspRequest(c, iss)), ok = ocspOk(d); if (!ok) continue; ocsps.push(d); for (const x of ok.certs) if (!all.has(x)) { try { all.set(x, certParts(x)); } catch {} } done = true; break; } catch {}
      }
      if (!done) for (const u of c.crl) { try { crls.push(await ask('crl', u)); done = true; break; } catch {} }
      if (!done) missing.push(c);
    }
    if (!ocsps.length && !crls.length) throw new Error('Keine Sperrauskunft erreichbar.');
    // /DSS anhängen (vorhandenen Speicher ergänzen)
    const doc = await PL.PDFDocument.load(orig, { updateMetadata: false }), ctx = doc.context, N = PL.PDFName.of, changed = new Map();
    const prevSize = Math.max(0, ...[...bin(orig.subarray(Math.max(0, orig.length - 4096))).matchAll(/\/Size\s+(\d+)/g)].map(m => +m[1]));
    if (prevSize - 1 > ctx.largestObjectNumber) ctx.largestObjectNumber = prevSize - 1;
    const streams = list => list.map(d => { const ref = ctx.register(ctx.flateStream(u8(d))); changed.set(ref, ctx.lookup(ref)); return ref; });
    const cat = doc.catalog, catRef = ctx.trailerInfo.Root;
    let dss = cat.lookup(N('DSS')); const dssRef = cat.get(N('DSS')) instanceof PL.PDFRef ? cat.get(N('DSS')) : null;
    if (!(dss instanceof PL.PDFDict)) dss = ctx.obj({});
    const add = (key, refs) => { if (!refs.length) return; const a = dss.lookup(N(key)); if (a instanceof PL.PDFArray) { refs.forEach(r => a.push(r)); if (dss.get(N(key)) instanceof PL.PDFRef) changed.set(dss.get(N(key)), a); } else dss.set(N(key), ctx.obj(refs)); };
    add('Certs', streams([...all.keys()])); add('OCSPs', streams(ocsps)); add('CRLs', streams(crls));
    if (dssRef) changed.set(dssRef, dss); else { const r = ctx.register(dss); changed.set(r, dss); cat.set(N('DSS'), r); changed.set(catRef, cat); }
    return { bytes: appendObjects(orig, ctx, changed), ocsp: ocsps.length, crl: crls.length, certs: all.size, missing: missing.length };
  }
  const api = { readP12, signPdf, freeSigFields, pickSigField, addTimestamp, docTimestamp, addLtv, ocspRequest: (c, i) => (libs(), ocspRequest(c, i)), certParts: d => (libs(), certParts(d)), TSA };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfSign = api;
})(typeof self !== 'undefined' ? self : globalThis);
