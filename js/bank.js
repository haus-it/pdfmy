// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Kontoauszug abgleichen: Umsätze aus dem Online-Banking (CAMT.053/.052 als XML oder CSV) lesen und offenen Rechnungen
   im Posteingangsbuch zuordnen – bezahlte Rechnungen werden erkannt. Lokal, ohne Server. Auch in Node-Tests nutzbar. */
(function (root) {
  'use strict';
  const num = s => { s = String(s || '').trim().replace(/\s|€|EUR/g, ''); if (!s) return NaN; if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,(?=\d{3}\b)/g, ''); return parseFloat(s); };
  const isoDate = s => { s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return ''; };

  /* CAMT (ISO 20022): Ntry → Datum, Betrag (Soll negativ), Gegenpartei, Verwendungszweck */
  function parseCamt(xml) {
    const out = [], tag = (s, n) => { const m = s.match(new RegExp(`<(?:\\w+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`)); return m ? m[1] : ''; };
    const txt = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    for (const m of String(xml).matchAll(/<(?:\w+:)?Ntry\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Ntry>/g)) {
      const e = m[1], debit = /DBIT/.test(tag(e, 'CdtDbtInd')), amount = num(txt(tag(e, 'Amt')));
      const date = isoDate(txt(tag(tag(e, 'BookgDt'), 'Dt')) || txt(tag(tag(e, 'BookgDt'), 'DtTm')) || txt(tag(tag(e, 'ValDt'), 'Dt')));
      const party = debit ? tag(e, 'Cdtr') : tag(e, 'Dbtr'), acct = debit ? tag(e, 'CdtrAcct') : tag(e, 'DbtrAcct');
      const purpose = [...e.matchAll(/<(?:\w+:)?Ustrd>([\s\S]*?)<\/(?:\w+:)?Ustrd>/g)].map(x => txt(x[1])).join(' ') + ' ' + txt(tag(tag(e, 'Strd'), 'Ref')) + ' ' + txt(tag(e, 'EndToEndId')).replace(/NOTPROVIDED/, '');
      out.push({ date, amount: debit ? -amount : amount, name: txt(tag(party, 'Nm')), iban: txt(tag(acct, 'IBAN')), purpose: purpose.trim() });
    }
    return out;
  }
  /* CSV aus dem Online-Banking (Sparkasse, Volksbank, Deutsche Bank, Commerzbank, DKB …): Spalten über die Kopfzeile finden */
  function parseCsv(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const hi = lines.findIndex(l => /buchung|datum|valuta/i.test(l) && /betrag|umsatz|soll|haben/i.test(l)); if (hi < 0) return [];
    const sep = (lines[hi].match(/;/g) || []).length >= (lines[hi].match(/,/g) || []).length ? ';' : lines[hi].includes('\t') ? '\t' : ',';
    const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    const head = split(lines[hi]).map(h => h.toLowerCase()), col = (...res) => { for (const re of res) { const i = head.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };
    const cDate = col(/^(buchungstag|buchungsdatum|buchung|datum)/), cAmt = col(/^(betrag|umsatz)/), cSoll = col(/soll|lastschrift|belastung/), cHaben = col(/haben|gutschrift/);
    const cPurp = col(/verwendungszweck/, /beschreibung/, /buchungstext|vorgang/), cName = col(/beg(ue|ü)nstigter|zahlungspflichtig|zahlungsempf|empf(ae|ä)nger|auftraggeber/, /name|gegenpartei/), cIban = col(/iban/, /kontonummer/);
    return lines.slice(hi + 1).map(split).map(r => {
      let amount = cAmt >= 0 ? num(r[cAmt]) : NaN;
      if (isNaN(amount) && (cSoll >= 0 || cHaben >= 0)) { const s = num(r[cSoll]), h = num(r[cHaben]); amount = !isNaN(h) && h ? Math.abs(h) : !isNaN(s) ? -Math.abs(s) : NaN; }
      return { date: isoDate(r[cDate]), amount, name: r[cName] || '', iban: (r[cIban] || '').replace(/\s/g, ''), purpose: r[cPurp] || '' };
    }).filter(t => t.date && !isNaN(t.amount));
  }
  const parse = (text, name = '') => /<\?xml|<Document|BkToCstmrStmt|BkToCstmrAcctRpt/.test(text) || /\.xml$/i.test(name) ? parseCamt(text) : parseCsv(text);

  /* Zuordnung: Zahlung (Abgang) mit gleichem Betrag + Rechnungsnummer/Zeichen im Verwendungszweck oder Absender als Empfänger */
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
  function match(txs, entries) {
    const used = new Set(), out = [];
    const open = entries.filter(e => e.amount && !/bezahlt|erledigt/.test(e.status || '') && !e.extra);
    for (const e of open) {
      const amt = num(String(e.amount).replace(/[^\d.,-]/g, '')); if (!(amt > 0)) continue;
      let best = null;
      for (const [i, t] of txs.entries()) {
        if (used.has(i) || Math.abs(Math.abs(t.amount) - amt) > 0.005) continue;
        const p = norm(t.purpose), n = norm(t.name), why = [];
        let score = 0;
        const refs = [e.invoiceNo, e.reference].filter(x => x && String(x).length >= 4).map(norm);
        if (refs.some(r => p.includes(r) || p.replace(/ /g, '').includes(r.replace(/ /g, '')))) { score += 3; why.push('Rechnungs-Nr./Zeichen im Verwendungszweck'); }
        const words = norm(e.sender).split(' ').filter(w => w.length > 3 && !/gmbh|stadt|und|der|die|das/.test(w));
        if (words.length && words.some(w => n.includes(w) || p.includes(w))) { score += 1; why.push('Empfänger passt'); }
        if (e.date && t.date && t.date < e.date) score -= 2;   // vor dem Briefdatum gebucht: unwahrscheinlich
        if (score >= 1 && (!best || score > best.score)) best = { i, t, score, why };
      }
      if (best) { used.add(best.i); out.push({ entry: e, tx: best.t, sure: best.score >= 3, why: ['Betrag', ...best.why].join(', ') }); }
    }
    return out;
  }
  const api = { parse, parseCamt, parseCsv, match, num };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Bank = api;
})(typeof self !== 'undefined' ? self : globalThis);
