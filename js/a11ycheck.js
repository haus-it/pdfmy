// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Barrierefreiheit eines PDFs prüfen (angelehnt an PDF/UA-1 bzw. den Acrobat-Prüfbericht) – lokal mit pdf-lib.
   check(bytes, { pagesWithText, pages }) → [{ id, ok: true|false|null (Hinweis), title, detail }] */
(function (root) {
  'use strict';
  async function check(bytes, info = {}) {
    const PL = root.PDFLib, N = n => PL.PDFName.of(n), out = [];
    const add = (id, ok, title, detail) => out.push({ id, ok, title, detail });
    let doc;
    try { doc = await PL.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); }
    catch (e) { return [{ id: 'open', ok: false, title: 'Datei lesbar', detail: 'Die Datei lässt sich nicht öffnen: ' + e.message }]; }
    const cat = doc.catalog, ctx = doc.context, get = (d, k) => d && d.lookup ? d.lookup(N(k)) : undefined;
    const str = v => v == null ? '' : (v.decodeText ? v.decodeText() : String(v)).trim();

    const mark = get(cat, 'MarkInfo'), marked = mark && String(get(mark, 'Marked')) === 'true', tree = get(cat, 'StructTreeRoot');
    add('tagged', !!(marked && tree), 'Getaggtes PDF (Struktur für Screenreader)', marked && tree ? 'Strukturbaum vorhanden.' : 'Ohne Tags können Screenreader Überschriften, Absätze und Lesereihenfolge nicht erkennen.');
    const lang = str(get(cat, 'Lang'));
    add('lang', !!lang, 'Dokumentsprache festgelegt', lang ? `Sprache: ${lang}` : 'Ohne Sprachangabe liest der Screenreader mit falscher Aussprache vor.');
    const title = (() => { try { return doc.getTitle() || ''; } catch { return ''; } })(), vp = get(cat, 'ViewerPreferences'), showTitle = vp && String(get(vp, 'DisplayDocTitle')) === 'true';
    add('title', !!(title && showTitle), 'Titel vorhanden und wird angezeigt', title ? (showTitle ? `Titel: ${title}` : `Titel „${title}“ ist gesetzt, wird aber nicht in der Titelleiste angezeigt (DisplayDocTitle).`) : 'Ohne Titel sehen Screenreader-Nutzer nur den Dateinamen.');
    if (info.pages != null) {
      const t = info.pagesWithText || 0;
      add('text', t === info.pages, 'Text ist lesbar (keine reinen Bilder)', t === info.pages ? 'Alle Seiten enthalten echten Text.' : `${info.pages - t} von ${info.pages} Seite(n) sind nur Bilder – Texterkennung nötig.`);
    }
    // Abbildungen mit Alternativtext
    if (tree) {
      let figs = 0, noAlt = 0; const seen = new Set();
      (function walk(n, depth) {
        if (!n || depth > 60) return;
        if (n instanceof PL.PDFArray) { for (let i = 0; i < n.size(); i++) walk(n.lookup(i), depth + 1); return; }
        if (!(n instanceof PL.PDFDict) || seen.has(n)) return; seen.add(n);
        if (String(get(n, 'S')) === '/Figure') { figs++; if (!str(get(n, 'Alt')) && !str(get(n, 'ActualText'))) noAlt++; }
        walk(get(n, 'K'), depth + 1);
      })(get(tree, 'K'), 0);
      add('alt', noAlt === 0, 'Abbildungen haben Alternativtext', figs ? (noAlt ? `${noAlt} von ${figs} Abbildung(en) ohne Alternativtext.` : `${figs} Abbildung(en) beschrieben.`) : 'Keine Abbildungen gekennzeichnet.');
    }
    // Schriften eingebettet, Tab-Reihenfolge bei Seiten mit Feldern/Anmerkungen
    let fonts = 0, notEmb = new Set(), tabsBad = 0;
    for (const page of doc.getPages()) {
      const annots = get(page.node, 'Annots');
      if (annots instanceof PL.PDFArray && annots.size() && String(get(page.node, 'Tabs')) !== '/S') tabsBad++;
      const res = page.node.Resources?.() || get(page.node, 'Resources'), fd = res && get(res, 'Font');
      if (!(fd instanceof PL.PDFDict)) continue;
      for (const [k] of fd.entries()) {
        const f = fd.lookup(k); if (!(f instanceof PL.PDFDict)) continue; fonts++;
        const sub = String(get(f, 'Subtype'));
        if (sub === '/Type3') continue;
        let desc = get(f, 'FontDescriptor');
        if (!desc && sub === '/Type0') { const df = get(f, 'DescendantFonts'); desc = df instanceof PL.PDFArray ? get(df.lookup(0), 'FontDescriptor') : null; }
        if (!desc || !(get(desc, 'FontFile') || get(desc, 'FontFile2') || get(desc, 'FontFile3'))) notEmb.add(str(get(f, 'BaseFont')).replace(/^\//, '') || k.toString());
      }
    }
    if (fonts) add('fonts', notEmb.size === 0, 'Schriften eingebettet', notEmb.size ? `Nicht eingebettet: ${[...notEmb].slice(0, 5).join(', ')}` : `${fonts} Schrift(en) eingebettet.`);
    add('tabs', tabsBad === 0, 'Tab-Reihenfolge folgt der Struktur', tabsBad ? `${tabsBad} Seite(n) mit Feldern/Anmerkungen ohne Tab-Reihenfolge „Struktur“.` : 'In Ordnung.');
    // Schutz: Verschlüsselung darf Hilfsprogramme nicht aussperren
    const enc = ctx.trailerInfo.Encrypt;
    if (enc) { const ed = ctx.lookup(enc), P = ed ? Number(String(get(ed, 'P'))) : -1; add('security', (P & 512) !== 0, 'Zugriff für Hilfsprogramme erlaubt', (P & 512) ? 'Verschlüsselt, Screenreader-Zugriff erlaubt.' : 'Die Verschlüsselung sperrt Screenreader aus.'); }
    // PDF/UA-Kennung und Lesezeichen (Hinweise)
    const meta = get(cat, 'Metadata'); let xmp = '';
    try { if (meta) xmp = new TextDecoder().decode(PL.decodePDFRawStream ? PL.decodePDFRawStream(meta).decode() : meta.getContents()); } catch { xmp = ''; }
    add('ua', /pdfuaid:part\W+1|pdfuaid:part="1"/.test(xmp) ? true : null, 'Als PDF/UA gekennzeichnet', /pdfuaid/.test(xmp) ? 'PDF/UA-Kennung vorhanden.' : 'Keine PDF/UA-Kennung (Hinweis).');
    if (doc.getPageCount() > 20) add('outline', get(cat, 'Outlines') ? true : null, 'Lesezeichen bei langen Dokumenten', get(cat, 'Outlines') ? 'Lesezeichen vorhanden.' : `Bei ${doc.getPageCount()} Seiten helfen Lesezeichen bei der Navigation (Hinweis).`);
    return out;
  }
  const api = { check };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.A11yCheck = api;
})(typeof self !== 'undefined' ? self : globalThis);
