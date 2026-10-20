// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* beA-/ERVV-Prüfung: Erfüllt eine PDF die technischen Vorgaben für die Einreichung bei Gericht?
   Grundlage: Elektronischer-Rechtsverkehr-Bekanntmachung 2025 (ERVB 2025, BAnz AT 29.07.2025 B2) zu § 5 ERVV:
   – PDF einschließlich PDF 2.0, PDF/A-1, PDF/A-2, PDF/UA; keine eingebundenen Objekte (Inline-Signaturen erlaubt);
     keine ausführbaren Anweisungen (JavaScript, auch nicht in Formularfeldern); Formularfelder ohne JavaScript und Hyperlinks erlaubt
   – Druckbarkeit; Dateiname höchstens 90 Zeichen einschließlich Endung, nur Buchstaben (inkl. ä ö ü ß), Ziffern, _ und -,
     Punkt nur vor der Endung; höchstens 1 000 Dateien und 200 MB je Nachricht
   – Durchsuchbarkeit ist seit 2022 keine Pflicht mehr, eingebettete Schriften „soll“ (orts- und systemunabhängige Darstellung): Hinweise
   Läuft im Browser und in Node (Tests); braucht PDFLib (pdf-lib). */
(function (root) {
  'use strict';
  const MAX_NAME = 90, MAX_BYTES = 200 * 1024 * 1024, MAX_FILES = 1000;

  /* Dateiname prüfen und einen zulässigen Vorschlag machen */
  function checkName(name) {
    const issues = [], full = String(name || '');
    const m = full.match(/^(.*?)(\.[A-Za-z0-9]{2,5})?$/), stem = m[1] || '', ext = m[2] || '.pdf';
    if (!m[2]) issues.push('Dateiendung .pdf fehlt');
    if (/\s/.test(stem)) issues.push('Leerzeichen im Dateinamen');
    if (/\./.test(stem)) issues.push('Punkt im Dateinamen (nur vor der Endung erlaubt)');
    const bad = [...new Set(stem.replace(/[A-Za-zÄÖÜäöüß0-9_\-.\s]/g, ''))];
    if (bad.length) issues.push('Nicht erlaubte Zeichen: ' + bad.join(' '));
    if (full.length > MAX_NAME) issues.push(`Zu lang: ${full.length} Zeichen (höchstens ${MAX_NAME})`);
    return { ok: !issues.length, issues, suggestion: safeName(stem) + ext.toLowerCase() };
  }
  // Zulässigen Namen bilden: Leerzeichen/Punkte → _, Akzente entfernen (é → e), sonst Unterstrich; ä ö ü ß bleiben
  function safeName(stem, maxStem = MAX_NAME - 4) {
    // Zeichenweise: deutsche Umlaute und ß bleiben, andere Akzente fallen weg (é → e, č → c)
    let s = [...String(stem || '').normalize('NFC')].map(c => /[äöüÄÖÜß]/.test(c) ? c : c.normalize('NFD').replace(/[̀-ͯ]/g, '')).join('')
      .replace(/[&+]/g, '_und_').replace(/[\s.]+/g, '_').replace(/[^A-Za-zÄÖÜäöüß0-9_-]/g, '_')
      .replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
    if (!s) s = 'Dokument';
    return s.length > maxStem ? s.slice(0, maxStem).replace(/[_-]+$/, '') : s;
  }

  /* PDF prüfen. Ergebnis: { ok, items: [{ level: 'ok'|'fehler'|'hinweis', key, text }], facts } */
  async function checkPdf(bytes, o = {}) {
    const L = root.PDFLib, items = [], add = (level, key, text) => items.push({ level, key, text });
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 1024)), ver = (head.match(/%PDF-(\d\.\d)/) || [])[1];
    const facts = { version: ver || '?', size: u8.length, js: 0, launch: 0, embedded: 0, media: 0, encrypted: false, fonts: [], pdfa: false, signed: false };
    if (!ver) { add('fehler', 'format', 'Keine PDF-Datei (Kopfzeile %PDF fehlt)'); return { ok: false, items, facts }; }
    if (+ver > 2.0) add('fehler', 'version', `PDF-Version ${ver} – zulässig bis PDF 2.0`);
    let lib;
    try { lib = await L.PDFDocument.load(u8, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }); }
    catch (e) { add('fehler', 'lesbar', 'PDF lässt sich nicht lesen: ' + e.message); return { ok: false, items, facts }; }
    facts.encrypted = !!lib.isEncrypted;
    const N = n => L.PDFName.of(n), name = v => (v instanceof L.PDFName ? v.asString() : String(v || '')).replace(/^\//, '');
    const MEDIA = new Set(['RichMedia', '3D', 'Movie', 'Sound', 'Screen']);
    // Alle Wörterbücher – auch direkt verschachtelte (z. B. JavaScript-Aktion im Katalog oder in einer Anmerkung)
    const dicts = [], walk = (o, depth) => {
      if (!o || depth > 12) return;
      if (o instanceof L.PDFDict) { dicts.push(o); for (const [, v] of o.entries()) if (!(v instanceof L.PDFRef)) walk(v, depth + 1); }
      else if (o instanceof L.PDFArray) { for (const v of o.asArray()) if (!(v instanceof L.PDFRef)) walk(v, depth + 1); }
      else if (o.dict instanceof L.PDFDict) walk(o.dict, depth);
    };
    for (const [, obj] of lib.context.enumerateIndirectObjects()) walk(obj, 0);
    for (const dict of dicts) {
      const S = name(dict.get(N('S'))), type = name(dict.get(N('Type'))), sub = name(dict.get(N('Subtype')));
      if (type === 'Font' && /^(Type1|MMType1|TrueType)$/.test(sub) && !dict.has(N('FontDescriptor'))) facts.fonts.push(name(dict.get(N('BaseFont'))) || '?');   // Standardschrift ohne Einbettung
      if (S === 'JavaScript' || dict.has(N('JS'))) facts.js++;
      if (S === 'Launch' || S === 'ImportData') facts.launch++;
      if (type === 'EmbeddedFile' || sub === 'FileAttachment' || type === 'Filespec' && dict.has(N('EF'))) facts.embedded++;
      if (MEDIA.has(sub) || S === 'Rendition' || S === 'Movie' || S === 'Sound') facts.media++;
      if (type === 'Sig' || name(dict.get(N('FT'))) === 'Sig' && dict.has(N('V'))) facts.signed = true;
      if (type === 'FontDescriptor' && !dict.has(N('FontFile')) && !dict.has(N('FontFile2')) && !dict.has(N('FontFile3'))) facts.fonts.push(name(dict.get(N('FontName'))) || '?');
    }
    // Namensbaum JavaScript im Katalog zählt auch ohne /S
    try { const names = lib.catalog.lookup(N('Names')); if (names instanceof L.PDFDict && names.has(N('JavaScript'))) facts.js++; if (names instanceof L.PDFDict && names.has(N('EmbeddedFiles'))) facts.embedded = Math.max(facts.embedded, 1); } catch { /* egal */ }
    try { const meta = lib.catalog.lookup(N('Metadata')); facts.pdfa = !!(meta && /pdfaid:part/.test(new TextDecoder('latin1').decode(meta.getContents ? meta.getContents() : new Uint8Array()))); } catch { /* egal */ }
    facts.fonts = [...new Set(facts.fonts.map(f => f.replace(/^[A-Z]{6}\+/, '')))];

    if (facts.encrypted) add('fehler', 'druck', 'Verschlüsselt bzw. Rechte eingeschränkt – Druckbarkeit ist nicht sichergestellt');
    else add('ok', 'druck', 'Druckbar, nicht verschlüsselt');
    if (facts.js) add('fehler', 'js', `Enthält JavaScript (${facts.js}×) – nicht zulässig`);
    if (facts.launch) add('fehler', 'launch', 'Enthält Befehle zum Starten von Programmen oder Laden von Daten – nicht zulässig');
    if (!facts.js && !facts.launch) add('ok', 'js', 'Keine ausführbaren Inhalte (JavaScript)');
    if (facts.embedded) add('fehler', 'anhang', `Enthält eingebettete Dateien/Anhänge (${facts.embedded}×) – nicht zulässig`);
    if (facts.media) add('fehler', 'medien', 'Enthält Multimedia- oder 3D-Inhalte – nicht zulässig');
    if (!facts.embedded && !facts.media) add('ok', 'anhang', 'Keine eingebetteten Dateien oder Medien');
    if (u8.length > MAX_BYTES) add('fehler', 'groesse', `Datei ${Math.round(u8.length / 1048576)} MB – höchstens 200 MB je Nachricht`);
    else add('ok', 'groesse', `Größe ${u8.length > 1048576 ? (u8.length / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(u8.length / 1024)) + ' KB'} (höchstens 200 MB je Nachricht)`);
    add(+ver <= 2.0 ? 'ok' : 'fehler', 'version', `PDF ${ver}${facts.pdfa ? ' (PDF/A)' : ''}`);
    if (facts.fonts.length) add('hinweis', 'schriften', `Nicht eingebettete Schrift(en): ${facts.fonts.slice(0, 4).join(', ')}${facts.fonts.length > 4 ? ' …' : ''} – die Darstellung kann beim Gericht abweichen`);
    if (facts.signed) add('hinweis', 'signatur', 'Digital signiert – Änderungen machen die Signatur ungültig');
    if (o.name != null) { const n = checkName(o.name); if (n.ok) add('ok', 'name', `Dateiname zulässig (${o.name.length} Zeichen)`); else n.issues.forEach(t => add('fehler', 'name', 'Dateiname: ' + t)); facts.nameSuggestion = n.suggestion; }
    if (o.textPages != null && o.pages) add(o.textPages >= o.pages ? 'ok' : 'hinweis', 'text', o.textPages >= o.pages ? 'Durchsuchbar (Text auf allen Seiten)' : `${o.pages - o.textPages} von ${o.pages} Seite(n) ohne Text – Texterkennung empfohlen (keine Pflicht)`);
    return { ok: !items.some(i => i.level === 'fehler'), items, facts };
  }

  /* Prüfung einer ganzen Sendung (mehrere Dateien) */
  function checkBatch(files) {
    const items = [], total = files.reduce((n, f) => n + (f.size || f.data?.length || 0), 0);
    if (files.length > MAX_FILES) items.push({ level: 'fehler', key: 'anzahl', text: `${files.length} Dateien – höchstens ${MAX_FILES} je Nachricht` });
    if (total > MAX_BYTES) items.push({ level: 'fehler', key: 'gesamt', text: `Zusammen ${Math.round(total / 1048576)} MB – höchstens 200 MB je Nachricht` });
    const names = files.map(f => f.name.toLowerCase()), dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length) items.push({ level: 'fehler', key: 'doppelt', text: 'Doppelte Dateinamen: ' + [...new Set(dup)].join(', ') });
    return { ok: !items.length, items, total };
  }

  const api = { checkName, safeName, checkPdf, checkBatch, MAX_NAME, MAX_BYTES, MAX_FILES };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BeaCheck = api;
})(typeof self !== 'undefined' ? self : this);
