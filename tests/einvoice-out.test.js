// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const O = require('../js/einvoice-out.js');
const E = require('../js/einvoice.js');

const inv = {
  number: 'RE-2026-0001', date: '2026-10-16', delivery: '2026-10-15', due: '2026-10-30', buyerRef: '04011000-12345-67',
  seller: { name: 'Mertens GmbH', street: 'Am Hoppenhof 30A', zip: '33104', city: 'Paderborn', vatId: 'DE123456789', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', contact: 'Wolfgang-Udo Mertens', phone: '+49 5251 123456', email: 'rechnung@mertens.example' },
  buyer: { name: 'Stadt Musterstadt', street: 'Rathausplatz 1', zip: '45127', city: 'Musterstadt', email: 'eingang@musterstadt.example' },
  lines: [{ name: 'Beratung PDFMy-Einführung', qty: 6, unit: 'Std', price: 120 }, { name: 'Schulungsunterlagen', qty: 10, unit: 'Stück', price: 12.5, vat: 7 }],
};

test('E-Rechnung: Summen je Steuersatz korrekt gerundet', () => {
  const t = O.totals(inv);
  assert.equal(t.net, 845); assert.equal(t.tax, 145.55); assert.equal(t.gross, 990.55);   // 720 × 19 % = 136,80; 125 × 7 % = 8,75
  assert.deepEqual(t.taxes.map(x => [x.rate, x.basis, x.tax]), [[19, 720, 136.8], [7, 125, 8.75]]);
});

test('XRechnung (CII): Pflichtangaben, Rundreise mit dem eigenen E-Rechnungs-Leser', () => {
  const { xml, errors } = O.build(inv, { xrechnung: true });
  assert.deepEqual(errors, []);
  assert.match(xml, /xrechnung_3\.0/); assert.match(xml, /<ram:BuyerReference>04011000-12345-67</);
  const d = E.parse(xml);
  assert.equal(d.invoiceNo, 'RE-2026-0001'); assert.equal(d.sender, 'Mertens GmbH'); assert.match(d.amount, /990,55/); assert.equal(d.iban, 'DE89370400440532013000');
  fs.writeFileSync(path.join(os.tmpdir(), 'pdfmy-xrechnung.xml'), xml);
});

test('Pflichtangaben fehlen → verständliche Hinweise', () => {
  const e = O.check({ lines: [] }, true);
  assert.ok(e.includes('Rechnungsnummer fehlt')); assert.ok(e.some(x => /Leitweg-ID/.test(x))); assert.ok(e.some(x => /IBAN/.test(x)));
});

test('Kleinunternehmer (0 %): Steuerbefreiung mit Begründung; Rechnungsnummern fortlaufend', () => {
  const { xml } = O.build({ ...inv, lines: [{ name: 'Leistung', qty: 1, price: 100, vat: 0 }] });
  assert.match(xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/); assert.match(xml, /§ 19 UStG/);
  const ku = O.build({ ...inv, seller: { ...inv.seller, vatId: '', taxNo: '339/5712/9999' }, lines: [{ name: 'X', qty: 1, price: 10, vat: 0 }] }).xml;
  assert.match(ku, /<ram:SellerTradeParty>\s*<ram:ID>339\/5712\/9999<\/ram:ID>/);   // BR-CO-26
  assert.equal(O.nextNumber('RE-2026-0041', 2026), 'RE-2026-0042'); assert.equal(O.nextNumber('RE-2025-0099', 2026), 'RE-2026-0001');
});
