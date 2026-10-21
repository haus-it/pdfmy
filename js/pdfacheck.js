// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PDF/A-Kurzprüfung (angelehnt an ISO 19005-2, PDF/A-2b) – lokal mit pdf-lib, wie „PDF/A prüfen“ bei PDF24 und Xodo.
   Prüft die häufigsten Ursachen, an denen Archive, Gerichte (beA) und Behörden PDFs ablehnen. Ersetzt keine vollständige
   Validierung (z. B. veraPDF), findet aber die typischen Fehler. check(bytes) → { claim, items: [{ id, ok, title, detail }] } */
(function (root) {
  'use strict';
  async function check(bytes) {
    const PL = root.PDFLib, N = n => PL.PDFName.of(n), items = [];
    const add = (id, ok, title, detail) => items.push({ id, ok, title, detail });
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let doc;
    try { doc = await PL.PDFDocument.load(u8, { ignoreEncryption: true, updateMetadata: false }); }
    catch (e) { return { claim: null, items: [{ id: 'open', ok: false, title: 'Datei lesbar', detail: 'Die Datei lässt sich nicht öffnen: ' + e.message }] }; }
    const cat = doc.catalog, ctx = doc.context, get = (d, k) => d && d.lookup ? d.lookup(N(k)) : undefined;
    const str = v => v == null ? '' : (v.decodeText ? v.decodeText() : String(v)).trim();
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 1024));

    // Kennung im XMP: pdfaid:part / conformance
    const meta = get(cat, 'Metadata'); let xmp = '';
    try { if (meta) xmp = new TextDecoder().decode(PL.decodePDFRawStream ? PL.decodePDFRawStream(meta).decode() : meta.getContents()); } catch { xmp = ''; }
    const part = (/pdfaid:part(?:>|="|\s*=\s*")\s*(\d)/.exec(xmp) || [])[1], conf = (/pdfaid:conformance(?:>|="|\s*=\s*")\s*([ABU])/i.exec(xmp) || [])[1];
    const claim = part ? `PDF/A-${part}${(conf || '').toLowerCase()}` : null;
    add('claim', claim ? true : false, 'Als PDF/A gekennzeichnet', claim ? `Die Datei gibt an: ${claim}.` : 'Keine PDF/A-Kennung in den Metadaten (XMP) – die Datei ist kein PDF/A.');
    add('header', /^%PDF-1\.[0-7]/.test(head) && /^%PDF-1\.\d\r?\n%[\x80-\xff]{4}/.test(head), 'Dateikopf nach Norm', /^%PDF-/.test(head) ? (/%[\x80-\xff]{4}/.test(head.slice(0, 40)) ? `Version ${head.slice(5, 8)}, Binärkennung vorhanden.` : 'Die Binärkennung in der zweiten Zeile fehlt (Hinweis für Archivsysteme).') : 'Kein gültiger PDF-Dateikopf.');

    // Verschlüsselung ist verboten
    const enc = ctx.trailerInfo.Encrypt;
    add('encrypt', !enc, 'Nicht verschlüsselt', enc ? 'Die Datei ist verschlüsselt bzw. passwortgeschützt – in PDF/A nicht erlaubt.' : 'In Ordnung.');

    // Farbprofil (OutputIntent)
    const oi = get(cat, 'OutputIntents'); let oiOk = false;
    if (oi instanceof PL.PDFArray) for (let i = 0; i < oi.size(); i++) { const o = oi.lookup(i); if (o instanceof PL.PDFDict && /GTS_PDFA/.test(String(get(o, 'S'))) && get(o, 'DestOutputProfile')) oiOk = true; }
    add('outputintent', oiOk, 'Farbprofil eingebettet (OutputIntent)', oiOk ? 'ICC-Profil vorhanden.' : 'Ohne eingebettetes Farbprofil sind geräteabhängige Farben (RGB/CMYK) nicht eindeutig.');

    // Schriften, Anmerkungen, Aktionen
    let fonts = 0; const notEmb = new Set(); let annBad = 0, annNoAp = 0, js = 0, launch = 0, media = 0, lzw = 0, transpGroup = 0;
    const visited = new Set();
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (visited.has(ref.toString())) continue; visited.add(ref.toString());
      const d = obj instanceof PL.PDFRawStream || obj instanceof PL.PDFStream ? obj.dict : obj;
      if (!(d instanceof PL.PDFDict)) continue;
      const type = String(get(d, 'Type')), sub = String(get(d, 'Subtype')), S = String(get(d, 'S'));
      const flt = get(d, 'Filter'); if (flt && /LZWDecode/.test(String(flt))) lzw++;
      if (S === '/JavaScript' || get(d, 'JS')) js++;
      if (S === '/Launch' || S === '/ImportData' || S === '/ResetForm' || S === '/Hide' || S === '/SetOCGState' || S === '/Rendition' || S === '/Trans' || S === '/GoTo3DView') launch++;
      if (/^\/(Movie|Sound|Screen|3D|RichMedia)$/.test(sub)) media++;
      if (type === '/Font' || /^\/(Type1|TrueType|Type0|MMType1|Type3)$/.test(sub) && get(d, 'BaseFont')) {
        if (sub === '/Type0' || sub === '/Type3' || !/^\/(Type1|TrueType|MMType1)$/.test(sub)) { if (sub !== '/Type0') continue; }
        fonts++;
        let desc = get(d, 'FontDescriptor');
        if (!desc && sub === '/Type0') { const df = get(d, 'DescendantFonts'); desc = df instanceof PL.PDFArray ? get(df.lookup(0), 'FontDescriptor') : null; }
        if (!desc || !(get(desc, 'FontFile') || get(desc, 'FontFile2') || get(desc, 'FontFile3'))) notEmb.add(str(get(d, 'BaseFont')).replace(/^\//, '') || '?');
      }
    }
    for (const page of doc.getPages()) {
      const annots = get(page.node, 'Annots');
      if (annots instanceof PL.PDFArray) for (let i = 0; i < annots.size(); i++) {
        const a = annots.lookup(i); if (!(a instanceof PL.PDFDict)) continue;
        const sub = String(get(a, 'Subtype')), F = Number(String(get(a, 'F') ?? 0));
        if (sub === '/Popup' || sub === '/Link') continue;
        if (!(F & 4) || (F & 1) || (F & 2) || (F & 32)) annBad++;   // Drucken muss gesetzt sein, nicht versteckt/unsichtbar
        const ap = get(a, 'AP'); if (!(ap instanceof PL.PDFDict) || !get(ap, 'N')) annNoAp++;
      }
      const g = get(page.node, 'Group'); if (g && String(get(g, 'S')) === '/Transparency' && !get(g, 'CS')) transpGroup++;
    }
    if (get(cat, 'OpenAction') && /JavaScript/.test(String(get(get(cat, 'OpenAction'), 'S')))) js++;
    const names = get(cat, 'Names');
    if (names && get(names, 'JavaScript')) js++;
    if (get(cat, 'AA')) js++;
    add('fonts', notEmb.size === 0, 'Alle Schriften eingebettet', fonts ? (notEmb.size ? `Nicht eingebettet: ${[...notEmb].slice(0, 5).join(', ')}${notEmb.size > 5 ? ' …' : ''}` : `${fonts} Schrift(en) eingebettet.`) : 'Keine Schriften (z. B. reiner Scan).');
    add('js', js === 0, 'Keine Skripte (JavaScript)', js ? `${js} Skript(e) gefunden – in PDF/A nicht erlaubt.` : 'In Ordnung.');
    add('actions', launch === 0 && media === 0, 'Keine verbotenen Aktionen oder Medien', launch || media ? `${launch ? launch + ' Aktion(en) (z. B. Programm starten, Formular zurücksetzen)' : ''}${launch && media ? ', ' : ''}${media ? media + ' Medienelement(e) (Video, Ton, 3D)' : ''}.` : 'In Ordnung.');
    add('annots', annBad === 0 && annNoAp === 0, 'Kommentare und Felder druckbar und sichtbar', annBad || annNoAp ? `${annBad ? annBad + ' Anmerkung(en) nicht druckbar oder versteckt' : ''}${annBad && annNoAp ? ', ' : ''}${annNoAp ? annNoAp + ' ohne Erscheinungsbild' : ''}.` : 'In Ordnung.');
    add('lzw', lzw === 0, 'Keine LZW-Komprimierung', lzw ? `${lzw} Datenstrom/-ströme mit LZW – in PDF/A nicht erlaubt.` : 'In Ordnung.');
    if (transpGroup) add('transparency', null, 'Transparenz mit Farbraum', `${transpGroup} Seite(n) mit Transparenzgruppe ohne Farbraum – nur mit Farbprofil erlaubt (Hinweis).`);

    // Eingebettete Dateien: PDF/A-2 erlaubt nur PDF/A-Anhänge
    const ef = names && get(names, 'EmbeddedFiles');
    if (ef) add('attach', claim === 'PDF/A-3b' || claim === 'PDF/A-3a' || claim === 'PDF/A-3u' ? true : null, 'Eingebettete Dateien', claim && claim.startsWith('PDF/A-3') ? 'PDF/A-3 erlaubt beliebige Anhänge (z. B. E-Rechnung).' : 'Die Datei enthält Anhänge – PDF/A-2 erlaubt nur Anhänge, die selbst PDF/A sind (Hinweis).');

    // Metadaten: Titel in Info und XMP gleich
    const title = (() => { try { return doc.getTitle() || ''; } catch { return ''; } })();
    if (claim && title) { const xt = (/<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(xmp) || [])[1] || ''; add('meta', xt.trim() === title.trim() ? true : null, 'Metadaten stimmig', xt.trim() === title.trim() ? 'Titel in Dokumenteigenschaften und XMP gleich.' : 'Titel in Dokumenteigenschaften und XMP unterscheiden sich (Hinweis).'); }
    return { claim, items };
  }
  const api = { check };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PdfACheck = api;
})(typeof self !== 'undefined' ? self : this);
