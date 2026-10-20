// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Posteingangsbuch: Einträge als CSV (Excel-tauglich: UTF-8 mit BOM, Semikolon) – ohne DOM, auch in Node-Tests nutzbar. */
(function (root) {
  'use strict';
  const COLS = [
    ['id', 'ID'], ['savedAt', 'Eingang'], ['date', 'Briefdatum'], ['sender', 'Absender'], ['type', 'Typ'], ['subject', 'Betreff'],
    ['deadline', 'Frist'], ['amount', 'Betrag'], ['reference', 'Aktenzeichen'], ['invoiceNo', 'Rechnungs-Nr.'], ['file', 'Datei'],
    ['pages', 'Seiten'], ['done', 'Erledigt'], ['by', 'Abgelegt von'], ['sha256', 'SHA-256'],
    ['assignee', 'Zuständig'], ['status', 'Status'], ['upd', 'Geändert'], ['inNo', 'Eingangs-Nr.'], ['retainMoved', 'Aussortiert'], ['wv', 'Wiedervorlage'], ['akte', 'Akte'], ['ver', 'Version'], ['seal', 'Siegel'], ['tags', 'Schlagwörter'], ['fields', 'Eigene Felder'], ['sigreq', 'Unterschriftsanfrage'], ['sigs', 'Unterschriften'],
  ];
  // Fortlaufende Eingangsnummer je Jahr: 2026-0001, 2026-0002 … (höchste vergebene + 1, auch aus dem Team-Buch)
  function nextInNo(entries, year, last = '') {
    let max = 0;
    for (const v of [...entries.map(e => e.inNo), last]) { const m = String(v || '').match(/^(\d{4})-(\d+)$/); if (m && +m[1] === year) max = Math.max(max, +m[2]); }
    return `${year}-${String(max + 1).padStart(4, '0')}`;
  }
  // Status: offen → in Arbeit → bezahlt/erledigt ("Erledigt" bleibt als Ja/Nein-Spalte für ältere Dateien und Excel-Filter)
  const STATUS = ['offen', 'in Arbeit', 'bezahlt', 'erledigt'];
  const isClosed = e => e.status === 'bezahlt' || e.status === 'erledigt';
  function norm(e) {
    const st = String(e.status || '').trim().toLowerCase();
    e.status = STATUS.find(x => x.toLowerCase() === st) || (e.done ? 'erledigt' : 'offen');
    e.done = isClosed(e);
    return e;
  }
  const q = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function toCsv(entries) {
    return '﻿' + [COLS.map(c => c[1]).join(';'), ...entries.map(e => norm({ ...e })).map(e => COLS.map(([k]) => q(k === 'done' ? (e.done ? 'ja' : '') : e[k])).join(';'))].join('\r\n') + '\r\n';
  }

  // CSV lesen (auch mit Anführungszeichen, Zeilenumbrüchen in Feldern, BOM, Komma- oder Semikolon-Trennung)
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim());
    const keyOf = h => (COLS.find(c => c[1] === h || c[0] === h) || [])[0];
    return rows.filter(r => r.some(c => c.trim())).map(r => {
      const e = {};
      head.forEach((h, i) => { const k = keyOf(h); if (k) e[k] = r[i] ?? ''; });
      e.done = /^(ja|x|1|true|erledigt)$/i.test(String(e.done || '').trim());
      e.pages = e.pages ? +e.pages || e.pages : '';
      return norm(e);
    });
  }

  // Zusammenführen (Team-Datei + eigene Einträge): gleiche ID → die zuletzt geänderte Fassung gewinnt;
  // ohne Änderungszeit (ältere Einträge) gewinnt "erledigt"
  function merge(a, b) {
    const m = new Map();
    for (const e0 of [...a, ...b]) {
      const e = norm({ ...e0 }), k = e.id || (e.savedAt + '|' + e.file), old = m.get(k);
      if (!old) { m.set(k, e); continue; }
      if (old.upd || e.upd) m.set(k, String(e.upd || '') >= String(old.upd || '') ? { ...old, ...e } : { ...e, ...old });
      else m.set(k, norm({ ...old, ...e, status: isClosed(old) && !isClosed(e) ? old.status : e.status }));
    }
    return [...m.values()].sort((x, y) => String(y.savedAt).localeCompare(String(x.savedAt)));
  }

  // Fristen: offene Einträge mit Frist, sortiert; Status überfällig / dringend (≤ 7 Tage) / später
  function deadlines(entries, today = new Date()) {
    const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());   // lokaler Kalendertag (nicht UTC)
    return entries.filter(e => e.deadline && !isClosed(norm({ ...e }))).map(e => {
      const days = Math.round((new Date(e.deadline + 'T00:00:00Z') - t) / 86400000);
      return { ...e, days, state: days < 0 ? 'overdue' : days <= 7 ? 'soon' : 'later' };
    }).sort((a, b) => a.days - b.days);
  }

  // Wem gehört der Brief? Kürzel/Name ohne Groß-/Kleinschreibung und Leerzeichen
  const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const mine = (e, me) => same(e.assignee, me);

  /* Weiterleiten per E-Mail: Betreff und Text mit allen Briefdaten und dem Ablagepfad */
  function forwardMail(e, { to = '', note = '', from = '', folder = '' } = {}) {
    const de = iso => iso ? iso.split('-').reverse().join('.') : '';
    const subject = `Post für dich: ${[e.type, e.sender].filter(Boolean).join(' – ') || e.file}${e.deadline ? ` (Frist ${de(e.deadline)})` : ''}`;
    const lines = [note, note ? '' : null, `${e.type || 'Brief'} von ${e.sender || 'unbekannt'}`, e.subject && `Betreff: ${e.subject}`, e.date && `Briefdatum: ${de(e.date)}`,
      e.deadline && `Frist: ${de(e.deadline)}`, e.amount && `Betrag: ${e.amount}`, (e.reference || e.invoiceNo) && `Zeichen: ${e.reference || e.invoiceNo}`,
      e.file && `Ablage: ${folder ? folder + '\\' : ''}${e.file}`, from ? '' : null, from && `Viele Grüße\n${from}`];
    const body = lines.filter(x => typeof x === 'string').join('\n').trim();
    return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /* ---------- Export für den Steuerberater ---------- */
  // Belegarten, die standardmäßig in die Buchhaltung gehören
  const TAX_TYPES = ['Rechnung', 'Gutschrift', 'Mahnung', 'Bescheid', 'Kontoauszug', 'Quittung', 'Beleg'];
  const belegDate = e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : String(e.savedAt || '').slice(0, 10);
  // Einträge eines Monats ("2026-09"), optional nur bestimmte Typen; sortiert nach Belegdatum
  function taxSelect(entries, month, types) {
    return entries.filter(e => belegDate(e).startsWith(month) && e.file && (!types || types.includes(e.type || 'Brief')))
      .sort((a, b) => belegDate(a).localeCompare(belegDate(b)) || String(a.sender || '').localeCompare(String(b.sender || ''), 'de'));
  }
  // "1.520,24 EUR" → { value: "1520,24", cur: "EUR" } (Excel rechnet mit dem Komma-Wert)
  function splitAmount(a) {
    const m = String(a || '').match(/(-?\d{1,3}(?:\.\d{3})*|-?\d+),(\d{2})/);
    if (!m) return { value: '', cur: '' };
    const cur = /USD|\$/.test(a) ? 'USD' : /CHF/.test(a) ? 'CHF' : /GBP|£/.test(a) ? 'GBP' : 'EUR';
    return { value: m[1].replace(/\./g, '') + ',' + m[2], cur };
  }
  const de = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';
  // Belegliste (CSV, Excel-tauglich): eine Zeile je Beleg, Datei = Name im ZIP
  function taxCsv(rows) {
    const head = ['Nr.', 'Belegdatum', 'Belegart', 'Rechnungssteller / Absender', 'Rechnungs-Nr.', 'Betreff', 'Betrag', 'Währung', 'Fällig am', 'Status', 'Aktenzeichen/Kd-Nr.', 'Eingang', 'Datei', 'SHA-256'];
    const lines = rows.map((r, i) => { const am = splitAmount(r.e.amount); return [i + 1, de(belegDate(r.e)), r.e.type, r.e.sender, r.e.invoiceNo, r.e.subject, am.value, am.cur, de(r.e.deadline),
      r.e.status || '', r.e.reference, String(r.e.savedAt || '').slice(0, 10).split('-').reverse().join('.'), r.zipName || '(Datei fehlt)', r.e.sha256].map(q).join(';'); });
    return '\uFEFF' + [head.join(';'), ...lines].join('\r\n') + '\r\n';
  }
  // DATEV „XML-Schnittstelle online“: document.xml für den Import von Belegbildern (Belege online / DMS)
  function datevXml(names, { description = '', system = 'PDFMy', date = new Date() } = {}) {
    const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    return `<?xml version="1.0" encoding="utf-8"?>
<archive xmlns="http://xml.datev.de/bedi/tps/document/v05.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xml.datev.de/bedi/tps/document/v05.0 Document_v050.xsd" version="5.0" generatingSystem="${x(system)}">
  <header>
    <date>${iso}</date>
    <description>${x(description)}</description>
  </header>
  <content>
${names.map(n => `    <document>\n      <extension xsi:type="File" name="${x(n)}"/>\n    </document>`).join('\n')}
  </content>
</archive>
`;
  }
  // Eindeutige, ZIP-taugliche Dateinamen (gleichnamige Belege bekommen eine laufende Nummer)
  function zipNames(files) {
    const used = new Set();
    return files.map(f => {
      let n = String(f).split('\\').pop().replace(/[\\/:*?"<>|]/g, '_'), k = 2;
      while (used.has(n.toLowerCase())) n = n.replace(/(\.[^.]+)?$/, m => ` (${k++})${m}`).replace(/ \((\d+)\) \((\d+)\)/, ' ($2)');
      used.add(n.toLowerCase()); return n;
    });
  }

  /* E-Mail-Entwurf mit Anhang als .eml – „X-Unsent: 1“ lässt Outlook ihn als neue, sendebereite Nachricht öffnen */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b || 0) << 8) | (c || 0);
      s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (b === undefined ? '=' : B64[n >> 6 & 63]) + (c === undefined ? '=' : B64[n & 63]);
    }
    return s;
  }
  const utf8 = s => new TextEncoder().encode(s);
  const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');
  const word = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(utf8(s))}?=`;
  function emlDraft({ to = '', cc = '', subject = '', body = '', attachments = [], date = new Date() }) {
    const bnd = '----=_PDFMy_' + date.getTime().toString(36);
    const parts = [
      `To: ${to}`, ...(cc ? [`Cc: ${cc}`] : []), `Subject: ${word(subject)}`, 'X-Unsent: 1', `Date: ${date.toUTCString()}`, 'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${bnd}"`, '', 'This is a multi-part message in MIME format.', '',
      `--${bnd}`, 'Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', wrap(b64(utf8(body))).trimEnd(),
      ...attachments.flatMap(a => ['', `--${bnd}`, `Content-Type: ${a.mime || 'application/octet-stream'}; name="${word(a.name)}"`, 'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${word(a.name)}"`, '', wrap(b64(a.bytes)).trimEnd()]),
      '', `--${bnd}--`, ''];
    return parts.join('\r\n');
  }

  /* Aufbewahrungsfristen (HGB § 257, AO § 147; Buchungsbelege seit 2025: 8 Jahre). Frist beginnt mit Ende des Kalenderjahres.
     Hinweis, keine Rechtsberatung: Verträge, Bescheide und Unbekanntes werden vorsichtig (10 Jahre bzw. gar nicht) behandelt. */
  const RETAIN = [
    [/rechnung|gutschrift|quittung|beleg|kontoauszug|lohn|gehalt|abrechnung|zahlung|mahnung|lieferschein/i, 8, 'Buchungsbeleg'],
    [/jahresabschluss|bilanz|inventar|buchungsjournal|eröffnungsbilanz/i, 10, 'Jahresabschluss/Bücher'],
    [/vertrag|kündigung|police|urkunde|zeugnis|grundbuch|testament/i, 0, 'Vertrag/Urkunde (unbefristet prüfen)'],
    [/bescheid|steuer|finanzamt/i, 10, 'Bescheid'],
    [/angebot|auftrag|bestellung|brief|schreiben|anfrage|information|einladung|ladung|werbung/i, 6, 'Geschäftsbrief'],
  ];
  function retention(e, today = new Date()) {
    const r = RETAIN.find(([re]) => re.test(e.type || '')) || [null, 10, 'unbekannt'];
    const d = e.date || (e.savedAt || '').slice(0, 10), y = +String(d).slice(0, 4);
    if (!r[1] || !y) return { years: r[1], kind: r[2], until: '', expired: false };
    const until = `${y + r[1]}-12-31`, t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { years: r[1], kind: r[2], until, expired: t > until };
  }
  // Wiedervorlage: offene Briefe, deren Wiedervorlage-Datum heute oder früher ist
  function resubmit(entries, today = new Date()) {
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return entries.filter(e => e.wv && e.wv <= t && !isClosed(norm({ ...e }))).sort((a, b) => a.wv < b.wv ? -1 : 1);
  }
  /* Akten (Mandanten-/Vorgangsakten): Einträge je Akte zusammenfassen – Anzahl, letzter Eingang, nächste offene Frist, Zuständige.
     today: 'YYYY-MM-DD'. Sortierung: Akten mit naher Frist zuerst, dann nach letztem Eingang. */
  function cases(entries, today) {
    const map = new Map();
    for (const e of entries) {
      const name = String(e.akte || '').trim(); if (!name) continue;
      const k = name.toLowerCase(), c = map.get(k) || { name, count: 0, open: 0, last: '', next: '', people: new Set(), ids: [] };
      c.count++; c.ids.push(e.id);
      const at = e.date || String(e.savedAt || '').slice(0, 10); if (at > c.last) c.last = at;
      if (!isClosed(norm({ ...e }))) { c.open++; if (e.deadline && e.deadline >= (today || '') && (!c.next || e.deadline < c.next)) c.next = e.deadline; }
      if (e.assignee) c.people.add(e.assignee);
      map.set(k, c);
    }
    return [...map.values()].map(c => ({ ...c, people: [...c.people] }))
      .sort((a, b) => (a.next && b.next ? a.next.localeCompare(b.next) : a.next ? -1 : b.next ? 1 : 0) || b.last.localeCompare(a.last) || a.name.localeCompare(b.name, 'de'));
  }
  // Akte für einen neuen Brief vorschlagen: gleiches Aktenzeichen → dieselbe Akte; sonst die letzte Akte dieses Absenders
  function suggestCase(entries, meta) {
    const n = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const ref = n(meta.reference || meta.customerNo), snd = n(meta.sender);
    const withCase = entries.filter(e => String(e.akte || '').trim()).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
    if (ref.length >= 4) { const hit = withCase.find(e => n(e.reference) === ref); if (hit) return hit.akte; }
    if (snd.length >= 3) { const hit = withCase.find(e => n(e.sender) === snd); if (hit) return hit.akte; }
    return '';
  }

  /* Eigene Felder (z. B. Mandant, Projekt, Kostenstelle): Namen legt das Büro fest (höchstens 5),
     im Buch stehen die Werte in einer Spalte als „Name: Wert; Name: Wert“ – lesbar in Excel und durchsuchbar */
  const FIELD_MAX = 5;
  function fieldNames(list) {
    const seen = new Set(), out = [];
    for (const raw of list || []) { const n = String(raw || '').replace(/[:;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30), k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); out.push(n); } }
    return out.slice(0, FIELD_MAX);
  }
  function fieldsText(obj) {
    return Object.entries(obj || {}).map(([k, v]) => [String(k).trim(), String(v == null ? '' : v).replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()]).filter(([k, v]) => k && v).map(([k, v]) => `${k}: ${v}`).join('; ');
  }
  function fieldsParse(str) {
    const o = {};
    for (const part of String(str || '').split(';')) { const i = part.indexOf(':'); if (i > 0) { const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim(); if (k && v) o[k] = v; } }
    return o;
  }
  // Vorschlag für einen neuen Brief: Werte des letzten Eintrags mit gleichem Aktenzeichen, sonst gleichem Absender
  function suggestFields(entries, meta) {
    const n = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const ref = n(meta.reference || meta.customerNo), snd = n(meta.sender);
    const withF = entries.filter(e => String(e.fields || '').trim()).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
    const hit = (ref.length >= 4 && withF.find(e => n(e.reference) === ref)) || (snd.length >= 3 && withF.find(e => n(e.sender) === snd));
    return hit ? fieldsParse(hit.fields) : {};
  }
  // Bisherige Werte eines Feldes, häufigste zuerst (Auswahlliste beim Tippen)
  function fieldValues(entries, name) {
    const m = new Map(), key = String(name).toLowerCase();
    for (const e of entries) for (const [k, v] of Object.entries(fieldsParse(e.fields))) if (k.toLowerCase() === key) { const c = m.get(v.toLowerCase()); if (c) c.n++; else m.set(v.toLowerCase(), { v, n: 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n || a.v.localeCompare(b.v, 'de')).map(x => x.v);
  }

  /* GoBD: Siegel je Eintrag = SHA-256 über die unveränderlichen Angaben (Eingang, Datei, Prüfsumme der Datei, Briefdatum, Absender, Typ, Eingangs-Nr.).
     Status, Zuständigkeit, Akte und Wiedervorlage dürfen sich ändern und gehören nicht dazu. Macht nachträgliche Änderungen im Buch
     (z. B. in Excel) erkennbar; ohne geheimen Schlüssel kein Schutz gegen absichtliche Fälschung. */
  const sealText = e => ['pdfmy-siegel-1', e.id, e.savedAt, e.file, e.sha256, e.date, e.sender, e.type, e.inNo].map(v => String(v ?? '').trim()).join('|');
  // Lücken in den Eingangsnummern je Jahr (2026-0001, 2026-0002 …) – Hinweis auf entfernte Einträge
  function inNoGaps(entries) {
    const byYear = new Map();
    for (const e of entries) { const m = String(e.inNo || '').match(/^(\d{4})-(\d+)$/); if (m) (byYear.get(m[1]) || byYear.set(m[1], new Set()).get(m[1])).add(+m[2]); }
    const out = [];
    for (const [y, set] of [...byYear].sort()) { const max = Math.max(...set); for (let n = 1; n <= max; n++) if (!set.has(n)) out.push(`${y}-${String(n).padStart(4, '0')}`); }
    return out;
  }

  /* Schlagwörter: kommagetrennt, ohne Doppelte (Groß/klein egal), Reihenfolge wie eingegeben */
  function tagList(v) {
    const seen = new Set(), out = [];
    for (const t of String(v || '').split(/[,;]/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(t.slice(0, 40)); } }
    return out;
  }
  // Alle verwendeten Schlagwörter mit Häufigkeit (häufigste zuerst) – für Vorschläge und Filter
  function allTags(entries) {
    const m = new Map();
    for (const e of entries) for (const t of tagList(e.tags)) { const k = t.toLowerCase(), c = m.get(k); if (c) c.n++; else m.set(k, { tag: t, n: 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'de'));
  }

  const api = { fieldNames, fieldsText, fieldsParse, suggestFields, fieldValues, tagList, allTags, sealText, inNoGaps, cases, suggestCase, b64, emlDraft, nextInNo, retention, resubmit, COLS, STATUS, isClosed, toCsv, parseCsv, merge, deadlines, mine, forwardMail, TAX_TYPES, belegDate, taxSelect, taxCsv, datevXml, zipNames, splitAmount };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Journal = api;
})(typeof self !== 'undefined' ? self : this);
