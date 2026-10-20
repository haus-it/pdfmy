// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/bank.js');

const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">1520.24</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-20</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Stadtwerke Musterstadt GmbH</Nm></Cdtr><CdtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></CdtrAcct></RltdPties>
 <RmtInf><Ustrd>Rechnung 2026-48213 Kd 4711</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">89.90</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-21</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Telekom Deutschland GmbH</Nm></Cdtr></RltdPties><RmtInf><Ustrd>Kundenkonto 55 1234</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">250.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-21</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Kunde AG</Nm></Dbtr></RltdPties><RmtInf><Ustrd>RE 77</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

test('CAMT.053: Datum, Betrag (Soll negativ), Gegenpartei, Verwendungszweck', () => {
  const t = B.parse(camt, 'auszug.xml');
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { date: '2026-10-20', amount: -1520.24, name: 'Stadtwerke Musterstadt GmbH', iban: 'DE89370400440532013000', purpose: 'Rechnung 2026-48213 Kd 4711' });
  assert.equal(t[2].amount, 250);
});

test('CSV (Sparkasse-Format): Spalten an der Kopfzeile erkannt', () => {
  const csv = '﻿"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"Betrag";"Waehrung"\r\n' +
    '"DE00";"20.10.26";"20.10.26";"LASTSCHRIFT";"Rechnung 2026-48213";"Stadtwerke Musterstadt GmbH";"DE89370400440532013000";"-1.520,24";"EUR"\r\n' +
    '"DE00";"21.10.26";"21.10.26";"GUTSCHRIFT";"RE 77";"Kunde AG";"DE44";"250,00";"EUR"\r\n';
  const t = B.parse(csv, 'umsaetze.csv');
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { date: '2026-10-20', amount: -1520.24, name: 'Stadtwerke Musterstadt GmbH', iban: 'DE89370400440532013000', purpose: 'Rechnung 2026-48213' });
});

test('Abgleich: Rechnung sicher (Betrag + Nummer), Telekom über Betrag + Name, falscher Betrag bleibt offen', () => {
  const entries = [
    { id: 'a', sender: 'Stadtwerke Musterstadt GmbH', amount: '1.520,24 EUR', invoiceNo: '2026-48213', date: '2026-10-07', status: 'offen' },
    { id: 'b', sender: 'Telekom Deutschland GmbH', amount: '89,90 EUR', date: '2026-10-05', status: 'offen' },
    { id: 'c', sender: 'Versicherung AG', amount: '300,00 EUR', date: '2026-10-01', status: 'offen' },
    { id: 'd', sender: 'Stadtwerke', amount: '1.520,24 EUR', status: 'bezahlt' },
  ];
  const m = B.match(B.parse(camt, 'a.xml'), entries);
  assert.deepEqual(m.map(x => [x.entry.id, x.sure]), [['a', true], ['b', false]]);
  assert.match(m[0].why, /Rechnungs-Nr/);
});
