// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Vorabprüfung („Preflight“): Erfüllt die PDF die Vorgaben des Empfängers? Profile:
   – bea   Einreichung bei Gericht (beA/EGVP), ERVB 2025 zu § 5 ERVV – Bausteine aus js/bea.js
   – epa   elektronische Patientenakte: PDF/A, höchstens 25 MB, keine aktiven Inhalte (gematik, KBV)
   – bitv  barrierefreie PDF: PDF/UA-1, BITV 2.0 / EN 301 549 – Bausteine aus js/a11ycheck.js
   – gobd  Archiv nach GoBD: PDF/A, unverschlüsselt, maschinell auswertbar (Text), Fingerabdruck für die Verfahrensdokumentation
   – bewerbung  Bewerbung über Portal oder E-Mail (app-v359): Größe, ohne Kennwort, ohne aktive Inhalte, durchsuchbar, Dateiname, Metadaten
   – druck Druckerei (PDF/X-4, Kurzprüfung): Schriften, Bildauflösung, Endformat/Beschnitt, Farbraum, aktive Inhalte – ehrlich als Kurzprüfung
   Ergebnis je Punkt: { ok: true | false | null (Hinweis), title, detail }. Rein lokal; braucht PDFLib, BeaCheck, PdfACheck, A11yCheck.
   Kurzprüfung – ersetzt keine vollständige Validierung (z. B. veraPDF). */
(function (root) {
  'use strict';
  const PROFILES = {
    bea: { label: 'beA / Gericht (ERVB 2025)', basis: 'ERVB 2025 (BAnz AT 29.07.2025 B2) zu § 5 ERVV' },
    bewerbung: { label: 'Bewerbung (Portal oder E-Mail)', basis: 'Übliche Vorgaben von Bewerbungsportalen und Personalabteilungen: eine PDF, höchstens 5 MB (oft 2 MB), ohne Kennwort, ohne aktive Inhalte, Text maschinenlesbar für Bewerbermanagement-Systeme' },
    epa: { label: 'ePA (elektronische Patientenakte)', basis: 'gematik „ePA für alle“, KBV-Praxisnachrichten: PDF/A, höchstens 25 MB je Dokument' },
    bitv: { label: 'Barrierefrei (BITV 2.0 / PDF/UA)', basis: 'PDF/UA-1 (ISO 14289-1), BITV 2.0, EN 301 549 Kap. 10, BFSG' },
    gobd: { label: 'Archiv (GoBD, PDF/A)', basis: 'GoBD Rz. 58 ff., 118 ff. (Unveränderbarkeit, maschinelle Auswertbarkeit), PDF/A (ISO 19005-2)' },
    pdfa: { label: 'PDF/A – alle Prüfpunkte', basis: 'ISO 19005-2 (PDF/A-2b) – Kurzprüfung der häufigsten Ablehnungsgründe von Archiven, Gerichten und Behörden' },
    druck: { label: 'Druckerei (PDF/X-4, Kurzprüfung)', basis: 'ISO 15930-7 (PDF/X-4) – Kurzprüfung typischer Ablehnungsgründe von Druckereien: Schriften, Auflösung, Endformat und Beschnitt, Farbraum, aktive Inhalte. PDFMy erzeugt selbst kein PDF/X' },
  };
  const MM = 72 / 25.4;
  /* Druckerei: Seitenrahmen, Bildauflösung (aus der Platzierung im Seiteninhalt), Farbräume, Ausgabebedingung */
  function printFacts(lib) {
    const L = root.PDFLib, N = n => L.PDFName.of(n), out = { pages: [], images: [], intents: [], rgb: 0, cmyk: 0 };
    const box = (pg, k) => { const a = pg.node.lookup(N(k)); return a instanceof L.PDFArray ? a.asArray().map(x => x.asNumber?.() ?? +x.toString()) : null; };
    try { const oi = lib.catalog.lookup(N('OutputIntents')); if (oi instanceof L.PDFArray) for (const x of oi.asArray()) { const d = lib.context.lookup(x); out.intents.push(String(d?.get?.(N('S')) || '').replace('/', '')); } } catch { /* egal */ }
    const space = (img) => { const cs = img.lookup?.(N('ColorSpace')) ?? img.get(N('ColorSpace')); const s = cs instanceof L.PDFArray ? String(cs.get(0)) : String(cs || ''); if (/DeviceRGB|CalRGB/.test(s)) return 'rgb'; if (/DeviceCMYK/.test(s)) return 'cmyk'; if (/ICCBased/.test(s)) { const n = lib.context.lookup(cs.get(1))?.dict?.get(N('N'))?.asNumber?.(); return n === 3 ? 'rgb' : n === 4 ? 'cmyk' : ''; } return ''; };
    lib.getPages().forEach((pg, i) => {
      const media = box(pg, 'MediaBox') || [0, 0, pg.getWidth(), pg.getHeight()];
      out.pages.push({ media, trim: box(pg, 'TrimBox'), art: box(pg, 'ArtBox'), bleed: box(pg, 'BleedBox') });
      // Bilder: Breite in Punkt aus der Matrix beim „Do“ (q/Q/cm im Seiteninhalt; Formulare/XObjects in XObjects nicht verfolgt)
      let xo; try { xo = pg.node.Resources()?.lookup(N('XObject')); } catch { xo = null; }
      if (!(xo instanceof L.PDFDict)) return;
      let text = '';
      try { const c = pg.node.Contents(); const streams = c instanceof L.PDFArray ? c.asArray().map(r => lib.context.lookup(r)) : [c]; for (const s of streams) if (s) text += new TextDecoder('latin1').decode(L.decodePDFRawStream(s).decode()) + '\n'; } catch { return; }
      const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
      let ctm = [1, 0, 0, 1, 0, 0]; const stack = [], nums = [];
      for (const tok of text.match(/\/[^\s/<>[\]()]+|[-+]?\d*\.?\d+|[A-Za-z'"*]+/g) || []) {
        if (/^[-+]?\d*\.?\d+$/.test(tok)) { nums.push(+tok); continue; }
        if (tok === 'q') stack.push(ctm); else if (tok === 'Q') ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (tok === 'cm' && nums.length >= 6) ctm = mul(nums.slice(-6), ctm);
        else if (tok === 'Do' && out._name) {
          const img = xo.lookup(N(out._name));
          if (img?.dict && String(img.dict.get(N('Subtype'))) === '/Image') {
            const w = img.dict.get(N('Width'))?.asNumber?.() || 0, h = img.dict.get(N('Height'))?.asNumber?.() || 0;
            const wPt = Math.hypot(ctm[0], ctm[1]), hPt = Math.hypot(ctm[2], ctm[3]);
            if (wPt > 1 && hPt > 1) out.images.push({ page: i + 1, dpi: Math.round(Math.min(w / (wPt / 72), h / (hPt / 72))), space: space(img.dict) });
          }
        }
        out._name = tok.startsWith('/') ? tok.slice(1) : null;
        if (!tok.startsWith('/')) nums.length = 0;
      }
    });
    delete out._name;
    for (const im of out.images) if (im.space === 'rgb') out.rgb++; else if (im.space === 'cmyk') out.cmyk++;
    return out;
  }
  const EPA_MAX = 25 * 1024 * 1024;
  const mb = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const fromBea = i => ({ ok: i.level === 'ok' ? true : i.level === 'fehler' ? false : null, title: i.text, detail: '' });

  /* bytes: die PDF, info: { name, pages, textPages } → { profile, ok, items, facts } */
  async function run(profile, bytes, info = {}) {
    const R = root, u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), items = [];
    const add = (ok, title, detail = '') => items.push({ ok, title, detail });
    const bea = await R.BeaCheck.checkPdf(u8, profile === 'bea' ? { name: info.name, pages: info.pages, textPages: info.textPages } : {});
    const f = bea.facts;
    // Titel aus der Datei selbst (das sehen ePA, Archiv und Screenreader) – sonst der Titel, den PDFMy beim Speichern setzen würde
    let docTitle = ''; try { docTitle = (await R.PDFLib.PDFDocument.load(u8, { ignoreEncryption: true, updateMetadata: false })).getTitle() || ''; } catch {}
    info = { ...info, title: docTitle.trim() || info.title || '' };
    if (profile === 'bea') items.push(...bea.items.map(fromBea));
    if (profile === 'epa' || profile === 'gobd') {
      const pa = await R.PdfACheck.check(u8);
      const claim = pa.claim || '', allowed = profile === 'epa' ? /^PDF\/A-[12]/.test(claim) : /^PDF\/A-[123]/.test(claim);
      add(!!claim && allowed, 'Als PDF/A gespeichert', claim ? `${claim}${allowed ? '' : profile === 'epa' ? ' – die ePA erwartet PDF/A-1 oder PDF/A-2' : ''}` : 'Keine PDF/A-Kennung – „Als PDF/A speichern“ wählen.');
      const bad = pa.items.filter(x => x.ok === false && x.id !== 'claim');
      add(bad.length === 0, 'PDF/A-Regeln eingehalten (Kurzprüfung)', bad.length ? bad.map(x => x.title).join('; ') : `${pa.items.filter(x => x.ok === true).length} Punkte erfüllt.`);
      add(!f.encrypted, 'Nicht verschlüsselt', f.encrypted ? (profile === 'gobd' ? 'Verschlüsselte Dateien sind für die Betriebsprüfung nicht maschinell auswertbar.' : 'Verschlüsselte Dateien lassen sich nicht in die ePA übernehmen.') : '');
      add(!f.js && !f.launch, 'Keine aktiven Inhalte (JavaScript, Programmaufrufe)', f.js || f.launch ? `${f.js + f.launch} gefunden.` : '');
    }
    if (profile === 'epa') {
      add(u8.length <= EPA_MAX, 'Größe höchstens 25 MB', `${mb(u8.length)}${u8.length > EPA_MAX ? ' – „Klein“ speichern oder teilen' : ''}`);
      add(!f.embedded && !f.media, 'Keine eingebetteten Dateien oder Medien', f.embedded || f.media ? 'Anhänge/Medien entfernen.' : '');
      add(info.title ? true : null, 'Titel gesetzt', info.title ? info.title : 'Ohne Titel zeigt die ePA nur den Dateinamen (Hinweis). Dokumenttyp und Autor setzt das Praxisverwaltungssystem beim Einstellen.');
    }
    if (profile === 'gobd') {
      if (info.pages) add(info.textPages >= info.pages ? true : null, 'Maschinell auswertbar (Text erkannt)', info.textPages >= info.pages ? 'Text auf allen Seiten – durchsuchbar.' : `${info.pages - info.textPages} von ${info.pages} Seite(n) ohne Text – Texterkennung empfohlen (Hinweis).`);
      add(info.title ? true : null, 'Titel/Beschreibung gesetzt', info.title || 'Titel erleichtert das Wiederfinden im Archiv (Hinweis).');
      if (f.signed) add(null, 'Digital signiert', 'Signierte Originale unverändert aufbewahren – jede Änderung macht die Signatur ungültig.');
      if (info.einvoice) add(null, 'E-Rechnung', 'Bei ZUGFeRD/XRechnung ist die XML-Datei das Original – unverändert mit aufbewahren (GoBD, § 14 UStG).');
    }
    if (profile === 'bewerbung') {
      const MB = 1024 * 1024;
      add(u8.length <= 5 * MB, 'Größe höchstens 5 MB', `${mb(u8.length)}${u8.length > 5 * MB ? ' – „Klein“ speichern; viele Portale lehnen größere Dateien ab' : ''}`);
      if (u8.length > 2 * MB && u8.length <= 5 * MB) add(null, 'Unter 2 MB empfohlen', 'Manche Portale und E-Mail-Postfächer nehmen nur 2 MB je Datei – „Klein“ speichern (Hinweis).');
      add(!f.encrypted, 'Ohne Kennwort', f.encrypted ? 'Personalabteilungen und Portale können geschützte Dateien oft nicht öffnen – ohne Kennwort speichern.' : '');
      add(!f.js && !f.launch && !f.embedded && !f.media, 'Keine aktiven Inhalte oder Dateianhänge', f.js || f.launch || f.embedded || f.media ? 'Skripte und eingebettete Dateien werden von Virenscannern der Unternehmen oft abgewiesen – entfernen.' : '');
      if (info.pages) add(info.textPages >= info.pages ? true : null, 'Text maschinenlesbar', info.textPages >= info.pages ? 'Text auf allen Seiten – Bewerbermanagement-Systeme können ihn auslesen.' : `${info.pages - info.textPages} von ${info.pages} Seite(n) ohne Text (Scans) – Texterkennung empfohlen, damit Systeme Zeugnisse und Lebenslauf lesen können (Hinweis).`);
      const nm = String(info.name || ''), okName = /^[A-Za-z0-9_.-]{1,80}\.pdf$/i.test(nm);
      if (nm) add(okName ? true : null, 'Dateiname ohne Umlaute und Leerzeichen', okName ? nm : `„${nm}“ – besser z. B. „${R.Bewerbung ? R.Bewerbung.fileName(info.person || '', '', R.ausgabeSprache ? R.ausgabeSprache() : 'de') : 'Bewerbung_Vorname_Nachname.pdf'}“ (Hinweis).`);
      let author = ''; try { author = (await R.PDFLib.PDFDocument.load(u8, { ignoreEncryption: true, updateMetadata: false })).getAuthor() || ''; } catch {}
      add(null, 'Titel und Autor in der Datei', `Titel: ${info.title || '–'} · Autor: ${author || '–'} – bitte prüfen, dass dort nichts von einer früheren Bewerbung oder einem anderen Arbeitgeber steht (Hinweis).`);
      if (info.pages > 12) add(null, 'Umfang', `${info.pages} Seiten – üblich sind Anschreiben, Lebenslauf und die wichtigsten Zeugnisse (Hinweis).`);
    }
    if (profile === 'pdfa') {   // vollständige PDF/A-Kurzprüfung (früher „PDF/A prüfen“): jeder Punkt einzeln
      const pa = await R.PdfACheck.check(u8);
      for (const x of pa.items) add(x.ok, x.title, x.detail);
    }
    if (profile === 'druck') {
      add(!f.fonts.length, 'Alle Schriften eingebettet', f.fonts.length ? `Nicht eingebettet: ${f.fonts.slice(0, 5).join(', ')}${f.fonts.length > 5 ? ' …' : ''} – die Druckerei setzt sonst eine Ersatzschrift ein. In PDFMy „Als PDF/A speichern“ bettet alle Schriften ein.` : '');
      add(!f.encrypted, 'Nicht verschlüsselt', f.encrypted ? 'PDF/X erlaubt keine Verschlüsselung – ohne Kennwort speichern.' : '');
      add(!f.js && !f.launch && !f.media, 'Keine aktiven Inhalte (JavaScript, Programmaufrufe, Medien)', f.js || f.launch || f.media ? `${f.js + f.launch + f.media} gefunden – in PDF/X nicht erlaubt.` : '');
      let lib = null; try { lib = await R.PDFLib.PDFDocument.load(u8, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }); } catch { /* oben schon gemeldet */ }
      if (lib) {
        const pf = printFacts(lib), ps = pf.pages;
        const inside = (b, m) => b[0] >= m[0] - 0.5 && b[1] >= m[1] - 0.5 && b[2] <= m[2] + 0.5 && b[3] <= m[3] + 0.5;
        const outside = ps.filter(p => (p.trim || p.art) && !inside(p.trim || p.art, p.media)).length;
        if (outside) add(false, 'Endformat liegt innerhalb der Seite', `${outside} Seite(n): Endformat (TrimBox) ragt über die Seite (MediaBox) hinaus.`);
        const noTrim = ps.filter(p => !p.trim && !p.art).length;
        add(noTrim ? null : true, 'Endformat (TrimBox) angegeben', noTrim ? `${noTrim} von ${ps.length} Seite(n) ohne Endformat – die Druckerei nimmt dann die Seitengröße als Endformat (Hinweis; PDF/X verlangt TrimBox).` : '');
        const bleedMm = ps.map(p => { const t = p.trim || p.art, b = p.bleed || p.media; return t ? Math.min(t[0] - b[0], t[1] - b[1], b[2] - t[2], b[3] - t[3]) / MM : 0; });
        const low = bleedMm.filter(x => x < 2.9).length;
        add(low ? null : true, 'Beschnitt (mind. 3 mm)', low ? `${low} Seite(n) ohne 3 mm Beschnitt – nur nötig, wenn Bilder oder Flächen bis an den Rand gehen (Hinweis).` : `${Math.round(Math.min(...bleedMm) * 10) / 10} mm`);
        const sizes = new Set(ps.map(p => { const b = p.trim || p.art || p.media; return Math.round((b[2] - b[0]) / MM) + '×' + Math.round((b[3] - b[1]) / MM); }));
        if (sizes.size > 1) add(null, 'Einheitliches Format', `Seiten in ${sizes.size} Formaten (${[...sizes].slice(0, 3).join(', ')} mm) – bei Druckaufträgen meist nicht gewollt.`);
        const coarse = pf.images.filter(im => im.dpi < 150), mid = pf.images.filter(im => im.dpi >= 150 && im.dpi < 300);
        if (pf.images.length) {
          add(!coarse.length, 'Bildauflösung mind. 150 dpi', coarse.length ? `${coarse.length} Bild(er) zu grob für den Druck, z. B. Seite ${coarse[0].page}: ${coarse[0].dpi} dpi.` : `${pf.images.length} Bild(er) geprüft.`);
          if (mid.length) add(null, 'Bildauflösung 300 dpi empfohlen', `${mid.length} Bild(er) unter 300 dpi, z. B. Seite ${mid[0].page}: ${mid[0].dpi} dpi – für Text und feine Linien reicht das oft nicht.`);
        }
        if (pf.rgb) add(null, 'Farbraum', `${pf.rgb} RGB-Bild(er) – PDF/X-4 erlaubt RGB mit Ausgabebedingung; die Druckerei rechnet in CMYK um, Farben können sich leicht ändern (Hinweis).`);
        const x = pf.intents.includes('GTS_PDFX');
        add(x ? true : null, 'Ausgabebedingung (PDF/X)', x ? 'PDF/X-Ausgabebedingung vorhanden.' : pf.intents.length ? `Nur ${pf.intents.join(', ')} – keine PDF/X-Ausgabebedingung. Viele Online-Druckereien nehmen die Datei trotzdem an; für PDF/X bitte mit dem Layoutprogramm erzeugen.` : 'Keine Ausgabebedingung – viele Online-Druckereien nehmen die Datei trotzdem an; für PDF/X bitte mit dem Layoutprogramm erzeugen.');
      }
    }
    if (profile === 'bitv') {
      const r = await R.A11yCheck.check(u8, { pages: info.pages, pagesWithText: info.textPages });
      // im Prüfprofil zählt die PDF/UA-Kennung als Pflicht (veraPDF: ISO 14289-1, Regel 5-1)
      for (const x of r) add(x.id === 'ua' && x.ok === null ? false : x.ok, x.title, x.detail);
    }
    const sha = await digest(u8);
    return { profile, ok: !items.some(i => i.ok === false), items, facts: { size: u8.length, version: f.version, pdfa: f.pdfa, sha256: sha } };
  }

  async function digest(u8) {
    const c = root.crypto?.subtle || (typeof require === 'function' ? require('node:crypto').webcrypto.subtle : null);
    if (!c) return '';
    return [...new Uint8Array(await c.digest('SHA-256', u8))].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /* Bericht als Blöcke für js/textpdf.js (Nachweis für Akte bzw. Verfahrensdokumentation) */
  function reportBlocks(res, { file = '', date = new Date(), app = 'PDFMy' } = {}) {
    const p = PROFILES[res.profile], sym = ok => ok === true ? '✓ erfüllt' : ok === false ? '✗ Fehler' : 'i Hinweis';
    const bad = res.items.filter(i => i.ok === false).length, hint = res.items.filter(i => i.ok === null).length;
    return [
      { type: 'h', level: 1, text: `Vorabprüfung: ${p.label}` },
      { type: 'p', text: `Datei: ${file}` },
      { type: 'p', text: `Geprüft am ${date.toLocaleString('de-DE')} mit ${app} (lokal, ohne Upload)` },
      { type: 'p', text: `Ergebnis: ${bad ? `${bad} Fehler` : 'keine Fehler'}${hint ? `, ${hint} Hinweis(e)` : ''}`, bold: true },
      res.items.some(i => i.detail)
        ? { type: 'table', head: true, rows: [['Ergebnis', 'Prüfpunkt', 'Einzelheiten'], ...res.items.map(i => [sym(i.ok), i.title, i.detail || ''])] }
        : { type: 'table', head: true, rows: [['Ergebnis', 'Prüfpunkt'], ...res.items.map(i => [sym(i.ok), i.title])] },
      { type: 'p', text: `Größe: ${mb(res.facts.size)} · PDF ${res.facts.version}${res.facts.pdfa ? ' (PDF/A)' : ''}` },
      { type: 'p', text: `SHA-256-Fingerabdruck der geprüften Datei: ${res.facts.sha256}` },
      { type: 'p', text: `Grundlage: ${p.basis}. Kurzprüfung der häufigsten Ablehnungsgründe – ersetzt keine vollständige Validierung.` },
    ];
  }

  const api = { PROFILES, run, reportBlocks, EPA_MAX };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Preflight = api;
})(typeof self !== 'undefined' ? self : globalThis);
