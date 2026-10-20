// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/einvoice.js');

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
 <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
 <rsm:ExchangedDocument><ram:ID>RE-2026-0815</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261012</udt:DateTimeString></ram:IssueDateTime><ram:IncludedNote><ram:Content>Danke für Ihren Auftrag &amp; Ihr Vertrauen.</ram:Content></ram:IncludedNote></rsm:ExchangedDocument>
 <rsm:SupplyChainTradeTransaction>
  <ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Wartung Heizung</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="HUR">2.5</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>200.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>
  <ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>04011000-12345-67</ram:BuyerReference><ram:SellerTradeParty><ram:Name>Haustechnik Müller GmbH</ram:Name></ram:SellerTradeParty><ram:BuyerTradeParty><ram:Name>Mertens GmbH</ram:Name></ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement>
  <ram:ApplicableHeaderTradeSettlement><ram:PaymentReference>RE-2026-0815</ram:PaymentReference><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
   <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE02 1203 0000 0000 2020 51</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
   <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261026</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
   <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>200.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">38.00</ram:TaxTotalAmount><ram:GrandTotalAmount>238.00</ram:GrandTotalAmount><ram:DuePayableAmount>238.00</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
  </ram:ApplicableHeaderTradeSettlement>
 </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
 <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
 <cbc:ID>4711</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate><cbc:DueDate>2026-10-31</cbc:DueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode><cbc:BuyerReference>991-01234-55</cbc:BuyerReference>
 <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Bürobedarf Schmidt KG</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
 <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Mertens GmbH</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
 <cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cbc:PaymentID>4711</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>DE75512108001245126199</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
 <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount></cac:TaxTotal>
 <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount><cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
 <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Kopierpapier A4</cbc:Name></cac:Item></cac:InvoiceLine>
</ubl:Invoice>`;

test('ZUGFeRD/XRechnung CII: alle Kerndaten', () => {
  const d = E.parse(CII);
  assert.equal(d.format, 'XRechnung (CII)');
  assert.equal(d.invoiceNo, 'RE-2026-0815'); assert.equal(d.date, '2026-10-12'); assert.equal(d.deadline, '2026-10-26');
  assert.equal(d.sender, 'Haustechnik Müller GmbH'); assert.equal(d.buyer, 'Mertens GmbH');
  assert.equal(d.amount, '238,00 EUR'); assert.equal(d.tax, '38,00 EUR'); assert.equal(d.iban, 'DE02120300000000202051');
  assert.equal(d.reference, 'RE-2026-0815'); assert.equal(d.note, 'Danke für Ihren Auftrag & Ihr Vertrauen.');
  assert.deepEqual(d.lines, [{ name: 'Wartung Heizung', qty: '2.5', unit: 'HUR', net: '200,00 EUR' }]);
  assert.match(E.toText(d), /Zu zahlen: 238,00 EUR/);
});

test('XRechnung UBL: Kopf statt Positions-ID, Lieferant über Firmenname', () => {
  const d = E.parse(UBL);
  assert.equal(d.format, 'XRechnung (UBL)'); assert.equal(d.invoiceNo, '4711'); assert.equal(d.date, '2026-10-01'); assert.equal(d.deadline, '2026-10-31');
  assert.equal(d.sender, 'Bürobedarf Schmidt KG'); assert.equal(d.amount, '119,00 EUR'); assert.equal(d.iban, 'DE75512108001245126199');
  assert.equal(d.lines[0].name, 'Kopierpapier A4'); assert.equal(d.reference, '4711');
});

test('Kein E-Rechnungs-XML → null', () => { assert.equal(E.parse('<foo/>'), null); });
