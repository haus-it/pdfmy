// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Vorabprüfung („Preflight“): Erfüllt die PDF die Vorgaben des Empfängers? Profile:
   – bea   Einreichung bei Gericht (beA/EGVP), ERVB 2025 zu § 5 ERVV – Bausteine aus js/bea.js
   – epa   elektronische Patientenakte: PDF/A, höchstens 25 MB, keine aktiven Inhalte (gematik, KBV)
   – bitv  barrierefreie PDF: PDF/UA-1, BITV 2.0 / EN 301 549 – Bausteine aus js/a11ycheck.js
   – gobd  Archiv nach GoBD: PDF/A, unverschlüsselt, maschinell auswertbar (Text), Fingerabdruck für die Verfahrensdokumentation
   Ergebnis je Punkt: { ok: true | false | null (Hinweis), title, detail }. Rein lokal; braucht PDFLib, BeaCheck, PdfACheck, A11yCheck.
   Kurzprüfung – ersetzt keine vollständige Validierung (z. B. veraPDF). */
(function (root) {
  'use strict';
  const PROFILES = {
    bea: { label: 'beA / Gericht (ERVB 2025)', basis: 'ERVB 2025 (BAnz AT 29.07.2025 B2) zu § 5 ERVV' },
    epa: { label: 'ePA (elektronische Patientenakte)', basis: 'gematik „ePA für alle“, KBV-Praxisnachrichten: PDF/A, höchstens 25 MB je Dokument' },
    bitv: { label: 'Barrierefrei (BITV 2.0 / PDF/UA)', basis: 'PDF/UA-1 (ISO 14289-1), BITV 2.0, EN 301 549 Kap. 10, BFSG' },
    gobd: { label: 'Archiv (GoBD, PDF/A)', basis: 'GoBD Rz. 58 ff., 118 ff. (Unveränderbarkeit, maschinelle Auswertbarkeit), PDF/A (ISO 19005-2)' },
    pdfa: { label: 'PDF/A – alle Prüfpunkte', basis: 'ISO 19005-2 (PDF/A-2b) – Kurzprüfung der häufigsten Ablehnungsgründe von Archiven, Gerichten und Behörden' },
  };
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
    if (profile === 'pdfa') {   // vollständige PDF/A-Kurzprüfung (früher „PDF/A prüfen“): jeder Punkt einzeln
      const pa = await R.PdfACheck.check(u8);
      for (const x of pa.items) add(x.ok, x.title, x.detail);
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
