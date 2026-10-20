// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ausführen: node --test tests
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/letter.js');

const RECHNUNG = `Stadtwerke Musterstadt GmbH
Kundenservice
Stadtwerke Musterstadt GmbH - Hafenstraße 12 :- 45127 Musterstadt
mentor Unternehmensgruppe
Buchhaltung
Beispielweg 5
40210 Düsseldorf
Kundennummer: 778812
Musterstadt, den 07.10.2026

Rechnung Nr. 2026-48213 — Stromlieferung September 2026

Sehr geehrte Damen und Herren,
für die Stromlieferung im Zeitraum vom 01.09.2026 bis 30.09.2026 berechnen
wir Ihnen folgenden Betrag:
Gesamtbetrag inkl. MwSt. 1.520,24 EUR
Bitte überweisen Sie den Betrag zahlbar bis 28.10.2026.
Mit freundlichen Grüßen
IBAN DE89 3704 0044 0532 0130 00 · BIC COBADEFFXXX`;

const BESCHEID = `Finanzamt Düsseldorf-Mitte
Kruppstraße 110, 40227 Düsseldorf
mentor GmbH
Beispielweg 5
40210 Düsseldorf
Steuernummer: 133/5713/0815
Datum: 2. Oktober 2026
Bescheid für 2025 über Umsatzsteuer
Sehr geehrte Damen und Herren,
die Nachzahlung beträgt 2.310,00 €.
Der Betrag ist fällig am 05.11.2026.
Einspruch kann innerhalb eines Monats eingelegt werden.`;

const MAHNUNG = `Bürobedarf Schulz KG · Industriestr. 4 · 50667 Köln
mentor Unternehmensgruppe
Beispielweg 5
40210 Düsseldorf
Köln, 12.10.2026
Betreff: 2. Mahnung zur Rechnung 4711
Sehr geehrte Damen und Herren,
leider konnten wir zu unserer Rechnung Nr. R-4711 vom 01.08.2026 noch keinen Zahlungseingang feststellen.
Offener Betrag: 349,90 EUR
Bitte zahlen Sie spätestens bis 26.10.2026.`;

const KUENDIGUNG = `Allianz Versicherungs-AG
mentor GmbH, Beispielweg 5, 40210 Düsseldorf
Versicherungsschein-Nr.: AS-99887766
Datum 30.09.2026
Bestätigung Ihrer Kündigung
Guten Tag,
wir bestätigen die Kündigung zum 31.12.2026.`;

test('Rechnung: Datum, Typ, Absender, Betreff, Frist, Schlüsseldaten', () => {
  const r = L.analyzeLetter(RECHNUNG, RECHNUNG, 'mentor');
  assert.equal(r.date, '2026-10-07');
  assert.equal(r.type, 'Rechnung');
  assert.equal(r.sender, 'Stadtwerke Musterstadt GmbH');
  assert.match(r.subject, /^Rechnung Nr\. 2026-48213/);
  assert.equal(r.deadline, '2026-10-28');
  assert.equal(r.amount, '1.520,24 EUR');
  assert.equal(r.iban, 'DE89 3704 0044 0532 0130 00');
  assert.equal(r.invoiceNo, '2026-48213');
  assert.equal(r.customerNo, '778812');
});

test('Bescheid: Monatsname-Datum, Fälligkeit, Steuernummer', () => {
  const r = L.analyzeLetter(BESCHEID, BESCHEID, 'mentor');
  assert.equal(r.date, '2026-10-02');
  assert.equal(r.type, 'Bescheid');
  assert.equal(r.sender, 'Finanzamt Düsseldorf-Mitte');
  assert.equal(r.subject, 'Bescheid für 2025 über Umsatzsteuer');
  assert.equal(r.deadline, '2026-11-05');
  assert.equal(r.amount, '2.310,00 EUR');
  assert.equal(r.reference, '133/5713/0815');
});

test('Mahnung hat Vorrang vor Rechnung, Betreff-Zeile wird genutzt', () => {
  const r = L.analyzeLetter(MAHNUNG, MAHNUNG, 'mentor');
  assert.equal(r.type, 'Mahnung');
  assert.equal(r.sender, 'Bürobedarf Schulz KG');
  assert.equal(r.subject, '2. Mahnung zur Rechnung 4711');
  assert.equal(r.date, '2026-10-12');
  assert.equal(r.deadline, '2026-10-26');
  assert.equal(r.amount, '349,90 EUR');
  assert.equal(r.invoiceNo, 'R-4711');
});

test('Eigener Firmenname wird nie Absender', () => {
  const r = L.analyzeLetter(KUENDIGUNG, KUENDIGUNG, 'mentor');
  assert.equal(r.sender, 'Allianz Versicherungs-AG');
  assert.equal(r.type, 'Kündigung');
  assert.equal(r.date, '2026-09-30');
  assert.equal(r.customerNo, 'AS-99887766');
});

test('Betrag ohne Signalwort: höchster Euro-Betrag', () => {
  const t = 'Kanzlei Beispiel · Ring 3 · 33098 Paderborn\nBetreff: Mandat 2026/155\nanbei unsere Rechnung über 410,00 EUR.\nAuslagen 12,50 EUR';
  assert.equal(L.analyzeLetter(t, t, 'mentor').amount, '410,00 EUR');
});

const LADUNG = `Amtsgericht Bielefeld
Familiengericht
-343- Amtsgericht Bielefeld, 33595 Bielefeld
Herr
Wolfgang Udo Mertens
Josef-Wirmer-Weg 28
33102 Paderborn
05.10.2026
Aktenzeichen
343 F 1057/26
bei Antwort bitte angeben
Umladung
Sehr geehrter Herr Mertens,
in der Familiensache Wozniak gegen Mertens
findet der Termin vom 08.10.2026 nicht statt.
Grund der Verlegung: Verhinderung des Antragsgegners.
Der neue Termin ist am
Donnerstag, 29.10.2026, 10:30 Uhr,`;

test('Gerichtsbrief (Umladung): Datum, Absender, Typ, Aktenzeichen, neuer Termin', () => {
  const r = L.analyzeLetter(LADUNG, LADUNG, 'mentor');
  assert.equal(r.date, '2026-10-05');
  assert.equal(r.sender, 'Amtsgericht Bielefeld');
  assert.equal(r.type, 'Ladung');
  assert.equal(r.subject, 'Umladung');
  assert.equal(r.reference, '343 F 1057/26');
  assert.equal(r.deadline, '2026-10-29');
});

test('IBAN-Prüfsumme', () => {
  assert.equal(L.ibanValid('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(L.ibanValid('DE89 3704 0044 0532 0130 01'), false);
});

test('Dateiname: ohne doppelten Typ, ohne verbotene Zeichen', () => {
  const n = L.buildFilename({ date: '2026-10-07', type: 'Rechnung', sender: 'A/B GmbH', subject: 'Rechnung: Nr. 5 "Test"' });
  assert.equal(n, '2026-10-07_Rechnung_A B GmbH_Nr. 5 Test.pdf');
  assert.match(L.buildFilename({}), /^Scan_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('Kalendereintrag für Frist', () => {
  const ics = L.buildIcs({ deadline: '2026-10-28', type: 'Rechnung', sender: 'Stadtwerke', subject: 'Strom', amount: '1,00 EUR' }, 'x.pdf', new Date('2026-10-14T10:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261028/);
  assert.match(ics, /DTEND;VALUE=DATE:20261029/);
  assert.match(ics, /TRIGGER:-P3D/);
  assert.match(ics, /SUMMARY:Frist: Rechnung Stadtwerke – Strom/);
  assert.ok(ics.split('\r\n').every(l => l.length <= 75));
  assert.equal(L.buildIcs({}), null);
});

test('GiroCode: EPC-Daten aus Briefdaten, nur mit gültiger IBAN und Euro-Betrag', () => {
  const L = require('../js/letter.js');
  assert.equal(L.epcPayload({ sender: 'Stadtwerke Musterstadt GmbH', iban: 'DE02 1203 0000 0000 2020 51', amount: '1.520,24 EUR', invoiceNo: '2026-48213', customerNo: '' }),
    'BCD\n002\n1\nSCT\n\nStadtwerke Musterstadt GmbH\nDE02120300000000202051\nEUR1520.24\n\n\nRechnung 2026-48213');
  assert.equal(L.epcPayload({ iban: 'DE02120300000000202052', amount: '10,00 EUR' }), null);
  assert.equal(L.epcPayload({ iban: 'DE02120300000000202051', amount: '10,00 USD' }), null);
  assert.equal(L.epcPayload({ iban: 'DE02120300000000202051', amount: '' }), null);
});

test('Schwärzen-Vorschläge: IBAN, E-Mail, Telefon, Steuer-ID, Geburtsdatum', () => {
  const L = require('../js/letter.js');
  const t = 'Herr Max Muster, geb. am 03.04.1980, Tel.: 05251 202081-1, max@muster.de, IBAN DE02 1203 0000 0000 2020 51, Steuer-ID 12 345 678 901, Rechnung 2026-48213 vom 07.10.2026';
  const r = L.findSensitive(t).map(x => [x.kind, t.slice(x.start, x.end)]);
  assert.deepEqual(r, [['Geburtsdatum', '03.04.1980'], ['Telefon', '05251 202081-1'], ['E-Mail', 'max@muster.de'], ['IBAN', 'DE02 1203 0000 0000 2020 51'], ['Steuer-ID', '12 345 678 901']]);
});

test('Schwärzen-Vorschläge: IBAN mit OCR-Leerzeichen nach dem Ländercode', () => {
  const L = require('../js/letter.js');
  const t = 'IBAN DE 12 3456 7890 1234 5678 90 - BIC MUSTDE33XXX';
  assert.deepEqual(L.findSensitive(t).map(x => t.slice(x.start, x.end)), ['DE 12 3456 7890 1234 5678 90']);
});

test('Stapel ohne Trennblatt: neuer Brief an Anrede, Datum und neuem Absender erkannt', () => {
  const L = require('../js/letter.js');
  const a1 = 'Stadtwerke Musterstadt GmbH\nHauptstr. 1, 12345 Musterstadt\nMusterstadt, 07.10.2026\nRechnung Nr. 2026-48213\nSehr geehrte Damen und Herren,\nfür die Stromlieferung berechnen wir … Seite 1 von 2';
  const a2 = 'weiterhin gilt: Die Zahlung ist fällig zum 28.10.2026.\nMit freundlichen Grüßen\nStadtwerke Musterstadt GmbH\nSeite 2 von 2';
  const b1 = 'Amtsgericht Bielefeld\nGerichtstr. 6, 33602 Bielefeld\nBielefeld, 05.10.2026\nAktenzeichen 343 F 1057/26\nSehr geehrter Herr Mertens,\nin der Familiensache …';
  const c1 = 'Finanzamt Paderborn\nBescheid vom 20.09.2026\nGuten Tag,\nhiermit erhalten Sie …\nMit freundlichen Grüßen';
  const c2 = 'Erläuterungen zum Bescheid: Die Festsetzung erfolgt nach § 155 AO.';
  assert.deepEqual(L.splitPoints([a1, a2, b1, c1, c2]), [2, 3]);
  assert.deepEqual(L.splitPoints([a1, a2]), []);
});

test('Aktionszeile: Rechnung mit Frist, überfällig, Gutschrift, Termin, ohne Frist', () => {
  const r = L.todoFor({ type: 'Rechnung', sender: 'Stadtwerke', amount: '1.520,24 EUR', deadline: '2026-10-28', iban: 'DE89370400440532013000' }, '2026-10-15');
  assert.equal(r.text, 'Rechnung über 1.520,24 EUR von Stadtwerke – zahlbar bis 28.10.2026 – in 13 Tagen');
  assert.deepEqual(r.actions, ['pay', 'cal', 'fwd', 'file']); assert.equal(r.tone, 'info');
  assert.equal(L.todoFor({ type: 'Rechnung', sender: 'X', amount: '10,00 EUR', deadline: '2026-10-14' }, '2026-10-15').tone, 'late');
  assert.match(L.todoFor({ type: 'Rechnung', sender: 'X', amount: '10,00 EUR', deadline: '2026-10-14' }, '2026-10-15').text, /seit 1 Tag überfällig/);
  assert.equal(L.todoFor({ type: 'Rechnung', sender: 'X', amount: '10,00 EUR', deadline: '2026-10-17' }, '2026-10-15').tone, 'soon');
  assert.equal(L.todoFor({ type: 'Mahnung', sender: 'X', amount: '10,00 EUR' }, '2026-10-15').tone, 'late');
  assert.deepEqual(L.todoFor({ type: 'Gutschrift', sender: 'X', amount: '5,00 EUR' }, '2026-10-15').actions, ['file']);
  assert.equal(L.todoFor({ type: 'Ladung', sender: 'Amtsgericht', deadline: '2026-10-15' }, '2026-10-15').text, 'Ladung von Amtsgericht: Termin am 15.10.2026 – heute fällig');
  assert.equal(L.todoFor({ type: 'Brief', sender: 'AOK', date: '2026-10-07' }, '2026-10-15').text, 'Brief von AOK vom 7.10.2026 – keine Frist erkannt.');
  assert.equal(L.todoFor({}, '2026-10-15'), null);
});

test('Autopilot: nur bei sicherer Erkennung', () => {
  const m = { sender: 'Stadtwerke', date: '2026-10-07', type: 'Rechnung' };
  assert.equal(L.autopilotCheck(m, { known: true }).ok, true);
  assert.match(L.autopilotCheck(m, { known: false }).reason, /neuer Absender/);
  assert.match(L.autopilotCheck({ ...m, date: '' }, { known: true }).reason, /datum/i);
  assert.match(L.autopilotCheck({ ...m, type: 'Brief' }, { known: true }).reason, /typ/i);
  assert.match(L.autopilotCheck(m, { known: true, duplicate: true }).reason, /Dublette/);
  assert.match(L.autopilotCheck(m, { known: true, letters: 3 }).reason, /3 Briefe/);
});


test('Sprache erkennen: Deutsch bleibt, Englisch/Französisch/Niederländisch werden erkannt', () => {
  const de = 'Sehr geehrte Damen und Herren, für die Stromlieferung im Zeitraum vom 01.09. bis 30.09. berechnen wir Ihnen den folgenden Betrag. Bitte überweisen Sie den Betrag zahlbar bis zum 28.10. auf das unten genannte Konto unter Angabe der Rechnungsnummer. Mit freundlichen Grüßen';
  const en = 'Dear Sir or Madam, please find enclosed the invoice for the services we have provided to your company in September. The amount is due within 14 days. Please transfer the amount to our account and quote the invoice number. If you have any questions, do not hesitate to contact us. Kind regards';
  const fr = 'Madame, Monsieur, nous vous prions de trouver ci-joint la facture pour les services que nous avons fournis à votre société en septembre. Le montant est payable dans un délai de 14 jours. Veuillez virer le montant sur notre compte avec le numéro de la facture. Cordialement';
  const nl = 'Geachte heer of mevrouw, hierbij ontvangt u de factuur voor de diensten die wij in september aan uw bedrijf hebben geleverd. Het bedrag dient binnen 14 dagen te worden betaald. Wij verzoeken u het bedrag over te maken naar ons rekeningnummer en het factuurnummer te vermelden. Met vriendelijke groet';
  assert.equal(L.detectLang(de), null);
  assert.equal(L.detectLang(en), 'eng');
  assert.equal(L.detectLang(fr), 'fra');
  assert.equal(L.detectLang(nl), 'nld');
  assert.equal(L.detectLang('Hello world'), null);   // zu kurz
});


test('Text ändern: Zeile um ein Wort, ohne Nachbarspalte und ohne Nachbarzeile', () => {
  const w = (t, x, y, ww = 0.05, h = 0.012) => ({ t, x, y, w: ww, h });
  const words = [w('Rechnung', 0.1, 0.30), w('Nr.', 0.16, 0.30, 0.02), w('2026-48213', 0.19, 0.301, 0.08), w('Datum:', 0.62, 0.30), w('07.10.2026', 0.68, 0.30),
    w('Sehr', 0.1, 0.33), w('geehrte', 0.16, 0.33)];
  assert.deepEqual(L.lineAround(words, words[1]).map(x => x.t), ['Rechnung', 'Nr.', '2026-48213']);
  assert.deepEqual(L.lineAround(words, words[4]).map(x => x.t), ['Datum:', '07.10.2026']);
  assert.deepEqual(L.lineAround(words, words[5]).map(x => x.t), ['Sehr', 'geehrte']);
});

test('Zahl-QR: GiroCode (EPC) und Schweizer QR-Rechnung', () => {
  const epc = ['BCD', '002', '1', 'SCT', '', 'Stadtwerke Musterstadt GmbH', 'DE89 3704 0044 0532 0130 00', 'EUR1520.24', '', '', 'Rechnung 2026-48213'].join('\n');
  assert.deepEqual(L.parsePaymentQr(epc), { name: 'Stadtwerke Musterstadt GmbH', iban: 'DE89370400440532013000', amount: '1.520,24 EUR', purpose: 'Rechnung 2026-48213', kind: 'GiroCode' });
  // GiroCode wie ihn PDFMy selbst erzeugt, wird wieder gelesen
  const own = L.epcPayload({ sender: 'X GmbH', iban: 'DE89370400440532013000', amount: '99,90 EUR', invoiceNo: '7' });
  assert.equal(L.parsePaymentQr(own).amount, '99,90 EUR');
  const spc = ['SPC', '0200', '1', 'CH4431999123000889012', 'S', 'Muster AG', 'Bahnhofstrasse', '1', '8000', 'Zürich', 'CH', '', '', '', '', '', '', '', '250.50', 'CHF', 'K', 'Kunde', '', '', '', '', '', 'NON', '', 'Rechnung 12'].join('\n');
  assert.equal(L.parsePaymentQr(spc).amount, '250,50 CHF');
  assert.equal(L.parsePaymentQr(spc).iban, 'CH4431999123000889012');
  assert.equal(L.parsePaymentQr('https://example.com'), null);
  assert.equal(L.parsePaymentQr(epc.replace('DE89', 'DE00')), null);   // Prüfziffer falsch
});


test('Antwortbrief: Absenderanschrift aus Rücksendezeile oder Adressblock, Betreff mit Bezug', () => {
  const t1 = 'Stadtwerke Musterstadt GmbH\nKundenservice\nStadtwerke Musterstadt GmbH · Hafenstraße 12 · 45127 Musterstadt\nmentor Unternehmensgruppe\nBuchhaltung\nBeispielweg 5\n40210 Düsseldorf\nMusterstadt, den 07.10.2026';
  assert.deepEqual(L.senderAddress(t1, 'mentor'), ['Stadtwerke Musterstadt GmbH', 'Hafenstraße 12', '45127 Musterstadt']);
  const t2 = 'AOK NordWest\nKopenhagener Straße 1\n44269 Dortmund\n\nHerrn\nMax Mustermann\nMusterweg 3\n33100 Paderborn';
  assert.deepEqual(L.senderAddress(t2, ''), ['AOK NordWest', 'Kopenhagener Straße 1', '44269 Dortmund']);
  assert.deepEqual(L.senderAddress('Kein Brief', ''), []);
  // Texterkennung liest die Trennpunkte als - und : ; eigene Anschrift (mentor …) darf nie Empfänger werden
  const ocr = 'Stadtwerke Musterstadt GmbH\nKundenservice\nStadtwerke Musterstadt GmbH - Hafenstraße 12 : 45127 Musterstadt\nmentor Unternehmensgruppe\nBuchhaltung\nBeispielweg 5\n40210 Düsseldorf';
  assert.deepEqual(L.senderAddress(ocr, 'mentor', 'Stadtwerke Musterstadt GmbH'), ['Stadtwerke Musterstadt GmbH', 'Hafenstraße 12', '45127 Musterstadt']);
  assert.deepEqual(L.senderAddress('mentor Unternehmensgruppe\nBuchhaltung\nBeispielweg 5\n40210 Düsseldorf', 'mentor', ''), []);
  const d = L.replyDraft({ date: '2026-10-07', type: 'Rechnung', invoiceNo: '2026-48213', customerNo: '4711' });
  assert.equal(d.subject, 'Ihr Schreiben vom 07.10.2026 – Rechnung 2026-48213, Kunden-Nr. 4711');
});


test('Textbausteine: Platzhalter mit Briefdaten', () => {
  const m = { date: '2026-10-07', amount: '1.520,24 EUR', invoiceNo: '2026-48213', deadline: '2026-10-28' };
  const t = L.fillTemplate('paid', m, new Date(2026, 9, 15));
  assert.equal(t, 'vielen Dank für Ihr Schreiben vom 07.10.2026. Den Betrag von 1.520,24 EUR haben wir am 15.10.2026 an Sie überwiesen (Rechnung 2026-48213). Bitte betrachten Sie die Angelegenheit damit als erledigt.');
  assert.match(L.fillTemplate('extend', m), /Frist bis zum 28\.10\.2026/);
  assert.match(L.fillTemplate('objection', {}), /vom …/);
  assert.equal(Object.keys(L.TEMPLATES).length, 7);
});


test('Ablage je Firma: Empfänger im Anschriftfeld, nicht die Rücksendezeile', () => {
  const routes = [{ key: 'Mertens GmbH' }, { key: 'Mentor GmbH' }];
  const t = 'Stadtwerke Musterstadt GmbH · Hafenstraße 12 · 45127 Musterstadt\nMentor GmbH\nBuchhaltung\nAm Hoppenhof 30A\n33104 Paderborn';
  assert.equal(L.pickRoute(t, routes), 1);
  assert.equal(L.pickRoute('Mertens GmbH · Am Hoppenhof 30A · 33104 Paderborn\nKunde AG\n10115 Berlin', routes), -1);   // eigene Rücksendezeile im Ausgangsbrief
  assert.equal(L.pickRoute('Herrn Max\nMertens  GmbH\nPaderborn', routes), 0);
});

test('Absender: Ausfüll-Zeilen und Formular-Beschriftungen werden nie Absender', () => {
  const form = 'Ort, Datum: ____________________\nUnterschrift: ______________________________\nName: __________';
  assert.equal(L.analyzeLetter(form, form).sender, '');
  const vertrag = 'Ort, Datum: ____________\nStadtwerke Musterstadt GmbH\nWartungsvertrag\nUnterschrift ............................';
  assert.equal(L.analyzeLetter(vertrag, vertrag).sender, 'Stadtwerke Musterstadt GmbH');
  const unten = 'Vereinbarung über Wartung\nHiermit wird vereinbart, dass ...\nOrt, Datum\nUnterschrift';
  assert.equal(L.analyzeLetter(unten, unten).sender, 'Vereinbarung über Wartung');
});

test('Absender: Anrede und Grußformel werden nie Absender', () => {
  const t = 'Sehr geehrte Frau Muster, vielen Dank.\nMit freundlichen Grüßen\nMüller Haustechnik GmbH';
  assert.equal(L.analyzeLetter(t, t).sender, 'Müller Haustechnik GmbH');
  const h = 'Hallo Herr Mertens,\nwie besprochen das Angebot.';
  assert.equal(L.analyzeLetter(h, h).sender, '');   // ein Satz aus dem Fließtext ist kein Absender
});

test('Fälschungsschutz: Urkunden und Kontoauszüge erkennen', () => {
  const k = L.protectedKind;
  assert.equal(k('Standesamt Paderborn\nGeburtsurkunde\nName: Max Muster'), 'urkunde');
  assert.equal(k('Universität Paderborn\nZeugnis\nüber die Bachelorprüfung'), 'urkunde');
  assert.equal(k('Arbeitszeugnis\nFrau Erika Muster war vom ...'), 'urkunde');
  assert.equal(k('Handwerkskammer Kassel\nMeisterbrief\nHerr Max Muster hat die Meisterprüfung bestanden'), 'urkunde');
  assert.equal(k('Gesellenbrief\nim Tischler-Handwerk'), 'urkunde');
  assert.equal(k('Notar Dr. Meier\nUR-Nr. 123/2026\nKaufvertrag'), 'urkunde');
  assert.equal(k('Sparkasse Paderborn-Detmold\nKontoauszug Nr. 9/2026\nIBAN DE02 1203 0000 0000 2020 51'), 'konto');
  assert.equal(k('Buchungstag Wert Vorgang Betrag\n01.10. 01.10. Lastschrift -20,00\nNeuer Saldo 1.234,56 H'), 'konto');
  assert.equal(k('Stadtwerke Musterstadt GmbH\nRechnung Nr. 4711\nBitte überweisen Sie den Betrag.'), 'nachweis');
  assert.equal(k('Muster GmbH\nEntgeltabrechnung Oktober 2026\nBrutto 3.200,00'), 'nachweis');
  assert.equal(k('Finanzamt Paderborn\nEinkommensteuerbescheid für 2025'), 'urkunde');
  assert.equal(k('Finanzamt Paderborn\nSteuernummer 339/5000/1234\nBescheid für 2025 über Einkommensteuer, Solidaritätszuschlag und Kirchensteuer'), 'urkunde');
  assert.equal(k('Deutsche Rentenversicherung\nRentenbescheid'), 'urkunde');
  assert.equal(k('Amtsgericht Paderborn\nBeschluss\nIn dem Rechtsstreit'), 'urkunde');
  assert.equal(k('SCHUFA-Auskunft nach Art. 15 DSGVO'), 'nachweis');
  assert.equal(k('Liebe Anna,\nwir laden dich zum Sommerfest ein.'), '');
  // Brief, der eine Urkunde erst weiter unten erwähnt, bleibt bearbeitbar
  const brief = ['Kanzlei Muster', 'Herrn Max Muster', 'Hauptstr. 1', '12345 Musterstadt', 'Paderborn, 17.10.2026', 'Ihr Antrag', 'Sehr geehrter Herr Muster,', 'vielen Dank.', 'Wir benötigen noch Unterlagen.', 'Bitte senden Sie uns:', '- Lohnabrechnung', '- Mietvertrag', '- Meldebestätigung', '- Steuerbescheid', '- eine Kopie der Geburtsurkunde'].join('\n');
  assert.equal(k(brief), '');
  assert.equal(k('Sehr geehrte Frau Muster,\nbitte senden Sie uns eine Kopie Ihres Steuerbescheids und den Personalausweis.'), '');
  assert.equal(k(''), '');
});

test('Text ändern: Absatz erkennen (Umbruch, Trennung, Anschrift bleibt getrennt)', () => {
  // Wörter einer Seite nachbilden: Zeilen mit x-Start, y, Höhe; Wortbreite ~ Länge
  const mk = (rows) => rows.flatMap(([text, x, y, h = 0.012]) => { let cx = x; return text.split(' ').map(t => { const w = { t, x: cx, y, w: t.length * 0.006, h }; cx += w.w + 0.006; return w; }); });
  const full = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll';   // läuft bis zum rechten Rand
  const words = mk([
    ['Herrn Max Muster', 0.1, 0.10], ['Hauptstr. 1', 0.1, 0.118], ['12345 Musterstadt', 0.1, 0.136],      // Anschrift (eng, kurz)
    ['Sehr geehrter Herr Muster,', 0.1, 0.25],                                                             // Anrede, danach Leerzeile
    [full + ' Haus-', 0.1, 0.30], ['tür ' + full, 0.1, 0.318], ['Ende des Absatzes.', 0.1, 0.336],
    ['Mit freundlichen Grüßen', 0.1, 0.40],
  ]);
  const hit = words.find(w => w.t === 'tür');
  const r = L.paragraphAround(words, hit);
  assert.equal(r.lines.length, 3);
  assert.match(r.text, /Haustür aaaa/);
  assert.match(r.text, /llll Ende des Absatzes\.$/);
  assert.ok(Math.abs(r.spacing - 0.018) < 0.001);
  // Anschrift: kurze Zeilen bleiben Zeilen (harte Umbrüche), Anrede gehört nicht dazu
  const a = L.paragraphAround(words, words.find(w => w.t === 'Hauptstr.'));
  assert.equal(a.text, 'Herrn Max Muster\nHauptstr. 1\n12345 Musterstadt');
  // einzelne Zeile bleibt einzeln
  assert.equal(L.paragraphAround(words, words.find(w => w.t === 'geehrter')).lines.length, 1);
});

test('Briefdaten: Anschriftfeld wird weder Betreff noch Absender', () => {
  const ohne = 'Herrn Max Muster\nHauptstraße 1\n12345 Musterstadt\nSehr geehrter Herr Muster,\nvielen Dank für Ihre Anfrage.';
  const r = L.analyzeLetter(ohne, ohne);
  assert.equal(r.subject, '');
  assert.equal(r.sender, '');
  // Absender nach dem Anschriftfeld wird gefunden, Betreff über der Anrede bleibt erhalten
  const mit = 'Frau Erika Muster\nMusterweg 5\n33100 Paderborn\nMüller Haustechnik\nWartung Ihrer Heizung\nSehr geehrte Frau Muster,\nanbei der Termin.';
  const m = L.analyzeLetter(mit, mit);
  assert.equal(m.sender, 'Müller Haustechnik');
  assert.equal(m.subject, 'Wartung Ihrer Heizung');
});

test('Briefdaten: Fließtext wird nicht Absender', () => {
  const f = 'Im Übrigen gelten die Regelungen des TKG zur Beeinträchtigung von Grundstücken und Gebäuden im Rahmen der\nRegelung von Wegerechten und Mitnutzung in ihrer jeweiligen Fassung.\nOrt\nDatum';
  assert.equal(L.analyzeLetter(f, f).sender, '');
});
