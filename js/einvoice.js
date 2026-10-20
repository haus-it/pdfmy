// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* E-Rechnungen lesen: ZUGFeRD/Factur-X (CII-XML, in PDF eingebettet) und XRechnung (CII oder UBL).
   Die Daten aus dem XML sind verbindlich – genauer als jede Texterkennung. Ohne DOM, auch in Node-Tests nutzbar. */
(function (root) {
  'use strict';
  const unesc = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').trim();
  // Erstes Element mit lokalem Namen (Namensraum-Präfix egal); Pfad = verschachtelte Suche
  function el(xml, ...path) {
    let s = xml;
    for (const name of path) {
      const m = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`).exec(s);
      if (!m) return null;
      s = m[1];
    }
    return s;
  }
  const txt = (xml, ...path) => { const v = el(xml, ...path); return v == null ? '' : unesc(v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')); };
  const all = (xml, name) => { const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'g'), out = []; let m; while ((m = re.exec(xml))) out.push(m[1]); return out; };
  const attr = (xml, name, a) => { const m = new RegExp(`<(?:[\\w.-]+:)?${name}\\s[^>]*${a}="([^"]*)"`).exec(xml); return m ? m[1] : ''; };
  const d102 = s => { s = (s || '').replace(/\D/g, ''); return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };
  const money = (v, cur) => {
    if (v === '' || v == null || isNaN(+v)) return '';
    return (+v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (cur || 'EUR');
  };

  function parse(xml) {
    xml = String(xml || '').replace(/^﻿/, '');
    if (/<(?:[\w.-]+:)?CrossIndustryInvoice[\s>]/.test(xml)) return parseCii(xml);
    if (/<(?:[\w.-]+:)?(Invoice|CreditNote)[\s>]/.test(xml) && /urn:oasis:names:specification:ubl/.test(xml)) return parseUbl(xml);
    return null;
  }
  function parseCii(x) {
    const doc = el(x, 'ExchangedDocument') || '', tr = el(x, 'SupplyChainTradeTransaction') || '';
    const agr = el(tr, 'ApplicableHeaderTradeAgreement') || '', set = el(tr, 'ApplicableHeaderTradeSettlement') || '';
    const sum = el(set, 'SpecifiedTradeSettlementHeaderMonetarySummation') || '';
    const cur = txt(set, 'InvoiceCurrencyCode') || 'EUR';
    const typeCode = txt(doc, 'TypeCode');
    const lines = all(tr, 'IncludedSupplyChainTradeLineItem').map(l => ({
      name: txt(l, 'SpecifiedTradeProduct', 'Name'), qty: txt(l, 'BilledQuantity'), unit: attr(l, 'BilledQuantity', 'unitCode'),
      net: money(txt(l, 'SpecifiedLineTradeSettlement', 'LineTotalAmount'), cur),
    }));
    return {
      format: /xrechnung/i.test(txt(x, 'GuidelineSpecifiedDocumentContextParameter', 'ID')) ? 'XRechnung (CII)' : 'ZUGFeRD / Factur-X',
      type: typeCode === '381' ? 'Gutschrift' : 'Rechnung',
      invoiceNo: txt(doc, 'ID'), date: d102(txt(doc, 'IssueDateTime')),
      sender: txt(agr, 'SellerTradeParty', 'Name'), buyer: txt(agr, 'BuyerTradeParty', 'Name'),
      amount: money(txt(sum, 'DuePayableAmount') || txt(sum, 'GrandTotalAmount'), cur),
      net: money(txt(sum, 'TaxBasisTotalAmount'), cur), tax: money(txt(sum, 'TaxTotalAmount'), cur),
      deadline: d102(txt(set, 'SpecifiedTradePaymentTerms', 'DueDateDateTime')),
      iban: txt(set, 'PayeePartyCreditorFinancialAccount', 'IBANID').replace(/\s/g, ''),
      reference: txt(set, 'PaymentReference') || txt(agr, 'BuyerReference'),
      note: txt(doc, 'IncludedNote', 'Content'), lines,
    };
  }
  function parseUbl(x) {
    const credit = /<(?:[\w.-]+:)?CreditNote[\s>]/.test(x);
    const cur = txt(x, 'DocumentCurrencyCode') || 'EUR', sup = el(x, 'AccountingSupplierParty') || '', cus = el(x, 'AccountingCustomerParty') || '';
    const pname = p => txt(p, 'PartyName', 'Name') || txt(p, 'PartyLegalEntity', 'RegistrationName');
    const tot = el(x, 'LegalMonetaryTotal') || '';
    // Kopf-Elemente vor den Positionen suchen (cbc:ID kommt auch in Positionen vor)
    const head = x.split(/<(?:[\w.-]+:)?(?:AccountingSupplierParty|InvoiceLine|CreditNoteLine)[\s>]/)[0];
    const lines = all(x, credit ? 'CreditNoteLine' : 'InvoiceLine').map(l => ({
      name: txt(l, 'Item', 'Name'), qty: txt(l, credit ? 'CreditedQuantity' : 'InvoicedQuantity'), unit: attr(l, credit ? 'CreditedQuantity' : 'InvoicedQuantity', 'unitCode'),
      net: money(txt(l, 'LineExtensionAmount'), cur),
    }));
    return {
      format: 'XRechnung (UBL)', type: credit ? 'Gutschrift' : 'Rechnung',
      invoiceNo: txt(head, 'ID'), date: txt(head, 'IssueDate'),
      sender: pname(sup), buyer: pname(cus),
      amount: money(txt(tot, 'PayableAmount'), cur), net: money(txt(tot, 'TaxExclusiveAmount'), cur),
      tax: money(txt(el(x, 'TaxTotal') || '', 'TaxAmount'), cur),
      deadline: txt(head, 'DueDate') || txt(x, 'PaymentDueDate'),
      iban: txt(x, 'PaymentMeans', 'PayeeFinancialAccount', 'ID').replace(/\s/g, ''),
      reference: txt(x, 'PaymentMeans', 'PaymentID') || txt(head, 'BuyerReference'),
      note: txt(head, 'Note'), lines,
    };
  }
  // Lesbare Textfassung (für Ansicht, Suche und Ablage einer reinen XML-Rechnung)
  function toText(d) {
    const row = (k, v) => v ? `${k}: ${v}` : '';
    return [`${d.type} (${d.format})`, row('Rechnungssteller', d.sender), row('Rechnungsempfänger', d.buyer), row('Rechnungsnummer', d.invoiceNo),
      row('Rechnungsdatum', d.date), row('Fällig am', d.deadline), row('Verwendungszweck', d.reference), '',
      ...d.lines.map((l, i) => `${i + 1}. ${l.name}${l.qty ? ` – ${(+l.qty).toLocaleString('de-DE')} ${l.unit || ''}`.trimEnd() : ''}${l.net ? ` – ${l.net}` : ''}`), '',
      row('Netto', d.net), row('Umsatzsteuer', d.tax), row('Zu zahlen', d.amount), row('IBAN', d.iban), d.note].filter((s, i, a) => s !== '' || (a[i - 1] !== '')).join('\n').trim();
  }

  /* Schnellprüfung einer E-Rechnung: Pflichtangaben und Rechenregeln nach EN 16931 (BR-…, BR-CO-…), bei XRechnung zusätzlich
     die deutschen Regeln (BR-DE-…). Ersetzt nicht die vollständige amtliche Prüfung (KoSIT-Validator, über 300 Regeln).
     Ergebnis: { ok, format, items: [{ level: 'fehler'|'hinweis'|'ok', rule, text }] } */
  function check(xml) {
    xml = String(xml || '').replace(/^﻿/, '');
    const d = parse(xml); if (!d) return { ok: false, format: '', items: [{ level: 'fehler', rule: '', text: 'Keine E-Rechnung (weder CII noch UBL)' }] };
    const cii = /CrossIndustryInvoice/.test(xml), items = [], err = (rule, text) => items.push({ level: 'fehler', rule, text }), hint = (rule, text) => items.push({ level: 'hinweis', rule, text });
    const n = v => { const s = String(v ?? '').trim(); return s === '' ? null : +s; }, eq = (a, b) => a != null && b != null && Math.abs(a - b) < 0.011;
    let f;   // Felder je Syntax
    if (cii) {
      const doc = el(xml, 'ExchangedDocument') || '', tr = el(xml, 'SupplyChainTradeTransaction') || '';
      const agr = el(tr, 'ApplicableHeaderTradeAgreement') || '', set = el(tr, 'ApplicableHeaderTradeSettlement') || '', sum = el(set, 'SpecifiedTradeSettlementHeaderMonetarySummation') || '';
      const seller = el(agr, 'SellerTradeParty') || '', buyer = el(agr, 'BuyerTradeParty') || '', cur = txt(set, 'InvoiceCurrencyCode');
      const taxTotals = [...sum.matchAll(/<(?:[\w.-]+:)?TaxTotalAmount([^>]*)>([^<]*)</g)], tt = taxTotals.find(m => !/currencyID/.test(m[1]) || m[1].includes(`"${cur}"`)) || taxTotals[0];
      const contact = el(seller, 'DefinedTradeContact') || '';
      f = { spec: txt(xml, 'GuidelineSpecifiedDocumentContextParameter', 'ID'), no: txt(doc, 'ID'), date: txt(doc, 'IssueDateTime'), type: txt(doc, 'TypeCode'), cur,
        sName: txt(seller, 'Name'), sCountry: txt(seller, 'PostalTradeAddress', 'CountryID'), sCity: txt(seller, 'PostalTradeAddress', 'CityName'), sZip: txt(seller, 'PostalTradeAddress', 'PostcodeCode'),
        sTax: all(seller, 'SpecifiedTaxRegistration').map(t => txt(t, 'ID')).filter(Boolean),
        cName: txt(contact, 'PersonName') || txt(contact, 'DepartmentName'), cPhone: txt(contact, 'TelephoneUniversalCommunication', 'CompleteNumber'), cMail: txt(contact, 'EmailURIUniversalCommunication', 'URIID'),
        bName: txt(buyer, 'Name'), bCountry: txt(buyer, 'PostalTradeAddress', 'CountryID'), bRef: txt(agr, 'BuyerReference'),
        payMeans: txt(set, 'SpecifiedTradeSettlementPaymentMeans', 'TypeCode'),
        s106: n(txt(sum, 'LineTotalAmount')), s107: n(txt(sum, 'AllowanceTotalAmount')) || 0, s108: n(txt(sum, 'ChargeTotalAmount')) || 0, s109: n(txt(sum, 'TaxBasisTotalAmount')),
        s110: tt ? n(tt[2]) : 0, s112: n(txt(sum, 'GrandTotalAmount')), s113: n(txt(sum, 'TotalPrepaidAmount')) || 0, s114: n(txt(sum, 'RoundingAmount')) || 0, s115: n(txt(sum, 'DuePayableAmount')),
        lines: all(tr, 'IncludedSupplyChainTradeLineItem').map(l => ({ id: txt(l, 'AssociatedDocumentLineDocument', 'LineID'), name: txt(l, 'SpecifiedTradeProduct', 'Name'), qty: n(txt(l, 'BilledQuantity')), unit: attr(l, 'BilledQuantity', 'unitCode'),
          price: n(txt(l, 'NetPriceProductTradePrice', 'ChargeAmount')), net: n(txt(l, 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount')) })) };
    } else {
      const credit = /<(?:[\w.-]+:)?CreditNote[\s>]/.test(xml), head = xml.split(/<(?:[\w.-]+:)?(?:AccountingSupplierParty|InvoiceLine|CreditNoteLine)[\s>]/)[0];
      const sup = el(xml, 'AccountingSupplierParty') || '', cus = el(xml, 'AccountingCustomerParty') || '', tot = el(xml, 'LegalMonetaryTotal') || '', cur = txt(head, 'DocumentCurrencyCode');
      const taxAmt = [...xml.matchAll(/<(?:[\w.-]+:)?TaxTotal[\s>][\s\S]*?<(?:[\w.-]+:)?TaxAmount([^>]*)>([^<]*)</g)], ta = taxAmt.find(m => m[1].includes(`"${cur}"`)) || taxAmt[0];
      f = { spec: txt(head, 'CustomizationID'), no: txt(head, 'ID'), date: txt(head, 'IssueDate'), type: txt(head, credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'), cur,
        sName: txt(sup, 'PartyName', 'Name') || txt(sup, 'PartyLegalEntity', 'RegistrationName'), sCountry: txt(sup, 'PostalAddress', 'Country', 'IdentificationCode'), sCity: txt(sup, 'PostalAddress', 'CityName'), sZip: txt(sup, 'PostalAddress', 'PostalZone'),
        sTax: all(sup, 'PartyTaxScheme').map(t => txt(t, 'CompanyID')).filter(Boolean),
        cName: txt(sup, 'Contact', 'Name'), cPhone: txt(sup, 'Contact', 'Telephone'), cMail: txt(sup, 'Contact', 'ElectronicMail'),
        bName: txt(cus, 'PartyName', 'Name') || txt(cus, 'PartyLegalEntity', 'RegistrationName'), bCountry: txt(cus, 'PostalAddress', 'Country', 'IdentificationCode'), bRef: txt(head, 'BuyerReference'),
        payMeans: txt(xml, 'PaymentMeans', 'PaymentMeansCode'),
        s106: n(txt(tot, 'LineExtensionAmount')), s107: n(txt(tot, 'AllowanceTotalAmount')) || 0, s108: n(txt(tot, 'ChargeTotalAmount')) || 0, s109: n(txt(tot, 'TaxExclusiveAmount')),
        s110: ta ? n(ta[2]) : 0, s112: n(txt(tot, 'TaxInclusiveAmount')), s113: n(txt(tot, 'PrepaidAmount')) || 0, s114: n(txt(tot, 'PayableRoundingAmount')) || 0, s115: n(txt(tot, 'PayableAmount')),
        lines: all(xml, credit ? 'CreditNoteLine' : 'InvoiceLine').map(l => ({ id: txt(l, 'ID'), name: txt(l, 'Item', 'Name'), qty: n(txt(l, credit ? 'CreditedQuantity' : 'InvoicedQuantity')), unit: attr(l, credit ? 'CreditedQuantity' : 'InvoicedQuantity', 'unitCode'),
          price: n(txt(l, 'Price', 'PriceAmount')), net: n(txt(l, 'LineExtensionAmount')) })) };
    }
    const xr = /xrechnung/i.test(f.spec), fmt = d.format, eur = v => (+v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Pflichtangaben (EN 16931)
    if (!f.spec) err('BR-01', 'Kennung der Spezifikation fehlt');
    if (!f.no) err('BR-02', 'Rechnungsnummer fehlt');
    if (!f.date) err('BR-03', 'Rechnungsdatum fehlt');
    if (!f.type) err('BR-04', 'Rechnungsart (Typcode) fehlt');
    if (!f.cur) err('BR-05', 'Währung fehlt');
    if (!f.sName) err('BR-06', 'Name des Verkäufers fehlt');
    if (!f.bName) err('BR-07', 'Name des Käufers fehlt');
    if (!f.sCountry) err('BR-09', 'Land in der Anschrift des Verkäufers fehlt');
    if (!f.bCountry) err('BR-11', 'Land in der Anschrift des Käufers fehlt');
    if (!f.lines.length) err('BR-16', 'Keine Rechnungsposition');
    f.lines.forEach((l, i) => {
      const k = `Position ${l.id || i + 1}`;
      if (!l.name) err('BR-25', `${k}: Bezeichnung fehlt`);
      if (l.qty == null) err('BR-22', `${k}: Menge fehlt`); else if (!l.unit) err('BR-23', `${k}: Mengeneinheit fehlt`);
      if (l.net == null) err('BR-24', `${k}: Nettobetrag fehlt`);
    });
    if (!f.sTax.length) err('BR-CO-26', 'USt-IdNr. oder Steuernummer des Verkäufers fehlt');
    // Rechenregeln
    if (f.s106 == null) err('BR-12', 'Summe der Positionen fehlt');
    else { const sl = f.lines.reduce((s, l) => s + (l.net || 0), 0); if (f.lines.length && !eq(sl, f.s106)) err('BR-CO-10', `Summe der Positionen ${eur(sl)} ≠ angegebene Summe ${eur(f.s106)}`); }
    if (f.s109 == null) err('BR-13', 'Nettobetrag der Rechnung fehlt');
    else if (f.s106 != null && !eq(f.s106 - f.s107 + f.s108, f.s109)) err('BR-CO-13', `Netto ${eur(f.s109)} ≠ Positionen − Nachlässe + Zuschläge (${eur((f.s106 - f.s107 + f.s108))})`);
    if (f.s112 == null) err('BR-14', 'Bruttobetrag der Rechnung fehlt');
    else if (f.s109 != null && !eq(f.s109 + (f.s110 || 0), f.s112)) err('BR-CO-15', `Brutto ${eur(f.s112)} ≠ Netto + Umsatzsteuer (${eur((f.s109 + (f.s110 || 0)))})`);
    if (f.s115 == null) err('BR-15', 'Zahlbetrag fehlt');
    else if (f.s112 != null && !eq(f.s112 - f.s113 + f.s114, f.s115)) err('BR-CO-16', `Zahlbetrag ${eur(f.s115)} ≠ Brutto − Vorauszahlung + Rundung (${eur((f.s112 - f.s113 + f.s114))})`);
    // XRechnung (BR-DE)
    if (xr) {
      if (!f.bRef) err('BR-DE-15', 'Leitweg-ID bzw. Käuferreferenz fehlt');
      if (!f.payMeans) err('BR-DE-1', 'Zahlungsart fehlt');
      if (!f.sCity) err('BR-DE-3', 'Ort des Verkäufers fehlt');
      if (!f.sZip) err('BR-DE-4', 'Postleitzahl des Verkäufers fehlt');
      if (!f.cName) err('BR-DE-5', 'Ansprechpartner des Verkäufers fehlt');
      if (!f.cPhone) err('BR-DE-6', 'Telefonnummer des Verkäufers fehlt');
      if (!f.cMail) err('BR-DE-7', 'E-Mail-Adresse des Verkäufers fehlt');
    } else if (!f.bRef) hint('', 'Keine Käuferreferenz – für Rechnungen an Behörden (XRechnung) ist die Leitweg-ID Pflicht');
    const ok = !items.some(i => i.level === 'fehler');
    if (ok) items.unshift({ level: 'ok', rule: '', text: `Pflichtangaben und Rechenregeln erfüllt (${fmt}, ${f.lines.length === 1 ? '1 Position' : `${f.lines.length} Positionen`})` });
    return { ok, format: fmt, xrechnung: xr, items };
  }

  const api = { parse, toText, check };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.EInvoice = api;
})(typeof self !== 'undefined' ? self : this);
