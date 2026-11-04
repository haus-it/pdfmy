// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Formulardaten austauschen – ohne Server:
   XFDF (Adobe-Standard, ISO 19444-1) und FDF lesen/schreiben, CSV (Excel) schreiben, Tabellenzeilen den Feldern zuordnen (Serienausfüllung).
   FormDaten.toXfdf(values, file) · parseXfdf(text) · parseFdf(text) · toCsv(fields, values) · parse(text, name) → { name: wert }
   FormDaten.matchColumns(header, fields) → [{ col, field }] · rowValues(row, map, fields) → { name: wert } · fileName(pattern …) */
(function (root) {
  'use strict';
  const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xmlUnesc = s => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  // Werte: Text, true/false (Kontrollkästchen) – in XFDF wie Acrobat als „Yes“/„Off“
  const outVal = v => v === true ? 'Yes' : v === false ? 'Off' : String(v ?? '');

  function toXfdf(values, file = '') {
    const rows = Object.entries(values).map(([k, v]) => `  <field name="${xmlEsc(k)}"><value>${xmlEsc(outVal(v))}</value></field>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n <fields>\n${rows.join('\n')}\n </fields>\n${file ? ` <f href="${xmlEsc(file)}"/>\n` : ''}</xfdf>\n`;
  }
  // XFDF: verschachtelte <field name="a"><field name="b"> ergeben „a.b“ (wie Acrobat bei hierarchischen Feldnamen)
  function parseXfdf(text) {
    const out = {}, stack = [], re = /<field\b[^>]*?\bname\s*=\s*("([^"]*)"|'([^']*)')[^>]*?(\/?)>|<\/field\s*>|<value(?:-richtext)?\b[^>]*>([\s\S]*?)<\/value(?:-richtext)?\s*>/gi;
    let m;
    while ((m = re.exec(text))) {
      if (m[1] !== undefined) { if (m[4] !== '/') stack.push(xmlUnesc(m[2] ?? m[3])); }
      else if (m[0][1] === '/') stack.pop();
      else if (stack.length) {
        const k = stack.join('.'), v = xmlUnesc(m[5].replace(/<[^>]+>/g, ''));
        out[k] = k in out ? [].concat(out[k], v) : v;   // Mehrfachauswahl: mehrere <value>
      }
    }
    if (!/<xfdf\b/i.test(text)) throw new Error('Keine XFDF-Datei.');
    return out;
  }
  // FDF (älteres Acrobat-Format): /T (Name) /V (Wert) oder /V /Name; Klammern mit \-Maskierung, Hex-Strings, UTF-16 mit BOM
  function pdfString(s) {
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c !== '\\') { r += c; continue; }
      const n = s[++i];
      if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; r += String.fromCharCode(parseInt(o, 8)); }
      else r += { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\n': '', '\r': '' }[n] ?? n;
    }
    if (r.charCodeAt(0) === 0xfe && r.charCodeAt(1) === 0xff) { let u = ''; for (let i = 2; i + 1 < r.length; i += 2) u += String.fromCharCode(r.charCodeAt(i) << 8 | r.charCodeAt(i + 1)); return u; }
    return r;
  }
  const hexString = h => { h = h.replace(/\s/g, ''); if (h.length % 2) h += '0'; let s = ''; for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return pdfString(s.replace(/\\/g, '\\\\')); };
  function readStr(t, i) {   // t[i] === '(' → [Text, Ende]
    let depth = 0, j = i, raw = '';
    for (; j < t.length; j++) {
      const c = t[j];
      if (c === '\\') { raw += c + t[++j]; continue; }
      if (c === '(') { if (depth++) raw += c; continue; }
      if (c === ')') { if (--depth === 0) break; raw += c; continue; }
      raw += c;
    }
    return [pdfString(raw), j + 1];
  }
  function parseFdf(text) {
    if (!/%FDF-/.test(text)) throw new Error('Keine FDF-Datei.');
    const out = {}, re = /\/T\s*(\(|<)/g; let m;
    while ((m = re.exec(text))) {
      let name, end;
      if (m[1] === '(') [name, end] = readStr(text, m.index + m[0].length - 1);
      else { const e = text.indexOf('>', m.index); name = hexString(text.slice(m.index + m[0].length, e)); end = e + 1; }
      // /V im selben Wörterbuch (vor dem nächsten /T bzw. Ende „>>“)
      const rest = text.slice(end, end + 4000), stop = rest.search(/\/T\s*[(<]|>>/), seg = stop < 0 ? rest : rest.slice(0, stop);
      const v = /\/V\s*(\(|<(?!<)|\/([^\s/<>()[\]]*))/.exec(seg); if (!v) continue;
      let val;
      if (v[1] === '(') val = readStr(seg, v.index + v[0].length - 1)[0];
      else if (v[1] === '<') { const e = seg.indexOf('>', v.index + v[0].length); val = hexString(seg.slice(v.index + v[0].length, e)); }
      else val = v[2].replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      out[name] = val;
    }
    return out;
  }

  // CSV für Excel: Kopfzeile = Feldnamen, eine Wertezeile; Semikolon und BOM, damit deutsches Excel Umlaute und Spalten richtig liest
  const csvCell = v => { const s = outVal(v === true ? 'Ja' : v === false ? 'Nein' : v); return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(fields, values) {
    const names = fields.map(f => f.name);
    return '﻿' + names.map(csvCell).join(';') + '\r\n' + names.map(n => csvCell(n in values ? values[n] : fields.find(f => f.name === n).value)).join(';') + '\r\n';
  }

  // Spalten den Feldern zuordnen: erst exakt, dann ohne Groß/klein, Leerzeichen und Satzzeichen (z. B. „PLZ“ ↔ „plz“, „Vor-name“ ↔ „Vorname“)
  const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
  function matchColumns(header, fields) {
    const used = new Set(), map = [];
    const pick = (i, test) => { if (map.some(x => x.col === i)) return; const f = fields.find(f => !used.has(f.name) && !f.ro && test(f)); if (f) { used.add(f.name); map.push({ col: i, field: f.name }); } };
    header.forEach((h, i) => pick(i, f => f.name === h));
    header.forEach((h, i) => norm(h) && pick(i, f => norm(f.name) === norm(h)));
    header.forEach((h, i) => norm(h) && pick(i, f => f.tip && norm(f.tip) === norm(h)));   // Kurzinfo des Felds (z. B. Feld „Text1“, Kurzinfo „Name“)
    return map.sort((a, b) => a.col - b.col);
  }
  const YES = /^(ja|j|yes|y|x|1|true|wahr|on|an|✓|✔|☑)$/i;
  // Wert für ein Feld: Kontrollkästchen ja/nein, Auswahl nur mit vorhandener Option (Groß/klein egal), sonst Text
  function fieldValue(f, v) {
    v = Array.isArray(v) ? v[0] ?? '' : String(v ?? '');
    if (f.kind === 'check') return YES.test(v.trim());
    if (f.kind === 'select') { if (!v) return ''; const o = (f.options || []).find(o => o === v) ?? (f.options || []).find(o => o.toLowerCase() === v.trim().toLowerCase()); return o ?? null; }   // null: Wert passt zu keiner Auswahl
    return v;
  }
  function rowValues(row, map, fields) {
    const values = {}, bad = [];
    for (const { col, field } of map) {
      const f = fields.find(x => x.name === field); if (!f) continue;
      const v = fieldValue(f, row[col]);
      if (v === null) bad.push(`${field}: „${row[col]}“`); else values[field] = v;
    }
    return { values, bad };
  }
  // Einen Datensatz (XFDF/FDF/JSON) den Feldern zuordnen – Namen exakt, sonst normalisiert
  function applyRecord(rec, fields) {
    const header = Object.keys(rec), map = matchColumns(header, fields), row = header.map(k => rec[k]);
    const r = rowValues(row, map, fields);
    return { ...r, unknown: header.filter((h, i) => !map.some(x => x.col === i)) };
  }
  function parse(text, name = '') {
    text = String(text).replace(/^﻿/, '');
    if (/\.fdf$/i.test(name) || /^%FDF-/.test(text)) return parseFdf(text);
    if (/\.json$/i.test(name) || /^\s*\{/.test(text)) { const o = JSON.parse(text); return o.fields && typeof o.fields === 'object' ? o.fields : o; }
    return parseXfdf(text);
  }
  // Dateiname je Datensatz: „Vorlage_003_Muster.pdf“ – Wert der gewählten Spalte, für Dateisysteme bereinigt
  const safe = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).replace(/[. ]+$/, '');
  function fileName(base, i, total, label) {
    const nr = String(i + 1).padStart(Math.max(2, String(total).length), '0'), l = safe(label || '');
    return `${safe(base) || 'Formular'}_${nr}${l ? '_' + l : ''}.pdf`;
  }

  const api = { toXfdf, parseXfdf, parseFdf, toCsv, matchColumns, fieldValue, rowValues, applyRecord, parse, fileName, norm };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FormDaten = api;
})(typeof self !== 'undefined' ? self : this);
