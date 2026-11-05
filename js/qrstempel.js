// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* QR-Code einfügen: GiroCode (EPC-QR, Version 002, „Quick Response Code – Guidelines to Enable Data Capture for the
   Initiation of a SEPA Credit Transfer“, EPC069-12) oder Link/Text als Bild auf die Seite stempeln – z. B. auf die eigene
   Rechnung aus Word. Reine Logik ohne DOM (Prüfen, Nutzdaten, Alt-Text); gezeichnet wird in js/pro.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QrStempel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const utf8Len = s => new TextEncoder().encode(s).length;

  function ibanValid(v) {
    const s = String(v || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97;
    return m === 1;
  }
  const ibanFmt = v => String(v || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

  // Betrag aus der Eingabe: „1.234,56“, „1234,56“, „1234.56“, „1,234.56“, „12“, „12,5 €“ → Zahl; leer → null; Unsinn → NaN
  function parseAmount(v) {
    let s = String(v ?? '').replace(/\s|€|EUR/gi, '');
    if (!s) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');   // englisch: 1,234.56
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(+s * 100) / 100;
  }

  /* GiroCode-Nutzdaten. Pflicht: Empfänger, IBAN. Betrag und Verwendungszweck freiwillig (die Banking-App fragt dann).
     Wirft einen Fehler mit verständlicher Meldung; Rückgabe: { payload, iban, amount } */
  function epc({ name, iban, bic, amount, purpose } = {}) {
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (!n) throw new Error('Bitte den Empfänger angeben.');
    if (n.length > 70) throw new Error('Der Empfänger darf höchstens 70 Zeichen haben.');
    const ib = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!ibanValid(ib)) throw new Error('Diese IBAN ist ungültig – bitte die Prüfziffer und die Länge kontrollieren.');
    const b = String(bic || '').replace(/\s+/g, '').toUpperCase();
    if (b && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(b)) throw new Error('Der BIC ist ungültig (8 oder 11 Zeichen, z. B. DEUTDEFF).');
    const a = typeof amount === 'number' || amount === null ? amount : parseAmount(amount);
    if (Number.isNaN(a)) throw new Error('Den Betrag bitte als Zahl angeben, z. B. 1.234,56.');
    if (a !== null && !(a >= 0.01 && a <= 999999999.99)) throw new Error('Der Betrag muss zwischen 0,01 und 999.999.999,99 Euro liegen.');
    const p = String(purpose || '').replace(/\s+/g, ' ').trim();
    if (p.length > 140) throw new Error('Der Verwendungszweck darf höchstens 140 Zeichen haben.');
    const L = ['BCD', '002', '1', 'SCT', b, n, ib, a === null ? '' : 'EUR' + a.toFixed(2), '', '', p];
    while (L.length > 7 && !L[L.length - 1]) L.pop();   // leere Felder am Ende weglassen (erlaubt)
    const payload = L.join('\n');
    if (utf8Len(payload) > 331) throw new Error('Die Angaben sind zu lang für einen GiroCode – bitte den Verwendungszweck kürzen.');
    return { payload, iban: ib, amount: a };
  }

  // Link oder freier Text; „www.beispiel.de“ wird zu https://www.beispiel.de
  function link(text) {
    let t = String(text || '').trim();
    if (!t) throw new Error('Bitte einen Link oder Text eingeben.');
    if (/^www\.[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) t = 'https://' + t;
    if (utf8Len(t) > 1200) throw new Error('Der Text ist zu lang für einen gut lesbaren QR-Code (höchstens etwa 1.200 Zeichen).');
    return { payload: t };
  }

  const money = a => a.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  // Alternativtext für Screenreader (PDF/UA: Figure mit Alt)
  function alt(kind, d) {
    if (kind === 'giro') return `GiroCode: Überweisung an ${d.name}, IBAN ${ibanFmt(d.iban)}${d.amount != null ? ', ' + money(d.amount) : ''}${d.purpose ? ', ' + d.purpose : ''}`;
    return `QR-Code: ${String(d.text || '').slice(0, 200)}`;
  }

  // Vorschlag aus dem erkannten Dokument (js/letter.js) und den zuletzt benutzten eigenen Bankdaten
  function prefill(meta = {}, saved = {}, ownName = '') {
    const a = parseAmount(String(meta.amount || '').replace(/[^\d.,]/g, ''));
    return {
      name: saved.name || ownName || '',
      iban: saved.iban || (ibanValid(meta.iban) ? ibanFmt(meta.iban) : ''),
      bic: saved.bic || '',
      amount: a && !Number.isNaN(a) ? a.toFixed(2).replace('.', ',') : '',
      purpose: meta.invoiceNo ? 'Rechnung ' + meta.invoiceNo : '',
    };
  }

  return { ibanValid, ibanFmt, parseAmount, epc, link, alt, prefill };
});
