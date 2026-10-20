// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// E-Rechnung prüfen: Pflichtangaben, Rechenregeln (EN 16931) und XRechnung-Regeln
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/einvoice-out.js');
const E = require('../js/einvoice.js');

const inv = {
  number: 'RE-2026-0001', date: '2026-10-16', delivery: '2026-10-15', due: '2026-10-30', buyerRef: '04011000-12345-67',
  seller: { name: 'Mertens GmbH', street: 'Am Hoppenhof 30A', zip: '33104', city: 'Paderborn', vatId: 'DE123456789', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', contact: 'Wolfgang-Udo Mertens', phone: '+49 5251 123456', email: 'rechnung@mertens.example' },
  buyer: { name: 'Stadt Musterstadt', street: 'Rathausplatz 1', zip: '45127', city: 'Musterstadt', email: 'eingang@musterstadt.example' },
  lines: [{ name: 'Beratung', qty: 6, unit: 'Std', price: 120 }, { name: 'Unterlagen', qty: 10, unit: 'Stück', price: 12.5, vat: 7 }],
};
const rules = r => r.items.filter(i => i.level === 'fehler').map(i => i.rule);

test('Gültige XRechnung (CII) aus dem eigenen Ersteller besteht', () => {
  const { xml } = O.build(inv, { xrechnung: true });
  const r = E.check(xml);
  assert.equal(r.ok, true, JSON.stringify(r.items));
  assert.equal(r.xrechnung, true);
});

test('Falsche Summe und fehlende Leitweg-ID werden erkannt', () => {
  const { xml } = O.build(inv, { xrechnung: true });
  const bad = xml.replace(/(<ram:GrandTotalAmount[^>]*>)[^<]*/, '$1999.99').replace(/<ram:BuyerReference>[^<]*<\/ram:BuyerReference>/, '');
  const r = E.check(bad);
  assert.equal(r.ok, false);
  assert.ok(rules(r).includes('BR-CO-15'), rules(r).join());
  assert.ok(rules(r).includes('BR-DE-15'), rules(r).join());
});

test('ZUGFeRD ohne XRechnung: Leitweg-ID nur Hinweis; fehlende Steuernummer ist Fehler', () => {
  const { xml } = O.build(inv, { xrechnung: false });
  const r = E.check(xml);
  if (!/xrechnung/i.test(xml)) assert.equal(r.xrechnung, false);
  const noTax = xml.replace(/<ram:SpecifiedTaxRegistration>[\s\S]*?<\/ram:SpecifiedTaxRegistration>/g, '');
  assert.ok(rules(E.check(noTax)).includes('BR-CO-26'));
});

test('UBL: Positionssumme falsch', () => {
  const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID><cbc:ID>R-1</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Lieferant AG</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:CityName>Köln</cbc:CityName><cbc:PostalZone>50667</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>DE111111111</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Kunde GmbH</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress></cac:Party></cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">119.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">90.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Ware</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">90.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</ubl:Invoice>`;
  const r = E.check(UBL);
  assert.deepEqual(rules(r), ['BR-CO-10']);
  assert.equal(E.check(UBL.replace('90.00</cbc:LineExtensionAmount>', '100.00</cbc:LineExtensionAmount>')).ok, true);
});
