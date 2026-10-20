// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Ausgehende E-Rechnungen nach EN 16931 (CII-Syntax): ZUGFeRD 2.3 / Factur-X 1.07 (Profil EN 16931) und XRechnung 3.0.
   build(inv, { xrechnung }) → { xml, totals, errors }. Reine Funktion – auch in Node-Tests nutzbar. */
(function (root) {
  'use strict';
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100, f2 = n => r2(n).toFixed(2);
  const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
  const d102 = iso => String(iso || '').replace(/-/g, '');
  const UNITS = { Stück: 'H87', Stk: 'H87', Std: 'HUR', Stunde: 'HUR', Tag: 'DAY', Monat: 'MON', Pauschale: 'LS', kg: 'KGM', m: 'MTR', km: 'KMT', l: 'LTR', 'm²': 'MTK' };
  const KU_REASON = 'Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG';

  // Summen je Steuersatz (BR-CO-14 ff.)
  function totals(inv) {
    const lines = (inv.lines || []).map((l, i) => ({ ...l, n: i + 1, qty: +l.qty || 0, price: +l.price || 0, vat: l.vat === '' || l.vat == null ? 19 : +l.vat }))
      .map(l => ({ ...l, net: r2(l.qty * l.price) }));
    const groups = {};
    for (const l of lines) { const k = l.vat; (groups[k] ||= { rate: k, basis: 0 }).basis = r2(groups[k].basis + l.net); }
    const taxes = Object.values(groups).sort((a, b) => b.rate - a.rate).map(g => ({ ...g, cat: g.rate > 0 ? 'S' : 'E', tax: r2(g.basis * g.rate / 100) }));
    const net = r2(lines.reduce((s, l) => s + l.net, 0)), tax = r2(taxes.reduce((s, t) => s + t.tax, 0));
    return { lines, taxes, net, tax, gross: r2(net + tax) };
  }
  // Pflichtangaben prüfen (EN 16931 + XRechnung-Zusatzregeln BR-DE-*) – verständliche Meldungen statt kryptischer Validator-Fehler
  function check(inv, xr) {
    const e = [], s = inv.seller || {}, b = inv.buyer || {};
    if (!inv.number) e.push('Rechnungsnummer fehlt');
    if (!inv.date) e.push('Rechnungsdatum fehlt');
    if (!(inv.lines || []).length) e.push('Mindestens eine Position angeben');
    if (!s.name) e.push('Ihr Firmenname fehlt'); if (!s.street || !s.zip || !s.city) e.push('Ihre Anschrift (Straße, PLZ, Ort) ist unvollständig');
    if (!s.vatId && !s.taxNo) e.push('USt-IdNr. oder Steuernummer (Verkäufer) fehlt');
    if (!s.iban) e.push('Ihre IBAN fehlt (für die Überweisung)');
    if (!b.name) e.push('Name des Rechnungsempfängers fehlt'); if (!b.zip || !b.city) e.push('Anschrift des Empfängers (PLZ, Ort) fehlt');
    if (xr) {
      if (!inv.buyerRef) e.push('XRechnung: Leitweg-ID bzw. Käuferreferenz fehlt');
      if (!s.contact || !s.phone || !s.email) e.push('XRechnung: Ansprechpartner, Telefon und E-Mail (Verkäufer) sind Pflicht');
      if (!b.email) e.push('XRechnung: E-Mail-Adresse des Empfängers fehlt');
    }
    return e;
  }
  function party(p, role, xr) {
    const contact = role === 'seller' && (p.contact || p.phone || p.email) ? `
        <ram:DefinedTradeContact>${p.contact ? `<ram:PersonName>${esc(p.contact)}</ram:PersonName>` : ''}${p.phone ? `
          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(p.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ''}${p.email ? `
          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(p.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ''}
        </ram:DefinedTradeContact>` : '';
    const tax = role === 'seller' ? [p.taxNo && `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.taxNo)}</ram:ID></ram:SpecifiedTaxRegistration>`, p.vatId && `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>`].filter(Boolean).join('\n        ')
      : p.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : '';
    // BR-CO-26: ohne USt-IdNr. braucht der Verkäufer eine Kennung (BT-29) – dann die Steuernummer
    const sid = role === 'seller' && !p.vatId && p.taxNo ? `
        <ram:ID>${esc(p.taxNo)}</ram:ID>` : '';
    return `${sid}
        <ram:Name>${esc(p.name)}</ram:Name>${contact}
        <ram:PostalTradeAddress><ram:PostcodeCode>${esc(p.zip)}</ram:PostcodeCode><ram:LineOne>${esc(p.street)}</ram:LineOne><ram:CityName>${esc(p.city)}</ram:CityName><ram:CountryID>${esc(p.country || 'DE')}</ram:CountryID></ram:PostalTradeAddress>${p.email ? `
        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${tax ? '\n        ' + tax : ''}`;
  }
  function build(inv, { xrechnung = false } = {}) {
    const errors = check(inv, xrechnung), t = totals(inv);
    const guideline = xrechnung ? 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0' : 'urn:cen.eu:en16931:2017';
    const lineXml = t.lines.map(l => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${l.n}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.name)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l.price.toFixed(2)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${UNITS[l.unit] || 'H87'}">${l.qty}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.vat > 0 ? 'S' : 'E'}</ram:CategoryCode><ram:RateApplicablePercent>${l.vat}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${f2(l.net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('');
    const taxXml = t.taxes.map(x => `
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${f2(x.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${x.cat === 'E' ? `<ram:ExemptionReason>${esc(KU_REASON)}</ram:ExemptionReason>` : ''}<ram:BasisAmount>${f2(x.basis)}</ram:BasisAmount><ram:CategoryCode>${x.cat}</ram:CategoryCode><ram:RateApplicablePercent>${x.rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`).join('');
    const s = inv.seller || {}, b = inv.buyer || {};
    const terms = inv.terms || (inv.due ? `Zahlbar ohne Abzug bis ${inv.due.split('-').reverse().join('.')}` : 'Zahlbar sofort ohne Abzug');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${guideline}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${inv.credit ? 381 : 380}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d102(inv.date)}</udt:DateTimeString></ram:IssueDateTime>${inv.note ? `
    <ram:IncludedNote><ram:Content>${esc(inv.note)}</ram:Content></ram:IncludedNote>` : ''}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineXml}
    <ram:ApplicableHeaderTradeAgreement>${inv.buyerRef ? `
      <ram:BuyerReference>${esc(inv.buyerRef)}</ram:BuyerReference>` : ''}
      <ram:SellerTradeParty>${party(s, 'seller', xrechnung)}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>${party(b, 'buyer', xrechnung)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>${inv.delivery ? `
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d102(inv.delivery)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ''}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(inv.number)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(String(s.iban || '').replace(/\s/g, ''))}</ram:IBANID>${s.bankName ? `<ram:AccountName>${esc(s.name)}</ram:AccountName>` : ''}</ram:PayeePartyCreditorFinancialAccount>${s.bic ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(s.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>${taxXml}
      <ram:SpecifiedTradePaymentTerms><ram:Description>${esc(terms)}</ram:Description>${inv.due ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d102(inv.due)}</udt:DateTimeString></ram:DueDateDateTime>` : ''}</ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${f2(t.net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${f2(t.net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${f2(t.tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${f2(t.gross)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${f2(t.gross)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
    return { xml, totals: t, errors };
  }
  // Fortlaufende Rechnungsnummer: RE-2026-0001 …
  const nextNumber = (last, year) => { const m = String(last || '').match(/(\d{4})-(\d+)$/); const n = m && +m[1] === year ? +m[2] + 1 : 1; return `RE-${year}-${String(n).padStart(4, '0')}`; };
  const api = { build, totals, check, nextNumber, KU_REASON };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.EInvoiceOut = api;
})(typeof self !== 'undefined' ? self : globalThis);
